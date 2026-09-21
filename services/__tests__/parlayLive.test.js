import { describe, it, expect } from 'vitest';

import {
  etParts,
  inWindow,
  isLikelyGameWindow,
  shouldRefresh,
  planEventFetches,
  mergeLiveStatus,
  REFRESH_TTL_MS
} from '../parlayLive.js';
import { GAME_STATE } from '../espnLiveScoreMapper.js';

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

describe('shouldRefresh', () => {
  const now = new Date('2026-09-20T20:00:00Z');

  it('never refreshes outside a window', () => {
    expect(shouldRefresh({ now, refreshedAt: null, inWindow: false })).toBe(false);
  });

  it('refreshes in a window when there is no prior pull', () => {
    expect(shouldRefresh({ now, refreshedAt: null, inWindow: true })).toBe(true);
  });

  it('waits out the 30-minute TTL, then refreshes', () => {
    const recent = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const stale = new Date(now.getTime() - REFRESH_TTL_MS - 1000).toISOString();
    expect(shouldRefresh({ now, refreshedAt: recent, inWindow: true })).toBe(false);
    expect(shouldRefresh({ now, refreshedAt: stale, inWindow: true })).toBe(true);
  });
});

// A slate: game 1 live (DEN/JAX), game 2 final (GB/NYJ), game 3 not started (KC/BUF).
const scoreboard = {
  events: [
    { id: '1', status: { type: { state: 'in', shortDetail: 'Q3 5:20' } }, competitions: [{ competitors: [{ team: { abbreviation: 'DEN' } }, { team: { abbreviation: 'JAX' } }] }] },
    { id: '2', status: { type: { state: 'post', shortDetail: 'Final' } }, competitions: [{ competitors: [{ team: { abbreviation: 'GB' } }, { team: { abbreviation: 'NYJ' } }] }] },
    { id: '3', status: { type: { state: 'pre', shortDetail: 'Sun 1:00 PM' } }, competitions: [{ competitors: [{ team: { abbreviation: 'KC' } }, { team: { abbreviation: 'BUF' } }] }] }
  ]
};

const receiving = (athletes) => ({ name: 'receiving', labels: ['REC', 'YDS', 'AVG', 'TD', 'LONG', 'TGTS'], athletes });
const summary1 = {
  boxscore: { players: [{ team: { abbreviation: 'DEN' }, statistics: [receiving([{ athlete: { id: '100' }, stats: ['5', '60', '12', '2', '30', '7'] }])] }] }
};

const picks = [
  { id: 'pLive', espnPlayerId: '100', teamAbbreviation: 'DEN' },
  { id: 'pFinal', espnPlayerId: '300', teamAbbreviation: 'GB' },
  { id: 'pPre', espnPlayerId: '999', teamAbbreviation: 'KC' }
];

describe('planEventFetches', () => {
  it('fetches live and newly-final games, never a game not started', () => {
    // First refresh: nothing known yet → fetch the live (1) and the final (2).
    expect(planEventFetches({ picks, scoreboard, prevEventStates: {} }).sort()).toEqual(['1', '2']);
  });

  it('skips a game that was already final last time', () => {
    // Game 2 was final before → its TDs cannot change → do not re-fetch it.
    expect(planEventFetches({ picks, scoreboard, prevEventStates: { 2: GAME_STATE.FINAL } })).toEqual(['1']);
  });
});

describe('mergeLiveStatus', () => {
  it('computes fetched games and carries a skipped final game forward', () => {
    const prev = { status: { pFinal: { state: GAME_STATE.FINAL, scored: true, tds: 1, detail: 'Final' } } };
    // We fetched game 1 only; game 2 was skipped (already final), game 3 not started.
    const { status, eventStates, live } = mergeLiveStatus({
      picks,
      scoreboard,
      summariesByEvent: { 1: summary1 },
      prev
    });

    expect(status.pLive).toMatchObject({ state: GAME_STATE.IN_PROGRESS, scored: true, tds: 2 });
    // Carried forward from prev rather than re-fetched or lost.
    expect(status.pFinal).toMatchObject({ state: GAME_STATE.FINAL, scored: true, tds: 1 });
    expect(status.pPre).toMatchObject({ state: GAME_STATE.NOT_STARTED, tds: null });

    expect(eventStates).toEqual({ 1: GAME_STATE.IN_PROGRESS, 2: GAME_STATE.FINAL, 3: GAME_STATE.NOT_STARTED });
    expect(live).toBe(true);
  });
});
