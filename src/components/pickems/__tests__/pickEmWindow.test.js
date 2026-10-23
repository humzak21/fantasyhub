import { describe, it, expect } from 'vitest';
import { formatCountdown, formatTimeRemaining, isWindowClosed, pickEmWindowState } from '../pickEmWindow.js';

const week = {
  submissionOpensAt: '2026-10-20T08:00:00Z',
  submissionClosesAt: '2026-10-23T00:00:00Z',
  resultsRevealAt: '2026-10-27T16:00:00Z'
};
const at = (iso) => new Date(iso);

describe('pickEmWindowState', () => {
  it('has no week without a row', () => {
    expect(pickEmWindowState(null).status).toBe('no-week');
  });

  it('walks upcoming → open → closed → completed', () => {
    expect(pickEmWindowState(week, at('2026-10-20T07:59:00Z')).status).toBe('upcoming');
    expect(pickEmWindowState(week, at('2026-10-20T08:00:00Z')).status).toBe('open');
    expect(pickEmWindowState(week, at('2026-10-23T00:00:00Z')).status).toBe('open');
    expect(pickEmWindowState(week, at('2026-10-23T00:00:01Z')).status).toBe('closed');
    expect(pickEmWindowState(week, at('2026-10-27T16:00:00Z')).status).toBe('completed');
  });

  it('carries the instants, for a countdown', () => {
    const state = pickEmWindowState(week, at('2026-10-21T00:00:00Z'));
    expect(state.closesAt.toISOString()).toBe('2026-10-23T00:00:00.000Z');
    expect(state.timeInfo).toBe('2d 0h remaining');
  });

  it('reads closed and completed as locked', () => {
    expect(isWindowClosed({ status: 'closed' })).toBe(true);
    expect(isWindowClosed({ status: 'completed' })).toBe(true);
    expect(isWindowClosed({ status: 'open' })).toBe(false);
  });
});

describe('formatCountdown', () => {
  const now = at('2026-10-21T00:00:00Z');

  it('counts days and hours, then hours and minutes, then minutes', () => {
    expect(formatCountdown('2026-10-22T04:30:00Z', now)).toBe('1d 4h');
    expect(formatCountdown('2026-10-21T03:12:00Z', now)).toBe('3h 12m');
    expect(formatCountdown('2026-10-21T00:45:00Z', now)).toBe('45m');
  });

  it('is null once passed, or without a deadline', () => {
    expect(formatCountdown('2026-10-20T00:00:00Z', now)).toBeNull();
    expect(formatCountdown(null, now)).toBeNull();
  });

  it('keeps the form’s long wording', () => {
    expect(formatTimeRemaining('2026-10-21T03:12:00Z', now)).toBe('3h 12m remaining');
    expect(formatTimeRemaining('2026-10-20T00:00:00Z', now)).toBe('Expired');
  });
});
