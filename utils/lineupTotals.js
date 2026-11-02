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

import { GAME_STATE } from '../services/espnLiveScoreMapper.js';

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
 * **Rows the live overlay has touched carry `nflState`, and add three facts.**
 * While games are on, the sum above is the wrong number to show: it adds a
 * Sunday starter's projection to a Thursday starter's result. `scored` is the
 * actuals alone, the score so far, which is ESPN's own live total. `yetToPlay`
 * counts starters whose game has not kicked off, figure or no figure.
 * `liveState` says where the lineup stands:
 *
 *   - `playing`  somebody in it is on the field
 *   - `between`  it has points on the board and more to come, nobody on now
 *   - `done`     every starter's game is over, and it is still not official
 *
 * @param {object[]} rows lineup rows, as `useWeekPlayerStats` / `useCurrentLineups` return
 * @returns {{ total: number|null, isProjected: boolean, scored?: number, yetToPlay?: number, liveState?: string|null }}
 *   `total` is null when nothing is known — an unimported season, or a week
 *   nobody has synced.
 */
export function lineupTotal(rows = []) {
  let total = 0;
  let counted = 0;
  let actuals = 0;
  let scored = 0;
  let playing = 0;
  let yetToPlay = 0;
  let tracked = false;

  for (const row of rows) {
    if (row?.nflState != null) tracked = true;
    if (row?.nflState === GAME_STATE.IN_PROGRESS) playing += 1;
    if (row?.nflState === GAME_STATE.NOT_STARTED) yetToPlay += 1;

    const points = row?.actualPoints ?? row?.projectedPoints;
    if (points == null || !Number.isFinite(Number(points))) continue;

    total += Number(points);
    counted += 1;
    if (row.actualPoints != null) {
      actuals += 1;
      scored += Number(row.actualPoints);
    }
  }

  if (counted === 0) return { total: null, isProjected: false };

  const settled = { total, isProjected: actuals < counted };
  if (!tracked) return settled;

  let liveState = null;
  if (playing > 0) liveState = 'playing';
  else if (actuals > 0) liveState = yetToPlay > 0 ? 'between' : 'done';

  return { ...settled, scored, yetToPlay, liveState };
}

/**
 * The number a side stands on right now: the score so far once it has one, or
 * the projected total. `livePoints` is ESPN's matchup score, which wins over
 * the rows' own sum when the caller has it.
 */
export function currentPoints(total, livePoints = null) {
  if (total?.liveState) return livePoints ?? total.scored;
  return total?.total ?? null;
}

/** Where a matchup stands, from its two sides. See `lineupTotal`. */
export function matchupLiveState(a, b) {
  const states = [a?.liveState, b?.liveState];
  if (states.includes('playing')) return 'playing';
  if (states.includes('between')) return 'between';
  return states[0] === 'done' && states[1] === 'done' ? 'done' : null;
}

/**
 * A `{ total, isProjected }` pair as the two props `ui/player-points.jsx` takes.
 *
 * One definition of the mapping because two surfaces render this total, and
 * writing the ternary out at each of them is how one of them ends up passing
 * `projectedPoints` unconditionally and labelling a finished week's score
 * "proj" — which is exactly what happened.
 *
 * A lineup under way shows its score so far, not the projected sum, and says
 * which of the two it is through `live`.
 */
export function totalAsPoints(total, livePoints = null) {
  if (!total || total.total == null) return { actualPoints: null, projectedPoints: null };

  if (total.liveState === 'done') return { actualPoints: livePoints ?? total.scored, projectedPoints: null };
  if (total.liveState) {
    return { actualPoints: livePoints ?? total.scored, projectedPoints: null, live: total.liveState };
  }

  return total.isProjected
    ? { actualPoints: null, projectedPoints: total.total }
    : { actualPoints: total.total, projectedPoints: null };
}

/** One player's line as `ui/player-points.jsx` props. On the field is `live`. */
export function rowAsPoints(row) {
  return {
    actualPoints: row.actualPoints,
    projectedPoints: row.projectedPoints,
    live: row.nflState === GAME_STATE.IN_PROGRESS ? 'playing' : null
  };
}

/** `lineupTotal` over the scoring starters only. The read both surfaces want. */
export function starterTotal(rows = []) {
  return lineupTotal(rows.filter(isScoringStarter));
}

export default starterTotal;
