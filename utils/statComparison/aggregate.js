/**
 * Turning facts into figures: one value, a line over weeks, a line over
 * seasons, or points for a scatter. Every path goes through `accumulate`, so a
 * season total, the last point of its running line and its share of an
 * all-time total can never disagree.
 */

import { rankRows } from '../recordBook/index.js';
import { bucketKey } from './facts.js';

function merge(stat, totals, components) {
  const next = totals ? { ...totals } : {};
  for (const [key, value] of Object.entries(components)) {
    if (!Number.isFinite(value)) continue;
    const mode = stat.combine?.[key] ?? 'sum';
    if (!(key in next)) next[key] = value;
    else if (mode === 'max') next[key] = Math.max(next[key], value);
    else if (mode === 'min') next[key] = Math.min(next[key], value);
    else next[key] += value;
  }
  return next;
}

/** Combined totals over some facts, or `null` when none of them bear on the stat. */
function accumulate(stat, facts, totals = null) {
  let result = totals;
  for (const fact of facts) {
    const components = stat.components(fact);
    if (components) result = merge(stat, result, components);
  }
  return result;
}

const finite = (value) => (Number.isFinite(value) ? value : null);
const valueOf = (stat, totals) => (totals ? finite(stat.value(totals)) : null);

function factsOf(stat, bucket) {
  if (!bucket || (stat.completedOnly && !bucket.completed)) return [];
  if (stat.from === 'week') return bucket.weeks;
  if (stat.from === 'playoff') return bucket.playoffs;
  return bucket.season ? [bucket.season] : [];
}

/** Can the stat be drawn week by week? */
export const hasWeeklyView = (stat) => stat?.from === 'week';

/**
 * One franchise's figure over a set of seasons.
 *
 * `perSeason` divides a count by the seasons that contributed to it, so a
 * two-season franchise can stand beside a seven-season one; a rate is already
 * comparable and is left alone.
 *
 * @returns {{ value: number|null, seasons: number, games: number }}
 */
export function statValue(facts, stat, franchiseId, years, { perSeason = false } = {}) {
  let totals = null;
  let seasons = 0;
  let games = 0;

  for (const year of years) {
    const bucket = facts.buckets.get(bucketKey(franchiseId, year));
    const seasonTotals = accumulate(stat, factsOf(stat, bucket));
    if (!seasonTotals) continue;
    seasons += 1;
    games += bucket.weeks.length;
    totals = merge(stat, totals, seasonTotals);
  }

  let value = valueOf(stat, totals);
  if (value != null && perSeason && stat.kind === 'count' && seasons > 0) value /= seasons;
  return { value, seasons, games };
}

/**
 * Every franchise's figure over the seasons, ranked in the stat's better
 * direction, with the franchises that have no figure listed apart.
 */
export function rankedValues(facts, stat, franchiseIds, years, options) {
  const rows = [];
  const missing = [];
  for (const franchiseId of franchiseIds) {
    const entry = statValue(facts, stat, franchiseId, years, options);
    if (entry.value == null) missing.push(franchiseId);
    else rows.push({ franchiseId, ...entry });
  }
  return {
    rows: rankRows(rows, { direction: stat.better === 'lower' ? 'asc' : 'desc' }),
    missing
  };
}

/**
 * One line per franchise across a season's regular-season weeks: the figure
 * to date for a running stat, that week's figure otherwise.
 *
 * @returns {{ rows: object[], series: { franchiseId, points: {week, value}[] }[] }}
 */
export function weeklySeries(facts, stat, franchiseIds, year) {
  const byWeek = new Map();
  const series = [];

  for (const franchiseId of franchiseIds) {
    const bucket = facts.buckets.get(bucketKey(franchiseId, year));
    if (!bucket || !hasWeeklyView(stat)) continue;

    const points = [];
    let running = null;
    for (const fact of bucket.weeks) {
      let value;
      if (stat.weekly === 'value') {
        value = valueOf(stat, accumulate(stat, [fact]));
      } else {
        running = accumulate(stat, [fact], running);
        value = valueOf(stat, running);
      }
      if (value == null) continue;
      points.push({ week: fact.week, value });
      if (!byWeek.has(fact.week)) byWeek.set(fact.week, { week: fact.week });
      byWeek.get(fact.week)[franchiseId] = value;
    }
    if (points.length > 0) series.push({ franchiseId, points });
  }

  return { rows: [...byWeek.values()].sort((a, b) => a.week - b.week), series };
}

/**
 * One line per franchise across seasons. A season the franchise sat out, or
 * one with no figure, is absent from its points — the chart draws a gap
 * rather than a line through a season that was never played.
 */
export function seasonSeries(facts, stat, franchiseIds, years, options) {
  const sorted = [...years].sort((a, b) => a - b);
  const rows = sorted.map((year) => ({ year }));
  const series = [];

  for (const franchiseId of franchiseIds) {
    const points = [];
    sorted.forEach((year, index) => {
      const { value } = statValue(facts, stat, franchiseId, [year], options);
      if (value == null) return;
      points.push({ year, value });
      rows[index][franchiseId] = value;
    });
    if (points.length > 0) series.push({ franchiseId, points });
  }

  return { rows, series };
}

/**
 * Two stats against each other: a point per franchise over the whole
 * selection (`mode: 'total'`) or a point per franchise-season
 * (`mode: 'season'`). A point needs both figures.
 */
export function scatterPoints(facts, statX, statY, franchiseIds, years, { mode = 'total', perSeason = false } = {}) {
  const points = [];
  const add = (franchiseId, yearList, year) => {
    const x = statValue(facts, statX, franchiseId, yearList, { perSeason }).value;
    const y = statValue(facts, statY, franchiseId, yearList, { perSeason }).value;
    if (x != null && y != null) points.push({ franchiseId, year, x, y });
  };

  for (const franchiseId of franchiseIds) {
    if (mode === 'season') {
      for (const year of years) add(franchiseId, [year], year);
    } else {
      add(franchiseId, years, null);
    }
  }

  const mean = (key) => (points.length > 0 ? points.reduce((sum, point) => sum + point[key], 0) / points.length : null);
  return { points, average: { x: mean('x'), y: mean('y') } };
}

/** The seasons a set of franchises played, oldest first. */
export function yearsPlayedBy(facts, franchiseIds) {
  return facts.years
    .map((entry) => entry.year)
    .filter((year) => franchiseIds.some((id) => facts.buckets.has(bucketKey(id, year))));
}
