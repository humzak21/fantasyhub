import { describe, it, expect } from 'vitest';

import { planEventFetches, mergeLiveStatus, REFRESH_TTL_MS } from '../parlayLive.js';
import { GAME_STATE } from '../espnLiveScoreMapper.js';
import { LIVE_REFRESH_TTL_MS } from '../liveScores.js';

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

describe('REFRESH_TTL_MS', () => {
  it('is the same 15 minutes as the live scores feed', () => {
    expect(REFRESH_TTL_MS).toBe(LIVE_REFRESH_TTL_MS);
  });
});

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
