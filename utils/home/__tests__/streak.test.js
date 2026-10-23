import { describe, it, expect } from 'vitest';
import { streakFromGames, streakOf } from '../streak.js';

const g = (week, a, sa, b, sb, type = 'regular') => ({ week, type, team1Id: a, team2Id: b, team1Score: sa, team2Score: sb });

describe('streakFromGames', () => {
  const games = [
    g(1, 'x', 90, 'y', 100),
    g(2, 'x', 110, 'z', 100),
    g(3, 'y', 80, 'x', 120),
    g(4, 'x', null, 'y', null),
    g(5, 'x', null, null, null, 'bye')
  ];

  it('counts back from the newest scored game', () => {
    expect(streakFromGames(games, 'x')).toEqual({ type: 'win', length: 2 });
    expect(streakFromGames(games, 'y')).toEqual({ type: 'loss', length: 1 });
  });

  it('breaks on a tie, which is a streak of its own', () => {
    expect(streakFromGames([g(1, 'x', 100, 'y', 90), g(2, 'x', 95, 'y', 95)], 'x')).toEqual({ type: 'tie', length: 1 });
  });

  it('is none before a game is played', () => {
    expect(streakFromGames([g(1, 'x', null, 'y', null)], 'x')).toEqual({ type: 'none', length: 0 });
  });

  it('prefers a stored streak, and falls back to the games', () => {
    expect(streakOf({ id: 'x', currentStreak: { type: 'loss', length: 4 } }, games)).toEqual({ type: 'loss', length: 4 });
    expect(streakOf({ id: 'x', currentStreak: { type: 'none', length: 0 } }, games)).toEqual({ type: 'win', length: 2 });
  });
});
