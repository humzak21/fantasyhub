/**
 * Which standings the drawer is showing, and what else that takes.
 *
 * Pure. The drawer holds the choice; this turns it into rows. There are three:
 *
 *   - **Official** is the RPC, as it always was. During a week it is also the
 *     table as the week began.
 *   - **Live** is the table if this week's games ended right now.
 *   - **Week N** is the table as it stood after week N.
 */

import { playoffStatus } from '../../services/playoffOddsCalculator.js';
import { teamIdOf } from '../playoffSeeding.js';
import { applyLiveScores } from '../liveOverlay.js';
import { computeStandings } from './computeStandings.js';

export const STANDINGS_VIEW = Object.freeze({ LIVE: 'live', OFFICIAL: 'official', WEEK: 'week' });

/** The weeks the Week picker offers: every game scored, newest first. */
export function scoredWeeks(games = []) {
  const weeks = new Map();

  for (const game of games) {
    if ((game.type ?? 'regular') !== 'regular' || game.team2Id == null) continue;

    const scored = game.team1Score != null && game.team2Score != null;
    weeks.set(game.week, (weeks.get(game.week) ?? true) && scored);
  }

  return [...weeks.entries()]
    .filter(([, scored]) => scored)
    .map(([week]) => week)
    .sort((a, b) => b - a);
}

const ranksOf = (standings) => {
  const ranks = new Map();
  for (const division of standings?.divisions ?? []) {
    for (const row of division.teams ?? []) ranks.set(row.id ?? row.teamId, row.divisionRank);
  }
  return ranks;
};

/**
 * Each row's place against the official table: positive is up. A team with no
 * official place to compare with has no movement, rather than a movement of 0.
 */
export function withMovement(standings, official) {
  const ranks = ranksOf(official);

  return {
    ...standings,
    divisions: standings.divisions.map((division) => ({
      ...division,
      teams: division.teams.map((row) => {
        const before = ranks.get(row.id);
        return { ...row, movement: before == null ? null : before - row.divisionRank };
      })
    }))
  };
}

/**
 * The games a view counts, for the table and for the bracket drawn from it. A
 * week's view stops at that week, so its bracket is the one that week projected,
 * even if the real one has been drawn since.
 */
export function gamesForView({ mode, week = null, games = [], live = null }) {
  if (mode === STANDINGS_VIEW.LIVE) return applyLiveScores(games, live);
  if (mode === STANDINGS_VIEW.WEEK) return games.filter((game) => game.week <= week);
  return games;
}

/**
 * The rows a view shows, in `getStandingsByDivision`'s shape.
 *
 * @param {object} input
 * @param {'live'|'official'|'week'} input.mode
 * @param {number|null} [input.week] - for the week view
 * @param {object} input.official - the RPC's standings
 * @param {Array<object>} input.teams
 * @param {Array<object>} input.games
 * @param {Array<object>} [input.divisions]
 * @param {object|null} [input.live] - from `useLiveWeek`
 * @param {number} input.year
 */
export function standingsForView({ mode, week = null, official, teams, games, divisions = [], live = null, year }) {
  if (mode === STANDINGS_VIEW.OFFICIAL) return official;

  const standings = computeStandings({
    teams,
    divisions,
    year,
    games: gamesForView({ mode, week, games, live })
  });

  return mode === STANDINGS_VIEW.LIVE ? withMovement(standings, official) : standings;
}

/**
 * The games a view's clinch and elimination marks are read from. The table's
 * own games, except that a week's view keeps the weeks after it, unscored: the
 * table stops at week N, but whether a team was out after week N depends on
 * what was still to play.
 */
export function gamesForStatus({ mode, week = null, games = [], live = null }) {
  if (mode === STANDINGS_VIEW.WEEK) {
    return games.map((game) =>
      game.week > week ? { ...game, team1Score: null, team2Score: null } : game
    );
  }
  return gamesForView({ mode, week, games, live });
}

/**
 * The view's rows with `playoffStatus` on each: `'clinched'`, `'eliminated'`
 * or null, on the view's own results (`services/playoffOddsCalculator.js`
 * `playoffStatus`, the odds model's arithmetic without the simulation).
 *
 * A mark lasts from the week it is earned until the last regular-season game
 * is scored, and then every row's is null: the field is decided, and the
 * table's playoff tints say who is in. Live counts this week's live scores, as
 * its table does, and Week N stands after week N.
 *
 * @param {object} standings - `getStandingsByDivision`'s shape
 * @param {object} input - the view, as `standingsForView` takes it
 * @param {number} [input.regularSeasonWeeks]
 */
export function withPlayoffStatus(
  standings,
  { mode, week = null, teams = [], games = [], live = null, year, regularSeasonWeeks }
) {
  if (!standings) return standings;

  const status = playoffStatus({
    teams,
    games: gamesForStatus({ mode, week, games, live }),
    regularSeasonWeeks,
    seasonYear: year
  });
  const mark = (row) => ({ ...row, playoffStatus: status.get(teamIdOf(row)) ?? null });

  return {
    ...standings,
    divisions: (standings.divisions ?? []).map((division) => ({
      ...division,
      teams: (division.teams ?? []).map(mark)
    })),
    unassigned: (standings.unassigned ?? []).map(mark)
  };
}
