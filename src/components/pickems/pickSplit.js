/**
 * How the league picked a week, matchup by matchup.
 *
 * Once a week's pick'ems close, every team gets a box with the share of the
 * league that took it — on Make Picks until the week is scored, then on the
 * Results tab with each matchup's winner marked. This is the arithmetic behind
 * those boxes, kept pure so it is tested without a database — the same split
 * as `weekWinners.js` and the component that renders it.
 *
 * A share is counted against the picks entered *for that game*, not against
 * everyone who submitted. In a normal week those are the same number — the
 * form will not submit without a pick for every game — but a game corrected
 * after somebody submitted would otherwise read as a matchup they declined to
 * pick, and its two shares would stop adding up to 100.
 *
 * A game nobody picked has no split: both shares are `null`, never 0. "Nobody
 * took this team" and "nobody picked this game at all" are different facts.
 *
 * A side has `won` only once its game is completed and names it the winner. A
 * game still to be scored, and a tie, have no winner — neither side may read
 * as one.
 */

/**
 * Is this game a bye rather than a matchup?
 *
 * The pick'ems form and the split both skip byes, so they share this one test
 * rather than a copy each. `getPickEmGameData` does not select `type`, so in
 * practice it is the missing second team that identifies one.
 *
 * @param {object} game
 * @returns {boolean}
 */
export function isByeGame(game) {
  return game?.type === 'bye' || !game?.team2;
}

/**
 * @typedef {object} PickSplitSide
 * @property {object} team - the game's team, as the pick'ems form renders it
 * @property {number} count - picks that took this team
 * @property {number|null} share - 0-100, or null when the game has no picks
 * @property {boolean} trails - strictly fewer picks than the other side
 * @property {boolean} won - the game is completed and this team won it
 */

/**
 * @typedef {object} PickSplitMatchup
 * @property {string} gameId
 * @property {number} total - picks entered for this game
 * @property {boolean} decided - the game is completed (a tie included)
 * @property {[PickSplitSide, PickSplitSide]} sides - team 1 first, as in the form
 */

const teamIdOf = (game, slot) => game[`team${slot}`]?.id ?? game[`team${slot}Id`] ?? null;

/**
 * @param {Array<object>} games - the week's games, as `getPickEmGameData`
 *   returns them; byes are skipped
 * @param {Array<object>} picks - every member's picks for the week, as
 *   `getAllPicksForWeek` returns them
 * @returns {{ submitted: number, matchups: PickSplitMatchup[] }} `submitted`
 *   is how many members picked at least one of these matchups
 */
export function summarizePickSplit(games = [], picks = []) {
  const tallies = new Map(
    games
      .filter((game) => !isByeGame(game))
      .map((game) => [
        game.id,
        { game, teamIds: [teamIdOf(game, 1), teamIdOf(game, 2)], counts: [0, 0] }
      ])
  );
  const members = new Set();

  for (const pick of picks) {
    const tally = tallies.get(pick.gameId);
    if (!tally) continue;

    const teamId = pick.pickedTeamId ?? pick.predictedWinnerTeamId;
    // A pick for neither team is a pick for a pairing that has since changed;
    // it says nothing about this one.
    const index = teamId ? tally.teamIds.indexOf(teamId) : -1;
    if (index === -1) continue;

    tally.counts[index] += 1;
    if (pick.userId) members.add(pick.userId);
  }

  const matchups = [...tallies.values()].map(({ game, teamIds, counts }) => {
    const total = counts[0] + counts[1];
    const decided = Boolean(game.isCompleted);
    const winnerId = decided ? game.winnerTeamId ?? null : null;
    const side = (index) => ({
      team: game[`team${index + 1}`],
      count: counts[index],
      share: total > 0 ? (counts[index] / total) * 100 : null,
      trails: counts[index] < counts[1 - index],
      won: winnerId !== null && winnerId === teamIds[index]
    });

    return { gameId: game.id, total, decided, sides: [side(0), side(1)] };
  });

  return { submitted: members.size, matchups };
}
