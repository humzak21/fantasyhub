import { ownerKey } from '../utils/ownerAliases.js';
import { PLAYOFF_RESEED_YEAR } from '../utils/playoffSeeding.js';
/**
 * ESPN matchup → `games` row, as pure functions.
 *
 * This replaces `assign_schedule_to_season`, the SECURITY DEFINER function that
 * used to be the only bridge from the ESPN staging tables into `games`. That
 * function matched teams by owner-name string equality, silently dropped any
 * matchup it could not match, threw away the ESPN matchup id, flattened the
 * playoff bracket to `type = 'playoff'` and stamped `completed_at = NOW()`.
 *
 * Nothing here touches the database: it takes ESPN matchups plus the rows that
 * already exist and returns a plan. `services/db/games.js::upsertEspnGames`
 * executes it. That split is what makes the interesting parts testable without
 * a client.
 *
 * Three rules run through the whole file:
 *
 *   1. **`type` is written on insert and never on update.** The 2025 postseason
 *      types were corrected by hand (migration 20260805100000), 2020-24's were
 *      derived from the bracket (20260915120000), and an ESPN sync must never
 *      undo either — the same promise `sync-week.js` has always made about
 *      scores. The one exception is a postseason row typed `regular`, which is
 *      only ever the residue of a matchup imported before ESPN tiered it; see
 *      `planGameWrites`. And a postseason matchup ESPN has not tiered yet is
 *      not inserted at all, so that residue is not created in the first place.
 *   2. **Derived columns are never written.** The `before_game_update` trigger
 *      computes `point_differential`, `is_blowout`, `is_close`, `is_tie`,
 *      `winner_team_id`, `loser_team_id` and `completed_at` on every write, and
 *      `is_completed` is generated. Sending `completed_at: null` in a patch
 *      would make the trigger re-stamp it with the import time, which is the
 *      exact bug being removed here.
 *   3. **A matched row is checked against ESPN, not just patched.** ESPN reuses
 *      matchup ids when it re-draws a schedule, so matching on one proves
 *      nothing about the teams. A scoreless row that disagrees is re-pointed;
 *      one that already has a result is reported as a conflict and left alone,
 *      because its scores belong to the teams currently stored.
 */

/** Columns the database owns. A payload containing any of these is a bug. */
export const TRIGGER_OWNED_COLUMNS = Object.freeze([
  'is_completed',
  'winner_team_id',
  'loser_team_id',
  'is_tie',
  'point_differential',
  'is_blowout',
  'is_close',
  'completed_at'
]);

/**
 * Look up a league team from an ESPN matchup side.
 *
 * ESPN id first, owner name second. Within a season the ESPN id is exact and
 * every team has one; the owner name is the identity that survives a team being
 * renumbered, which is why it stays as the fallback.
 *
 * Accepts teams in either shape — `getSeason()` returns camelCase,
 * `getTeamsForSeason()` returns database rows — because both callers exist.
 * The previous copy of this in `scripts/sync-week.js` read `team.ownerName`,
 * a key neither shape has, so its owner fallback never once fired.
 */
export function buildTeamIndex(teams = []) {
  const byEspnId = new Map();
  const byOwner = new Map();

  for (const team of teams) {
    const espnTeamId = team.espnTeamId ?? team.espn_team_id;
    const owner = team.owner ?? team.ownerName ?? team.owner_name;

    if (espnTeamId != null) byEspnId.set(String(espnTeamId), team);
    if (owner) byOwner.set(ownerKey(owner), team);
  }

  return {
    size: teams.length,
    byEspnId,
    byOwner,
    find(espnTeamId, ownerName) {
      if (espnTeamId != null && byEspnId.has(String(espnTeamId))) {
        return byEspnId.get(String(espnTeamId));
      }
      if (ownerName) {
        return byOwner.get(ownerKey(ownerName)) ?? null;
      }
      return null;
    }
  };
}

