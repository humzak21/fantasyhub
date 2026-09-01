/**
 * The board's ordering and the author's window.
 *
 * These are the two things the takes UI gets wrong silently if they drift: a
 * board sorted by posting time reads as a feed rather than a schedule, and an
 * edit window that disagrees with the RLS policy shows the reader a button
 * whose only outcome is an error toast.
 */

import { describe, it, expect } from 'vitest';

import {
  EDIT_WINDOW_MS,
  STATUS_BADGE,
  canDeleteTake,
  canEditTake,
  canFade,
  fadeCount,
  groupByMilestone,
  hasFaded,
  hasWager,
  milestoneLabel,
  milestoneSortKey
} from '../milestones.js';

const USER = { id: 'user-1' };
const OTHER = { id: 'user-2' };

/** 14 regular season weeks + 3 playoff weeks, the shape this league runs. */
const CONFIG = { regularSeasonWeeks: 14, weekCount: 17 };

const take = (overrides = {}) => ({
  id: 'take-1',
  userId: USER.id,
  body: 'Nobody goes 14-0',
  targetType: 'week',
  targetWeek: 3,
  status: 'pending',
  createdAt: '2026-09-01T12:00:00Z',
  takeParticipants: [],
  ...overrides
});

describe('milestoneSortKey', () => {
  it('sorts weeks by their own number', () => {
    expect(milestoneSortKey(take({ targetWeek: 3 }))).toBe(3);
    expect(milestoneSortKey(take({ targetWeek: 14 }))).toBe(14);
  });

  it('puts both terminal milestones beyond any week, in the order they arrive', () => {
    const endOfRegular = milestoneSortKey(take({ targetType: 'end_of_regular_season', targetWeek: null }));
    const endOfSeason = milestoneSortKey(take({ targetType: 'end_of_season', targetWeek: null }));

    expect(endOfRegular).toBeGreaterThan(milestoneSortKey(take({ targetWeek: 17 })));
    expect(endOfSeason).toBeGreaterThan(endOfRegular);
  });
});

describe('milestoneLabel', () => {
  it('names a regular season week', () => {
    expect(milestoneLabel(take({ targetWeek: 3 }), CONFIG)).toBe('Week 3');
  });

  it('names a playoff week the way the rest of the app does', () => {
    // Week 17 of a 14+3 season is the final, and the board must not call it
    // "Week 17" while the week navigator calls it "Championship".
    expect(milestoneLabel(take({ targetWeek: 17 }), CONFIG)).toBe('Championship');
    expect(milestoneLabel(take({ targetWeek: 15 }), CONFIG)).toBe('Playoffs R1');
  });

  it('names the terminal milestones', () => {
    expect(milestoneLabel(take({ targetType: 'end_of_regular_season', targetWeek: null }), CONFIG))
      .toBe('End of regular season');
    expect(milestoneLabel(take({ targetType: 'end_of_season', targetWeek: null }), CONFIG))
      .toBe('End of season');
  });
});

