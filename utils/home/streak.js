/**
 * A team's current streak, from its scored games.
 *
 * The standings RPC carries `streak_type` / `streak_length`, and they are not
 * always filled — the drawer derives the streak from the games when they are
 * not, and so does the home page's standings card, through this. Regular
 * season and bracket games alike, newest first; a bye is not a game and does
 * not break a run, a tie does (as everywhere in the league).
 *
 * Pure. Returns the shape `StreakChip` reads.
 *
 * @param {object[]} games - the season's games (`team1Id`, `team1Score`, …)
 * @param {string} teamId
 * @returns {{ type: 'win'|'loss'|'tie'|'none', length: number }}
 */
export function streakFromGames(games = [], teamId) {
  const played = games
    .filter(
      (game) =>
        game.team2Id != null &&
        game.type !== 'bye' &&
        Number.isFinite(game.team1Score) &&
        Number.isFinite(game.team2Score) &&
        (game.team1Id === teamId || game.team2Id === teamId)
    )
    .sort((a, b) => b.week - a.week);

  let type = 'none';
  let length = 0;
  for (const game of played) {
    const mine = game.team1Id === teamId ? game.team1Score : game.team2Score;
    const theirs = game.team1Id === teamId ? game.team2Score : game.team1Score;
    const result = mine > theirs ? 'win' : mine < theirs ? 'loss' : 'tie';
    if (type === 'none') type = result;
    if (result !== type) break;
    length += 1;
  }
  return { type, length };
}

/** The stored streak when there is one, otherwise the games' answer. */
export function streakOf(team, games) {
  const stored = team?.currentStreak;
  if (stored && stored.type && stored.type !== 'none' && stored.length > 0) return stored;
  return streakFromGames(games, team?.id ?? team?.teamId);
}

export default streakFromGames;
