/**
 * The targeted `kona_player_info` fetch.
 *
 * Two things carry weight: an empty id list must not become a request for the
 * entire player universe, and a payload whose shape has changed must throw
 * rather than return `[]` — the grader treats an absent stat line as "skip",
 * so a silent empty array would look exactly like "ESPN does not know these
 * players" and the failure would never surface.
 */

import { describe, it, expect, vi } from 'vitest';

import { MAX_PLAYER_IDS, fetchPlayerWeekInfo } from '../espnPlayerInfoFetcher.js';

const ok = (payload) => ({ ok: true, status: 200, json: async () => payload });

const call = (over = {}) =>
  fetchPlayerWeekInfo({
    leagueId: '67674700',
    seasonYear: 2026,
    week: 4,
    espnPlayerIds: [3117251],
    espnS2: 'S2',
    swid: '{SWID}',
    ...over
  });

describe('fetchPlayerWeekInfo', () => {
  it('filters by id in the X-Fantasy-Filter header and scopes to the week', async () => {
    const fetchImpl = vi.fn(async () => ok({ players: [{ id: 3117251, player: { id: 3117251 } }] }));

    const players = await call({ fetchImpl });

    expect(players).toHaveLength(1);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/2026/segments/0/leagues/67674700');
    expect(url).toContain('view=kona_player_info');
    expect(url).toContain('scoringPeriodId=4');
    expect(JSON.parse(init.headers['X-Fantasy-Filter'])).toEqual({
      players: { filterIds: { value: [3117251] }, limit: 1 }
    });
    // League-scoped, so cookied — this reports *our* league's scoring.
    expect(init.headers.Cookie).toBe('espn_s2=S2; SWID={SWID}');
  });

  it('does not call ESPN at all with no ids', async () => {
    const fetchImpl = vi.fn();

    await expect(call({ espnPlayerIds: [], fetchImpl })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('deduplicates ids', async () => {
    const fetchImpl = vi.fn(async () => ok({ players: [] }));

    await call({ espnPlayerIds: [1, 1, 2, null], fetchImpl });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].headers['X-Fantasy-Filter']).players.filterIds)
      .toEqual({ value: [1, 2] });
  });

  it('refuses an unreasonable batch rather than sending it', async () => {
    const fetchImpl = vi.fn();
    const ids = Array.from({ length: MAX_PLAYER_IDS + 1 }, (_, i) => i + 1);

    await expect(call({ espnPlayerIds: ids, fetchImpl })).rejects.toThrow(/batch the call/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws on a failed request', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, statusText: 'Unauthorized' });

    await expect(call({ fetchImpl })).rejects.toThrow(/401/);
  });

  it('throws when the payload shape changes, rather than reporting no players', async () => {
    const fetchImpl = async () => ok({ notPlayers: [] });

    await expect(call({ fetchImpl })).rejects.toThrow(/payload shape has changed/);
  });

  it('returns an empty array when ESPN knows none of the ids', async () => {
    // A real answer, unlike a missing key.
    await expect(call({ fetchImpl: async () => ok({ players: [] }) })).resolves.toEqual([]);
  });

  it('sends no cookie header without credentials', async () => {
    const fetchImpl = vi.fn(async () => ok({ players: [] }));

    await call({ espnS2: null, swid: null, fetchImpl });

    expect(fetchImpl.mock.calls[0][1].headers.Cookie).toBeUndefined();
  });
});