/**
 * ESPN playoff bracket → the `type` values `games_type_check` allows.
 *
 * `playoffTierType` is a **string** — 'NONE', 'WINNERS_BRACKET',
 * 'LOSERS_CONSOLATION_LADDER', 'WINNERS_CONSOLATION_LADDER'. The fetcher used
 * to test `playoffTierType > 0`, which is false for every string, so no matchup
 * was ever recognised as a playoff game and the whole 2025 bracket had to be
 * typed by hand.
 *
 * The tier says which bracket; the round comes from how far into the postseason
 * the week is. Both are needed. Derived against the 2025 rows, which this
 * reproduces exactly: week 15 winners → first round, consolation →
 * quarterfinals; week 16 → semifinals; week 17 → championship.
 *
 * Rounds, not pairings: ESPN decides who plays whom and this classifies what it
 * sends. That is why the 2026 change — division winners on byes, four
 * league-wide wildcards, semifinals re-seeded NFL-style — needs nothing here.
 * It does mean ESPN's own bracket settings have to implement the re-seed; if
 * they do not, the games still import and render correctly under the seeds they
 * actually contain, but a predicted semifinal will not match the real one.
 */
export function resolveGameType(matchup, { isBye, playoffIndex }) {
  if (isBye) return 'bye';

  // No tier in a postseason week is not a regular-season game; it is a matchup
  // ESPN has not placed in a bracket yet. `null` means "unresolved" — the
  // planner holds it back rather than write a type it could never correct.
  const tier = matchup.playoffTierType;
  if (!tier || tier === 'NONE') return playoffIndex > 0 ? null : 'regular';

  const winners = ['playoff_first_round', 'playoff_semifinals', 'playoff_championship'];
  const consolation = [
    'playoff_consolation_quarterfinals',
    'playoff_consolation_semifinals',
    'playoff_consolation_championship'
  ];

  // playoffIndex is 1-based: week 15 of a 14-week regular season is index 1.
  const round = (ladder) => ladder[playoffIndex - 1] ?? 'playoff';

  if (tier === 'WINNERS_BRACKET') return round(winners);
  if (tier === 'LOSERS_CONSOLATION_LADDER') return round(consolation);

  // WINNERS_CONSOLATION_LADDER (the placement game for teams knocked out of the
  // winners bracket) and any tier ESPN adds later. Flat 'playoff' is always a
  // legal value; guessing a round would not be.
  return 'playoff';
}

/**
 * Has this matchup actually been played?
 *
 * ESPN answers this directly: `winner` is 'HOME' | 'AWAY' | 'TIE' while a game
 * is decided and 'UNDECIDED' before. The old rule was `score > 0 on either
 * side`, which cannot tell a scheduled week (0–0) from a real one, and would
 * import a future week as a completed tie.
 *
 * The scoring-period comparison is a fallback for payloads without a winner.
 */
export function hasFinalScore(matchup, { currentScoringPeriod = null } = {}) {
  const winner = matchup.espnWinner ?? matchup.winner;
  if (winner && winner !== 'UNDECIDED') return true;

  if (currentScoringPeriod != null && matchup.week != null) {
    return matchup.week < currentScoringPeriod;
  }

  return false;
}

/** Numeric-safe comparison; PostgREST hands `numeric` back as a number. */
const sameScore = (a, b) => {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return Number(a) === Number(b);
};

/**
 * Do a stored row and an ESPN matchup name the same two teams?
 *
 * Unordered on purpose. A row is allowed to store the pair the other way round
 * from ESPN's home/away — `findExistingGame` matches those, and the score
 * assignment above respects them — so only a genuinely different pair of teams
 * counts as drift. A bye compares `null` against `null` and needs no special
 * case.
 */
const isSamePairing = (row, team1Id, team2Id) =>
  (row.team1_id === team1Id && row.team2_id === team2Id) ||
  (row.team1_id === team2Id && row.team2_id === team1Id);

/**
 * Has this row got a result already?
 *
 * `is_completed` is generated from the scores, so either is sufficient; both
 * are checked because a caller may not have selected the generated column.
 */
const hasResult = (row) =>
  row.team1_score != null || row.team2_score != null || row.is_completed === true;

