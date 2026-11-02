/**
 * The client mirror of `get_standings_by_division`.
 *
 * The first block is the one that matters. The fixture is the RPC's real output
 * and the real games for 2025 (the old rule, a finished season) and 2026 (seeded,
 * in progress), captured on 2026-11-02 with team ids anonymised in sorted order,
 * so the id tiebreak still means what it did. If the RPC's rule, `computeSeeds`
 * or the canonical sort moves, this fails.
 *
 * `current_streak` is not compared: it is blank on every stored team, so the
 * RPC reports none and the app has always worked the streak out from the games.
 *
 * Every field matched for every team of 2020-24 and 2026. 2025 has one exception,
 * pinned below: three teams' stored point totals differ from their own games by
 * 2-6 points, while their records, ranks and seeds agree. That is drift in
 * `teams`, not here, so the games are what this reads.
 */

import { describe, it, expect } from 'vitest';

import fixture from './__fixtures__/standings-seasons.json';
import { computeStandings, tallyRecords } from '../standings/computeStandings.js';
import { standingsThrough } from '../franchiseWeeks.js';

const flat = (standings) => [...standings.divisions.flatMap((d) => d.teams), ...standings.unassigned];

const asRpcRow = (row) => ({
  team_id: row.id,
  wins: row.wins,
  losses: row.losses,
  ties: row.ties,
  division_rank: row.divisionRank,
  playoff_position: row.isPlayoffSpot,
  playoff_seed: row.playoffSeed,
  is_bye: row.isBye,
  is_wildcard: row.isWildcard
});

const STORED_POINTS_DRIFT = { 2025: new Set(['t03', 't05', 't09']), 2026: new Set() };

describe.each(['2025', '2026'])('computeStandings against the %s RPC', (year) => {
  const { teams, games, rpc } = fixture[year];
  const rows = flat(computeStandings({ teams, games, year: Number(year) }));
  const byId = new Map(rows.map((row) => [row.id, row]));

  it('has every team', () => {
    expect(rows).toHaveLength(14);
  });

  it.each(rpc.map((row) => [row.team_id, row]))('matches %s', (id, stored) => {
    const row = byId.get(id);
    const { points_for: pf, points_against: pa, win_percentage: pct, ...facts } = stored;

    expect(asRpcRow(row)).toEqual(facts);
    expect(row.winPercentage).toBeCloseTo(Number(pct), 3);

    if (STORED_POINTS_DRIFT[year].has(id)) return;

    expect(row.pointsFor).toBeCloseTo(Number(pf), 1);
    expect(row.pointsAgainst).toBeCloseTo(Number(pa), 1);
    expect(row.pointDifferential).toBeCloseTo(Number(pf) - Number(pa), 1);
  });
});

describe('computeStandings', () => {
  const team = (id, division_id) => ({ id, name: `Team ${id}`, owner: `Owner ${id}`, division_id });
  const game = (week, team1Id, team2Id, team1Score, team2Score, type = 'regular') => ({
    week,
    type,
    team1Id,
    team2Id,
    team1Score,
    team2Score
  });

  const teams = [team('a', 1), team('b', 1), team('c', 2), team('d', 2)];

  it('has the RPC\'s shape', () => {
    const { divisions } = computeStandings({
      teams,
      games: [game(1, 'a', 'b', 100, 90)],
      divisions: [{ id: 1, name: 'North' }],
      year: 2026
    });

    expect(divisions[0]).toMatchObject({ divisionId: 1, divisionName: 'North' });
    expect(divisions[0].teams[0]).toEqual({
      teamId: 'a',
      id: 'a',
      name: 'Team a',
      owner: 'Owner a',
      divisionId: 1,
      wins: 1,
      losses: 0,
      ties: 0,
      pointsFor: 100,
      pointsAgainst: 90,
      pointDifferential: 10,
      winPercentage: 1,
      currentStreak: { type: 'win', length: 1 },
      divisionRank: 1,
      isPlayoffSpot: true,
      playoffSeed: 1,
      isBye: true,
      isWildcard: false
    });
  });

  it('counts a tie as half a win', () => {
    const [first] = computeStandings({ teams, games: [game(1, 'a', 'b', 100, 100)], year: 2026 }).divisions[0].teams;
    expect(first).toMatchObject({ ties: 1, winPercentage: 0.5 });
  });

  it('stops at the week it is asked about, the streak included', () => {
    const games = [game(1, 'a', 'b', 100, 90), game(2, 'a', 'b', 80, 90)];
    const row = (throughWeek) =>
      flat(computeStandings({ teams, games, year: 2026, throughWeek })).find((r) => r.id === 'a');

    expect(row(1)).toMatchObject({ wins: 1, losses: 0, currentStreak: { type: 'win', length: 1 } });
    expect(row(null)).toMatchObject({ wins: 1, losses: 1, currentStreak: { type: 'loss', length: 1 } });
  });

  it('counts the regular season only: no bracket game, bye, or unscored week', () => {
    const games = [
      game(15, 'a', 'b', 100, 90, 'playoff_first_round'),
      game(15, 'c', null, null, null, 'bye'),
      game(8, 'a', 'b', null, null)
    ];
    const [first] = computeStandings({ teams, games, year: 2026 }).divisions[0].teams;

    expect(first).toMatchObject({ wins: 0, losses: 0, pointsFor: 0 });
  });

  it('keeps the old rule before 2026: top three of a division, no seeds', () => {
    const rows = flat(computeStandings({ teams, games: [], year: 2025 }));

    expect(rows.every((row) => row.isPlayoffSpot && row.playoffSeed === null && !row.isBye)).toBe(true);
  });

  it('files a team with no division as unassigned, still able to hold a seed', () => {
    const { unassigned } = computeStandings({
      teams: [...teams, team('e', null)],
      games: [game(1, 'e', 'a', 150, 90)],
      year: 2026
    });

    expect(unassigned).toHaveLength(1);
    expect(unassigned[0]).toMatchObject({ id: 'e', divisionId: null, playoffSeed: 3 });
  });

  it('gives a team that has not played a 0-0 row, not nothing', () => {
    expect(tallyRecords(teams, []).get('d')).toEqual({
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      games: 0
    });
  });
});

describe('standingsThrough', () => {
  it('reads the same records as the mirror it now calls', () => {
    const { teams, games } = fixture['2026'];
    const week = 5;
    const table = standingsThrough({ teams, games }, week);
    const rows = flat(computeStandings({ teams, games, year: 2026, throughWeek: week }));

    for (const row of rows) {
      expect(table.get(row.id)).toMatchObject({ wins: row.wins, losses: row.losses, ties: row.ties });
    }
  });
});
