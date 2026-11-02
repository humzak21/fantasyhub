/**
 * How seasons were decided: who locked the 1 seed and the punishment and when,
 * how the punished team got there, and where each kind of start ended up.
 *
 * Pure, over the record book's own per-game rows (`buildSides`), so a result
 * and a phase mean what they mean on the Records tab. `buildRecordBook` turns
 * this into record rows; the Statistics tab renders it through `useSituations`.
 *
 * Rules that are load-bearing:
 *
 *   * **Punishment is last place in the regular season**, by the canonical
 *     standings sort. It is not the worst `final_rank`, which is settled by the
 *     consolation bracket: over 2020-25 the two named different teams in four
 *     seasons of six.
 *   * **The 1 seed is first in the regular season.** Every season's stored
 *     `playoff_seed = 1` is that team, under both seeding rules: from 2026 the
 *     better division winner is the best team in the league by construction.
 *   * **A place is locked only when no outcome can change it.** `lockedEnds`
 *     answers that exactly, not by bound, and needs no schedule (see below).
 *   * **A level record is not a lock while games remain.** The tiebreak is
 *     points for, which is still to be scored, the same reasoning as
 *     `mathematicalStatus`. So a place that comes down to points is locked in
 *     the final week, when the points are in, and says so (`onPoints`).
 *   * **Unknown is absent.** A season in progress has a lock only if one has
 *     happened; nothing here guesses at one.
 */

import { compareStandings } from '../playoffSeeding.js';

/** The score bands the records and the comparison count, regular-season games only. */
export const SCORE_BANDS = [
  { id: 'gamesUnder100', label: 'Sub-100', description: 'Regular-season games under 100 points.', matches: (score) => score < 100 },
  { id: 'games130Plus', label: '130+', description: 'Regular-season games of 130 points or more.', matches: (score) => score >= 130 },
  { id: 'games140Plus', label: '140+', description: 'Regular-season games of 140 points or more.', matches: (score) => score >= 140 },
  { id: 'games150Plus', label: '150+', description: 'Regular-season games of 150 points or more.', matches: (score) => score >= 150 },
  { id: 'games160Plus', label: '160+', description: 'Regular-season games of 160 points or more.', matches: (score) => score >= 160 }
];

/** The starts the Statistics tab can be read by, in games played. */
export const START_LENGTHS = [2, 3, 4, 5];

const equivalentWins = (row) => row.wins + row.ties / 2;

const recordOf = ({ wins, losses, ties }) => ({ wins, losses, ties });

/**
 * Which team, if any, has first and last place sewn up.
 *
 * Exact, and why it can be: first place is lost only if somebody catches the
 * leader, and the worst case against any one rival — the leader loses out, the
 * rival wins out — is always a possible outcome, because if those two play each
 * other that game simply goes the rival's way. So checking each rival on its own
 * decides it, in a line, for a whole season's schedule. `mathematicalStatus`
 * cannot answer this: it asks who makes a six-team field, which is why it has to
 * try outcomes, and why its fallback bound can be late. Last place is the mirror.
 *
 * Tied on record is not locked while anybody has a game left, because points for
 * is still to be scored. With nothing left, the real tiebreaks decide.
 *
 * @param {Array<{ id: *, wins: number, losses: number, ties: number,
 *   pointsFor: number, pointsAgainst: number, gamesLeft: number }>} table
 * @returns {{ first: *, last: *, onPoints: { first: boolean, last: boolean } }}
 */
