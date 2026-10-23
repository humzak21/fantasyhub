/**
 * The home page's pick'ems widget, decided.
 *
 * Pure, over rows the Pick'ems tab already caches. The widget renders these
 * and nothing else.
 */

import { weekWinners } from '../../src/components/pickems/weekWinners.js';

/**
 * "9 of 14 picked · 7 of 14 parlays in".
 *
 * Picked is distinct members with a `pick_em_submissions` row this week; in is
 * the week's `td_parlay_picks` rows (one per member). The denominator is
 * `count_approved_members()` — exactly who may submit — and until it arrives
 * (or if it fails) the line says "9 picked", never "9 of —" and never a
 * denominator borrowed from the team count, which is a different set.
 *
 * @param {{ allPicks?: object[], parlayPicks?: object[], memberCount?: number|null }} input
 * @returns {{ picked: number, parlays: number, of: number|null, text: string }}
 */
export function pickemCounters({ allPicks = [], parlayPicks = [], memberCount = null } = {}) {
  const picked = new Set(allPicks.map((pick) => pick.userId).filter(Boolean)).size;
  const parlays = new Set(parlayPicks.map((pick) => pick.userId ?? pick.id).filter(Boolean)).size;
  const of = Number.isFinite(memberCount) && memberCount > 0 ? memberCount : null;

  const text = of
    ? `${picked} of ${of} picked · ${parlays} of ${of} parlays in`
    : `${picked} picked · ${parlays} ${parlays === 1 ? 'parlay' : 'parlays'} in`;

  return { picked, parlays, of, text };
}

/**
 * How the viewer did in a scored week, and who won it.
 *
 * Place is competition ranking on points (1, 2, 2, 4): `getWeeklyPickEmScores`
 * numbers its rows by array position, which would split a tie by sort order.
 * Winners come from `weekWinners`, the rule the Pick'ems tab uses.
 *
 * @param {object[]} scores - `getWeeklyPickEmScores` rows
 * @param {string|null} userId
 * @returns {{
 *   mine: null | { correct: number, decided: number, place: number, tied: boolean },
 *   winners: object[],
 *   entrants: number
 * }}
 */
export function viewerWeekResult(scores = [], userId = null) {
  const winners = weekWinners(scores);
  const row = userId ? scores.find((score) => score.userId === userId) : null;

  let mine = null;
  if (row) {
    const points = row.totalPoints ?? 0;
    const ahead = scores.filter((score) => (score.totalPoints ?? 0) > points).length;
    const level = scores.filter((score) => (score.totalPoints ?? 0) === points).length;
    mine = {
      correct: row.correctPicks ?? 0,
      decided: row.decidedPicks ?? row.totalPicks ?? 0,
      place: ahead + 1,
      tied: level > 1
    };
  }

  return { mine, winners, entrants: scores.length };
}
