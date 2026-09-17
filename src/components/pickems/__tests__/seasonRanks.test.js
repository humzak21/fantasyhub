import { describe, it, expect } from 'vitest';
import { rankSeasonStandings, ordinal } from '../seasonRanks.js';

const row = (userId, totalPoints, overallAccuracyPercentage = 50) => ({
  userId,
  totalPoints,
  overallAccuracyPercentage
});

describe('rankSeasonStandings', () => {
  it('ranks by points, in order', () => {
    const ranked = rankSeasonStandings([row('a', 30), row('b', 20), row('c', 10)]);
    expect(ranked.map((r) => [r.userId, r.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3]
    ]);
  });

  it('gives everyone on the top score first place, not 1 and 2', () => {
    // The incoming rows carry seasonRank 1 and 2 from the data layer, which
    // numbers by array position — the whole reason this function exists.
    const ranked = rankSeasonStandings([row('a', 30, 80), row('b', 30, 60), row('c', 20)]);

    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(ranked.filter((r) => r.isLeader).map((r) => r.userId)).toEqual(['a', 'b']);
    expect(ranked[0].isTied).toBe(true);
    expect(ranked[2].isTied).toBe(false);
  });

  it('skips the places a tie consumed', () => {
    const ranked = rankSeasonStandings([row('a', 30), row('b', 20), row('c', 20), row('d', 10)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it('does not sort on accuracy, which is not a tiebreak for the prize', () => {
    const ranked = rankSeasonStandings([row('a', 30, 40), row('b', 30, 90)]);
    expect(ranked.every((r) => r.rank === 1)).toBe(true);
  });

  it('crowns nobody before a point has been scored', () => {
    const ranked = rankSeasonStandings([row('a', 0), row('b', 0)]);
    expect(ranked.every((r) => r.isLeader)).toBe(false);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1]);
  });

  it('survives an empty or absent list', () => {
    expect(rankSeasonStandings([])).toEqual([]);
    expect(rankSeasonStandings(undefined)).toEqual([]);
  });
});

describe('ordinal', () => {
  it('reads the way a person writes a place', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd'
    ]);
  });
});
