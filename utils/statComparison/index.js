/**
 * The History overview's stat comparison: any stat, any teams, any seasons.
 *
 *   facts.js      the record book's per-game rows, bucketed by franchise-season
 *   catalog.js    every stat, as additive components plus a value function
 *   aggregate.js  values, weekly and season lines, scatter points
 *   view.js       which chart a selection gets
 *
 * Pure: `useStatComparison` runs `buildComparisonFacts` in `select` over the
 * record book's cached source, and the component does the rest at render.
 */

export { buildComparisonFacts, bucketKey } from './facts.js';
export { CATEGORIES, STATS, STATS_BY_ID, DEFAULT_STAT_ID, getStat } from './catalog.js';
export {
  hasWeeklyView,
  statValue,
  rankedValues,
  weeklySeries,
  seasonSeries,
  scatterPoints,
  yearsPlayedBy
} from './aggregate.js';
export { VIEW_IDS, resolveView } from './view.js';
