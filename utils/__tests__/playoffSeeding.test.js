/**
 * The 2026+ qualification rule, on its own.
 *
 * Everything downstream — the standings drawer, the odds calculator, the
 * bracket, and the SQL that mirrors this in `get_standings_by_division` — is
 * meant to agree with these cases.
 */

import { describe, it, expect } from 'vitest';

import {
  PLAYOFF_RESEED_YEAR,
  usesSeededPlayoffs,
  compareStandings,
  sortByStandings,
  computeSeeds,
  playoffFieldInSeedOrder,
  reseedSemis,
  organizeSeededBracket
} from '../playoffSeeding.js';

/** A team row in the shape the standings drawer and the odds calculator use. */
const team = (id, divisionId, wins, losses, pointsFor, pointsAgainst = 1000) => ({
  id,
  divisionId,
  wins,
  losses,
  ties: 0,
  pointsFor,
  pointsAgainst,
  winPercentage: wins + losses > 0 ? wins / (wins + losses) : 0
});

describe('usesSeededPlayoffs', () => {
  it('starts in 2026 and never reaches back', () => {
    expect(PLAYOFF_RESEED_YEAR).toBe(2026);
    expect(usesSeededPlayoffs(2026)).toBe(true);
    expect(usesSeededPlayoffs(2027)).toBe(true);
    expect(usesSeededPlayoffs(2025)).toBe(false);
    expect(usesSeededPlayoffs(2020)).toBe(false);
  });

  it('treats an unknown year as the legacy rule rather than guessing', () => {
    expect(usesSeededPlayoffs(null)).toBe(false);
    expect(usesSeededPlayoffs(undefined)).toBe(false);
    expect(usesSeededPlayoffs('')).toBe(false);
    expect(usesSeededPlayoffs('not a year')).toBe(false);
  });

  it('accepts the string a route param or a season row would hand it', () => {
    expect(usesSeededPlayoffs('2026')).toBe(true);
  });
});

describe('compareStandings', () => {
  it('puts the better win percentage first', () => {
    const better = team('a', 1, 9, 3, 1200);
    const worse = team('b', 1, 8, 4, 1400);
    expect(compareStandings(better, worse)).toBeLessThan(0);
    expect(compareStandings(worse, better)).toBeGreaterThan(0);
  });

  it('breaks a tied record on points for', () => {
    const high = team('a', 1, 8, 4, 1400);
    const low = team('b', 1, 8, 4, 1300);
    expect(compareStandings(high, low)).toBeLessThan(0);
  });

  it('breaks a tied record and tied points for on the lower points against', () => {
    const stingy = team('a', 1, 8, 4, 1400, 1100);
    const leaky = team('b', 1, 8, 4, 1400, 1300);
    expect(compareStandings(stingy, leaky)).toBeLessThan(0);
  });

  it('falls back to the team id so the order is deterministic, not merely stable', () => {
    const a = team('aaa', 1, 8, 4, 1400, 1200);
    const b = team('bbb', 1, 8, 4, 1400, 1200);
    expect(compareStandings(a, b)).toBeLessThan(0);
    expect(compareStandings(b, a)).toBeGreaterThan(0);
    expect(compareStandings(a, a)).toBe(0);
  });

  it('reads snake_case rows straight from the RPC', () => {
    const better = { team_id: 'a', win_percentage: 0.75, points_for: '1200', points_against: '900' };
    const worse = { team_id: 'b', win_percentage: 0.5, points_for: '1500', points_against: '900' };
    expect(compareStandings(better, worse)).toBeLessThan(0);
  });

  it('derives a win percentage from the record when the column is missing', () => {
    const better = { id: 'a', wins: 9, losses: 3, ties: 0, pointsFor: 1000 };
    const worse = { id: 'b', wins: 6, losses: 6, ties: 0, pointsFor: 1400 };
    expect(compareStandings(better, worse)).toBeLessThan(0);
  });

  it('counts a tie as half a win when deriving', () => {
    const tied = { id: 'a', wins: 6, losses: 5, ties: 1, pointsFor: 1000 };
    const plain = { id: 'b', wins: 6, losses: 6, ties: 0, pointsFor: 1000 };
    expect(compareStandings(tied, plain)).toBeLessThan(0);
  });

  it('sorts a whole league without mutating the caller\'s array', () => {
    const league = [team('c', 1, 5, 7, 1100), team('a', 1, 9, 3, 1300)];
    const sorted = sortByStandings(league);
    expect(sorted.map((t) => t.id)).toEqual(['a', 'c']);
    expect(league.map((t) => t.id)).toEqual(['c', 'a']);
  });
});

