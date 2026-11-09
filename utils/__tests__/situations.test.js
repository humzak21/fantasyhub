/**
 * How seasons were decided: locks, punishment, starts and score bands.
 *
 * A six-team, five-week league, played out by hand so each lock can be checked
 * against the table. After week 4 everybody but A and F is 2-2, so with one game
 * left neither end can change:
 *
 *        wk1   wk2   wk3   wk4   wk5   final
 *   A    W     W     W     W     W     5-0   1 seed, locked week 4
 *   B    L     L     W     W     W     3-2
 *   C    L     L     W     W     L     2-3
 *   D    W     W     L     L     W     3-2   wins the west on the points
 *   E    W     W     L     L     L     2-3
 *   F    L     L     L     L     L     0-5   punishment, locked week 4
 */

import { describe, it, expect } from 'vitest';

import {
  SCORE_BANDS,
  START_LENGTHS,
  buildRecordBook,
  buildSituations,
  lockedEnds,
  rankRows,
  recordRows
} from '../recordBook/index.js';
import { buildComparisonFacts, getStat, statValue } from '../statComparison/index.js';

const S = { id: 's1', year: 2023, isCompleted: true, regularSeasonWeeks: 5 };

const team = (key, extra = {}) => ({
  id: `t${key}`,
  seasonId: S.id,
  franchiseId: `f${key}`,
  divisionId: 'AB'.includes(key) || key === 'C' ? 'east' : 'west',
  name: `Team ${key}`,
  owner: `Owner ${key}`,
  madePlayoffs: false,
  playoffFinish: 'none',
  finalRank: null,
  ...extra
});

const game = (week, a, sa, b, sb, season = S) => ({
  id: `${season.id}-${week}-${a}${b}`,
  seasonId: season.id,
  week,
  type: 'regular',
  team1Id: `t${a}`,
  team2Id: `t${b}`,
  team1Score: sa,
  team2Score: sb,
  isBlowout: false,
  isClose: false
});

const source = {
  seasons: [S],
  teams: [
    team('A', { madePlayoffs: true, playoffFinish: 'champion', finalRank: 1 }),
    team('B', { madePlayoffs: true, finalRank: 3 }),
    team('C', { madePlayoffs: true, playoffFinish: '2nd', finalRank: 2 }),
    team('D', { finalRank: 5 }),
    // The worst final rank is E's: the consolation bracket, not the punishment.
    team('E', { finalRank: 6 }),
    team('F', { finalRank: 4 })
  ],
  games: [
    game(1, 'A', 165, 'B', 100), game(1, 'D', 110, 'C', 95), game(1, 'E', 92, 'F', 80),
    game(2, 'A', 140, 'C', 120), game(2, 'E', 94, 'B', 90), game(2, 'D', 100, 'F', 70),
    game(3, 'A', 130, 'D', 100), game(3, 'B', 120, 'F', 60), game(3, 'C', 150, 'E', 96),
    game(4, 'A', 120, 'E', 90), game(4, 'B', 131, 'D', 100), game(4, 'C', 125, 'F', 99),
    game(5, 'A', 130, 'F', 90), game(5, 'B', 118, 'C', 115), game(5, 'D', 105, 'E', 98)
  ]
};

const row = (id, wins, losses, gamesLeft, extra = {}) => ({
  id, wins, losses, ties: 0, pointsFor: 0, pointsAgainst: 0, gamesLeft, ...extra
});

describe('lockedEnds', () => {
  it('locks first only when nobody can catch the leader', () => {
    expect(lockedEnds([row('a', 9, 2, 2), row('b', 6, 5, 2)]).first).toBe('a');
    expect(lockedEnds([row('a', 8, 3, 2), row('b', 6, 5, 2)]).first).toBeNull();
  });

  it('leaves a level finish open while points for is still to be scored', () => {
    // b can only tie a on record, but the tie goes to points nobody has scored.
    const { first, last } = lockedEnds([row('a', 9, 4, 1), row('b', 8, 5, 1), row('c', 7, 6, 1)]);
    expect(first).toBeNull();
    expect(last).toBeNull();
  });

  it('locks last on the mirror of the same rule', () => {
    expect(lockedEnds([row('a', 5, 2, 1), row('b', 5, 2, 1), row('c', 3, 4, 1)]).last).toBe('c');
  });

  it('settles a level finish on points once nothing is left, and says so', () => {
    const locked = lockedEnds([
      row('a', 9, 5, 0, { pointsFor: 1400 }),
      row('b', 9, 5, 0, { pointsFor: 1500 }),
      row('c', 4, 10, 0, { pointsFor: 1000 })
    ]);
    expect(locked.first).toBe('b');
    expect(locked.onPoints).toEqual({ first: true, last: false });
    expect(locked.last).toBe('c');
  });

  it('counts a tie as half a win', () => {
    const tied = { ...row('a', 4, 0, 1), ties: 1 };
    expect(lockedEnds([tied, row('b', 3, 2, 1)]).first).toBe('a');
    expect(lockedEnds([tied, row('b', 3, 1, 1, { ties: 1 })]).first).toBeNull();
  });
});

