/**
 * A team's score for a week, summed from its lineup.
 *
 * One definition, because two surfaces show this number — the pick'ems
 * research header and the Schedule card's score line — and a projected total
 * that disagreed with itself between two tabs would be worse than no total at
 * all.
 *
 * Verified against the live league: this league starts QB/2RB/2WR/TE/FLEX/D-ST/K,
 * and summing a team's starters reproduces ESPN's own matchup score exactly
 * (see the `player_week_stats` note in CLAUDE.md). So a sum of starters is a
 * real projected score, not an approximation of one.
 */

/**
 * Bench and IR do not score, so they are not part of a team's total.
 *
 * `started` is the fact both row sources carry — `player_week_stats.started`
 * from `isStarterSlot`, and a derived `slot !== 'BE' && slot !== 'IR'` in
 * `getCurrentLineupsForWeek`. The slot check is belt and braces for a row
 * shape that has one but not the other.
 */
export function isScoringStarter(row) {
  return Boolean(row?.started) && row.rosterSlot !== 'BE' && row.rosterSlot !== 'IR';
}

/**
 * Sum a lineup, and say whether the answer is still a projection.
 *
 * `isProjected` is true while *any* counted starter is still on a projection.
 * That is the conservative direction on purpose: a total is only a result once
 * every starter in it is a result, and calling a mid-week mixture "final"
 * would be the one error a reader cannot detect — the number looks exactly the
 * same either way.
 *
 * Rows with neither an actual nor a projection are skipped rather than counted
 * as zero, the null-never-0 rule again. That does make the total an
 * underestimate when a starter has no figure at all, which is why the per-row
 * dash beside them stays visible: the lineup shows what the total is missing.
 *
 * @param {object[]} rows lineup rows, as `useWeekPlayerStats` / `useCurrentLineups` return
 * @returns {{ total: number|null, isProjected: boolean }} `total` is null when
 *   nothing is known — an unimported season, or a week nobody has synced.
 */
export function lineupTotal(rows = []) {
  let total = 0;
  let counted = 0;
  let actuals = 0;

  for (const row of rows) {
    const points = row?.actualPoints ?? row?.projectedPoints;
    if (points == null || !Number.isFinite(Number(points))) continue;

    total += Number(points);
    counted += 1;
    if (row.actualPoints != null) actuals += 1;
  }

  if (counted === 0) return { total: null, isProjected: false };

  return { total, isProjected: actuals < counted };
}

/**
 * A `{ total, isProjected }` pair as the two props `ui/player-points.jsx` takes.
 *
 * One definition of the mapping because two surfaces render this total, and
 * writing the ternary out at each of them is how one of them ends up passing
 * `projectedPoints` unconditionally and labelling a finished week's score
 * "proj" — which is exactly what happened.
 */
export function totalAsPoints(total) {
  if (!total || total.total == null) return { actualPoints: null, projectedPoints: null };

  return total.isProjected
    ? { actualPoints: null, projectedPoints: total.total }
    : { actualPoints: total.total, projectedPoints: null };
}

/** `lineupTotal` over the scoring starters only. The read both surfaces want. */
export function starterTotal(rows = []) {
  return lineupTotal(rows.filter(isScoringStarter));
}

export default starterTotal;