export function lockedEnds(table) {
  if (table.length < 2) return { first: null, last: null, onPoints: { first: false, last: false } };

  if (table.every((row) => row.gamesLeft === 0)) {
    const order = [...table].sort(compareStandings);
    const top = order[0];
    const bottom = order[order.length - 1];
    return {
      first: top.id,
      last: bottom.id,
      onPoints: {
        first: equivalentWins(top) === equivalentWins(order[1]),
        last: equivalentWins(bottom) === equivalentWins(order[order.length - 2])
      }
    };
  }

  const others = (row) => table.filter((other) => other !== row);
  const clearFirst = (row) =>
    others(row).every((rival) => equivalentWins(row) > equivalentWins(rival) + rival.gamesLeft);
  const clearLast = (row) =>
    others(row).every((rival) => equivalentWins(rival) > equivalentWins(row) + row.gamesLeft);

  return {
    first: table.find(clearFirst)?.id ?? null,
    last: table.find(clearLast)?.id ?? null,
    onPoints: { first: false, last: false }
  };
}

/** One team's season, its regular-season games in order and how it finished. */
function buildTeamSeason(games, team, season) {
  const weekly = [];
  const running = { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };

  for (const side of games) {
    if (side.result === 'W') running.wins += 1;
    else if (side.result === 'L') running.losses += 1;
    else running.ties += 1;
    running.pointsFor += side.pf;
    running.pointsAgainst += side.pa;
    weekly.push({ week: side.week, result: side.result, pf: side.pf, pa: side.pa, ...running });
  }

  return {
    id: team.id,
    teamId: team.id,
    franchiseId: team.franchiseId,
    seasonId: season.id,
    year: season.year,
    completed: Boolean(season.isCompleted),
    weekly,
    ...running,
    madePlayoffs: Boolean(team.madePlayoffs),
    champion: team.playoffFinish === 'champion',
    finish: team.playoffFinish ?? null
  };
}

/** A team's place in the standings after each week, onto its `weekly` rows. */
function replayStandings(teamSeasons, totalWeeks, isCompleted) {
  const weeks = [...new Set(teamSeasons.flatMap((team) => team.weekly.map((row) => row.week)))].sort((a, b) => a - b);
  const lastWeek = weeks[weeks.length - 1];
  let first = null;
  let last = null;

  for (const week of weeks) {
    const table = teamSeasons.map((team) => {
      const games = team.weekly.filter((row) => row.week <= week);
      const through = games.at(-1);
      return {
        id: team.id,
        wins: through?.wins ?? 0,
        losses: through?.losses ?? 0,
        ties: through?.ties ?? 0,
        pointsFor: through?.pointsFor ?? 0,
        pointsAgainst: through?.pointsAgainst ?? 0,
        // A finished season is over at its last game, whatever the row says.
        gamesLeft: isCompleted && week === lastWeek ? 0 : Math.max(0, totalWeeks - games.length)
      };
    });

    [...table].sort(compareStandings).forEach((row, index) => {
      const own = teamSeasons.find((team) => team.id === row.id).weekly.find((entry) => entry.week === week);
      if (own) own.place = index + 1;
    });

    const locked = lockedEnds(table);
    const stamp = (id, onPoints) => {
      const row = table.find((entry) => entry.id === id);
      return { teamId: id, week, weeksLeft: Math.max(0, totalWeeks - week), record: recordOf(row), onPoints };
    };
    if (!first && locked.first != null) first = stamp(locked.first, locked.onPoints.first);
    if (!last && locked.last != null) last = stamp(locked.last, locked.onPoints.last);
  }

  return { first, last };
}

/**
 * Every team-season and every season's race for first and last.
 *
 * @param {object[]} sides from `buildSides`
 * @param {object[]} seasons
 * @param {Map<string, object>} teamById
 * @returns {{ teamSeasons: object[], races: object[] }} races oldest first
 */
