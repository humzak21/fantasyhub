/**
 * Which chart a selection gets. The reader picks a stat, teams and seasons;
 * this decides what shape answers that question, and which other shapes are
 * worth offering.
 *
 *   one season, weekly stat      Week by week (line) · Season total (bar)
 *   one season, season-only stat Season total (bar)
 *   some seasons                 Season by season (line) · Combined (bar)
 *   all seasons                  All-time (bar) · Season by season (line)
 *   a second stat                the same choice of total or per season, as a
 *                                scatter — never week by week
 *
 * A count over several seasons can be shown per season, so a franchise that
 * has played two seasons is not ranked against seven seasons' totals.
 */

import { hasWeeklyView } from './aggregate.js';

export const VIEW_IDS = { week: 'week', season: 'season', total: 'total' };

const totalLabel = (yearCount, allSeasons) =>
  yearCount === 1 ? 'Season total' : allSeasons ? 'All-time' : 'Combined';

/**
 * @param {{
 *   stat: object,
 *   statY?: object|null,
 *   yearCount: number,
 *   allSeasons: boolean,
 *   requested?: string|null,
 * }} selection
 * @returns {{
 *   view: 'week'|'season'|'total',
 *   chart: 'line-week'|'line-season'|'bar'|'scatter',
 *   options: { id: string, label: string }[],
 *   perSeasonToggle: boolean,
 * }}
 */
export function resolveView({ stat, statY = null, yearCount, allSeasons, requested = null }) {
  const scatter = Boolean(statY);
  const total = { id: VIEW_IDS.total, label: totalLabel(yearCount, allSeasons) };

  let options;
  if (yearCount <= 1) {
    options = !scatter && hasWeeklyView(stat)
      ? [{ id: VIEW_IDS.week, label: 'Week by week' }, total]
      : [total];
  } else {
    const season = { id: VIEW_IDS.season, label: scatter ? 'Each season' : 'Season by season' };
    options = allSeasons ? [total, season] : [season, total];
  }

  const view = options.some((option) => option.id === requested) ? requested : options[0].id;

  const chart = scatter
    ? 'scatter'
    : view === VIEW_IDS.week
      ? 'line-week'
      : view === VIEW_IDS.season
        ? 'line-season'
        : 'bar';

  const isCount = stat?.kind === 'count' || statY?.kind === 'count';
  const perSeasonToggle = view === VIEW_IDS.total && yearCount > 1 && isCount;

  return { view, chart, options, perSeasonToggle };
}
