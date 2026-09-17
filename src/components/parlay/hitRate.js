/**
 * How often a member's parlay pick has actually scored.
 *
 * Over *graded* picks only, never every pick entered. A NULL `scored_td` is
 * ungraded, not "no touchdown" — the sync's grader deliberately skips every
 * case it is not certain of, and a pick can sit pending for days — so counting
 * pending weeks as misses would report a season as worse than it is, and the
 * figure would move as the grader caught up rather than as the football
 * happened.
 *
 * Nothing graded yet returns null rather than 0%, the record book's rule:
 * unknown is absent, not zero.
 *
 * @param {Array<{ scoredTd?: boolean|null }>} picks
 * @returns {{ hits: number, graded: number, percent: number }|null}
 */
export function parlayHitRate(picks = []) {
  const graded = picks.filter((pick) => pick?.scoredTd === true || pick?.scoredTd === false);
  if (graded.length === 0) return null;
  const hits = graded.filter((pick) => pick.scoredTd === true).length;
  return { hits, graded: graded.length, percent: (hits / graded.length) * 100 };
}
