/**
 * The standings, worked out in the browser.
 *
 * `get_standings_by_division` reads the totals the game triggers roll onto
 * `teams`, so it can only ever answer "as of now, officially". Two questions it
 * cannot answer are what the standings drawer asks: as of an earlier week, and
 * as if this week's games ended right now. So this is the RPC's client mirror:
 * teams and games in, rows in its exact shape out. Seeding goes through
 * `computeSeeds`, the sort through `compareStandings`, and
 * `standings.test.js` holds it to the RPC's own stored output for real seasons,
 * so the definitions cannot drift.
 *
 * Pure, and it writes nothing. A live standing exists in the drawer and nowhere
 * else: Home's widgets, the rankings and the parlay grader stay official.
 */

import { streakFromGames } from '../home/streak.js';
import {
  computeSeeds,
  divisionIdOf,
  teamIdOf,
  usesSeededPlayoffs
} from '../playoffSeeding.js';

/** Scores a table can count. A bye has no opponent, and an unscored game no result. */
const isCounted = (game, throughWeek) =>
  (game.type ?? 'regular') === 'regular' &&
  game.team2Id != null &&
  game.team1Score != null &&
  game.team2Score != null &&
  (throughWeek == null || game.week <= throughWeek);

/**
 * Each team's regular-season record from the games, in `throughWeek` or all of
 * them. Every team gets a row: one that has not played reads 0-0, not missing.
 *
 * @param {Array<object>} teams
 * @param {Array<object>} games - `team1Id`, `team1Score`, …
 * @param {{ throughWeek?: number|null }} [options]
 * @returns {Map<*, { wins: number, losses: number, ties: number, pointsFor: number, pointsAgainst: number, games: number }>}
 */
export function tallyRecords(teams = [], games = [], { throughWeek = null } = {}) {
  const records = new Map(
    teams.map((team) => [
      teamIdOf(team),
      { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, games: 0 }
    ])
  );

  for (const game of games) {
    if (!isCounted(game, throughWeek)) continue;

    const first = Number(game.team1Score);
    const second = Number(game.team2Score);

    for (const [teamId, mine, theirs] of [
      [game.team1Id, first, second],
      [game.team2Id, second, first]
    ]) {
      const record = records.get(teamId);
      if (!record) continue;

      record.games += 1;
      record.pointsFor += mine;
      record.pointsAgainst += theirs;
      if (mine > theirs) record.wins += 1;
      else if (mine < theirs) record.losses += 1;
      else record.ties += 1;
    }
  }

  return records;
}

/**
 * Standings in `getStandingsByDivision`'s shape.
 *
 * @param {object} input
 * @param {Array<object>} input.teams - the season's teams, in either casing
 * @param {Array<object>} input.games - the season's games
 * @param {Array<object>} [input.divisions] - for each division's name
 * @param {number} input.year - decides the qualification rule, as the RPC's does
 * @param {number|null} [input.throughWeek] - count nothing after this week
 * @returns {{ divisions: Array<{ divisionId: *, divisionName: string|null, teams: Array<object> }>, unassigned: Array<object> }}
 */
export function computeStandings({ teams = [], games = [], divisions = [], year, throughWeek = null }) {
  const records = tallyRecords(teams, games, { throughWeek });
  const counted = throughWeek == null ? games : games.filter((game) => game.week <= throughWeek);

  const rows = teams.map((team) => {
    const id = teamIdOf(team);
    const record = records.get(id);
    return {
      teamId: id,
      id,
      name: team.name,
      owner: team.owner,
      divisionId: divisionIdOf(team),
      wins: record.wins,
      losses: record.losses,
      ties: record.ties,
      pointsFor: record.pointsFor,
      pointsAgainst: record.pointsAgainst,
      pointDifferential: record.pointsFor - record.pointsAgainst,
      winPercentage: record.games > 0 ? (record.wins + record.ties / 2) / record.games : 0,
      currentStreak: streakFromGames(counted, id)
    };
  });

  const seeds = computeSeeds(rows);
  const seeded = usesSeededPlayoffs(year);

  const finished = rows.map((row) => {
    const seed = seeds.get(row.id);
    return {
      ...row,
      divisionRank: seed.divisionRank,
      // Through 2025: the top three of each division, and no seeds at all.
      isPlayoffSpot: seeded ? seed.seed != null : seed.divisionRank <= 3,
      playoffSeed: seeded ? seed.seed : null,
      isBye: seeded && seed.isBye,
      isWildcard: seeded && seed.isWildcard
    };
  });

  const byDivision = new Map();
  for (const row of finished) {
    if (row.divisionId == null) continue;
    if (!byDivision.has(row.divisionId)) byDivision.set(row.divisionId, []);
    byDivision.get(row.divisionId).push(row);
  }

  const inRank = (a, b) => a.divisionRank - b.divisionRank;

  return {
    divisions: [...byDivision.entries()].map(([divisionId, members]) => ({
      divisionId,
      divisionName: divisions.find((division) => division.id === divisionId)?.name ?? null,
      teams: members.sort(inRank)
    })),
    unassigned: finished.filter((row) => row.divisionId == null).sort(inRank)
  };
}

export default computeStandings;
