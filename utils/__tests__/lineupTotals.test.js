/**
 * A team's total, and whether it is still a projection.
 *
 * The load-bearing case is the mixed one — some starters played Thursday, the
 * rest play Sunday. That total is *not* a result, and saying otherwise is an
 * error the reader cannot detect: 118.4 looks the same either way.
 */

import { describe, it, expect } from 'vitest';

import {
  isScoringStarter,
  lineupTotal,
  starterTotal,
  totalAsPoints
} from '../lineupTotals.js';

const starter = (over = {}) => ({
  started: true,
  rosterSlot: 'QB',
  actualPoints: null,
  projectedPoints: null,
  ...over
});

describe('isScoringStarter', () => {
  it('counts a started player', () => {
    expect(isScoringStarter(starter())).toBe(true);
  });

  it('excludes bench and IR, however they are marked', () => {
    expect(isScoringStarter(starter({ started: false }))).toBe(false);
    expect(isScoringStarter(starter({ rosterSlot: 'BE' }))).toBe(false);
    expect(isScoringStarter(starter({ rosterSlot: 'IR' }))).toBe(false);
    // A row that says `started` but sits on the bench is contradictory; the
    // slot wins, because the slot is what does not score.
    expect(isScoringStarter(starter({ started: true, rosterSlot: 'BE' }))).toBe(false);
  });
});

describe('lineupTotal', () => {
  it('is null, not zero, when nothing is known', () => {
    // Every season before 2026. A zero here would say the team scored nothing.
    expect(lineupTotal([])).toEqual({ total: null, isProjected: false });
    expect(lineupTotal([starter(), starter()])).toEqual({ total: null, isProjected: false });
  });

  it('sums projections and says so', () => {
    expect(
      lineupTotal([starter({ projectedPoints: 21.4 }), starter({ projectedPoints: 11.1 })])
    ).toEqual({ total: 32.5, isProjected: true });
  });

  it('sums actuals and does not call them a projection', () => {
    expect(
      lineupTotal([starter({ actualPoints: 18.2 }), starter({ actualPoints: 4 })])
    ).toEqual({ total: 22.2, isProjected: false });
  });

  it('stays a projection while any starter is unsettled', () => {
    // Thursday is played, Sunday is not. The total is not a result yet.
    const mixed = lineupTotal([
      starter({ actualPoints: 18.2, projectedPoints: 11 }),
      starter({ projectedPoints: 14.3 })
    ]);

    expect(mixed.isProjected).toBe(true);
    // The actual wins over its own stale projection within the sum.
    expect(mixed.total).toBeCloseTo(32.5, 5);
  });

  it('counts an actual of zero as settled', () => {
    // A starter who was inactive scored nothing — a result, not a gap.
    expect(lineupTotal([starter({ actualPoints: 0 })])).toEqual({
      total: 0,
      isProjected: false
    });
  });

  it('skips a starter with no figure rather than counting them as zero', () => {
    const total = lineupTotal([starter({ projectedPoints: 21.4 }), starter()]);

    // The per-row dash beside the unknown player is what shows the gap; the
    // total reports what it actually knows.
    expect(total).toEqual({ total: 21.4, isProjected: true });
  });
});

describe('starterTotal', () => {
  it('ignores the bench', () => {
    expect(
      starterTotal([
        starter({ projectedPoints: 21.4 }),
        starter({ rosterSlot: 'BE', started: false, projectedPoints: 99 }),
        starter({ rosterSlot: 'IR', started: false, projectedPoints: 99 })
      ])
    ).toEqual({ total: 21.4, isProjected: true });
  });
});

describe('totalAsPoints', () => {
  it('sends a settled total to the unlabelled slot', () => {
    expect(totalAsPoints({ total: 22.2, isProjected: false })).toEqual({
      actualPoints: 22.2,
      projectedPoints: null
    });
  });

  it('sends an unsettled total to the labelled slot', () => {
    expect(totalAsPoints({ total: 32.5, isProjected: true })).toEqual({
      actualPoints: null,
      projectedPoints: 32.5
    });
  });

  it('sends nothing at all when there is no total', () => {
    const nothing = { actualPoints: null, projectedPoints: null };

    expect(totalAsPoints(null)).toEqual(nothing);
    expect(totalAsPoints({ total: null, isProjected: false })).toEqual(nothing);
  });

  it('keeps a settled zero out of the projected slot', () => {
    expect(totalAsPoints({ total: 0, isProjected: false })).toEqual({
      actualPoints: 0,
      projectedPoints: null
    });
  });
});
