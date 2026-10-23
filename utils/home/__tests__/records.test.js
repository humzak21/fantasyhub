import { describe, it, expect } from 'vitest';
import {
  buildHomeRecordBooks,
  canBeNew,
  dateKeyOf,
  homeRecordCards,
  latestScoredWeek,
  newRecords,
  recordOfTheDay,
  rowIdentity,
  topFiveEntries,
  withoutWeek,
  yourRecord
} from '../records.js';
import { RECORDS } from '../../../src/components/history/records/recordCatalog.js';

const IDS = { A: 'f-a', B: 'f-b', C: 'f-c', D: 'f-d' };

const team = (key, seasonId, extra = {}) => ({
  id: `${seasonId}-${key}`,
  seasonId,
  franchiseId: IDS[key],
  name: `Team ${key}`,
  owner: `Owner ${key}`,
  madePlayoffs: false,
  playoffFinish: 'none',
  finalRank: null,
  ...extra
});

const game = (seasonId, week, a, sa, b, sb, type = 'regular') => ({
  id: `${seasonId}-${week}-${a}${b}`,
  seasonId,
  week,
  type,
  team1Id: `${seasonId}-${a}`,
  team2Id: `${seasonId}-${b}`,
  team1Score: sa,
  team2Score: sb,
  isBlowout: Math.abs(sa - sb) >= 30,
  isClose: Math.abs(sa - sb) <= 5
});

// 2025 is complete; 2026 has two scored weeks, and in week 2 A scores 200 —
// the highest score anybody has posted.
const SOURCE = {
  seasons: [
    { id: 's25', year: 2025, isCompleted: true, regularSeasonWeeks: 2 },
    { id: 's26', year: 2026, isCompleted: false, regularSeasonWeeks: 14 }
  ],
  teams: ['A', 'B', 'C', 'D'].flatMap((k) => [team(k, 's25'), team(k, 's26')]),
  games: [
    game('s25', 1, 'A', 120, 'B', 100), game('s25', 1, 'C', 90, 'D', 95),
    game('s25', 2, 'A', 110, 'C', 105), game('s25', 2, 'B', 130, 'D', 80),
    game('s26', 1, 'A', 100, 'D', 99), game('s26', 1, 'B', 101, 'C', 140),
    game('s26', 2, 'A', 200, 'B', 90), game('s26', 2, 'C', 111, 'D', 112),
    // Scheduled, unscored: not "the latest week".
    game('s26', 3, 'A', null, 'C', null)
  ],
  transactions: [{ seasonId: 's26', franchiseId: IDS.D, trades: 9 }],
  trades: [],
  bids: [],
  lineups: []
};

const highScore = RECORDS.find((r) => r.id === 'game-high-score');

describe('latestScoredWeek / withoutWeek', () => {
  it('finds the newest scored regular week, skipping unscored fixtures', () => {
    expect(latestScoredWeek(SOURCE)).toEqual({ year: 2026, seasonId: 's26', week: 2 });
  });

  it('removes that week’s games and nothing else', () => {
    const before = withoutWeek(SOURCE, 's26', 2);
    expect(before.games.some((g) => g.seasonId === 's26' && g.week === 2)).toBe(false);
    expect(before.games).toHaveLength(SOURCE.games.length - 2);
    expect(before.transactions).toBe(SOURCE.transactions);
  });
});

describe('newRecords', () => {
  const { book, before } = buildHomeRecordBooks(SOURCE);

  it('finds a row that entered a top five this week', () => {
    const fresh = newRecords(book, before);
    const top = fresh.find((entry) => entry.record.id === 'game-high-score');
    expect(top).toMatchObject({ rank: 1, row: { franchiseId: IDS.A, week: 2, year: 2026, value: 200 } });
  });

  it('does not call a row new that was already there', () => {
    // Week 2 put both A's 200 and D's 112 into the top five; nothing older is new.
    const fresh = newRecords(book, before).filter((entry) => entry.record.kind === 'game');
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((entry) => entry.row.year === 2026 && entry.row.week === 2)).toBe(true);
  });

  it('never offers a record built on season transaction counts', () => {
    expect(newRecords(book, before).some((entry) => !canBeNew(entry.record))).toBe(false);
    expect(canBeNew(RECORDS.find((r) => r.id === 'season-trades'))).toBe(false);
    expect(canBeNew(highScore)).toBe(true);
  });

  it('is empty without a before book', () => {
    expect(newRecords(book, null)).toEqual([]);
  });
});

describe('recordOfTheDay / yourRecord', () => {
  const { book } = buildHomeRecordBooks(SOURCE);

  it('is a #1, and the same one all day', () => {
    const a = recordOfTheDay(book, RECORDS, '2026-10-23');
    const b = recordOfTheDay(book, RECORDS, '2026-10-23');
    expect(a.rank).toBe(1);
    expect(a.key).toBe(b.key);
  });

  it('changes with the date, over enough days', () => {
    const keys = new Set(
      Array.from({ length: 20 }, (_, i) => recordOfTheDay(book, RECORDS, `2026-10-${String(i + 1).padStart(2, '0')}`).key)
    );
    expect(keys.size).toBeGreaterThan(1);
  });

  it("is the viewer's best place, and null for a franchise with none", () => {
    const mine = yourRecord(book, RECORDS, IDS.A, '2026-10-23');
    expect(mine.rank).toBe(1);
    expect(mine.row.franchiseId === IDS.A || mine.row.partnerFranchiseId === IDS.A).toBe(true);
    expect(yourRecord(book, RECORDS, 'f-nobody', '2026-10-23')).toBeNull();
    expect(yourRecord(book, RECORDS, null)).toBeNull();
  });
});

describe('homeRecordCards', () => {
  const books = buildHomeRecordBooks(SOURCE);

  it('orders new, then the day, then yours, and never repeats an entry', () => {
    const cards = homeRecordCards({ ...books, franchiseId: IDS.C, dateKey: '2026-10-23' });
    const kinds = cards.map((card) => card.kind);
    expect(kinds[0]).toBe('new');
    expect(kinds.indexOf('day')).toBeGreaterThan(kinds.lastIndexOf('new'));
    expect(new Set(cards.map((card) => card.key)).size).toBe(cards.length);
  });

  it('offers only the day and yours before any week is scored', () => {
    const cards = homeRecordCards({ book: books.book, before: null, franchiseId: IDS.A, dateKey: '2026-10-23' });
    expect(cards.every((card) => card.kind !== 'new')).toBe(true);
    expect(cards.length).toBeGreaterThan(0);
  });
});

describe('topFiveEntries / rowIdentity', () => {
  it('caps every record at five places', () => {
    const { book } = buildHomeRecordBooks(SOURCE);
    expect(topFiveEntries(book).every((entry) => entry.rank <= 5)).toBe(true);
  });

  it('keys a streak on where it began, so a running one keeps its identity', () => {
    const streak = { kind: 'streak' };
    expect(rowIdentity(streak, { franchiseId: 'f', start: { year: 2026, week: 1 }, end: { year: 2026, week: 2 } })).toBe(
      rowIdentity(streak, { franchiseId: 'f', start: { year: 2026, week: 1 }, end: { year: 2026, week: 5 } })
    );
  });

  it('keys the date in local time', () => {
    expect(dateKeyOf(new Date(2026, 9, 3))).toBe('2026-10-03');
  });
});
