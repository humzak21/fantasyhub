/**
 * What the Records tab highlights, against a league small enough to work by
 * hand. 2023 is outside the window; 2024 is the previous season and 2025 the
 * current one, in progress.
 *
 * 2023 (completed):  wk1  A 150 – B 100      C 120 – D  90
 *                    wk2  A 145 – C 100      B 130 – D  95
 * 2024 (completed):  wk1  A 110 – D 100      B 105 – C 100
 *                    wk2  D 160 – B 100      A 112 – C 111
 * 2025 (in progress): wk1  D 155 – C 100     B 101 – A 100
 */

import { describe, it, expect } from 'vitest';
import {
  TOP,
  beforeSeason,
  buildRecordBooks,
  newRowIds,
  rowIdentity,
  topFive,
  topFiveEntries
} from '../recordBook/newRecords.js';
import { RECORDS } from '../../src/components/history/records/recordCatalog.js';

const S23 = { id: 's23', year: 2023, isCompleted: true, regularSeasonWeeks: 2 };
const S24 = { id: 's24', year: 2024, isCompleted: true, regularSeasonWeeks: 2 };
const S25 = { id: 's25', year: 2025, isCompleted: false, isActive: true, regularSeasonWeeks: 2 };

const KEYS = ['A', 'B', 'C', 'D'];

const team = (season, key, extra = {}) => ({
  id: `${season.id}-${key}`,
  seasonId: season.id,
  franchiseId: `f${key}`,
  name: `Team ${key}`,
  owner: `Owner ${key}`,
  madePlayoffs: false,
  playoffFinish: 'none',
  ...extra
});

const game = (season, week, a, sa, b, sb, type = 'regular') => ({
  id: `${season.id}-${week}-${a}${b}`,
  seasonId: season.id,
  week,
  type,
  team1Id: `${season.id}-${a}`,
  team2Id: `${season.id}-${b}`,
  team1Score: sa,
  team2Score: sb,
  isBlowout: Math.abs(sa - sb) >= 30,
  isClose: Math.abs(sa - sb) <= 5
});

const SOURCE = {
  seasons: [S23, S24, S25],
  teams: [S23, S24, S25].flatMap((season) => KEYS.map((key) => team(season, key))),
  games: [
    game(S23, 1, 'A', 150, 'B', 100), game(S23, 1, 'C', 120, 'D', 90),
    game(S23, 2, 'A', 145, 'C', 100), game(S23, 2, 'B', 130, 'D', 95),
    game(S24, 1, 'A', 110, 'D', 100), game(S24, 1, 'B', 105, 'C', 100),
    game(S24, 2, 'D', 160, 'B', 100), game(S24, 2, 'A', 112, 'C', 111),
    game(S25, 1, 'D', 155, 'C', 100), game(S25, 1, 'B', 101, 'A', 100)
  ],
  transactions: [
    { seasonId: 's23', franchiseId: 'fA', trades: 3 },
    { seasonId: 's25', franchiseId: 'fD', trades: 9 }
  ],
  trades: [
    { seasonId: 's23', franchiseIds: ['fA', 'fB'] },
    { seasonId: 's25', franchiseIds: ['fC', 'fD'] }
  ],
  bids: [],
  lineups: []
};

const books = buildRecordBooks(SOURCE);
const record = (id) => RECORDS.find((entry) => entry.id === id);
const fresh = (id, phase) => newRowIds(record(id), { ...books, phase });

describe('topFive', () => {
  // Five ties at the top of a list hide the sixth from a five-row cut, and a
  // tie lists the earlier achievement first, so the sixth is always the newest.
  const tied = buildRecordBooks({
    ...SOURCE,
    games: [
      game(S23, 1, 'A', 150, 'B', 100), game(S23, 1, 'C', 150, 'D', 90),
      game(S23, 2, 'A', 150, 'C', 100), game(S23, 2, 'B', 150, 'D', 95),
      game(S24, 1, 'A', 150, 'D', 100),
      game(S25, 1, 'D', 150, 'C', 100)
    ]
  }).book;

  it('is a place, not a position: every row tied into it counts', () => {
    const rows = topFive(tied, record('game-high-score'));

    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.rank === 1)).toBe(true);
    expect(rows.at(-1)).toMatchObject({ year: 2025, teamId: 's25-D' });
  });

  it('stops at the fifth place, and the whole-book list keeps to it', () => {
    expect(topFive(books.book, record('game-high-score')).every((row) => row.rank <= TOP)).toBe(true);
    expect(topFiveEntries(tied).every((entry) => entry.rank <= TOP)).toBe(true);
    expect(topFiveEntries(null)).toEqual([]);
  });

  it('reads the phase asked for, and the regular season by default', () => {
    const bracket = buildRecordBooks({
      ...SOURCE,
      games: [...SOURCE.games, game(S24, 3, 'A', 99, 'B', 88, 'playoff_championship')]
    }).book;

    expect(topFive(bracket, record('game-high-score')).some((row) => row.value === 99)).toBe(false);
    expect(topFive(bracket, record('game-high-score'), 'playoff').map((row) => row.value)).toEqual([99, 88]);
  });
});

