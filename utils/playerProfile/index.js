/**
 * The player page's pure half: the stat catalog, the profile builder and the
 * career ranking. No React, no database.
 */

export {
  STAT_GROUPS,
  GROUPS_BY_POSITION,
  groupsFor,
  statLine,
  sumStatLines,
  summarizeLine
} from './statCatalog.js';

export {
  buildPlayerProfile,
  aggregate,
  buildTrends,
  recordWhenStarted,
  percentile,
  stddevPop,
  RECENT_GAMES,
  BOOM_FACTOR,
  BUST_FACTOR,
  MIN_RATE_GAMES,
  GAME_LIST_SIZE
} from './buildPlayerProfile.js';

export { rankCareers, neighbours } from './rankCareers.js';
