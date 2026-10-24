/**
 * The home page's "Last 3 weeks": the viewer's three most recent scored games,
 * how the standing and the power rank moved across them.
 *
 * Reuses the franchise profile's machinery rather than writing a second
 * standings sort: `buildSeasonIndex` over a *light* source — the season, its
 * teams, its games and its rank snapshots, all already cached — and
 * `seasonArc` for standing-by-record after each week and the snapshot rank
 * going into it. The full `useSeasonWeeks` source (every player row and
 * lineup) is far too heavy for a card on the landing page.
 *
 * Pure.
 */

import { buildSeasonIndex, seasonArc } from '../franchiseWeeks.js';
import { franchiseIdOf } from '../viewerTeam.js';

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isScored = (game) => isNumber(game.team1Score) && isNumber(game.team2Score);
const isBye = (game) => game.type === 'bye' || game.team2Id == null;

/**
 * The light season index: what the shell's caches already hold, in the shape
 * `buildSeasonIndex` reads. Teams arrive in database shape from
 * `getTeamsForSeason` (`franchise_id`), and rank rows from
 * `getPowerRankingsHistory` carry `weekNumber`; both are normalised here.
 *
 * @param {object} season - the active season (`regularSeasonWeeks`, `totalWeeks`)
 * @param {object[]} teams
 * @param {object[]} games - `getSeasonGames` rows
 * @param {object[]} [rankRows] - `getPowerRankingsHistory` rows
 */
export function buildLightSeasonIndex(season, teams = [], games = [], rankRows = []) {
  if (!season) return null;
  return buildSeasonIndex({
    season: {
      year: season.year,
      regularSeasonWeeks: season.regularSeasonWeeks ?? season.regular_season_weeks ?? null,
      totalWeeks: season.totalWeeks ?? season.total_weeks ?? null
    },
    teams: teams.map((team) => ({ ...team, franchiseId: franchiseIdOf(team) })),
    games,
    ranks: rankRows
      .map((row) => ({
        week: row.week ?? row.weekNumber ?? row.week_number,
        teamId: row.teamId ?? row.team_id,
        rank: row.rank,
        snapshotType: row.snapshotType ?? row.snapshot_type ?? null
      }))
      .filter((row) => isNumber(row.week) && row.teamId)
  });
}

/**
 * @param {object|null} index - from `buildLightSeasonIndex`
 * @param {string} franchiseId
 * @param {number|null} actualWeek - only weeks before it count; null counts none
 * @param {{ weeks?: number }} [options]
 * @returns {null | {
 *   rows: Array<{ week, opponentId, pointsFor, pointsAgainst, result, margin, standing, powerRank, leagueAverage }>,
 *   standing: { from: number|null, to: number|null },
 *   powerRank: { from: number|null, to: number|null }
 * }} null when there is no team or no scored game yet
 */
export function recentForm(index, franchiseId, actualWeek, { weeks = 3 } = {}) {
  const team = index?.teamByFranchise.get(franchiseId);
  if (!team || actualWeek == null) return null;

  // A bye inside the window is skipped, not counted: the window still reaches
  // back three *scored* weeks.
  const played = index.games
    .filter(
      (game) =>
        game.week <= actualWeek &&
        isScored(game) &&
        !isBye(game) &&
        (game.team1Id === team.id || game.team2Id === team.id)
    )
    .sort((a, b) => a.week - b.week)
    .slice(-weeks);

  if (played.length === 0) return null;

  const arc = new Map(seasonArc(index, franchiseId).map((entry) => [entry.week, entry]));

  const rows = played.map((game) => {
    const isTeam1 = game.team1Id === team.id;
    const pointsFor = isTeam1 ? game.team1Score : game.team2Score;
    const pointsAgainst = isTeam1 ? game.team2Score : game.team1Score;
    const margin = pointsFor - pointsAgainst;
    const weekScores = (index.gamesByWeek.get(game.week) ?? [])
      .filter((g) => isScored(g) && !isBye(g))
      .flatMap((g) => [g.team1Score, g.team2Score]);

    return {
      week: game.week,
      type: game.type,
      opponentId: isTeam1 ? game.team2Id : game.team1Id,
      pointsFor,
      pointsAgainst,
      result: margin > 0 ? 'W' : margin < 0 ? 'L' : 'T',
      margin,
      standing: arc.get(game.week)?.standing ?? null,
      powerRank: arc.get(game.week)?.powerRank ?? null,
      leagueAverage: weekScores.length
        ? weekScores.reduce((sum, value) => sum + value, 0) / weekScores.length
        : null
    };
  });

  const known = (key) => rows.map((row) => row[key]).filter((value) => value != null);
  const span = (key) => {
    const values = known(key);
    return { from: values[0] ?? null, to: values[values.length - 1] ?? null };
  };

  return { rows, standing: span('standing'), powerRank: span('powerRank') };
}

export default recentForm;