/** The two teams of a matchup, or a reason why they could not be resolved. */
function resolveSides(matchup, teamIndex) {
  const home = matchup.homeTeam?.teamId != null
    ? teamIndex.find(matchup.homeTeam.teamId, matchup.homeTeam.ownerName)
    : null;
  const away = matchup.awayTeam?.teamId != null
    ? teamIndex.find(matchup.awayTeam.teamId, matchup.awayTeam.ownerName)
    : null;

  // ESPN models a bye as a matchup with one side missing entirely.
  const isBye = matchup.awayTeam?.teamId == null || matchup.homeTeam?.teamId == null;

  if (isBye) {
    const solo = home ?? away;
    if (!solo) return { error: 'bye team not found in this season' };
    return { isBye: true, team1: solo, team2: null };
  }

  if (!home && !away) return { error: 'neither team found in this season' };
  if (!home) return { error: `home team ${matchup.homeTeam.teamId} not found in this season` };
  if (!away) return { error: `away team ${matchup.awayTeam.teamId} not found in this season` };

  return { isBye: false, team1: home, team2: away };
}

/**
 * Find the row this matchup already has, if any.
 *
 * Three rungs, first hit wins:
 *   1. the ESPN matchup id — exact once a row has been stamped;
 *   2. the same week and the same pair of teams **in either order** — this is
 *      what adopts rows written before ESPN ids were stored, including the
 *      hand-built 2025 postseason, instead of inserting a duplicate beside them;
 *   3. a bye: same week, same team, no opponent.
 */
function findExistingGame(existingGames, { matchup, week, team1, team2, isBye }) {
  if (matchup.matchupId != null) {
    const byEspnId = existingGames.find((row) => row.espn_matchup_id === matchup.matchupId);
    if (byEspnId) return { row: byEspnId, matchedBy: 'espn_matchup_id' };
  }

  if (isBye) {
    const bye = existingGames.find(
      (row) => row.week === week && row.team1_id === team1.id && row.team2_id === null
    );
    return bye ? { row: bye, matchedBy: 'bye' } : null;
  }

  const pair = existingGames.find(
    (row) =>
      row.week === week &&
      ((row.team1_id === team1.id && row.team2_id === team2.id) ||
        (row.team1_id === team2.id && row.team2_id === team1.id))
  );

  return pair ? { row: pair, matchedBy: 'teams' } : null;
}

/**
 * Turn ESPN matchups into inserts and patches against what is already stored.
 *
 * @param {Object} options
 * @param {string} options.seasonId
 * @param {Array}  options.matchups      normalized matchups from the fetcher
 * @param {Array}  options.existingGames raw `games` rows for the season/week
 * @param {Object} options.teamIndex     from `buildTeamIndex`
 * @param {number} [options.regularSeasonWeeks] for playoff round math
 * @param {number} [options.currentScoringPeriod]
 * @param {string} [options.userId]      stamped on inserts only
 * @param {number} [options.week]        only consider this week
 * @param {boolean} [options.withholdResults] write rows and types, never a
 *   score — the daily refresh's postseason pass, which must not write results
 * @returns {{inserts: Array, updates: Array, unchanged: number, unmatched: Array,
 *   conflicts: Array, untyped: Array, handEntered: Array}}
 */