describe('groupByMilestone', () => {
  it('orders sections by when they resolve, not by when they were posted', () => {
    const board = [
      take({ id: 'a', targetType: 'end_of_season', targetWeek: null }),
      take({ id: 'b', targetWeek: 9 }),
      take({ id: 'c', targetType: 'end_of_regular_season', targetWeek: null }),
      take({ id: 'd', targetWeek: 2 })
    ];

    expect(groupByMilestone(board, CONFIG).map((section) => section.label)).toEqual([
      'Week 2',
      'Week 9',
      'End of regular season',
      'End of season'
    ]);
  });

  it('collects every take about the same week into one section', () => {
    const board = [take({ id: 'a', targetWeek: 3 }), take({ id: 'b', targetWeek: 3 })];
    const sections = groupByMilestone(board, CONFIG);

    expect(sections).toHaveLength(1);
    expect(sections[0].takes.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('keeps the order the query returned within a section', () => {
    const board = [take({ id: 'newer', targetWeek: 3 }), take({ id: 'older', targetWeek: 3 })];
    expect(groupByMilestone(board, CONFIG)[0].takes.map((t) => t.id)).toEqual(['newer', 'older']);
  });

  it('has nothing to show for an empty board', () => {
    expect(groupByMilestone([], CONFIG)).toEqual([]);
  });
});

describe('canEditTake', () => {
  const createdAt = '2026-09-01T12:00:00Z';
  const posted = new Date(createdAt).getTime();
  const mine = take({ createdAt });

  it('allows the author inside the window', () => {
    expect(canEditTake(mine, USER, posted + 1000)).toBe(true);
  });

  it('allows it up to the very last millisecond', () => {
    expect(canEditTake(mine, USER, posted + EDIT_WINDOW_MS - 1)).toBe(true);
  });

  it('refuses it the moment the window closes', () => {
    // The boundary itself is closed: the policy reads `now() < created_at +
    // 72 hours`, so equality is already too late.
    expect(canEditTake(mine, USER, posted + EDIT_WINDOW_MS)).toBe(false);
  });

  it('refuses somebody else\'s take inside the window', () => {
    expect(canEditTake(mine, OTHER, posted + 1000)).toBe(false);
  });

  it('refuses a graded take inside the window', () => {
    expect(canEditTake(take({ createdAt, status: 'correct' }), USER, posted + 1000)).toBe(false);
  });

  it('refuses a signed-out viewer', () => {
    expect(canEditTake(mine, null, posted + 1000)).toBe(false);
  });
});

describe('canDeleteTake', () => {
  it('lets the author delete an ungraded take with no time limit', () => {
    const old = take({ createdAt: '2020-01-01T00:00:00Z' });
    expect(canDeleteTake(old, USER)).toBe(true);
    expect(canEditTake(old, USER)).toBe(false);
  });

  it('refuses once it has been graded', () => {
    expect(canDeleteTake(take({ status: 'incorrect' }), USER)).toBe(false);
  });

  it('refuses somebody else', () => {
    expect(canDeleteTake(take(), OTHER)).toBe(false);
  });
});

describe('hasWager', () => {
  it('is false for a take nobody staked anything on', () => {
    expect(hasWager(take())).toBe(false);
    expect(hasWager(take({ wager: null }))).toBe(false);
    // takes_wager_check forbids this spelling, but a stale row or a bad client
    // must not read as a live bet.
    expect(hasWager(take({ wager: '' }))).toBe(false);
  });

  it('is true once something is on the line', () => {
    expect(hasWager(take({ wager: '$20' }))).toBe(true);
  });
});

describe('canFade', () => {
  const staked = (overrides = {}) => take({ wager: '$20', ...overrides });

  it('refuses the author their own take', () => {
    expect(canFade(staked(), USER)).toBe(false);
  });

  it('allows another signed-in member', () => {
    expect(canFade(staked(), OTHER)).toBe(true);
  });

  it('refuses a signed-out viewer', () => {
    expect(canFade(staked(), null)).toBe(false);
  });

  it('refuses once the take is graded', () => {
    expect(canFade(staked({ status: 'correct' }), OTHER)).toBe(false);
  });

  it('refuses a take with nothing staked on it', () => {
    // The clause added to `take_participants insert own`: with no wager there
    // is no side to take, so the button must not exist. Without this the UI
    // would offer a click the database now refuses.
    expect(canFade(take(), OTHER)).toBe(false);
  });
});

describe('hell nah counting', () => {
  const faded = take({
    wager: '$20',
    takeParticipants: [
      { id: 'p1', userId: OTHER.id, createdAt: '2026-09-02T12:00:00Z' },
      { id: 'p2', userId: 'user-3', createdAt: '2026-09-02T13:00:00Z' }
    ]
  });

  it('counts the fades', () => {
    expect(fadeCount(faded)).toBe(2);
    expect(fadeCount(take())).toBe(0);
  });

  it('knows whether this viewer is among them', () => {
    expect(hasFaded(faded, OTHER)).toBe(true);
    expect(hasFaded(faded, USER)).toBe(false);
    expect(hasFaded(faded, null)).toBe(false);
  });
});

describe('STATUS_BADGE', () => {
  it('names a real badge variant for every status the CHECK allows', () => {
    // The four values in takes_status_check. A status with no entry renders an
    // unstyled badge, which reads as a bug rather than as a state.
    expect(Object.keys(STATUS_BADGE).sort()).toEqual([
      'correct',
      'incorrect',
      'pending',
      'push'
    ]);
    expect(Object.values(STATUS_BADGE).every((variant) =>
      ['info', 'success', 'destructive', 'warning'].includes(variant)
    )).toBe(true);
  });
});
