/**
 * Season standings, ranked so that a tie is a tie.
 *
 * `getSeasonPickEmStandings` numbers its rows by array position, so two
 * members on the same total come back ranked 1 and 2 and whichever the sort
 * happened to put first wears the trophy. That is the same bug `weekWinners`
 * exists to avoid, one grain up: everyone on the top score has won.
 *
 * Competition ranking (1, 2, 2, 4), on total points alone — accuracy is the
 * standings' sort tiebreak, not a tiebreak for the prize, and using it here
 * would silently separate two members the league considers level.
 *
 * @param {Array<{ totalPoints?: number }>} standings - in their sorted order
 * @returns {Array} the same rows, each with `rank`, `isTied` and `isLeader`
 */
export function rankSeasonStandings(standings = []) {
  const sorted = [...standings].sort(
    (a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0)
  );

  const countByPoints = new Map();
  for (const row of sorted) {
    const points = row.totalPoints ?? 0;
    countByPoints.set(points, (countByPoints.get(points) ?? 0) + 1);
  }

  let rank = 0;
  let previousPoints = null;

  return sorted.map((row, index) => {
    const points = row.totalPoints ?? 0;
    if (points !== previousPoints) {
      rank = index + 1;
      previousPoints = points;
    }
    return {
      ...row,
      rank,
      isTied: countByPoints.get(points) > 1,
      // A season nobody has scored in has no leader: everyone is on zero, and
      // crowning all fourteen of them on the Tuesday of week 1 is worse than
      // saying nothing.
      isLeader: rank === 1 && points > 0
    };
  });
}

/** 1 → "1st", 2 → "2nd", 23 → "23rd". */
export function ordinal(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  const rem100 = value % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}
