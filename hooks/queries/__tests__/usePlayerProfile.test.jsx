/**
 * The player hooks: their keys, their `select`, and when they stay idle.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const playerProfiles = {
  getPlayerProfileSource: vi.fn(async (id) => (id === 'missing' ? null : { player: { id } })),
  getPlayerCareers: vi.fn(async () => [{ playerId: 'p1' }]),
  getPlayerByEspnId: vi.fn(async (espnId) => ({ id: 'p1', espnPlayerId: espnId }))
};

vi.mock('../../../services/db/index.js', () => ({ getDb: () => ({ playerProfiles }) }));
vi.mock('../../../utils/playerProfile/index.js', () => ({
  buildPlayerProfile: vi.fn((source) => (source ? { built: source.player.id } : null)),
  rankCareers: vi.fn((rows, options) => ({ ranked: rows.length, ...options }))
}));

const { usePlayerProfile, usePlayerCareers, usePlayerByEspnId } = await import('../usePlayerProfile.js');
const { qk } = await import('../keys.js');

function setup(hook) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { queryClient, ...renderHook(hook, { wrapper }) };
}

describe('player query keys', () => {
  it('sit under the players scope', () => {
    expect(qk.players.profile('p1')).toEqual(['players', 'profile', 'p1']);
    expect(qk.players.careers()).toEqual(['players', 'careers']);
    expect(qk.players.byEspnId(42)).toEqual(['players', 'byEspnId', 42]);
  });
});

describe('usePlayerProfile', () => {
  it('builds the profile in select', async () => {
    const { result } = setup(() => usePlayerProfile('p1'));
    await waitFor(() => expect(result.current.data).toEqual({ built: 'p1' }));
    expect(playerProfiles.getPlayerProfileSource).toHaveBeenCalledWith('p1');
  });

  it('is null for an unknown player', async () => {
    const { result } = setup(() => usePlayerProfile('missing'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('stays idle without an id or when disabled', () => {
    playerProfiles.getPlayerProfileSource.mockClear();
    setup(() => usePlayerProfile(null));
    setup(() => usePlayerProfile('p1', { enabled: false }));
    expect(playerProfiles.getPlayerProfileSource).not.toHaveBeenCalled();
  });
});

describe('usePlayerCareers', () => {
  it('ranks with the five-game floor', async () => {
    const { result } = setup(() => usePlayerCareers());
    await waitFor(() => expect(result.current.data).toEqual({ ranked: 1, minGames: 5 }));
  });
});

describe('usePlayerByEspnId', () => {
  it('looks a player up by ESPN id, and not without one', async () => {
    const { result } = setup(() => usePlayerByEspnId(42));
    await waitFor(() => expect(result.current.data).toEqual({ id: 'p1', espnPlayerId: 42 }));

    playerProfiles.getPlayerByEspnId.mockClear();
    setup(() => usePlayerByEspnId(null));
    expect(playerProfiles.getPlayerByEspnId).not.toHaveBeenCalled();
  });
});