describe('the races', () => {
  const [race] = buildSituations(source).races;

  it('finds the week each end was locked', () => {
    expect(race.oneSeed).toMatchObject({
      teamId: 'tA',
      franchiseId: 'fA',
      week: 4,
      weeksLeft: 1,
      record: { wins: 4, losses: 0, ties: 0 }
    });
    expect(race.punishment).toMatchObject({ teamId: 'tF', week: 4, weeksLeft: 1 });
  });

  it('keeps the punishee\'s path, week by week, with where it stood', () => {
    expect(race.punishment.path.map((game) => game.result).join('')).toBe('LLLLL');
    expect(race.punishment.path.at(-1)).toMatchObject({ week: 5, wins: 0, losses: 5, place: 6 });
  });

  it('calls a season decided on points in its final week', () => {
    const [level] = buildSituations({
      seasons: [{ ...S, regularSeasonWeeks: 1 }],
      teams: ['A', 'B', 'C', 'D'].map((key) => team(key)),
      games: [game(1, 'A', 100, 'B', 90), game(1, 'C', 120, 'D', 80)]
    }).races;

    expect(level.oneSeed).toMatchObject({ teamId: 'tC', week: 1, weeksLeft: 0, onPoints: true });
    expect(level.punishment).toMatchObject({ teamId: 'tD', week: 1, weeksLeft: 0, onPoints: true });
  });

  it('reports nothing for a season in progress until something is locked', () => {
    const active = { ...S, id: 's2', year: 2024, isCompleted: false };
    const [current] = buildSituations({
      seasons: [active],
      teams: ['A', 'B', 'C', 'D'].map((key) => team(key, { seasonId: active.id })),
      games: [game(1, 'A', 100, 'B', 90, active), game(1, 'C', 90, 'D', 80, active)]
    }).races;

    expect(current.oneSeed).toBeNull();
    expect(current.punishment).toBeNull();
    expect(current.completed).toBe(false);
  });
});

describe('the record book', () => {
  const book = buildRecordBook(source);
  const value = (scope, key, franchiseId) =>
    recordRows(book, scope, key).find((entry) => entry.franchiseId === franchiseId)?.value;

  it('ranks a lock by its week, earliest or latest', () => {
    expect(rankRows(recordRows(book, 'season', 'oneSeedLock'), { direction: 'asc' })[0]).toMatchObject({
      franchiseId: 'fA',
      value: 4,
      weeksLeft: 1,
      year: 2023
    });
    expect(recordRows(book, 'season', 'punishmentLock')[0]).toMatchObject({ franchiseId: 'fF', value: 4 });
  });

  it('punishes last in the regular season, not the worst final rank', () => {
    expect(value('career', 'lastPlaces', 'fF')).toBe(1);
    expect(value('career', 'lastPlaces', 'fE')).toBe(0);
  });

  it('gives each division its best regular-season record', () => {
    expect(value('career', 'divisionTitles', 'fA')).toBe(1);
    expect(value('career', 'divisionTitles', 'fD')).toBe(1);
    expect(value('career', 'divisionTitles', 'fB')).toBe(0);
  });

  it('counts the score bands per franchise, per season and league-wide', () => {
    expect(value('career', 'games160Plus', 'fA')).toBe(1);
    // Exactly 130 is 130+, and exactly 100 is not sub-100.
    expect(value('season', 'games130Plus', 'fA')).toBe(4);
    expect(value('season', 'games140Plus', 'fA')).toBe(2);
    expect(value('career', 'gamesUnder100', 'fE')).toBe(5);
    expect(value('career', 'gamesUnder100', 'fD')).toBe(0);
    expect(recordRows(book, 'season', 'league_gamesUnder100')[0].value).toBe(12);
  });

  it('lists a season\'s finish after an 0-3 or a 3-0 start', () => {
    expect(recordRows(book, 'season', 'after03').map((entry) => entry.franchiseId)).toEqual(['fF']);
    const after30 = recordRows(book, 'season', 'after30');
    expect(after30.map((entry) => entry.franchiseId)).toEqual(['fA']);
    expect(after30[0]).toMatchObject({ value: 100, record: { wins: 5, losses: 0, ties: 0 } });
  });

  it('agrees with the comparison on the bands and the division titles', () => {
    const facts = buildComparisonFacts(source);
    const compare = (id, franchiseId) =>
      statValue(facts, getStat(id), franchiseId, [2023]).value;

    for (const band of SCORE_BANDS) {
      expect(compare(band.id, 'fA')).toBe(value('career', band.id, 'fA'));
      expect(compare(band.id, 'fE')).toBe(value('career', band.id, 'fE'));
    }
    expect(compare('divisionTitles', 'fD')).toBe(1);
    expect(compare('lastPlaces', 'fF')).toBe(1);
  });
});

