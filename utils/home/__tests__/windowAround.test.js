import { describe, it, expect } from 'vitest';
import { windowAround } from '../windowAround.js';

const league = (n) => Array.from({ length: n }, (_, i) => `team-${i + 1}`);
const ranks = (slice) => slice.map((entry) => entry.rank);

describe('windowAround', () => {
  it('centres the viewer with two above and two below', () => {
    expect(ranks(windowAround(league(14), 6))).toEqual([5, 6, 7, 8, 9]);
  });

  it('clamps at the top: rank 1 shows rows 1-5', () => {
    expect(ranks(windowAround(league(14), 0))).toEqual([1, 2, 3, 4, 5]);
    expect(ranks(windowAround(league(14), 1))).toEqual([1, 2, 3, 4, 5]);
  });

  it('clamps at the bottom: rank 14 shows rows 10-14', () => {
    expect(ranks(windowAround(league(14), 13))).toEqual([10, 11, 12, 13, 14]);
    expect(ranks(windowAround(league(14), 12))).toEqual([10, 11, 12, 13, 14]);
  });

  it('shows the top five when there is no viewer', () => {
    expect(ranks(windowAround(league(14), -1))).toEqual([1, 2, 3, 4, 5]);
  });

  it('shows everything in a league shorter than the window', () => {
    expect(ranks(windowAround(league(4), 3))).toEqual([1, 2, 3, 4]);
    expect(windowAround([], 0)).toEqual([]);
  });

  it('carries the row with its rank', () => {
    expect(windowAround(league(14), 6)[2]).toEqual({ row: 'team-7', rank: 7 });
  });
});
