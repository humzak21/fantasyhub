import { describe, it, expect } from 'vitest';
import { weekWinners } from '../weekWinners.js';

const score = (userId, totalPoints, weeklyRank) => ({ userId, totalPoints, weeklyRank });

describe('weekWinners', () => {
  it('names the single top score', () => {
    expect(weekWinners([score('a', 6, 1), score('b', 5, 2)]).map((s) => s.userId)).toEqual(['a']);
  });

  it('names everyone on the top score, whatever rank the sort gave them', () => {
    const scores = [score('a', 6, 1), score('b', 6, 2), score('c', 6, 3), score('d', 4, 4)];
    expect(weekWinners(scores).map((s) => s.userId)).toEqual(['a', 'b', 'c']);
  });

  it('has no winner when nobody scored', () => {
    expect(weekWinners([score('a', 0, 1), score('b', 0, 2)])).toEqual([]);
  });

  it('has no winner without scores', () => {
    expect(weekWinners([])).toEqual([]);
    expect(weekWinners(undefined)).toEqual([]);
  });
});