describe('computeSeeds', () => {
  /**
   * Division 1 is the strong one: it sends its winner plus three wildcards.
   * Division 2 sends its winner and one wildcard.
   */
  const league = [
    team('d1-1', 1, 11, 1, 1500),
    team('d1-2', 1, 10, 2, 1450),
    team('d1-3', 1, 9, 3, 1400),
    team('d1-4', 1, 8, 4, 1350),
    team('d1-5', 1, 2, 10, 900),
    team('d2-1', 2, 10, 2, 1480),
    team('d2-2', 2, 8, 4, 1300),
    team('d2-3', 2, 4, 8, 1000),
    team('d2-4', 2, 3, 9, 950)
  ];

  it('gives the byes to the two division winners, best record seeded first', () => {
    const seeds = computeSeeds(league);

    expect(seeds.get('d1-1')).toMatchObject({ seed: 1, isBye: true, isWildcard: false });
    expect(seeds.get('d2-1')).toMatchObject({ seed: 2, isBye: true, isWildcard: false });
  });

  it('seeds the two division winners against each other by the canonical sort', () => {
    // Same record; the division-2 winner has scored more, so it takes seed 1.
    const tied = [
      team('d1-1', 1, 10, 2, 1400),
      team('d1-2', 1, 3, 9, 900),
      team('d2-1', 2, 10, 2, 1500),
      team('d2-2', 2, 3, 9, 900)
    ];

    const seeds = computeSeeds(tied);
    expect(seeds.get('d2-1').seed).toBe(1);
    expect(seeds.get('d1-1').seed).toBe(2);
  });

  it('awards the wildcards league-wide, so one division can send five teams', () => {
    const seeds = computeSeeds(league);

    // 3-6 by record regardless of division: d1-2, d1-3, d1-4, then d2-2.
    expect(seeds.get('d1-2')).toMatchObject({ seed: 3, isWildcard: true, isBye: false });
    expect(seeds.get('d1-3')).toMatchObject({ seed: 4, isWildcard: true });
    expect(seeds.get('d1-4')).toMatchObject({ seed: 5, isWildcard: true });
    expect(seeds.get('d2-2')).toMatchObject({ seed: 6, isWildcard: true });

    // Division 1 sends five; division 2 sends its winner and one wildcard.
    const qualified = [...seeds.entries()].filter(([, info]) => info.seed != null);
    expect(qualified).toHaveLength(6);
    expect(qualified.filter(([id]) => id.startsWith('d1-'))).toHaveLength(4);
  });

  it('leaves everyone else unseeded rather than at seed 0', () => {
    const seeds = computeSeeds(league);
    expect(seeds.get('d1-5')).toMatchObject({ seed: null, isBye: false, isWildcard: false });
    expect(seeds.get('d2-3').seed).toBeNull();
    expect(seeds.get('d2-4').seed).toBeNull();
  });

  it('reports division rank for every team, qualifier or not', () => {
    const seeds = computeSeeds(league);
    expect(seeds.get('d1-1').divisionRank).toBe(1);
    expect(seeds.get('d1-5').divisionRank).toBe(5);
    expect(seeds.get('d2-1').divisionRank).toBe(1);
    expect(seeds.get('d2-4').divisionRank).toBe(4);
  });

  it('a third-place division team can outrank another division\'s second', () => {
    const seeds = computeSeeds(league);
    // d1-3 is third in its division and seeded above d2-2, which is second in
    // its own. Under the old top-3-per-division rule both simply qualified.
    expect(seeds.get('d1-3').divisionRank).toBe(3);
    expect(seeds.get('d1-3').seed).toBeLessThan(seeds.get('d2-2').seed);
  });

  it('returns the field in seed order', () => {
    expect(playoffFieldInSeedOrder(league).map((t) => t.id)).toEqual([
      'd1-1',
      'd2-1',
      'd1-2',
      'd1-3',
      'd1-4',
      'd2-2'
    ]);
  });

  it('seeds league-wide rather than throwing when there are not two divisions', () => {
    // Mid-setup: every team still sits in one division.
    const oneDivision = [
      team('a', 1, 11, 1, 1500),
      team('b', 1, 10, 2, 1450),
      team('c', 1, 9, 3, 1400),
      team('d', 1, 8, 4, 1350),
      team('e', 1, 7, 5, 1300),
      team('f', 1, 6, 6, 1250),
      team('g', 1, 1, 11, 800)
    ];

    const seeds = computeSeeds(oneDivision);
    expect(seeds.get('a')).toMatchObject({ seed: 1, isBye: true });
    expect(seeds.get('b')).toMatchObject({ seed: 2, isBye: true });
    expect(seeds.get('f')).toMatchObject({ seed: 6, isWildcard: true });
    expect(seeds.get('g').seed).toBeNull();
  });

  it('ignores an empty division rather than handing it a bye', () => {
    const lopsided = [
      team('a', 1, 11, 1, 1500),
      team('b', 1, 10, 2, 1450),
      team('c', 1, 9, 3, 1400)
    ];
    // Division 2 exists but has no teams: there is no second winner to seed.
    const seeds = computeSeeds(lopsided);
    expect(seeds.get('a')).toMatchObject({ seed: 1, isBye: true });
    expect(seeds.get('b')).toMatchObject({ seed: 2, isBye: true });
  });

  it('handles teams with no division at all', () => {
    const unassigned = [
      { id: 'a', wins: 9, losses: 3, pointsFor: 1300 },
      { id: 'b', wins: 3, losses: 9, pointsFor: 900 }
    ];
    const seeds = computeSeeds(unassigned);
    expect(seeds.get('a')).toMatchObject({ seed: 1, divisionRank: 1 });
    expect(seeds.get('b')).toMatchObject({ seed: 2, divisionRank: 2 });
  });

  it('returns an empty map for an empty league', () => {
    expect(computeSeeds([]).size).toBe(0);
    expect(computeSeeds(null).size).toBe(0);
  });
});

