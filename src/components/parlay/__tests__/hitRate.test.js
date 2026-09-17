import { describe, it, expect } from 'vitest';
import { parlayHitRate } from '../hitRate.js';

const pick = (scoredTd) => ({ scoredTd });

describe('parlayHitRate', () => {
  it('counts hits against graded picks', () => {
    expect(parlayHitRate([pick(true), pick(false), pick(true), pick(false)])).toEqual({
      hits: 2,
      graded: 4,
      percent: 50
    });
  });

  it('leaves a pending pick out of the denominator, not into the misses', () => {
    // NULL is ungraded, never "no touchdown" — the grader skips every case it
    // is not sure of, so a pending week must not drag the rate down.
    expect(parlayHitRate([pick(true), pick(null), pick(undefined)])).toEqual({
      hits: 1,
      graded: 1,
      percent: 100
    });
  });

  it('is null with nothing graded, rather than 0%', () => {
    expect(parlayHitRate([pick(null), pick(null)])).toBeNull();
    expect(parlayHitRate([])).toBeNull();
    expect(parlayHitRate(undefined)).toBeNull();
  });
});
