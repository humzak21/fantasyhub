/**
 * A team's total, and whether it is still a projection.
 *
 * The load-bearing case is the mixed one — some starters played Thursday, the
 * rest play Sunday. That total is *not* a result, and saying otherwise is an
 * error the reader cannot detect: 118.4 looks the same either way.
 */

import { describe, it, expect } from 'vitest';

import {
  currentPoints,
  isScoringStarter,
  lineupTotal,
  matchupLiveState,
  rowAsPoints,
  starterTotal,
  totalAsPoints
} from '../lineupTotals.js';
import { GAME_STATE } from '../../services/espnLiveScoreMapper.js';

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

describe('a lineup under way', () => {
  const live = (nflState, overrides) => ({
    started: true,
    rosterSlot: 'RB',
    actualPoints: null,
    projectedPoints: 10,
    nflState,
    ...overrides
  });

  it('reads as it always did until the overlay has touched it', () => {
    expect(lineupTotal([starter({ actualPoints: 12 })])).toEqual({ total: 12, isProjected: false });
  });

  it('keeps the score so far apart from the projected sum', () => {
    const total = lineupTotal([
      live(GAME_STATE.FINAL, { actualPoints: 20 }),
      live(GAME_STATE.IN_PROGRESS, { actualPoints: 3.5 }),
      live(GAME_STATE.NOT_STARTED)
    ]);

    expect(total).toEqual({
      total: 33.5,
      isProjected: true,
      scored: 23.5,
      yetToPlay: 1,
      liveState: 'playing'
    });
  });

  it('has no live state before anybody has played', () => {
    expect(lineupTotal([live(GAME_STATE.NOT_STARTED)]).liveState).toBeNull();
  });

  it('is between games with points on the board, nobody on and more to come', () => {
    expect(
      lineupTotal([live(GAME_STATE.FINAL, { actualPoints: 12 }), live(GAME_STATE.NOT_STARTED)]).liveState
    ).toBe('between');
  });

  it('is done once every game is over', () => {
    expect(lineupTotal([live(GAME_STATE.FINAL, { actualPoints: 12 })]).liveState).toBe('done');
  });

  it('counts a starter with no figure as yet to play', () => {
    const rows = [
      live(GAME_STATE.FINAL, { actualPoints: 12 }),
      live(GAME_STATE.NOT_STARTED, { projectedPoints: null })
    ];
    expect(lineupTotal(rows).yetToPlay).toBe(1);
  });

  it('shows the score so far, and says it is not a result', () => {
    const total = { total: 33.5, isProjected: true, scored: 23.5, yetToPlay: 1, liveState: 'playing' };

    expect(totalAsPoints(total)).toEqual({ actualPoints: 23.5, projectedPoints: null, live: 'playing' });
    expect(totalAsPoints(total, 24.1).actualPoints).toBe(24.1);
    expect(totalAsPoints({ ...total, liveState: 'between' }).live).toBe('between');
  });

  it('shows a finished lineup as a bare figure', () => {
    const total = { total: 12, isProjected: false, scored: 12, yetToPlay: 0, liveState: 'done' };
    expect(totalAsPoints(total)).toEqual({ actualPoints: 12, projectedPoints: null });
  });

  it('stands on the score so far once there is one, the projection before', () => {
    expect(currentPoints({ total: 33.5, scored: 23.5, liveState: 'playing' })).toBe(23.5);
    expect(currentPoints({ total: 33.5, scored: 23.5, liveState: 'playing' }, 24.1)).toBe(24.1);
    expect(currentPoints({ total: 33.5, isProjected: true })).toBe(33.5);
    expect(currentPoints(null)).toBeNull();
  });

  it('marks only a player who is on the field as live', () => {
    expect(rowAsPoints(live(GAME_STATE.IN_PROGRESS, { actualPoints: 3 })).live).toBe('playing');
    expect(rowAsPoints(live(GAME_STATE.FINAL, { actualPoints: 3 })).live).toBeNull();
    expect(rowAsPoints({ actualPoints: 3 }).live).toBeNull();
  });

  it('calls a matchup by whichever side is furthest along', () => {
    const state = (liveState) => ({ liveState });

    expect(matchupLiveState(state('playing'), state('done'))).toBe('playing');
    expect(matchupLiveState(state('between'), state(null))).toBe('between');
    expect(matchupLiveState(state('done'), state('done'))).toBe('done');
    expect(matchupLiveState(state('done'), state(null))).toBeNull();
    expect(matchupLiveState(undefined, undefined)).toBeNull();
  });
});
