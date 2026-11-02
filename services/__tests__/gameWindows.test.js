import { describe, it, expect } from 'vitest';

import {
  LAST_KICKOFF_TAIL_MS,
  etParts,
  fetchWeekKickoffs,
  inWindow,
  isGameWindowOpen,
  isLikelyGameWindow,
  kickoffWindows,
  shouldRefresh
} from '../gameWindows.js';

const HOUR = 60 * 60 * 1000;

describe('etParts', () => {
  it('reads Eastern weekday and minutes from a UTC instant (EDT)', () => {
    // 2026-09-25T01:00Z is Thursday 21:00 in EDT (UTC-4).
    expect(etParts(new Date('2026-09-25T01:00:00Z'))).toEqual({ weekday: 4, minutes: 21 * 60 });
  });

  it('handles the EST offset too', () => {
    // 2026-12-15T02:00Z is Sunday 21:00 in EST (UTC-5) — a Monday-night edge…
    // actually 2026-12-14 is a Monday, so 02:00Z Mon = 21:00 Sun EST.
    expect(etParts(new Date('2026-12-14T02:00:00Z'))).toEqual({ weekday: 0, minutes: 21 * 60 });
  });
});

describe('inWindow', () => {
  it('accepts the three game windows and rejects the rest', () => {
    expect(inWindow({ weekday: 4, minutes: 21 * 60 })).toBe(true);  // Thu 9pm
    expect(inWindow({ weekday: 0, minutes: 16 * 60 })).toBe(true);  // Sun 4pm
    expect(inWindow({ weekday: 1, minutes: 21 * 60 })).toBe(true);  // Mon 9pm
    expect(inWindow({ weekday: 0, minutes: 8 * 60 })).toBe(false);  // Sun 8am (pre-slate)
    expect(inWindow({ weekday: 4, minutes: 12 * 60 })).toBe(false); // Thu noon
    expect(inWindow({ weekday: 3, minutes: 21 * 60 })).toBe(false); // Wed 9pm
  });

  it('is half-open: the start minute is in, the end minute is out', () => {
    expect(inWindow({ weekday: 4, minutes: 20 * 60 })).toBe(true);      // 20:00 exactly
    expect(inWindow({ weekday: 4, minutes: 20 * 60 - 1 })).toBe(false); // 19:59
  });
});

describe('isLikelyGameWindow', () => {
  it('is true during Sunday afternoon and false on a Wednesday', () => {
    expect(isLikelyGameWindow(new Date('2026-09-20T20:00:00Z'))).toBe(true);  // Sun 4pm ET
    expect(isLikelyGameWindow(new Date('2026-09-23T20:00:00Z'))).toBe(false); // Wed 4pm ET
  });
});

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

describe('the 2026 calendar', () => {
  // The first kickoff of each day that is not a Thursday, Sunday or Monday.
  const unusual = [
    ['the Wednesday opener', '2026-09-10T00:20:00Z'],
    ['the night before Thanksgiving', '2026-11-26T01:00:00Z'],
    ['the Friday after it', '2026-11-27T20:00:00Z'],
    ['a Saturday in December', '2026-12-19T22:00:00Z'],
    ['Christmas, a Friday', '2026-12-25T18:00:00Z']
  ];

  it.each(unusual)('is open for %s, which the fixed slots miss', (_name, kickoff) => {
    const inGame = new Date(Date.parse(kickoff) + HOUR);

    expect(isLikelyGameWindow(inGame)).toBe(false);
    expect(isGameWindowOpen(inGame, [kickoff])).toBe(true);
  });
});

describe('fetchWeekKickoffs', () => {
  /** A stand-in for the query builder, recording what was asked for. */
  const clientWith = (result) => {
    const filters = {};
    const query = {
      select: () => query,
      eq: (column, value) => {
        filters[column] = value;
        return query;
      },
      not: () => query,
      then: (resolve) => resolve(result)
    };
    return { filters, client: { from: () => query } };
  };

  it('leaves out ESPN\'s placeholder times', async () => {
    const { client, filters } = clientWith({ data: [{ game_time: 'kickoff' }], error: null });

    await expect(fetchWeekKickoffs(client, 2026, 12)).resolves.toEqual(['kickoff']);
    expect(filters).toEqual({ season_year: 2026, week: 12, start_time_tbd: false });
  });

  it('asks nothing without a year and a week', async () => {
    const { client } = clientWith({ data: null, error: new Error('should not run') });
    await expect(fetchWeekKickoffs(client, null, 12)).resolves.toEqual([]);
  });

  it('says so when the read fails, rather than reporting no games', async () => {
    const { client } = clientWith({ data: null, error: new Error('no') });
    await expect(fetchWeekKickoffs(client, 2026, 12)).rejects.toThrow('no');
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