export function planGameWrites({
  seasonId,
  matchups = [],
  existingGames = [],
  teamIndex,
  regularSeasonWeeks = 14,
  currentScoringPeriod = null,
  userId = null,
  week = null,
  withholdResults = false
}) {
  const inserts = [];
  const updates = [];
  const unmatched = [];
  const conflicts = [];
  const untyped = [];
  const handEntered = [];
  let unchanged = 0;

  // Rows this plan has already claimed, so two matchups cannot both adopt the
  // same game — that would produce a duplicate insert on the next run.
  const claimed = new Set();

  for (const matchup of matchups) {
    const matchupWeek = matchup.week;
    if (week != null && matchupWeek !== week) continue;

    const sides = resolveSides(matchup, teamIndex);
    if (sides.error) {
      unmatched.push({
        matchupId: matchup.matchupId,
        week: matchupWeek,
        homeEspnTeamId: matchup.homeTeam?.teamId ?? null,
        awayEspnTeamId: matchup.awayTeam?.teamId ?? null,
        reason: sides.error
      });
      continue;
    }

    const { isBye, team1, team2 } = sides;
    const existing = findExistingGame(
      existingGames.filter((row) => !claimed.has(row.id)),
      { matchup, week: matchupWeek, team1, team2, isBye }
    );

    const played = !withholdResults && !isBye && hasFinalScore(matchup, { currentScoringPeriod });
    const homeScore = matchup.homeTeam?.score ?? null;
    const awayScore = matchup.awayTeam?.score ?? null;
    const playoffIndex = matchupWeek - regularSeasonWeeks;

    if (!existing) {
      const type = resolveGameType(matchup, { isBye, playoffIndex });

      // A postseason matchup ESPN has not tiered. Inserting it would type it
      // `regular`, so it waits: the next run sees the tier and inserts it right.
      if (type === null) {
        untyped.push({
          matchupId: matchup.matchupId ?? null,
          week: matchupWeek,
          reason: 'ESPN has not placed this postseason matchup in a bracket yet'
        });
        continue;
      }

      inserts.push({
        season_id: seasonId,
        week: matchupWeek,
        team1_id: team1.id,
        team2_id: team2?.id ?? null,
        team1_score: played ? homeScore : null,
        team2_score: played ? awayScore : null,
        type,
        espn_matchup_id: matchup.matchupId ?? null,
        espn_scoring_period_id: matchup.scoringPeriodId ?? null,
        ...(userId ? { user_id: userId } : {})
      });
      continue;
    }

    claimed.add(existing.row.id);
    const row = existing.row;
    const patch = {};

    // A hand-entered result is the league's own record of a game ESPN does not
    // have — 2024 week 1 was played before the league was wiped and restarted,
    // so whatever ESPN reports for that week describes a different league.
    // Nothing on the row is patched: not the scores, the pairing, the week or
    // the ESPN ids. Claimed above all the same, so no other matchup adopts it.
    if (row.hand_entered) {
      handEntered.push({ id: row.id, matchupId: matchup.matchupId ?? null, week: matchupWeek });
      unchanged += 1;
      continue;
    }

    // Does the stored row still describe the fixture ESPN is reporting?
    //
    // Rung 1 of `findExistingGame` matches on the ESPN matchup id alone, and
    // ESPN reuses those ids when it reshuffles a schedule. Without this check
    // the patch below could only ever carry scores and ESPN ids, so a
    // re-drawn week matched its old row, produced an empty patch and was
    // reported as "unchanged" — which is exactly what happened to all seven
    // 2026 week-1 games, twice, including under --dry-run. The stale pairing
    // survived a full re-import because no amount of re-running could express
    // the correction.
    const espnTeam2Id = team2?.id ?? null;
    const samePairing = isSamePairing(row, team1.id, espnTeam2Id);
    const sameWeek = row.week === matchupWeek;

    if (!samePairing || !sameWeek) {
      // A row that already has a result must never be silently re-pointed:
      // those scores were produced by the teams currently stored, and moving
      // the row would attribute a played game to somebody who did not play it.
      // Report it and let a person decide.
      if (hasResult(row)) {
        conflicts.push({
          id: row.id,
          matchupId: matchup.matchupId ?? null,
          matchedBy: existing.matchedBy,
          storedWeek: row.week,
          espnWeek: matchupWeek,
          storedTeams: [row.team1_id, row.team2_id],
          espnTeams: [team1.id, espnTeam2Id],
          reason: samePairing
            ? 'ESPN moved this matchup to another week, but the stored row already has a result'
            : 'ESPN reports different teams for this matchup, but the stored row already has a result'
        });
        continue;
      }

      if (!samePairing) {
        patch.team1_id = team1.id;
        patch.team2_id = espnTeam2Id;
      }
      if (!sameWeek) patch.week = matchupWeek;
    }

    // Scores follow the teams the row will hold *after* this patch, not ESPN's
    // home/away: a row may legitimately store the pair the other way round, and
    // a re-pointed row takes ESPN's order.
    const team1IsHome = patch.team1_id !== undefined ? true : row.team1_id === team1.id;
    const team1Score = played ? (team1IsHome ? homeScore : awayScore) : null;
    const team2Score = played ? (team1IsHome ? awayScore : homeScore) : null;

    // Never null out a stored score: ESPN reporting a game as undecided again
    // (a mid-week refetch) must not erase last week's result.
    if (played) {
      if (!sameScore(row.team1_score, team1Score)) patch.team1_score = team1Score;
      if (!sameScore(row.team2_score, team2Score)) patch.team2_score = team2Score;
    }

    // Stamp ESPN identity onto rows that predate it. This is what makes the
    // next run match on rung 1 instead of falling back to the team pair.
    if (matchup.matchupId != null && row.espn_matchup_id !== matchup.matchupId) {
      patch.espn_matchup_id = matchup.matchupId;
    }
    if (
      matchup.scoringPeriodId != null &&
      row.espn_scoring_period_id !== matchup.scoringPeriodId
    ) {
      patch.espn_scoring_period_id = matchup.scoringPeriodId;
    }

    // The one stored type the sync corrects: a postseason row typed `regular`.
    // That value is only ever what an untiered matchup was given before this
    // planner held them back — no hand correction and no derived type is
    // `regular` in a postseason week — so replacing it undoes nobody's work.
    if (row.type === 'regular' && playoffIndex > 0) {
      const resolved = resolveGameType(matchup, { isBye, playoffIndex });
      if (resolved && resolved !== 'regular') patch.type = resolved;
    }

    if (Object.keys(patch).length === 0) {
      unchanged += 1;
      continue;
    }

    updates.push({ id: row.id, patch, matchedBy: existing.matchedBy, week: matchupWeek });
  }

  return { inserts, updates, unchanged, unmatched, conflicts, untyped, handEntered };
}

