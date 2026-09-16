/**
 * The stat comparison, against the record book's hand-built league.
 *
 * 2024 (completed, three-week regular season):
 *   wk1  A 120 – B 100      C  90 – D  95
 *   wk2  A 130 – C  80      B 110 – D 108
 *   wk3  A 100 – D 100      B 140 – C  70
 *   wk4  A 110 – B 105 (championship)   C 150 – D 60 (consolation)
 * 2025 (in progress):
 *   wk1  A  90 – B 130      C 100 – D  99
 *
 * The first block holds every stat that also exists in the record book to the
 * record book's figure — one definition, two surfaces.
 */

import { describe, it, expect } from 'vitest';

import { buildRecordBook } from '../recordBook/index.js';
import {
  STATS,
  buildComparisonFacts,
  getStat,
  rankedValues,
  resolveView,
  scatterPoints,
  seasonSeries,
  statValue,
  weeklySeries,
  yearsPlayedBy
} from '../statComparison/index.js';

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
  trades: [],
  bids: [],
  lineups: [
    { seasonId: 's24', week: 1, teamId: 's24-A', starterPoints: 120, optimalPoints: 120, startersScoring: 9 },
    { seasonId: 's24', week: 1, teamId: 's24-B', starterPoints: 100, optimalPoints: 125, startersScoring: 9 },
    { seasonId: 's24', week: 2, teamId: 's24-B', starterPoints: 110, optimalPoints: 112, startersScoring: 8 }
  ]
};

const book = buildRecordBook(SOURCE);
const facts = buildComparisonFacts(SOURCE);
const ALL = [2024, 2025];
const value = (id, franchiseId, years = ALL, options) => statValue(facts, getStat(id), franchiseId, years, options).value;

