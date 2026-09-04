/**
 * ESPN matchup rosters → `player_week_stats` rows, as pure functions.
 *
 * The weekly sync has always fetched this data and thrown it away. The
 * `mMatchupScore` view attaches `rosterForCurrentScoringPeriod` to each side of
 * every matchup, and inside it is the thing the power ranking was missing: who
 * was in the lineup that week and what each of them actually scored, under this
 * league's own scoring settings. `services/espnScheduleFetcher.js` already
 * carries it through `parseMatchupData`; until now nothing read it.
 *
 * Nothing here touches the database or the network, the same split as
 * `services/espnGameMapper.js`: this returns a plan,
 * `services/db/playerWeekStats.js::upsertPlayerWeekStats` executes it.
 */

import { isStarterSlot } from './db/espnMapping.js';

/**
 * ESPN `defaultPositionId` → the position strings the rest of the app uses.
 *
 * Only the offensive/kicker/defense ids matter for a standard league; IDP ids
 * (9-15) are deliberately absent and map to null rather than being invented,
 * because a wrong position silently corrupts the optimal-lineup calculation.
 */
const POSITION_BY_ID = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'D/ST'
};

export function mapDefaultPositionId(defaultPositionId) {
  return POSITION_BY_ID[defaultPositionId] ?? null;
}

/**
 * The points ESPN projected for this player in this week.
 *
 * A player's `stats` array holds one entry per (source, split, period)
 * combination, and a single week's roster carries entries for the whole season
 * to date. Three things identify the one we want:
 *
 *   - `statSourceId === 1` — projection. Source 0 is the actual result.
 *   - `statSplitTypeId === 1` — a single week. Split 0 is the season total.
 *   - `scoringPeriodId === week` — this week, not last week's projection.
 *
 * Matching on fewer than all three picks up a season total or an actual score
 * and reports it as a projection.
 */
export function findProjectedPoints(player, week) {
  const stats = Array.isArray(player?.stats) ? player.stats : [];

  const projection = stats.find(
    (stat) =>
      stat?.statSourceId === 1 &&
      stat?.statSplitTypeId === 1 &&
      stat?.scoringPeriodId === week
  );

  return projection?.appliedTotal ?? null;
}

/**
 * The raw per-category stat map ESPN recorded for this player in this week.
 *
 * The same three predicates as `findProjectedPoints`, with the source flipped:
 * `statSourceId === 0` is the actual result rather than the projection, and
 * split 1 / `scoringPeriodId === week` narrows it to this single week. Matching
 * on fewer than all three picks up the season-to-date totals that ride along in
 * the same array, which would report a running total as one week's production —
 * and a season total in a week's row is not a smaller error than a wrong
 * number, it is one that grows all year.
 *
 * Returned verbatim, keyed by ESPN stat id as a string ("4" passing TD, "25"
 * rushing TD, "43" receiving TD; see `ESPN_STAT_IDS`). Storing the whole map
 * rather than the few categories wanted today is what makes it worth a column:
 * the payload is already downloaded and discarded, and nothing else in this
 * system has player-level category data at all.
 *
 * Null, never `{}`, when ESPN reported nothing — an empty object would assert a
 * player who did nothing, which is a different claim from not knowing.
 */
export function findStatBreakdown(player, week) {
  const stats = Array.isArray(player?.stats) ? player.stats : [];

  const actual = stats.find(
    (stat) =>
      stat?.statSourceId === 0 &&
      stat?.statSplitTypeId === 1 &&
      stat?.scoringPeriodId === week
  );

  const breakdown = actual?.stats;
  if (!breakdown || typeof breakdown !== 'object') return null;

  return Object.keys(breakdown).length > 0 ? breakdown : null;
}

/**
 * Whether ESPN has settled this matchup.
 *
 * `espnWinner` is ESPN's own verdict, carried through by
 * `services/espnScheduleFetcher.js::parseMatchupData` — 'HOME' | 'AWAY' |
 * 'TIE' while the week is over, 'UNDECIDED' while any game in it is still to
 * be played. A matchup with no verdict at all is treated as undecided, which
 * is the conservative direction: see `findActualPoints`.
 */
