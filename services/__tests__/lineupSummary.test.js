/**
 * A team's week as the lineup records store it.
 *
 * Pinned: a week is summarized only once every starter is a result, the
 * optimal lineup is chosen from the bench too, and the stored optimal can
 * never fall below what was actually started.
 */

import { describe, it, expect } from 'vitest';

import { summarizeTeamWeek } from '../lineupSummary.js';

const starter = (position, actualPoints, rosterSlot = position) => ({
  lineupSlotId: 0,
  rosterSlot,
  started: true,
  position,
  actualPoints,
  projectedPoints: 10
});

const bench = (position, actualPoints) => ({
  lineupSlotId: 20,
  rosterSlot: 'BE',
  started: false,
  position,
  actualPoints,
  projectedPoints: 10
});

/** A full nine-man lineup that is also the best available. */
const FULL_LINEUP = [
  starter('QB', 20),
  starter('RB', 15), starter('RB', 12),
  starter('WR', 14), starter('WR', 11),
  starter('TE', 8),
  starter('RB', 9, 'FLEX'),
  starter('D/ST', 6),
  starter('K', 7)
];

describe('summarizeTeamWeek', () => {
  it('summarizes a settled week whose starters were the best lineup', () => {
    expect(summarizeTeamWeek([...FULL_LINEUP, bench('WR', 2)])).toEqual({
      starterPoints: 102,
      optimalPoints: 102,
      startersScoring: 9
    });
  });

  it('chooses the optimal lineup from the bench as well', () => {
    const summary = summarizeTeamWeek([...FULL_LINEUP, bench('WR', 30)]);

    // The 30-point bench receiver replaces the 9-point flex.
    expect(summary.optimalPoints).toBe(123);
    expect(summary.starterPoints).toBe(102);
  });

  it('counts starters who scored, not starters who played', () => {
    const lineup = FULL_LINEUP.map((row, i) => (i < 2 ? { ...row, actualPoints: 0 } : row));

    expect(summarizeTeamWeek(lineup).startersScoring).toBe(7);
  });

  it('has no summary while any starter is still a projection', () => {
    const lineup = FULL_LINEUP.map((row, i) => (i === 0 ? { ...row, actualPoints: null } : row));

    expect(summarizeTeamWeek(lineup)).toBeNull();
    expect(summarizeTeamWeek([])).toBeNull();
  });

  it('never stores an optimal lineup below the one that was started', () => {
    // A kicker ESPN started in a slot the template cannot fill with him.
    const lineup = [starter('K', 12, 'FLEX'), starter('K', 7)];

    const summary = summarizeTeamWeek(lineup);
    expect(summary.optimalPoints).toBeGreaterThanOrEqual(summary.starterPoints);
  });
});
