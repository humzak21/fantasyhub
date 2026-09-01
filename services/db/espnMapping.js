/**
 * Pure ESPN → internal value mapping. No database access, no context — which
 * is exactly why these three belong on their own where they can be tested
 * without a client.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

// Helper function to map ESPN injury status to database-allowed values
export function mapESPNInjuryStatus(espnInjuryStatus) {
  if (!espnInjuryStatus) return 'ACTIVE';

  // Convert to uppercase and handle common ESPN injury status values
  const status = espnInjuryStatus.toString().toUpperCase().trim();

  // Direct matches
  const validStatuses = ['ACTIVE', 'QUESTIONABLE', 'DOUBTFUL', 'OUT', 'IR', 'SUSPENDED', 'PUP'];
  if (validStatuses.includes(status)) {
    return status;
  }

  // Handle common ESPN variations and mappings
  const statusMap = {
    'HEALTHY': 'ACTIVE',
    'Q': 'QUESTIONABLE',
    'D': 'DOUBTFUL',
    'O': 'OUT',
    'INJURED_RESERVE': 'IR',
    'RESERVE': 'IR',
    'PHYSICALLY_UNABLE_TO_PERFORM': 'PUP',
    'PUP_R': 'PUP',
    'SUSP': 'SUSPENDED',
    'SUS': 'SUSPENDED',
    'NA': 'ACTIVE',
    'PROBABLE': 'ACTIVE', // ESPN removed probable, treat as active
    'GTD': 'QUESTIONABLE', // Game Time Decision
    'GAME_TIME_DECISION': 'QUESTIONABLE'
  };

  return statusMap[status] || 'ACTIVE'; // Default to ACTIVE for unknown statuses
}

// Helper function to map ESPN pro team IDs to NFL team abbreviations
export function getNFLTeamAbbreviation(proTeamId) {
  const teamMap = {
    1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
    9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
    17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
    25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU'
  };
  return teamMap[proTeamId] || null;
}

// Helper function to map ESPN roster slots to database roster slots.
// The player's position is not consulted: the ESPN slot id already encodes it,
// and where it does not (FLEX, BENCH, IR) the slot is what we want to store.
//
// The multi-position slots (3, 5, 7) and the team QB slot (1) were missing, so
// anyone started in one of them fell through to the `|| 'BE'` default and was
// recorded as a bench player. That is invisible in the roster view — the names
// are all there — but it makes a started player look benched to anything
// counting starters, which `player_week_stats` now does.
export function mapESPNRosterSlot(espnSlot) {
  // ESPN roster slot mapping
  const slotMap = {
    0: 'QB',   // QB
    1: 'QB',   // TQB (team QB)
    2: 'RB',   // RB
    3: 'FLEX', // RB/WR
    4: 'WR',   // WR
    5: 'FLEX', // WR/TE
    6: 'TE',   // TE
    7: 'FLEX', // OP (offensive player)
    16: 'D/ST', // D/ST
    17: 'K',   // K
    20: 'BE',  // Bench
    21: 'IR',  // IR
    23: 'FLEX' // Flex
  };

  return slotMap[espnSlot] || 'BE';
}

/** Bench (20) and IR (21) are the only ESPN slots that do not score. */
export function isStarterSlot(espnSlot) {
  return espnSlot != null && espnSlot !== 20 && espnSlot !== 21;
}

/**
 * The ESPN stat ids this app derives figures from.
 *
 * ESPN keys a player's per-category stat map by a numeric id as a *string*, so
 * these are strings: `statBreakdown['25']`, never `statBreakdown[25]`.
 *
 * Verified arithmetically on 2026-09-01 against completed 2025 season totals
 * rather than taken from a community id list. Jahmyr Gibbs' stored line —
 * 1223 rushing yards, 13 of id 25, 616 receiving yards, 5 of id 43, 77
 * receptions, 1 fumble lost — reproduces his 366.9 `appliedTotal` exactly under
 * PPR scoring, and Jalen Hurts' 25 of id 4 reproduces his 299.06. A mislabelled
 * id would not reconcile.
 *
 * This is a deliberately short list. `stat_breakdown` stores ESPN's whole map,
 * so naming an id here is about what the app *derives*, not about what it
 * keeps — the rest stays in the column awaiting a reader.
 */
export const ESPN_STAT_IDS = {
  PASSING_TD: '4',
  RUSHING_TD: '25',
  RECEIVING_TD: '43'
};

/** The ids that mean the player carried the ball into the end zone themselves. */
const SCORED_TD_IDS = [ESPN_STAT_IDS.RUSHING_TD, ESPN_STAT_IDS.RECEIVING_TD];

/** Sum a set of stat ids out of a breakdown, or null when there is no breakdown. */
function sumStats(statBreakdown, ids) {
  // Null is "we do not know", and it has to survive: `player_week_stats` rows
  // written before 2026-09 have no breakdown at all, and returning 0 for those
  // would report every player in league history as having scored nothing. The
  // power ranking learned this the expensive way — see the "a component that
  // cannot be computed is null, never 0" rule in CLAUDE.md.
  if (!statBreakdown || typeof statBreakdown !== 'object') return null;

  let total = 0;
  for (const id of ids) {
    const value = Number(statBreakdown[id]);
    if (Number.isFinite(value)) total += value;
  }

  return total;
}

/**
 * Touchdowns this player was involved in: thrown, run and caught.
 *
 * The broad count, and rarely the one a question wants. A quarterback who threw
 * four is credited with four here, which is right for "who produced the most
 * touchdowns" and wrong for "did this player score one" — for that, use
 * `getScoredTouchdownCount`.
 *
 * @returns {number|null} null when the row has no breakdown stored
 */
export function getTouchdownCount(statBreakdown) {
  return sumStats(statBreakdown, Object.values(ESPN_STAT_IDS));
}

/**
 * Touchdowns this player *scored* — rushing and receiving only.
 *
 * The question the weekly TD parlay actually asks. A passing touchdown is
 * thrown, not scored: the quarterback who throws for four has scored none, and
 * grading his pick as a hit on that basis would be wrong in the one direction
 * nobody would check. The two counts are separate functions rather than a flag
 * so that a future auto-grader has to say which one it means.
 *
 * @returns {number|null} null when the row has no breakdown stored
 */
export function getScoredTouchdownCount(statBreakdown) {
  return sumStats(statBreakdown, SCORED_TD_IDS);
}
