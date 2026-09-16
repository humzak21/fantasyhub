/**
 * The record trend, against a three-franchise league small enough to redo by
 * hand.
 *
 * 2024 (completed):
 *   wk1  A 120 – B 100
 *   wk2  A  90 – C 110
 *   wk3  A 100 – B 100   (tie)
 * 2025 (in progress):
 *   wk1  B 130 – A  90
 *   wk2  C  80 – A 105
 */

import { describe, it, expect } from 'vitest';

import { buildRecordTrends, buildTrendChart, yearsPlayed } from '../recordTrend.js';

const S24 = { id: 's24', year: 2024, isCompleted: true };
const S25 = { id: 's25', year: 2025, isCompleted: false };

const team = (season, key) => ({ id: `${season.id}-${key}`, seasonId: season.id, franchiseId: `f${key}` });

let gameId = 0;
const game = (season, week, [k1, s1], [k2, s2]) => ({
  id: `g${(gameId += 1)}`,
  seasonId: season.id,
  week,
  team1Id: `${season.id}-${k1}`,
  team2Id: `${season.id}-${k2}`,
  team1Score: s1,
  team2Score: s2
});

const source = () => ({
  // Out of year order on purpose: `years` must still run oldest first.
  seasons: [S25, S24],
  teams: [S24, S25].flatMap((season) => ['A', 'B', 'C'].map((key) => team(season, key))),
  // Weeks out of order on purpose: the running record must still follow the calendar.
  games: [
    game(S24, 3, ['A', 100], ['B', 100]),
    game(S24, 1, ['A', 120], ['B', 100]),
    game(S24, 2, ['A', 90], ['C', 110]),
    game(S25, 2, ['C', 80], ['A', 105]),
    game(S25, 1, ['B', 130], ['A', 90])
  ]
});

describe('buildRecordTrends', () => {
  it('accumulates a season week by week, whatever order the games arrive in', () => {
    const { byFranchise } = buildRecordTrends(source());

    expect(byFranchise.fA[2024]).toEqual([
      { week: 1, wins: 1, losses: 0, ties: 0, net: 1, result: 'W', pf: 120, pa: 100 },
      { week: 2, wins: 1, losses: 1, ties: 0, net: 0, result: 'L', pf: 90, pa: 110 },
      { week: 3, wins: 1, losses: 1, ties: 1, net: 0, result: 'T', pf: 100, pa: 100 }
    ]);
  });

  it('starts every season from 0–0', () => {
    const { byFranchise } = buildRecordTrends(source());

    expect(byFranchise.fA[2025].map((point) => point.net)).toEqual([-1, 0]);
    expect(byFranchise.fB[2025]).toEqual([
      { week: 1, wins: 1, losses: 0, ties: 0, net: 1, result: 'W', pf: 130, pa: 90 }
    ]);
  });

  it('lists every season oldest first, with whether it is finished', () => {
    expect(buildRecordTrends(source()).years).toEqual([
      { year: 2024, isCompleted: true },
      { year: 2025, isCompleted: false }
    ]);
  });

  it('skips a game whose team it cannot place in that season', () => {
    const input = source();
    input.games.push({ ...game(S25, 3, ['A', 100], ['B', 90]), team2Id: 's24-B' }, game(S25, 4, ['A', 100], ['Z', 90]));

    const { byFranchise } = buildRecordTrends(input);

    // A's side of both still counts; B's cross-season side and Z's do not exist.
    expect(byFranchise.fA[2025].map((point) => point.week)).toEqual([1, 2, 3, 4]);
    expect(byFranchise.fB[2025].map((point) => point.week)).toEqual([1]);
    expect(byFranchise.fZ).toBeUndefined();
  });

  it('is empty, not a crash, before the source arrives', () => {
    expect(buildRecordTrends(undefined)).toEqual({ years: [], byFranchise: {} });
  });
});

describe('yearsPlayed', () => {
  it('is the union across the picked franchises, newest first', () => {
    const trends = buildRecordTrends(source());
    const input = source();
    input.games = input.games.filter((g) => g.seasonId === 's24' && g.team2Id === 's24-C');
    const onlyC24 = buildRecordTrends(input);

    expect(yearsPlayed(trends, ['fA'])).toEqual([2025, 2024]);
    expect(yearsPlayed(onlyC24, ['fC'])).toEqual([2024]);
    expect(yearsPlayed(trends, [])).toEqual([]);
  });
});

describe('buildTrendChart', () => {
  it('draws every picked team in every picked season it played, newest season first', () => {
    const trends = buildRecordTrends(source());

    const { series } = buildTrendChart(trends, ['fA', 'fB'], [2024, 2025]);

    expect(series.map((line) => line.key)).toEqual(['fA:2025', 'fA:2024', 'fB:2025', 'fB:2024']);
    expect(series[0]).toMatchObject({ year: 2025, isCompleted: false, final: { wins: 1, losses: 1 } });
  });

  it('leaves out a team-season that was never played', () => {
    const input = source();
    input.games = input.games.filter((g) => g.seasonId === 's24');
    const trends = buildRecordTrends(input);

    expect(buildTrendChart(trends, ['fC'], [2024, 2025]).series.map((line) => line.key)).toEqual(['fC:2024']);
  });

  it('puts each line on its week, and absent where it has no game', () => {
    const trends = buildRecordTrends(source());

    const { rows } = buildTrendChart(trends, ['fA', 'fC'], [2024]);

    expect(rows).toEqual([
      { week: 1, 'fA:2024': 1 },
      { week: 2, 'fA:2024': 0, 'fC:2024': 1 },
      { week: 3, 'fA:2024': 0 }
    ]);
  });

  it('always keeps .500 on the axis', () => {
    const trends = buildRecordTrends(source());

    expect(buildTrendChart(trends, ['fB'], [2025]).yDomain).toEqual([-1, 1]);
    expect(buildTrendChart(trends, [], []).yDomain).toEqual([-1, 1]);
  });
});
