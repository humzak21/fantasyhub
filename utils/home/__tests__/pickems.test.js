import { describe, it, expect } from 'vitest';
import { pickemCounters, viewerWeekResult } from '../pickems.js';

const picksBy = (...users) => users.flatMap((u) => [{ userId: u, gameId: 'g1' }, { userId: u, gameId: 'g2' }]);

describe('pickemCounters', () => {
  it('reads "9 of 14" once the member count is in', () => {
    const counters = pickemCounters({
      allPicks: picksBy('a', 'b', 'c'),
      parlayPicks: [{ userId: 'a' }, { userId: 'b' }],
      memberCount: 14
    });
    expect(counters).toMatchObject({ picked: 3, parlays: 2, of: 14 });
    expect(counters.text).toBe('3 of 14 picked · 2 of 14 parlays in');
  });

  it('reads "9 picked" before it, never "of —"', () => {
    expect(pickemCounters({ allPicks: picksBy('a'), parlayPicks: [{ userId: 'a' }] }).text).toBe(
      '1 picked · 1 parlay in'
    );
    expect(pickemCounters({ allPicks: [], parlayPicks: [], memberCount: 0 }).text).toBe(
      '0 picked · 0 parlays in'
    );
  });

  it('counts members, not rows', () => {
    expect(pickemCounters({ allPicks: picksBy('a', 'a') }).picked).toBe(1);
  });
});

describe('viewerWeekResult', () => {
  const scores = [
    { userId: 'a', totalPoints: 6, correctPicks: 6, decidedPicks: 7 },
    { userId: 'b', totalPoints: 6, correctPicks: 6, decidedPicks: 7 },
    { userId: 'c', totalPoints: 4, correctPicks: 4, decidedPicks: 7 }
  ];

  it('places the viewer by competition ranking, and says when it is shared', () => {
    expect(viewerWeekResult(scores, 'b').mine).toEqual({ correct: 6, decided: 7, place: 1, tied: true });
    expect(viewerWeekResult(scores, 'c').mine).toEqual({ correct: 4, decided: 7, place: 3, tied: false });
  });

  it('names every member on the top score as a winner', () => {
    expect(viewerWeekResult(scores, 'c').winners.map((w) => w.userId)).toEqual(['a', 'b']);
  });

  it('has no row for a viewer who did not enter', () => {
    expect(viewerWeekResult(scores, 'z')).toMatchObject({ mine: null, entrants: 3 });
  });
});
