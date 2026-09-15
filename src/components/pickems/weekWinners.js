/**
 * Who won a pick'em week: every member on the top score.
 *
 * Not `weeklyRank === 1`. `getWeeklyPickEmScores` numbers its rows by array
 * position, so two members on the same total come back ranked 1 and 2, and a
 * rank-based read would crown whichever one the sort happened to put first.
 *
 * A week nobody scored a point in has no winner, rather than a tie between
 * everyone who submitted.
 *
 * @param {Array<{ totalPoints: number }>} scores
 * @returns {Array} the rows on the top score, in their incoming order
 */
export function weekWinners(scores = []) {
  const top = Math.max(0, ...scores.map((score) => score.totalPoints ?? 0));
  if (top <= 0) return [];
  return scores.filter((score) => score.totalPoints === top);
}