describe('rowIdentity', () => {
  it('keys a streak on where it began, so a running one keeps its identity', () => {
    const streak = { kind: 'streak' };
    expect(rowIdentity(streak, { franchiseId: 'f', start: { year: 2026, week: 1 }, end: { year: 2026, week: 2 } })).toBe(
      rowIdentity(streak, { franchiseId: 'f', start: { year: 2026, week: 1 }, end: { year: 2026, week: 5 } })
    );
  });
});

describe('beforeSeason', () => {
  it('keeps only what came before the year, transactions and trades included', () => {
    const before = beforeSeason(SOURCE, 2024);

    expect(before.seasons).toEqual([S23]);
    expect(before.teams.every((row) => row.seasonId === 's23')).toBe(true);
    expect(before.games).toHaveLength(4);
    expect(before.transactions).toEqual([SOURCE.transactions[0]]);
    expect(before.trades).toEqual([SOURCE.trades[0]]);
  });
});

describe('buildRecordBooks', () => {
  it('starts the before book where the recent seasons begin', () => {
    expect(books.book.recentYears).toEqual([2025, 2024]);
    expect(books.before.years.map((entry) => entry.year)).toEqual([2023]);
  });

  it('has no before book when no season came first', () => {
    expect(buildRecordBooks({ ...SOURCE, seasons: [S24, S25] }).before).toBeNull();
    expect(buildRecordBooks({}).before).toBeNull();
  });

  it('moves with the seasons: nothing about the window is a fixed year', () => {
    const S26 = { id: 's26', year: 2026, isCompleted: false, isActive: true };
    const later = buildRecordBooks({
      ...SOURCE,
      seasons: [S23, S24, { ...S25, isActive: false, isCompleted: true }, S26],
      teams: [...SOURCE.teams, ...KEYS.map((key) => team(S26, key))]
    });

    expect(later.book.recentYears).toEqual([2026, 2025]);
    expect(later.before.years.map((entry) => entry.year)).toEqual([2024, 2023]);
  });
});

describe('newRowIds', () => {
  it('marks every game in the top five set in a recent season, not just the #1', () => {
    // 160 (2024) and 155 (2025) are 1st and 2nd; 150 and 145 are older; 130 is 2023's.
    expect(fresh('game-high-score')).toEqual(new Set(['g:s24-D:2', 'g:s25-D:1']));
  });

  it('marks a recent row below #1 as readily as one at the top', () => {
    const low = fresh('game-low-score');
    // 90 is 2023's, then 95; the 100s are tied for third and 2024 and 2025 both hold some.
    expect(low.has('g:s24-D:1')).toBe(true);
    expect(low.has('g:s25-A:1')).toBe(true);
    expect(low.has('g:s23-D:1')).toBe(false);
  });

  it('dates a streak by the season it ended in, however early it began', () => {
    // D lost both of 2023 and week 1 of 2024, then won two: the win streak is
    // new, and the loss streak ended in the window too.
    expect(fresh('career-win-streak').has('s:fD:2024:2')).toBe(true);
    expect(fresh('career-loss-streak').has('s:fD:2023:1')).toBe(true);
  });

  it('does not mark a streak that ended before the window', () => {
    // A's four wins ended in 2024; D's two ended in 2025.
    const ids = newRowIds(record('career-win-streak'), {
      book: { ...books.book, recentYears: [2025] },
      before: books.before
    });
    expect(ids.has('s:fA:2023:1')).toBe(false);
    expect(ids.has('s:fD:2024:2')).toBe(true);
  });

  it('marks a career that entered a top five, and leaves one already in it alone', () => {
    // Going into 2024, D had no wins, and a zero is not a place. A, B and C had
    // one and have only climbed.
    expect(fresh('career-wins')).toEqual(new Set(['f:fD']));
  });

  it('marks a career trade pair by entry too, which has no year of its own', () => {
    expect(fresh('career-trade-partners')).toEqual(new Set(['p:fC:fD:']));
  });

  it('counts a whole season of transactions, unlike a week', () => {
    // D's first transactions row is 2025's.
    expect(fresh('career-trades')).toEqual(new Set(['f:fD']));
  });

  it('marks no career at all without a before book', () => {
    const { book } = buildRecordBooks({ ...SOURCE, seasons: [S24, S25] });
    expect(newRowIds(record('career-wins'), { book, before: null }).size).toBe(0);
  });

  it('measures the phase the card is showing', () => {
    const bracket = buildRecordBooks({
      ...SOURCE,
      games: [...SOURCE.games, game(S24, 3, 'A', 99, 'B', 88, 'playoff_championship')]
    });
    const playoff = newRowIds(record('game-high-score'), { ...bracket, phase: 'playoff' });

    expect(playoff).toEqual(new Set(['g:s24-A:3', 'g:s24-B:3']));
  });

  it('is empty for an empty book', () => {
    expect(newRowIds(record('game-high-score'), { book: null, before: null }).size).toBe(0);
  });
});
