/**
 * The record book, against a four-team league small enough to work by hand.
 *
 * 2024 (completed, three-week regular season):
 *   wk1  A 120 – B 100      C  90 – D  95
 *   wk2  A 130 – C  80      B 110 – D 108
 *   wk3  A 100 – D 100      B 140 – C  70
 *   wk4  A 110 – B 105 (championship)   C 150 – D 60 (consolation)
 * 2025 (in progress):
 *   wk1  A  90 – B 130      C 100 – D  99
 *
 * Every expected value below is worked out from that grid, so a change in a
 * rule shows up as a number that no longer matches arithmetic anyone can redo.
 */

import { describe, it, expect } from 'vitest';

import { buildRecordBook, rankRows, recordRows, streakRuns } from '../recordBook/index.js';

const S24 = { id: 's24', year: 2024, isCompleted: true, regularSeasonWeeks: 3 };
const S25 = { id: 's25', year: 2025, isCompleted: false, regularSeasonWeeks: 3 };

const team = (season, key, extra = {}) => ({
  id: `${season.id}-${key}`,
  seasonId: season.id,
  franchiseId: `f${key}`,
  name: `Team ${key} ${season.year}`,
  owner: `Owner ${key}`,
  madePlayoffs: false,
  playoffFinish: 'none',
  finalRank: null,
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
  seasons: [S24, S25],
  teams: [
    team(S24, 'A', { madePlayoffs: true, playoffFinish: 'champion', finalRank: 1 }),
    team(S24, 'B', { madePlayoffs: true, playoffFinish: '2nd', finalRank: 2 }),
    team(S24, 'C', { finalRank: 4 }),
    team(S24, 'D', { finalRank: 3 }),
    team(S25, 'A'), team(S25, 'B'), team(S25, 'C'), team(S25, 'D')
  ],
  games: [
    game(S24, 1, 'A', 120, 'B', 100), game(S24, 1, 'C', 90, 'D', 95),
    game(S24, 2, 'A', 130, 'C', 80), game(S24, 2, 'B', 110, 'D', 108),
    game(S24, 3, 'A', 100, 'D', 100), game(S24, 3, 'B', 140, 'C', 70),
    game(S24, 4, 'A', 110, 'B', 105, 'playoff_championship'),
    game(S24, 4, 'C', 150, 'D', 60, 'playoff_consolation_championship'),
    game(S25, 1, 'A', 90, 'B', 130), game(S25, 1, 'C', 100, 'D', 99)
  ],
  transactions: [
    { seasonId: 's24', franchiseId: 'fA', freeAgentAdds: 3, waiverClaims: 2, trades: 3, drops: 4, faabSpent: 40 },
    { seasonId: 's24', franchiseId: 'fB', freeAgentAdds: 0, waiverClaims: 0, trades: 2, drops: 1, faabSpent: 0 }
  ],
  trades: [
    { seasonId: 's24', franchiseIds: ['fA', 'fB'] },
    { seasonId: 's24', franchiseIds: ['fB', 'fA'] },
    { seasonId: 's24', franchiseIds: ['fA', 'fC'] }
  ],
  bids: [
    { seasonId: 's24', franchiseId: 'fA', teamId: 's24-A', bidAmount: 40, scoringPeriod: 2, playerName: 'Waiver Guy' },
    { seasonId: 's24', franchiseId: 'fB', teamId: 's24-B', bidAmount: 0, scoringPeriod: 2, playerName: 'Free Guy' }
  ],
  lineups: [
    { seasonId: 's24', week: 1, teamId: 's24-A', starterPoints: 120, optimalPoints: 120, startersScoring: 9 },
    { seasonId: 's24', week: 1, teamId: 's24-B', starterPoints: 100, optimalPoints: 125, startersScoring: 9 },
    { seasonId: 's24', week: 2, teamId: 's24-B', starterPoints: 110, optimalPoints: 112, startersScoring: 8 }
  ]
};

const book = buildRecordBook(SOURCE);
const valueOf = (rows, franchiseId, extra = () => true) =>
  rows.find((row) => row.franchiseId === franchiseId && extra(row))?.value;

describe('rankRows', () => {
  it('shares a place between equal values and skips the next', () => {
    const ranked = rankRows([{ value: 8 }, { value: 10 }, { value: 5 }, { value: 8 }]);

    expect(ranked.map((row) => row.rank)).toEqual([1, 2, 2, 4]);
    expect(ranked.map((row) => row.tied)).toEqual([false, true, true, false]);
  });

  it('reads the scale from the direction, cuts at the limit, and can drop zeros', () => {
    const rows = [{ value: 3 }, { value: 0 }, { value: 1 }];

    expect(rankRows(rows, { direction: 'asc' }).map((row) => row.value)).toEqual([0, 1, 3]);
    expect(rankRows(rows, { limit: 1 })).toHaveLength(1);
    expect(rankRows(rows, { hideZero: true }).map((row) => row.value)).toEqual([3, 1]);
  });

  it('lists the earlier of two equal achievements first', () => {
    const ranked = rankRows([{ value: 7, year: 2024 }, { value: 7, year: 2021 }]);
    expect(ranked.map((row) => row.year)).toEqual([2021, 2024]);
  });
});

describe('streakRuns', () => {
  it('breaks a run where two items are not consecutive', () => {
    const seasons = [{ year: 2020 }, { year: 2021 }, { year: 2023 }];
    const runs = streakRuns(seasons, () => true, (prev, item) => item.year === prev.year + 1);

    expect(runs.map((run) => run.length)).toEqual([2, 1]);
  });
});

describe('buildRecordBook', () => {
  it('builds season totals from completed seasons only, but games from every season', () => {
    expect(recordRows(book, 'season', 'wins').map((row) => row.year)).toEqual([2024, 2024, 2024, 2024]);
    expect(recordRows(book, 'season', 'score', { year: 2025 })).toHaveLength(4);
  });

  it('counts a standings record the way the league does', () => {
    const wins = recordRows(book, 'season', 'wins');
    expect(wins.find((row) => row.franchiseId === 'fA').record).toEqual({ wins: 2, losses: 0, ties: 1 });
    expect(valueOf(recordRows(book, 'season', 'winPct'), 'fA')).toBeCloseTo(83.3333, 3);
  });

  it('works out all-play records, with a tied score as half', () => {
    // A beat all three other scores in weeks 1 and 2; in week 3 lost to B's
    // 140, beat C's 70 and tied D's 100.
    expect(valueOf(recordRows(book, 'season', 'allPlayWins'), 'fA')).toBe(7.5);
    expect(valueOf(recordRows(book, 'season', 'allPlayLosses'), 'fA')).toBe(1.5);
  });

  it('measures luck as wins beyond what the scoring earned', () => {
    const luck = recordRows(book, 'season', 'luck');

    expect(valueOf(luck, 'fA')).toBeCloseTo(0, 4);
    expect(valueOf(luck, 'fD')).toBeCloseTo(0.3333, 4);
    expect(valueOf(luck, 'fB')).toBeCloseTo(-0.3333, 4);
  });

  it('shares a weekly high score, and counts it across seasons for a career', () => {
    expect(valueOf(recordRows(book, 'season', 'weeklyHighs'), 'fA')).toBe(2);
    // B had the top score in 2024 week 3 and in 2025 week 1.
    expect(valueOf(recordRows(book, 'career', 'weeklyHighs'), 'fB')).toBe(2);
    expect(valueOf(recordRows(book, 'season', 'facedTop'), 'fC')).toBe(2);
  });

  it('uses the stored blowout and close-game flags, and never calls a tie a narrow win', () => {
    expect(valueOf(recordRows(book, 'season', 'blowoutWins'), 'fB')).toBe(1);
    expect(valueOf(recordRows(book, 'season', 'narrowWins'), 'fD')).toBe(1);

    const margins = recordRows(book, 'season', 'winMargin', { year: 2024, phase: 'regular' });
    expect(margins.map((row) => row.value).sort((a, b) => a - b)).toEqual([2, 5, 20, 50, 70]);
  });

  it('keeps bracket games apart from the regular season and leaves consolation out', () => {
    const playoff = recordRows(book, 'season', 'score', { phase: 'playoff' });

    expect(playoff.map((row) => row.value).sort()).toEqual([105, 110]);
    expect(recordRows(book, 'season', 'score').some((row) => row.value === 150)).toBe(false);
    expect(valueOf(recordRows(book, 'career', 'playoffPoints'), 'fA')).toBe(110);
  });

  it('lists a combined score once, under the winner', () => {
    const combined = recordRows(book, 'season', 'combined', { year: 2024, phase: 'regular' });

    expect(combined).toHaveLength(6);
    expect(combined.find((row) => row.value === 220).franchiseId).toBe('fA');
  });

  it('carries a win streak across a season boundary and marks it active', () => {
    // B: lost week 1 of 2024, won weeks 2 and 3, then won week 1 of 2025.
    const career = recordRows(book, 'career', 'winStreak').filter((row) => row.franchiseId === 'fB');
    expect(career).toEqual([
      expect.objectContaining({ value: 3, start: { year: 2024, week: 2 }, end: { year: 2025, week: 1 }, active: true })
    ]);

    const inSeason = recordRows(book, 'season', 'winStreak', { year: 2024 }).filter((row) => row.franchiseId === 'fB');
    expect(inSeason).toEqual([expect.objectContaining({ value: 2, active: false })]);
  });

  it('awards the top record, scoring titles and last place from completed seasons', () => {
    const career = (key, id) => valueOf(recordRows(book, 'career', key), id);

    expect(career('topRecords', 'fA')).toBe(1);
    expect(career('topRecordFlops', 'fA')).toBe(0);
    // A and B both scored 350.
    expect(career('scoringTitles', 'fA')).toBe(1);
    expect(career('scoringTitles', 'fB')).toBe(1);
    expect(career('lastPlaces', 'fC')).toBe(1);
    expect(career('championships', 'fA')).toBe(1);
    expect(career('finals', 'fB')).toBe(1);
  });

  it('ranks every franchise on a rate, however few games or weeks it has', () => {
    // A: 2-0-1 in 2024 and a loss in 2025 — four games, no minimum to clear.
    expect(recordRows(book, 'career', 'winPct')).toHaveLength(4);
    expect(valueOf(recordRows(book, 'career', 'winPct'), 'fA')).toBeCloseTo(62.5, 4);

    // Two settled weeks of lineups are enough for B: 210 of a possible 237.
    const efficiency = recordRows(book, 'season', 'lineupEfficiency');
    expect(efficiency).toHaveLength(2);
    expect(valueOf(efficiency, 'fB')).toBeCloseTo((210 / 237) * 100, 4);
  });

  it('reads lineups for avoidable losses and short-handed wins', () => {
    // B lost week 1 100-120, but its best lineup would have scored 125.
    expect(valueOf(recordRows(book, 'season', 'avoidableLosses'), 'fB')).toBe(1);
    // B beat D in week 2 with eight starters scoring.
    expect(valueOf(recordRows(book, 'season', 'shortHandedWins'), 'fB')).toBe(1);
    expect(valueOf(recordRows(book, 'season', 'benchPoints'), 'fB')).toBe(27);
    // No lineup data for C: no row, not a zero.
    expect(valueOf(recordRows(book, 'season', 'benchPoints'), 'fC')).toBeUndefined();
  });

  it('counts trade partners as unordered pairs, and keeps only real bids', () => {
    const partners = recordRows(book, 'career', 'tradePartners');

    expect(partners).toEqual(expect.arrayContaining([
      { franchiseId: 'fA', partnerFranchiseId: 'fB', value: 2 },
      { franchiseId: 'fA', partnerFranchiseId: 'fC', value: 1 }
    ]));
    expect(recordRows(book, 'season', 'faabBids').map((row) => row.playerName)).toEqual(['Waiver Guy']);
    expect(valueOf(recordRows(book, 'season', 'rosterMoves'), 'fA')).toBe(9);
  });

  it('lists the seasons that have games, newest first', () => {
    expect(book.years).toEqual([{ year: 2025, isCompleted: false }, { year: 2024, isCompleted: true }]);
  });
});
