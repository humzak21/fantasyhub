import { describe, it, expect } from 'vitest';
import { buildLightSeasonIndex, recentForm } from '../recentForm.js';

const SEASON = { year: 2026, regularSeasonWeeks: 14, totalWeeks: 17 };
// Database shape, as `getTeamsForSeason` returns them.
const TEAMS = ['a', 'b', 'c', 'd'].map((k) => ({ id: `t-${k}`, franchise_id: `f-${k}`, name: `Team ${k}` }));
const game = (week, a, sa, b, sb, type = 'regular') => ({
  id: `${week}-${a}${b}`,
  week,
  type,
  team1Id: `t-${a}`,
  team2Id: b ? `t-${b}` : null,
  team1Score: sa,
  team2Score: sb
});

const GAMES = [
  game(1, 'a', 100, 'b', 90), game(1, 'c', 80, 'd', 120),
  game(2, 'a', 110, 'c', 120), game(2, 'b', 100, 'd', 95),
  // A bye for a in week 3.
  game(3, 'a', null, null, null, 'bye'), game(3, 'b', 105, 'c', 99),
  game(4, 'a', 130, 'd', 100), game(4, 'b', 90, 'c', 91),
  // Next week, unscored.
  game(5, 'a', null, 'b', null)
];

const RANKS = [
  { weekNumber: 2, teamId: 't-a', rank: 3, snapshotType: 'weekly' },
  { weekNumber: 4, teamId: 't-a', rank: 1, snapshotType: 'weekly' }
];

const index = buildLightSeasonIndex(SEASON, TEAMS, GAMES, RANKS);

describe('recentForm', () => {
  it('is the last three scored games, newest last, skipping a bye', () => {
    const form = recentForm(index, 'f-a', 5);
    expect(form.rows.map((row) => row.week)).toEqual([1, 2, 4]);
    expect(form.rows.map((row) => row.result)).toEqual(['W', 'L', 'W']);
    expect(form.rows[2]).toMatchObject({ pointsFor: 130, pointsAgainst: 100, margin: 30, opponentId: 't-d' });
  });

  it('carries the league average for each week', () => {
    const form = recentForm(index, 'f-a', 5);
    expect(form.rows[0].leagueAverage).toBeCloseTo((100 + 90 + 80 + 120) / 4);
  });

  it('is one row in week 2', () => {
    expect(recentForm(index, 'f-a', 1).rows).toHaveLength(1);
  });

  it('moves standing by record and power rank across the window', () => {
    const form = recentForm(index, 'f-a', 5);
    expect(form.standing.from).not.toBeNull();
    expect(form.powerRank).toEqual({ from: 3, to: 1 });
  });

  it('has no power movement without snapshots', () => {
    const plain = buildLightSeasonIndex(SEASON, TEAMS, GAMES, []);
    expect(recentForm(plain, 'f-a', 5).powerRank).toEqual({ from: null, to: null });
  });

  it('is null with no team, no week, or nothing played', () => {
    expect(recentForm(index, 'f-nobody', 5)).toBeNull();
    expect(recentForm(index, 'f-a', null)).toBeNull();
    const fresh = buildLightSeasonIndex(SEASON, TEAMS, [game(1, 'a', null, 'b', null)], []);
    expect(recentForm(fresh, 'f-a', 1)).toBeNull();
  });
});
