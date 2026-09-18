/**
 * How the league picked a week, matchup by matchup.
 *
 * Once a week's pick'ems close, the Make Picks page shows every matchup with
 * the share of the league that took each side. This is the arithmetic behind
 * that row, kept pure so it is tested without a database — the same split as
 * `weekWinners.js` and the component that renders it.
 *
 * A share is counted against the picks entered *for that game*, not against
 * everyone who submitted. In a normal week those are the same number — the
 * form will not submit without a pick for every game — but a game corrected
 * after somebody submitted would otherwise read as a matchup they declined to
 * pick, and its two shares would stop adding up to 100.
 *
 * A game nobody picked has no split: both shares are `null`, never 0. "Nobody
 * took this team" and "nobody picked this game at all" are different facts.
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
 * @property {boolean} isViewerPick - the viewer's own pick
 */

/**
 * @typedef {object} PickSplitMatchup
 * @property {string} gameId
 * @property {number} total - picks entered for this game
 * @property {[PickSplitSide, PickSplitSide]} sides - team 1 first, as in the form
 */

const teamIdOf = (game, slot) => game[`team${slot}`]?.id ?? game[`team${slot}Id`] ?? null;

/**
 * @param {Array<object>} games - the week's games, as `getPickEmGameData`
 *   returns them; byes are skipped
 * @param {Array<object>} picks - every member's picks for the week, as
 *   `getAllPicksForWeek` returns them
 * @param {string|null} [viewerId] - marks the viewer's own pick in each matchup
 * @returns {{ submitted: number, matchups: PickSplitMatchup[] }} `submitted`
 *   is how many members picked at least one of these matchups
 */
export function summarizePickSplit(games = [], picks = [], viewerId = null) {
  const tallies = new Map(
    games
      .filter((game) => !isByeGame(game))
      .map((game) => [
        game.id,
        {
          game,
          teamIds: [teamIdOf(game, 1), teamIdOf(game, 2)],
          counts: [0, 0],
          viewerTeamId: null
        }
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
    if (viewerId && pick.userId === viewerId) tally.viewerTeamId = teamId;
  }

  const matchups = [...tallies.values()].map(({ game, teamIds, counts, viewerTeamId }) => {
    const total = counts[0] + counts[1];
    const side = (index) => ({
      team: game[`team${index + 1}`],
      count: counts[index],
      share: total > 0 ? (counts[index] / total) * 100 : null,
      trails: counts[index] < counts[1 - index],
      isViewerPick: viewerTeamId !== null && viewerTeamId === teamIds[index]
    });

    return { gameId: game.id, total, sides: [side(0), side(1)] };
  });

  return { submitted: members.size, matchups };
}
