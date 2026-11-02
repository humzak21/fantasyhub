/**
 * The app's one write to ESPN. What matters is the shape of the transaction,
 * that a refusal comes back as data rather than a throw, and that no cookie
 * ever reaches a message.
 */

import { describe, it, expect, vi } from 'vitest';

import { buildLineupSwap, fetchLiveRosters, postLineupSwap } from '../espnLineupWriter.js';

const json = (body, init = {}) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body, ...init });

const swap = buildLineupSwap({ teamId: 3, week: 10, starterEspnId: 100, benchEspnId: 200, slotId: 2 });

describe('buildLineupSwap', () => {
  it('moves the starter to the bench and the bench player into the slot, in one transaction', () => {
    expect(swap).toMatchObject({ teamId: 3, type: 'ROSTER', scoringPeriodId: 10, executionType: 'EXECUTE' });
    expect(swap.items).toEqual([
      { playerId: 100, type: 'LINEUP', fromLineupSlotId: 2, toLineupSlotId: 20 },
      { playerId: 200, type: 'LINEUP', fromLineupSlotId: 20, toLineupSlotId: 2 }
    ]);
  });
});

describe('postLineupSwap', () => {
  const post = (fetchImpl, espnS2 = 'secret-cookie') =>
    postLineupSwap({ leagueId: 'L', seasonYear: 2026, espnS2, swap, fetchImpl });

  it('posts to the write host', async () => {
    const fetchImpl = vi.fn(async () => json({}));

    expect(await post(fetchImpl)).toEqual({ ok: true, detail: null });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://lm-api-writes.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/L/transactions/');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(swap);
  });

  it('returns ESPN\'s refusal code instead of throwing', async () => {
    const fetchImpl = async () =>
      json({ details: [{ type: 'TRAN_LINEUP_LOCKED' }] }, { ok: false, status: 409 });

    expect(await post(fetchImpl)).toEqual({ ok: false, detail: 'TRAN_LINEUP_LOCKED' });
  });

  it('falls back to the status when the refusal has no body', async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => { throw new Error('html'); } });

    expect(await post(fetchImpl)).toEqual({ ok: false, detail: 'HTTP 500' });
  });

  it('survives the network failing, without repeating what it sent', async () => {
    const fetchImpl = async () => {
      throw new Error('connection reset, cookie secret-cookie');
    };

    const result = await post(fetchImpl);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('secret-cookie');
  });

  it('sends nothing without a cookie', async () => {
    const fetchImpl = vi.fn();

    expect((await post(fetchImpl, null)).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('fetchLiveRosters', () => {
  const read = (fetchImpl) => fetchLiveRosters({ leagueId: 'L', seasonYear: 2026, week: 10, fetchImpl });

  it('maps each team to its players\' live slot, status and eligibility', async () => {
    const rosters = await read(async () => json({
      teams: [{
        id: 3,
        roster: {
          entries: [{
            playerId: 100,
            lineupSlotId: 2,
            playerPoolEntry: { player: { injuryStatus: 'OUT', eligibleSlots: [2, 23, 20] } }
          }]
        }
      }]
    }));

    expect(rosters.get(3).get(100)).toEqual({ lineupSlotId: 2, injuryStatus: 'OUT', eligibleSlots: [2, 23, 20] });
  });

  it('throws on a failed read, which must not look like an empty roster', async () => {
    await expect(read(async () => json({}, { ok: false, status: 401, statusText: 'Unauthorized' })))
      .rejects.toThrow('401');
  });

  it('throws when the payload has changed shape', async () => {
    await expect(read(async () => json({ nope: true }))).rejects.toThrow('shape');
  });
});