describe('reseedSemis', () => {
  it('gives seed 1 the lowest surviving seed', () => {
    expect(reseedSemis(6, 5)).toEqual({ semi1: [1, 6], semi2: [2, 5] });
    expect(reseedSemis(6, 4)).toEqual({ semi1: [1, 6], semi2: [2, 4] });
    expect(reseedSemis(3, 4)).toEqual({ semi1: [1, 4], semi2: [2, 3] });
    expect(reseedSemis(3, 5)).toEqual({ semi1: [1, 5], semi2: [2, 3] });
  });

  it('does not care which round-1 game reported first', () => {
    expect(reseedSemis(5, 6)).toEqual(reseedSemis(6, 5));
    expect(reseedSemis(4, 3)).toEqual(reseedSemis(3, 4));
  });

  it('leaves both semis TBD until both round-1 results are in', () => {
    expect(reseedSemis(6, null)).toEqual({ semi1: [1, null], semi2: [2, null] });
    expect(reseedSemis(null, null)).toEqual({ semi1: [1, null], semi2: [2, null] });
    expect(reseedSemis(undefined, 4)).toEqual({ semi1: [1, null], semi2: [2, null] });
  });
});

describe('organizeSeededBracket', () => {
  const g = (id, type, team1Id, team2Id = null) => ({
    id,
    type,
    week: 15,
    team1: team1Id ? { id: team1Id, name: team1Id } : null,
    team2: team2Id ? { id: team2Id, name: team2Id } : null
  });

  const seedByTeamId = new Map([
    ['t1', 1],
    ['t2', 2],
    ['t3', 3],
    ['t4', 4],
    ['t5', 5],
    ['t6', 6]
  ]);

  it('places byes by seed, not by which row arrived first', () => {
    // Seed 2's bye row comes back first; it must still land in slot 2.
    const bracket = organizeSeededBracket(
      [g('bye-2', 'bye', 't2'), g('bye-1', 'bye', 't1')],
      seedByTeamId
    );

    expect(bracket.byes[1].id).toBe('bye-1');
    expect(bracket.byes[2].id).toBe('bye-2');
  });

  it('routes the round-1 game containing seed 6 to 3v6', () => {
    const bracket = organizeSeededBracket(
      [
        g('r1-a', 'playoff_first_round', 't4', 't5'),
        g('r1-b', 'playoff_first_round', 't3', 't6')
      ],
      seedByTeamId
    );

    expect(bracket.r1['3v6'].id).toBe('r1-b');
    expect(bracket.r1['4v5'].id).toBe('r1-a');
  });

  it('routes the semi containing seed 1 to semi1', () => {
    const bracket = organizeSeededBracket(
      [
        g('semi-x', 'playoff_semifinals', 't2', 't5'),
        g('semi-y', 'playoff_semifinals', 't1', 't6')
      ],
      seedByTeamId
    );

    expect(bracket.semis.semi1.id).toBe('semi-y');
    expect(bracket.semis.semi2.id).toBe('semi-x');
  });

  it('collects the championship, third-place and both fifth-place legs', () => {
    const bracket = organizeSeededBracket(
      [
        g('title', 'playoff_championship', 't1', 't2'),
        g('third', 'playoff_third_place', 't3', 't4'),
        g('fifth-1', 'playoff_fifth_place', 't5', 't6'),
        g('fifth-2', 'playoff_fifth_place', 't5', 't6')
      ],
      seedByTeamId
    );

    expect(bracket.championship.id).toBe('title');
    expect(bracket.thirdPlace.id).toBe('third');
    expect(bracket.fifthPlace.map((game) => game.id)).toEqual(['fifth-1', 'fifth-2']);
  });

  it('ignores consolation rows, which are not part of this bracket', () => {
    const bracket = organizeSeededBracket(
      [g('con', 'playoff_consolation_quarterfinals', 't3', 't4')],
      seedByTeamId
    );

    expect(bracket.r1['3v6']).toBeNull();
    expect(bracket.r1['4v5']).toBeNull();
  });

  it('still renders real games when no seeds are known yet', () => {
    const bracket = organizeSeededBracket(
      [
        g('bye-a', 'bye', 't1'),
        g('bye-b', 'bye', 't2'),
        g('r1-a', 'playoff_first_round', 't3', 't6'),
        g('r1-b', 'playoff_first_round', 't4', 't5')
      ],
      new Map()
    );

    expect(bracket.byes[1].id).toBe('bye-a');
    expect(bracket.byes[2].id).toBe('bye-b');
    expect(bracket.r1['3v6'].id).toBe('r1-a');
    expect(bracket.r1['4v5'].id).toBe('r1-b');
  });

  it('is all-TBD before the bracket exists', () => {
    const bracket = organizeSeededBracket([], seedByTeamId);
    expect(bracket).toEqual({
      byes: { 1: null, 2: null },
      r1: { '3v6': null, '4v5': null },
      semis: { semi1: null, semi2: null },
      championship: null,
      thirdPlace: null,
      fifthPlace: []
    });
  });

  it('tolerates a missing game list and a missing seed map', () => {
    expect(() => organizeSeededBracket(null, null)).not.toThrow();
    expect(organizeSeededBracket(null, null).byes[1]).toBeNull();
  });
});