export function buildSeasonStories(sides, seasons, teamById) {
  const teamSeasons = [];
  const races = [];

  for (const season of seasons) {
    const gamesByTeam = new Map();
    for (const side of sides) {
      if (side.seasonId !== season.id || side.phase !== 'regular') continue;
      if (!gamesByTeam.has(side.teamId)) gamesByTeam.set(side.teamId, []);
      gamesByTeam.get(side.teamId).push(side);
    }
    if (gamesByTeam.size === 0) continue;

    const teams = [...gamesByTeam].map(([teamId, games]) =>
      buildTeamSeason([...games].sort((a, b) => a.week - b.week), teamById.get(teamId), season)
    );
    const totalWeeks = season.regularSeasonWeeks ?? Math.max(...teams.map((team) => team.weekly.length));
    const { first, last } = replayStandings(teams, totalWeeks, Boolean(season.isCompleted));

    const held = (lock) => {
      if (!lock) return null;
      const team = teams.find((entry) => entry.id === lock.teamId);
      return {
        ...lock,
        franchiseId: team.franchiseId,
        finalRecord: recordOf(team),
        path: team.weekly
      };
    };

    if (season.isCompleted) {
      for (const team of teams) {
        team.oneSeed = team.id === first?.teamId;
        team.punished = team.id === last?.teamId;
      }
    }

    teamSeasons.push(...teams);
    races.push({
      seasonId: season.id,
      year: season.year,
      completed: Boolean(season.isCompleted),
      regularSeasonWeeks: totalWeeks,
      oneSeed: held(first),
      punishment: held(last)
    });
  }

  return { teamSeasons, races };
}

/** "0-3", or "1-1-1" with a tie in it. */
export const startKey = ({ wins, losses, ties }) =>
  ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;

/** A team-season's record after its first `games` games, or null if it has not played them. */
export function startOf(teamSeason, games) {
  const row = teamSeason.weekly[games - 1];
  return row ? recordOf(row) : null;
}

/** A team's final standing, as `compareStandings` reads one. */
const standingOf = (team) => ({
  id: team.teamId,
  wins: team.wins,
  losses: team.losses,
  ties: team.ties,
  pointsFor: team.pointsFor,
  pointsAgainst: team.pointsAgainst
});

/**
 * Where each start ended up, worst start first: how many teams had it, the
 * record they averaged, the best and worst of them, and how many made the
 * playoffs, won the title or took the punishment.
 *
 * Completed seasons only. A season still being played has starts but no ends.
 *
 * @param {object[]} teamSeasons from `buildSeasonStories`
 * @param {number} games the length of the start
 */
export function startOutcomes(teamSeasons, games) {
  const groups = new Map();

  for (const team of teamSeasons) {
    if (!team.completed) continue;
    const start = startOf(team, games);
    if (!start) continue;
    const key = startKey(start);
    if (!groups.has(key)) groups.set(key, { key, ...start, teams: [] });
    groups.get(key).teams.push(team);
  }

  return [...groups.values()]
    .map(({ teams, ...group }) => {
      const order = [...teams].sort((a, b) => compareStandings(standingOf(a), standingOf(b)));
      const count = teams.length;
      return {
        ...group,
        count,
        averageWins: teams.reduce((total, team) => total + equivalentWins(team), 0) / count,
        averageLosses: teams.reduce((total, team) => total + team.losses + team.ties / 2, 0) / count,
        best: order[0],
        worst: order[count - 1],
        madePlayoffs: teams.filter((team) => team.madePlayoffs).length,
        titles: teams.filter((team) => team.champion).length,
        punished: teams.filter((team) => team.punished).length
      };
    })
    .sort((a, b) => equivalentWins(a) - equivalentWins(b));
}

/** League-wide count of each score band per season, newest first. */
export function scoreBandsBySeason(sides, seasons) {
  return [...seasons]
    .sort((a, b) => b.year - a.year)
    .map((season) => {
      const scores = sides
        .filter((side) => side.seasonId === season.id && side.phase === 'regular')
        .map((side) => side.pf);
      return {
        year: season.year,
        completed: Boolean(season.isCompleted),
        games: scores.length,
        counts: Object.fromEntries(
          SCORE_BANDS.map((band) => [band.id, scores.filter(band.matches).length])
        )
      };
    })
    .filter((row) => row.games > 0);
}
