/**
 * What every card reads. The first test is the bug this exists to prevent: the
 * research panel it replaced called `useCurrentLineups` directly, which skipped
 * the live overlay, so it stayed on projections while Schedule went live.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { GAME_STATE } from '../../../../services/espnLiveScoreMapper.js';

const hooks = {
  useActualWeek: vi.fn(() => 8),
  useSeasonConfig: vi.fn(() => ({ startDate: '2026-09-08' })),
  useLineupsForWeek: vi.fn(() => ({ data: {}, live: null, isLoading: false })),
  useNflOpponentMap: vi.fn(() => ({ data: {} }))
};

vi.mock('../../../../hooks/queries/index.js', () => hooks);

const { useMatchupBoard } = await import('../useMatchupBoard.js');

const GAME = { id: 'g1', isCompleted: false, team1: { id: 'a' }, team2: { id: 'b' } };

const setup = (overrides) =>
  renderHook(() => useMatchupBoard({ seasonId: 's', week: 8, nflSeasonYear: 2026, games: [GAME], ...overrides }));

beforeEach(() => vi.clearAllMocks());

describe('useMatchupBoard', () => {
  it('reads lineups through the hook that lays the live week over them', () => {
    setup();
    expect(hooks.useLineupsForWeek).toHaveBeenCalledWith('s', 8, { actualWeek: 8, enabled: true });
  });

  it('waits for the season rather than believing the placeholder week', () => {
    hooks.useSeasonConfig.mockReturnValue(null);
    setup();
    expect(hooks.useLineupsForWeek).toHaveBeenCalledWith('s', 8, { actualWeek: null, enabled: true });
    hooks.useSeasonConfig.mockReturnValue({ startDate: '2026-09-08' });
  });

  it('asks for nothing without games, or when told not to', () => {
    setup({ games: [] });
    expect(hooks.useLineupsForWeek).toHaveBeenLastCalledWith('s', 8, expect.objectContaining({ enabled: false }));

    setup({ enabled: false });
    expect(hooks.useLineupsForWeek).toHaveBeenLastCalledWith('s', 8, expect.objectContaining({ enabled: false }));
  });

  it('asks the NFL calendar for the season year, never the season id', () => {
    setup();
    expect(hooks.useNflOpponentMap).toHaveBeenCalledWith(2026, 8, { enabled: true });
  });

  it('gives a chip to the viewer\'s picks and no one else\'s games', () => {
    const final = { started: true, rosterSlot: 'RB', position: 'RB', proTeamId: 12, projectedPoints: 12, actualPoints: 60, nflState: GAME_STATE.FINAL };
    const rows = { a: [final], b: [{ ...final, actualPoints: 40 }] };
    hooks.useLineupsForWeek.mockReturnValue({ data: rows, live: null, isLoading: false });

    const { result } = setup({ picks: { g1: 'a' } });
    expect(result.current.outlooks.g1.key).toBe('locked');

    const none = setup({ picks: {} });
    expect(none.result.current.outlooks.g1).toBeNull();
  });
});
