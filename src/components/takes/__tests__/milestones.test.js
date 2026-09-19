/**
 * The board's ordering and the two windows.
 *
 * These are the things the takes UI gets wrong silently if they drift: a board
 * sorted by posting time reads as a feed rather than a schedule, and an edit or
 * Hell Nah window that disagrees with the RLS policy shows the reader a button
 * whose only outcome is an error toast.
 *
 * Every window assertion passes `now` explicitly. The fixtures are dated, and a
 * test that let the wall clock decide would have started failing three days
 * after it was written — which is how the board's own fixtures broke when the
 * Hell Nah window shipped.
 */

import { describe, it, expect } from 'vitest';

import {
  EDIT_WINDOW_MS,
  FADE_WINDOW_MS,
  STATUS_BADGE,
  canDeleteTake,
  canEditTake,
  canFade,
  canHellYeah,
  canWithdrawFade,
  canWithdrawHellYeah,
  fadeCount,
  fadeDeadline,
  fadeTerms,
  fadeWindowNote,
  groupByMilestone,
  hasFaded,
  hasHellYeahed,
  hasWager,
  hellYeahCount,
  isFadeWindowOpen,
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

/** The fixtures are posted at noon on 2026-09-01; this is an hour later. */
const INSIDE = Date.parse('2026-09-01T13:00:00Z');
/** Four days later — past the 72-hour window, whichever end it runs from. */
const OUTSIDE = Date.parse('2026-09-05T13:00:00Z');

describe('canFade', () => {
  const staked = (overrides = {}) => take({ wager: '$20', ...overrides });

  it('refuses the author their own take', () => {
    expect(canFade(staked(), USER, INSIDE)).toBe(false);
  });

  it('allows another signed-in member', () => {
    expect(canFade(staked(), OTHER, INSIDE)).toBe(true);
  });

  it('refuses a signed-out viewer', () => {
    expect(canFade(staked(), null, INSIDE)).toBe(false);
  });

  it('refuses once the take is graded', () => {
    expect(canFade(staked({ status: 'correct' }), OTHER, INSIDE)).toBe(false);
  });

  it('refuses a take with nothing staked on it', () => {
    // The clause added to `take_participants insert own`: with no wager there
    // is no side to take, so the button must not exist. Without this the UI
    // would offer a click the database now refuses.
    expect(canFade(take(), OTHER, INSIDE)).toBe(false);
  });

  it('refuses once the take has been settled for three days', () => {
    expect(canFade(staked(), OTHER, OUTSIDE)).toBe(false);
  });

  it('runs the window from the last edit, not from posting', () => {
    // The author reworded it on the third day, so the take people are fading
    // is younger than the take that was posted — and everybody gets three days
    // on the new wording.
    const reworded = staked({ editedAt: '2026-09-04T12:00:00Z' });
    expect(canFade(reworded, OTHER, OUTSIDE)).toBe(true);
    expect(canFade(reworded, OTHER, Date.parse('2026-09-08T13:00:00Z'))).toBe(false);
  });
});

describe('the Hell Nah window', () => {
  const staked = (overrides = {}) => take({ wager: '$20', ...overrides });

  it('closes 72 hours after the take last moved', () => {
    expect(FADE_WINDOW_MS).toBe(72 * 60 * 60 * 1000);
    expect(fadeDeadline(staked())).toBe(Date.parse('2026-09-01T12:00:00Z') + FADE_WINDOW_MS);
    expect(fadeDeadline(staked({ editedAt: '2026-09-02T12:00:00Z' })))
      .toBe(Date.parse('2026-09-02T12:00:00Z') + FADE_WINDOW_MS);
  });

  it('treats a take with no usable date as closed rather than as open forever', () => {
    expect(fadeDeadline(take({ createdAt: null }))).toBe(null);
    expect(fadeDeadline(take({ createdAt: 'not a date' }))).toBe(null);
    expect(isFadeWindowOpen(take({ createdAt: null }), INSIDE)).toBe(false);
  });

  it('closes withdrawing exactly when it closes fading', () => {
    // The asymmetry this pair exists to prevent: a window that shut for
    // joining but stayed open for leaving would let the side with something to
    // lose step off once the football had answered the question.
    const faded = staked({
      takeParticipants: [{ id: 'p1', userId: OTHER.id, createdAt: '2026-09-01T13:00:00Z' }]
    });

    expect(canWithdrawFade(faded, OTHER, INSIDE)).toBe(true);
    expect(canWithdrawFade(faded, OTHER, OUTSIDE)).toBe(false);
  });

  it('lets somebody withdraw from a take whose stake was cleared', () => {
    // Withdrawing deliberately does not check the wager: clearing a stake
    // leaves the rows behind, and the people holding them must still be able
    // to step off while the window is open.
    const faded = take({
      takeParticipants: [{ id: 'p1', userId: OTHER.id, createdAt: '2026-09-01T13:00:00Z' }]
    });

    expect(canWithdrawFade(faded, OTHER, INSIDE)).toBe(true);
    expect(canFade(faded, OTHER, INSIDE)).toBe(false);
  });

  it('refuses to withdraw a Hell Nah the viewer never placed', () => {
    expect(canWithdrawFade(staked(), OTHER, INSIDE)).toBe(false);
  });

  it('says which side of the deadline the take is on', () => {
    expect(fadeWindowNote(staked(), INSIDE)).toMatch(/^Hell Yeahs and Hell Nahs close /);
    expect(fadeWindowNote(staked(), OUTSIDE)).toMatch(/^Hell Yeahs and Hell Nahs closed /);
    expect(fadeWindowNote(take({ createdAt: null }), INSIDE)).toBe(null);
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

describe('Hell Yeah', () => {
  const THIRD = { id: 'user-3' };
  const yeah = (userId, wager = null) => ({
    id: `y-${userId}`,
    userId,
    side: 'yeah',
    wager,
    createdAt: '2026-09-01T13:00:00Z'
  });
  const nah = (userId) => ({ id: `n-${userId}`, userId, side: 'nah', createdAt: '2026-09-01T13:00:00Z' });

  it('can back any take, staked or not', () => {
    // At its core a Hell Yeah is just "good call" — unlike a Hell Nah, it
    // needs nothing staked.
    expect(canHellYeah(take(), OTHER, INSIDE)).toBe(true);
    expect(canHellYeah(take({ wager: '$20' }), OTHER, INSIDE)).toBe(true);
  });

  it('refuses the author, a visitor, a graded take and a closed window', () => {
    expect(canHellYeah(take(), USER, INSIDE)).toBe(false);
    expect(canHellYeah(take(), null, INSIDE)).toBe(false);
    expect(canHellYeah(take({ status: 'correct' }), OTHER, INSIDE)).toBe(false);
    expect(canHellYeah(take(), OTHER, OUTSIDE)).toBe(false);
  });

  it('keeps each member to one side', () => {
    const board = take({ wager: '$20', takeParticipants: [yeah(OTHER.id), nah(THIRD.id)] });

    expect(canFade(board, OTHER, INSIDE)).toBe(false);
    expect(canHellYeah(board, THIRD, INSIDE)).toBe(false);
  });

  it('counts each side separately', () => {
    const board = take({
      wager: '$20',
      takeParticipants: [yeah(OTHER.id, '$10'), yeah('user-4'), nah(THIRD.id)]
    });

    expect(hellYeahCount(board)).toBe(2);
    expect(fadeCount(board)).toBe(1);
    expect(hasHellYeahed(board, OTHER)).toBe(true);
    expect(hasFaded(board, OTHER)).toBe(false);
    expect(hasFaded(board, THIRD)).toBe(true);
  });

  it('reads a row with no side as a Hell Nah, as every row before Hell Yeah was', () => {
    const legacy = take({ wager: '$20', takeParticipants: [{ id: 'p1', userId: OTHER.id }] });
    expect(hasFaded(legacy, OTHER)).toBe(true);
    expect(hellYeahCount(legacy)).toBe(0);
  });

  it('withdraws inside the same window as a Hell Nah', () => {
    const board = take({ takeParticipants: [yeah(OTHER.id)] });
    expect(canWithdrawHellYeah(board, OTHER, INSIDE)).toBe(true);
    expect(canWithdrawHellYeah(board, OTHER, OUTSIDE)).toBe(false);
    expect(canWithdrawHellYeah(board, THIRD, INSIDE)).toBe(false);
  });

  it('never tells a fader they owe a backer', () => {
    // A backer's stake is a show of confidence: the Hell Nah price is the
    // author's stake and nothing else, however many backers added one.
    const backed = take({ wager: '$20', takeParticipants: [yeah(OTHER.id, '$10')] });
    expect(fadeTerms(backed)).toBe(fadeTerms(take({ wager: '$20' })));
    expect(fadeTerms(backed)).not.toMatch(/\$10/);
  });

  it('names only Hell Yeahs in the window note of an unstaked take', () => {
    expect(fadeWindowNote(take(), INSIDE)).toMatch(/^Hell Yeahs close /);
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
