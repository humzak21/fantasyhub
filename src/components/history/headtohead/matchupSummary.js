/**
 * Everything worth saying about two franchises' meetings, from the list of them.
 *
 * Pure, over `getMatchupHistory`'s rows: oldest first, every row oriented so
 * franchise 1 is `team1`. Index 0 of every pair below is franchise 1.
 *
 * Playoff means a bracket game (`isPlayoff`), and consolation is counted
 * separately rather than folded into either — the pre-2025 flat postseason
 * types are what used to make a consolation game read as a playoff meeting.
 * A tie is half a win in the win percentage, as everywhere in the league, and
 * breaks a streak.
 */

export const phaseOf = (game) =>
  game.isPlayoff ? 'playoff' : game.isConsolation ? 'consolation' : 'regular';

const emptyRecord = () => ({ wins: 0, losses: 0, ties: 0 });

const emptySide = () => ({
  wins: 0,
  losses: 0,
  ties: 0,
  points: 0,
  byPhase: { regular: emptyRecord(), playoff: emptyRecord(), consolation: emptyRecord() },
  highScore: null,
  biggestWin: null,
  longestStreak: null
});

/**
 * @param {object[]} games from `getMatchupHistory`
 * @returns {null | {
 *   totalGames: number,
 *   phases: { regular: number, playoff: number, consolation: number },
 *   sides: object[],
 *   averageCombined: number,
 *   highestCombined: { value: number, game: object },
 *   closest: { value: number, game: object } | null,
 *   currentStreak: { side: 0|1, length: number } | null,
 *   recent: object[]
 * }}
 */
export function summarizeMatchup(games = []) {
  const played = games.filter(
    (game) => Number.isFinite(game.team1Score) && Number.isFinite(game.team2Score)
  );
  if (played.length === 0) return null;

  const sides = [emptySide(), emptySide()];
  const phases = { regular: 0, playoff: 0, consolation: 0 };
  const runs = [null, null];
  let combinedTotal = 0;
  let highestCombined = null;
  let closest = null;

  for (const game of played) {
    const scores = [game.team1Score, game.team2Score];
    const phase = phaseOf(game);
    const winner = scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : null;
    const combined = scores[0] + scores[1];
    const margin = Math.abs(scores[0] - scores[1]);

    phases[phase] += 1;
    combinedTotal += combined;
    if (!highestCombined || combined > highestCombined.value) highestCombined = { value: combined, game };
    // A tie is not a close game; it is a tie.
    if (margin > 0 && (!closest || margin < closest.value)) closest = { value: margin, game };

    for (const i of [0, 1]) {
      const side = sides[i];
      const record = side.byPhase[phase];
      side.points += scores[i];
      if (!side.highScore || scores[i] > side.highScore.value) side.highScore = { value: scores[i], game };

      if (winner === i) {
        side.wins += 1;
        record.wins += 1;
        const won = scores[i] - scores[1 - i];
        if (!side.biggestWin || won > side.biggestWin.value) side.biggestWin = { value: won, game };

        runs[i] = runs[i]
          ? { length: runs[i].length + 1, start: runs[i].start, end: game }
          : { length: 1, start: game, end: game };
        if (!side.longestStreak || runs[i].length > side.longestStreak.length) side.longestStreak = runs[i];
      } else {
        if (winner === null) {
          side.ties += 1;
          record.ties += 1;
        } else {
          side.losses += 1;
          record.losses += 1;
        }
        runs[i] = null;
      }
    }
  }

  const total = played.length;
  for (const side of sides) {
    side.winPct = ((side.wins + side.ties / 2) / total) * 100;
    side.averagePoints = side.points / total;
  }

  const currentStreak = [0, 1].map((i) => runs[i]).find(Boolean);

  return {
    totalGames: total,
    phases,
    sides,
    averageCombined: combinedTotal / total,
    highestCombined,
    closest,
    currentStreak: currentStreak
      ? { side: runs[0] ? 0 : 1, length: currentStreak.length }
      : null,
    recent: played.slice(-5).reverse()
  };
}

export default summarizeMatchup;
