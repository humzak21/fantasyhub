/**
 * The Submissions tab's arithmetic: which rows every card draws, and each
 * member's score.
 *
 * The cards are read against each other, so row 3 has to be the same matchup on
 * every one of them. `submissionMatchups` is that shared list: the form's order,
 * with every member given a row for every matchup whether they picked it or not.
 * A card that closed up around a missing pick would put every row after it one
 * line out from its neighbours.
 */

import { isByeGame } from './pickSplit.js';

/**
 * @param {Array<object>} games - the week's games, as `getPickEmGameData`
 *   returns them; byes are skipped
 * @param {Array<object>} submissions - every member's rows, as
 *   `getAdminSubmissionsForWeek` returns them
 * @returns {Array<{ gameId: string, game: object }>} in the form's order, then
 *   any game a pick names that the week no longer lists, which keeps a pick on a
 *   corrected game visible rather than dropping it
 */
export function submissionMatchups(games = [], submissions = []) {
  const listed = new Map(
    games.filter((game) => !isByeGame(game)).map((game) => [game.id, game])
  );

  const unlisted = new Map();
  for (const submission of submissions) {
    if (!listed.has(submission.gameId)) unlisted.set(submission.gameId, submission.games);
  }

  return [
    ...listed,
    ...[...unlisted].sort(([a], [b]) => String(a).localeCompare(String(b)))
  ].map(([gameId, game]) => ({ gameId, game }));
}

/**
 * A member's score for the week, on the rule `getWeeklyPickEmScores` uses, so
 * this card and the Results tab give the same figure: hits out of the picks whose
 * games have been played, never out of the picks entered.
 *
 * @param {Array<object>} picks - one member's rows
 * @returns {{ correct: number, decided: number }}
 */
export function submissionScore(picks = []) {
  return picks.reduce(
    (score, pick) => ({
      correct: score.correct + (pick.isCorrect ? 1 : 0),
      decided: score.decided + (pick.gameCompleted ? 1 : 0)
    }),
    { correct: 0, decided: 0 }
  );
}
