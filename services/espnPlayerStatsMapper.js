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

/** The actual points a stat line records for this week, when the total is absent. */
function findActualPoints(entry, player, week) {
  // `appliedStatTotal` on the pool entry is ESPN's own answer and is what the
  // matchup score is summed from, so it wins whenever it is present.
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
function mapEntry(entry, espnTeamId, week) {
  const pool = entry?.playerPoolEntry ?? {};
  const player = pool.player ?? {};

  const espnPlayerId = player.id ?? pool.id ?? entry?.playerId ?? null;
  if (espnPlayerId == null) return null;

  const lineupSlotId = entry?.lineupSlotId ?? null;

  return {
    espnTeamId,
    espnPlayerId,
    playerName: player.fullName ?? entry?.playerPoolEntry?.player?.fullName ?? null,
    defaultPositionId: player.defaultPositionId ?? null,
    position: mapDefaultPositionId(player.defaultPositionId),
    proTeamId: player.proTeamId ?? null,
    lineupSlotId,
    started: isStarterSlot(lineupSlotId),
    actualPoints: findActualPoints(entry, player, week),
    projectedPoints: findProjectedPoints(player, week),
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
    // A bye has one side; a matchup ESPN has not populated yet has neither.
    for (const side of [matchup?.homeTeam, matchup?.awayTeam]) {
      const espnTeamId = side?.teamId;
      if (espnTeamId == null) continue;

      const entries = side?.rosterForCurrentScoringPeriod?.entries;
      if (!Array.isArray(entries)) continue;

      for (const entry of entries) {
        const mapped = mapEntry(entry, espnTeamId, week);
        if (mapped) rows.push(mapped);
      }
    }
  }

  return rows;
}

export default mapMatchupRosterEntries;
