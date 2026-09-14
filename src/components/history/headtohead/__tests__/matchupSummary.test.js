/**
 * Two franchises' meetings, worked by hand. Franchise 1 is always `team1`.
 *
 *   2023 wk3   regular      120 – 100   franchise 1 by 20
 *   2023 wk10  regular      110 – 111   franchise 2 by 1
 *   2024 wk2   regular      130 –  90   franchise 1 by 40
 *   2024 wk16  playoffs     140 – 135   franchise 1 by 5
 *   2025 wk5   regular      100 – 100   tie
 */

import { describe, it, expect } from 'vitest';

import { phaseOf, summarizeMatchup } from '../matchupSummary';

const meeting = (year, week, team1Score, team2Score, phase = 'regular') => ({
  id: `${year}-${week}`,
  year,
  week,
  team1Score,
  team2Score,
  isRegular: phase === 'regular',
  isPlayoff: phase === 'playoff',
  isConsolation: phase === 'consolation'
});

const GAMES = [
  meeting(2023, 3, 120, 100),
  meeting(2023, 10, 110, 111),
  meeting(2024, 2, 130, 90),
  meeting(2024, 16, 140, 135, 'playoff'),
  meeting(2025, 5, 100, 100)
];

describe('summarizeMatchup', () => {
  const summary = summarizeMatchup(GAMES);
  const [first, second] = summary.sides;

  it('keeps the regular season, the playoffs and the overall record apart', () => {
    expect(first).toMatchObject({ wins: 3, losses: 1, ties: 1 });
    expect(first.byPhase.regular).toEqual({ wins: 2, losses: 1, ties: 1 });
    expect(first.byPhase.playoff).toEqual({ wins: 1, losses: 0, ties: 0 });
    expect(second.byPhase.playoff).toEqual({ wins: 0, losses: 1, ties: 0 });
    expect(summary.phases).toEqual({ regular: 4, playoff: 1, consolation: 0 });
  });

  it('counts a tie as half a win', () => {
    expect(first.winPct).toBeCloseTo(70, 5);
    expect(second.winPct).toBeCloseTo(30, 5);
  });

  it('finds the notable games, and never calls a tie the closest one', () => {
    expect(summary.closest.value).toBe(1);
    expect(summary.closest.game.id).toBe('2023-10');
    expect(summary.highestCombined).toMatchObject({ value: 275 });
    expect(first.biggestWin).toMatchObject({ value: 40 });
    expect(second.biggestWin).toMatchObject({ value: 1 });
    expect(first.highScore.value).toBe(140);
  });

  it('measures the longest run of wins, and lets a tie end the current one', () => {
    expect(first.longestStreak.length).toBe(2);
    expect(first.longestStreak.start.id).toBe('2024-2');
    expect(summary.currentStreak).toBeNull();
  });

  it('reports who has won the most recent meetings in a row', () => {
    const later = summarizeMatchup([...GAMES, meeting(2025, 12, 90, 95), meeting(2026, 1, 101, 120)]);
    expect(later.currentStreak).toEqual({ side: 1, length: 2 });
  });

  it('lists the last five meetings newest first', () => {
    expect(summary.recent.map((game) => game.id)).toEqual(['2025-5', '2024-16', '2024-2', '2023-10', '2023-3']);
  });

  it('has nothing to say about two franchises that never met', () => {
    expect(summarizeMatchup([])).toBeNull();
  });

  it('reads consolation as its own phase', () => {
    expect(phaseOf(meeting(2021, 16, 1, 0, 'consolation'))).toBe('consolation');
  });
});
