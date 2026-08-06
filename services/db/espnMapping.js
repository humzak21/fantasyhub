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
export function mapESPNRosterSlot(espnSlot) {
  // ESPN roster slot mapping
  const slotMap = {
    0: 'QB',   // QB
    2: 'RB',   // RB  
    4: 'WR',   // WR
    6: 'TE',   // TE
    16: 'D/ST', // D/ST
    17: 'K',   // K
    20: 'BE',  // Bench
    21: 'IR',  // IR
    23: 'FLEX' // Flex
  };

  return slotMap[espnSlot] || 'BE';
}