describe('one definition: the record book agrees', () => {
  const statIds = new Set(STATS.map((stat) => stat.id));

  it('every team-season figure the record book has', () => {
    let compared = 0;
    for (const [key, rows] of Object.entries(book.season)) {
      if (!statIds.has(key)) continue;
      for (const row of rows) {
        expect([key, row.franchiseId, value(key, row.franchiseId, [row.year])]).toEqual([
          key, row.franchiseId, expect.closeTo(row.value, 3)
        ]);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(60);
  });

  it('every career figure the record book has', () => {
    let compared = 0;
    for (const [key, rows] of Object.entries(book.career)) {
      if (!statIds.has(key)) continue;
      for (const row of rows) {
        expect([key, row.franchiseId, value(key, row.franchiseId)]).toEqual([
          key, row.franchiseId, expect.closeTo(row.value, 3)
        ]);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(60);
  });
});

describe('statValue', () => {
  it('combines seasons from their components, not by averaging the seasons', () => {
    // A: 2-0-1 in 2024 (83.3%), 0-1 in 2025 (0%). Averaged: 41.7%. Combined: 2.5 / 4.
    expect(value('winPct', 'fA')).toBeCloseTo(62.5, 5);
    // B: starters 100 + 110 of a possible 125 + 112 in 2024; 2025 has no lineups.
    expect(value('lineupEfficiency', 'fB')).toBeCloseTo((210 / 237) * 100, 5);
  });

  it('keeps max and min as max and min across seasons', () => {
    expect(value('bestWeek', 'fB')).toBe(140);
    expect(value('worstWeek', 'fA')).toBe(90);
  });

  it('has no value where there is no data, rather than zero', () => {
    expect(value('lineupEfficiency', 'fC')).toBeNull();
    expect(value('trades', 'fC')).toBeNull();
    expect(value('avgWinMargin', 'fC', [2024])).toBeNull(); // C never won in 2024
  });

  it('counts placements from completed seasons only', () => {
    expect(statValue(facts, getStat('championships'), 'fA', ALL)).toEqual({ value: 1, seasons: 1, games: 3 });
    expect(value('championships', 'fA', [2025])).toBeNull();
    // The regular-season finish is where a season in progress stands today.
    expect(value('standing', 'fB', [2025])).toBe(1);
  });

  it('averages a count per contributing season on request, and leaves rates alone', () => {
    expect(value('wins', 'fB', ALL)).toBe(3);
    expect(value('wins', 'fB', ALL, { perSeason: true })).toBe(1.5);
    expect(value('winPct', 'fB', ALL, { perSeason: true })).toBe(value('winPct', 'fB', ALL));
  });

  it('counts the sample behind a figure', () => {
    expect(statValue(facts, getStat('ppg'), 'fA', ALL)).toMatchObject({ seasons: 2, games: 4 });
  });

  it('gives every stat a figure or null on the whole league without throwing', () => {
    for (const stat of STATS) {
      for (const franchiseId of facts.franchiseIds) {
        const { value: v } = statValue(facts, stat, franchiseId, ALL);
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('rankedValues', () => {
  it('ranks in the better direction and lists the franchises with no figure apart', () => {
    const losses = rankedValues(facts, getStat('losses'), ['fA', 'fB', 'fC', 'fD'], [2024]);
    expect(losses.rows.map((row) => row.franchiseId)).toEqual(['fA', 'fB', 'fD', 'fC']);
    expect(losses.rows.map((row) => row.rank)).toEqual([1, 2, 2, 4]);

    const efficiency = rankedValues(facts, getStat('lineupEfficiency'), ['fA', 'fB', 'fC'], [2024]);
    expect(efficiency.missing).toEqual(['fC']);
  });
});

describe('weeklySeries', () => {
  it('runs a running stat to the season figure', () => {
    const { series, rows } = weeklySeries(facts, getStat('winPct'), ['fA'], 2024);
    expect(series[0].points.map((point) => point.week)).toEqual([1, 2, 3]);
    expect(series[0].points.at(-1).value).toBeCloseTo(value('winPct', 'fA', [2024]), 5);
    expect(rows.map((row) => row.fA)).toEqual([100, 100, expect.closeTo(83.333, 2)]);
  });

  it('draws a per-week stat as that week alone', () => {
    const { series } = weeklySeries(facts, getStat('pointsFor'), ['fB'], 2024);
    expect(series[0].points.map((point) => point.value)).toEqual([100, 110, 140]);
  });

  it('skips weeks a lineup stat has nothing for', () => {
    const { series } = weeklySeries(facts, getStat('benchPoints'), ['fA', 'fB', 'fC'], 2024);
    expect(series.map((line) => [line.franchiseId, line.points.map((p) => p.week)])).toEqual([
      ['fA', [1]],
      ['fB', [1, 2]]
    ]);
  });

  it('has nothing for a season-only stat', () => {
    expect(weeklySeries(facts, getStat('trades'), ['fA'], 2024).series).toEqual([]);
  });
});

describe('seasonSeries', () => {
  it('leaves a gap for a season with no figure', () => {
    const { rows, series } = seasonSeries(facts, getStat('trades'), ['fA'], ALL);
    expect(rows).toEqual([{ year: 2024, fA: 3 }, { year: 2025 }]);
    expect(series[0].points).toEqual([{ year: 2024, value: 3 }]);
  });
});

describe('scatterPoints', () => {
  it('plots a franchise once over the selection, or once per season', () => {
    const total = scatterPoints(facts, getStat('ppg'), getStat('wins'), ['fA', 'fB'], ALL);
    expect(total.points).toEqual([
      { franchiseId: 'fA', year: null, x: 110, y: 2 },
      { franchiseId: 'fB', year: null, x: 120, y: 3 }
    ]);
    expect(total.average).toEqual({ x: 115, y: 2.5 });

    const bySeason = scatterPoints(facts, getStat('ppg'), getStat('wins'), ['fA'], ALL, { mode: 'season' });
    expect(bySeason.points.map((point) => point.year)).toEqual([2024, 2025]);
  });

  it('needs both figures for a point', () => {
    const { points } = scatterPoints(facts, getStat('ppg'), getStat('trades'), ['fA', 'fC'], [2024]);
    expect(points.map((point) => point.franchiseId)).toEqual(['fA']);
  });
});

describe('yearsPlayedBy', () => {
  it('lists the seasons any of the franchises played, oldest first', () => {
    expect(yearsPlayedBy(facts, ['fA'])).toEqual([2024, 2025]);
    expect(facts.years).toEqual([{ year: 2024, isCompleted: true }, { year: 2025, isCompleted: false }]);
  });
});

describe('resolveView', () => {
  const winPct = getStat('winPct');
  const trades = getStat('trades');
  const wins = getStat('wins');
  const ids = (resolved) => resolved.options.map((option) => option.id);

  it('one season, a weekly stat: week by week first, then the season total', () => {
    const resolved = resolveView({ stat: winPct, yearCount: 1, allSeasons: false });
    expect([resolved.chart, ids(resolved)]).toEqual(['line-week', ['week', 'total']]);
    expect(resolveView({ stat: winPct, yearCount: 1, allSeasons: false, requested: 'total' }).chart).toBe('bar');
  });

  it('one season, a season-only stat: the season total only', () => {
    const resolved = resolveView({ stat: trades, yearCount: 1, allSeasons: false, requested: 'week' });
    expect([resolved.chart, ids(resolved), resolved.options[0].label]).toEqual(['bar', ['total'], 'Season total']);
  });

  it('some seasons: season by season first', () => {
    const resolved = resolveView({ stat: winPct, yearCount: 3, allSeasons: false });
    expect([resolved.chart, ids(resolved)]).toEqual(['line-season', ['season', 'total']]);
    expect(resolved.options[1].label).toBe('Combined');
  });

  it('all seasons: the all-time total first', () => {
    const resolved = resolveView({ stat: winPct, yearCount: 6, allSeasons: true });
    expect([resolved.chart, ids(resolved), resolved.options[0].label]).toEqual(['bar', ['total', 'season'], 'All-time']);
  });

  it('a second stat makes a scatter, never week by week', () => {
    expect(resolveView({ stat: winPct, statY: wins, yearCount: 1, allSeasons: false, requested: 'week' }))
      .toMatchObject({ chart: 'scatter', view: 'total' });
    expect(resolveView({ stat: winPct, statY: wins, yearCount: 4, allSeasons: false }))
      .toMatchObject({ chart: 'scatter', view: 'season' });
  });

  it('offers a per-season average for a count over several seasons only', () => {
    expect(resolveView({ stat: wins, yearCount: 6, allSeasons: true }).perSeasonToggle).toBe(true);
    expect(resolveView({ stat: winPct, yearCount: 6, allSeasons: true }).perSeasonToggle).toBe(false);
    expect(resolveView({ stat: wins, yearCount: 1, allSeasons: false, requested: 'total' }).perSeasonToggle).toBe(false);
    expect(resolveView({ stat: wins, yearCount: 6, allSeasons: true, requested: 'season' }).perSeasonToggle).toBe(false);
  });
});