describe('starts', () => {
  const { starts } = buildSituations(source);

  it('groups team-seasons by their record after the start, worst first', () => {
    expect(starts[3].map((group) => group.key)).toEqual(['0-3', '1-2', '2-1', '3-0']);
    expect(starts[3].reduce((total, group) => total + group.count, 0)).toBe(6);
  });

  it('reports where each start ended', () => {
    const allWon = starts[3].find((group) => group.key === '3-0');
    expect(allWon).toMatchObject({ count: 1, madePlayoffs: 1, titles: 1, punished: 0, averageWins: 5 });

    const allLost = starts[3].find((group) => group.key === '0-3');
    expect(allLost).toMatchObject({ count: 1, madePlayoffs: 0, titles: 0, punished: 1 });
    expect(allLost.best.teamId).toBe('tF');
  });

  it('names the best and worst finish of a shared start', () => {
    const middling = starts[3].find((group) => group.key === '2-1');
    expect(middling.best.teamId).toBe('tD');
    expect(middling.worst.teamId).toBe('tE');
  });

  it('offers every start from 2 games to 13', () => {
    expect(START_LENGTHS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(Object.keys(starts).map(Number)).toEqual(START_LENGTHS);
  });

  it('leaves out a team-season too short for the start', () => {
    expect(starts[5].reduce((total, group) => total + group.count, 0)).toBe(6);
    expect(starts[13]).toEqual([]);
  });

  it('leaves a season still being played out', () => {
    const active = { ...S, id: 's2', year: 2024, isCompleted: false };
    const { starts: open } = buildSituations({
      seasons: [active],
      teams: ['A', 'B'].map((key) => team(key, { seasonId: active.id })),
      games: [game(1, 'A', 100, 'B', 90, active), game(2, 'A', 100, 'B', 90, active)]
    });
    expect(open[2]).toEqual([]);
  });
});

describe('places from the bottom', () => {
  const { places } = buildSituations(source);

  it('counts where the bottom of the table stood after a start, and who took the punishment', () => {
    // After week 3: F is 0-3, and B is below C at 1-2 on points for.
    expect(places[3]).toEqual([
      { fromBottom: 1, seasons: 1, punished: 1 },
      { fromBottom: 2, seasons: 1, punished: 0 },
      { fromBottom: 3, seasons: 1, punished: 0 },
      { fromBottom: 4, seasons: 1, punished: 0 }
    ]);
  });

  it('leaves a season still being played out', () => {
    const active = { ...S, id: 's2', year: 2024, isCompleted: false };
    const { places: open } = buildSituations({
      seasons: [active],
      teams: ['A', 'B'].map((key) => team(key, { seasonId: active.id })),
      games: [game(1, 'A', 100, 'B', 90, active), game(2, 'A', 100, 'B', 90, active)]
    });
    expect(open[2].every((place) => place.seasons === 0)).toBe(true);
  });
});

describe('score bands by season', () => {
  it('counts the league, newest first, with every band', () => {
    const { bands } = buildSituations(source);
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({ year: 2023, games: 30 });
    expect(bands[0].counts).toEqual({
      gamesUnder100: 12,
      games130Plus: 6,
      games140Plus: 3,
      games150Plus: 2,
      games160Plus: 1
    });
  });
});