export function isMatchupDecided(matchup) {
  const winner = matchup?.espnWinner;
  return typeof winner === 'string' && winner !== '' && winner !== 'UNDECIDED';
}

/**
 * The points this player has actually scored this week — or null while the
 * game has not been played.
 *
 * `appliedStatTotal` on the pool entry is ESPN's own answer and is what the
 * matchup score is summed from, so it wins whenever it is present. But ESPN
 * reports it as `0` for every player from the moment the week opens, days
 * before kickoff, and a `0` written into `actual_points` is not "nothing has
 * happened yet" — it is a result, and every reader treats it as one:
 * `ui/player-points.jsx` shows a bare 0 instead of the labelled projection,
 * and `utils/lineupTotals.js` calls the team's total final. On 2026-09-04,
 * four days before the season started, that put "0.0" beside every starter on
 * the Schedule tab and in the pick'ems research panel while the Teams tab,
 * which reads `players.projected_points` alone, showed the projections.
 *
 * So the total is a result only when there is evidence a game was played:
 * either ESPN has settled the matchup (`isMatchupDecided`), in which case a 0
 * is a genuine 0 — the inactive starter, the kicker who never attempted — or
 * ESPN has recorded a per-category stat line for the player (`findStatBreakdown`
 * is non-null), which it does not before kickoff. Mid-week that is exactly the
 * story the points column tells: the Thursday starter's actual is in, the
 * Sunday starter's is still a projection.
 */
function findActualPoints(entry, player, week, { decided = false, breakdown = null } = {}) {
  if (!decided && breakdown == null) return null;

  if (typeof entry?.playerPoolEntry?.appliedStatTotal === 'number') {
    return entry.playerPoolEntry.appliedStatTotal;
  }

  const stats = Array.isArray(player?.stats) ? player.stats : [];
  const actual = stats.find(
    (stat) =>
      stat?.statSourceId === 0 &&
      stat?.statSplitTypeId === 1 &&
      stat?.scoringPeriodId === week
  );

  return actual?.appliedTotal ?? null;
}

/** One roster entry → the facts worth storing about it. */
function mapEntry(entry, espnTeamId, week, decided) {
  const pool = entry?.playerPoolEntry ?? {};
  const player = pool.player ?? {};

  const espnPlayerId = player.id ?? pool.id ?? entry?.playerId ?? null;
  if (espnPlayerId == null) return null;

  const lineupSlotId = entry?.lineupSlotId ?? null;
  const statBreakdown = findStatBreakdown(player, week);

  return {
    espnTeamId,
    espnPlayerId,
    playerName: player.fullName ?? entry?.playerPoolEntry?.player?.fullName ?? null,
    defaultPositionId: player.defaultPositionId ?? null,
    position: mapDefaultPositionId(player.defaultPositionId),
    proTeamId: player.proTeamId ?? null,
    lineupSlotId,
    started: isStarterSlot(lineupSlotId),
    actualPoints: findActualPoints(entry, player, week, { decided, breakdown: statBreakdown }),
    projectedPoints: findProjectedPoints(player, week),
    statBreakdown,
    injuryStatus: player.injuryStatus ?? null
  };
}

/**
 * Walk both sides of every matchup and flatten their rosters into one list.
 *
 * @param {Array}  matchups normalized matchups from `ESPNScheduleFetcher`
 * @param {number} week     the scoring period these rosters belong to
 * @returns {Array} one entry per rostered player, ready for team/player resolution
 */
export function mapMatchupRosterEntries(matchups = [], week) {
  const rows = [];

  for (const matchup of matchups) {
    const decided = isMatchupDecided(matchup);

    // A bye has one side; a matchup ESPN has not populated yet has neither.
    for (const side of [matchup?.homeTeam, matchup?.awayTeam]) {
      const espnTeamId = side?.teamId;
      if (espnTeamId == null) continue;

      const entries = side?.rosterForCurrentScoringPeriod?.entries;
      if (!Array.isArray(entries)) continue;

      for (const entry of entries) {
        const mapped = mapEntry(entry, espnTeamId, week, decided);
        if (mapped) rows.push(mapped);
      }
    }
  }

  return rows;
}

export default mapMatchupRosterEntries;