/**
 * Does one stored postseason week have the shape the bracket requires?
 *
 * Pure, over the `games` rows of a single week. The sync runs it after writing
 * a postseason week and the Automations dashboard runs it over every elapsed
 * one, so the two cannot disagree about what a correct bracket week is. Each
 * string returned is one thing a person should look at; an empty list is a
 * correct week.
 *
 *   round 1  two first-round games — and from 2026, the two bye rows that
 *            `finalize_season` refuses to run without
 *   round 2  two semifinals
 *   round 3  one championship
 *   always   no postseason game typed `regular`
 *
 * Consolation and placement games are not counted: their number follows the
 * league size and ESPN's ladder settings, and neither decides the title.
 *
 * `complete: false` is for the week in progress, where ESPN may not have drawn
 * the round yet: only a game typed `regular` is reported, since that is wrong
 * the moment it is written.
 */
export function validatePostseasonWeek(
  games = [],
  { week, regularSeasonWeeks = 14, year = null, complete = true } = {}
) {
  const round = week - regularSeasonWeeks;
  if (!(round >= 1)) return [];

  const count = (type) => games.filter((game) => game.type === type).length;
  const issues = [];

  const expectCount = (type, expected, label) => {
    const found = count(type);
    if (found !== expected) issues.push(`week ${week}: ${found} ${label}, expected ${expected}`);
  };

  const regular = count('regular');
  if (regular > 0) {
    issues.push(`week ${week}: ${regular} postseason ${regular === 1 ? 'game' : 'games'} typed regular`);
  }

  if (!complete) return issues;

  if (round === 1) {
    expectCount('playoff_first_round', 2, 'first-round games');
    if (year != null && year >= PLAYOFF_RESEED_YEAR) expectCount('bye', 2, 'bye rows');
  } else if (round === 2) {
    expectCount('playoff_semifinals', 2, 'semifinals');
  } else if (round === 3) {
    expectCount('playoff_championship', 1, 'championship games');
  }

  return issues;
}
