import { describe, it, expect } from 'vitest';

import {
  LAST_KICKOFF_TAIL_MS,
  isGameWindowOpen,
  isLikelyGameWindow,
  kickoffWindows,
  shouldRefresh
} from '../gameWindows.js';

const HOUR = 60 * 60 * 1000;

describe('kickoffWindows', () => {
  it('makes one window per Eastern day, first kickoff to last kickoff plus the tail', () => {
    const windows = kickoffWindows([
      '2026-11-01T18:00:00Z', // Sunday 1:00 PM ET
      '2026-11-02T01:20:00Z', // Sunday 8:20 PM ET, still Sunday in Eastern time
      '2026-11-01T21:25:00Z'  // Sunday 4:25 PM ET
    ]);

    expect(windows).toEqual([
      {
        start: Date.parse('2026-11-01T18:00:00Z'),
        end: Date.parse('2026-11-02T01:20:00Z') + LAST_KICKOFF_TAIL_MS
      }
    ]);
  });

  it('keeps the days of a week apart', () => {
    const windows = kickoffWindows(['2026-10-30T00:15:00Z', '2026-11-01T18:00:00Z']);
    expect(windows).toHaveLength(2);
    expect(windows[0].start).toBeLessThan(windows[1].start);
  });

  it('skips a bye row, which has no kickoff, and an unreadable one', () => {
    expect(kickoffWindows([null, undefined, 'not a date'])).toEqual([]);
  });
});

describe('isGameWindowOpen', () => {
  const week = ['2026-10-30T00:15:00Z', '2026-11-03T01:15:00Z'];

  it('opens at the kickoff, not before it', () => {
    expect(isGameWindowOpen(new Date('2026-10-30T00:14:00Z'), week)).toBe(false);
    expect(isGameWindowOpen(new Date('2026-10-30T00:15:00Z'), week)).toBe(true);
  });

  it('carries a Monday-night game past midnight Eastern', () => {
    // Tuesday 12:30 AM ET, after the week has rolled over.
    expect(isGameWindowOpen(new Date('2026-11-03T05:00:00Z'), week)).toBe(true);
    expect(isGameWindowOpen(new Date('2026-11-03T05:15:00Z'), week)).toBe(false);
  });

  it('sees a Saturday game the fixed slots have no row for', () => {
    const saturday = ['2026-12-19T18:00:00Z'];
    const at = new Date('2026-12-19T19:00:00Z');
    expect(isLikelyGameWindow(at)).toBe(false);
    expect(isGameWindowOpen(at, saturday)).toBe(true);
  });

  it('sees the 9:30 AM London slot', () => {
    const london = ['2026-10-11T13:30:00Z'];
    const at = new Date('2026-10-11T14:00:00Z');
    expect(isLikelyGameWindow(at)).toBe(false);
    expect(isGameWindowOpen(at, london)).toBe(true);
  });

  it('falls back to the usual slots for a week the calendar does not cover', () => {
    const sunday = new Date('2026-11-01T19:00:00Z');
    const wednesday = new Date('2026-11-04T19:00:00Z');
    expect(isGameWindowOpen(sunday, [])).toBe(true);
    expect(isGameWindowOpen(wednesday, [])).toBe(false);
  });
});

describe('shouldRefresh', () => {
  const now = new Date('2026-11-01T19:00:00Z');
  const ttlMs = HOUR / 4;

  it('never refreshes outside a window', () => {
    expect(shouldRefresh({ now, refreshedAt: null, inWindow: false, ttlMs })).toBe(false);
  });

  it('refreshes a window with nothing stored, and once the TTL has lapsed', () => {
    expect(shouldRefresh({ now, refreshedAt: null, inWindow: true, ttlMs })).toBe(true);
    expect(shouldRefresh({ now, refreshedAt: '2026-11-01T18:45:00Z', inWindow: true, ttlMs })).toBe(true);
    expect(shouldRefresh({ now, refreshedAt: '2026-11-01T18:50:00Z', inWindow: true, ttlMs })).toBe(false);
  });
});
