/**
 * The player page's chunk is requested the first time a player is opened, and
 * stays mounted after the first close so the exit animation can run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';

import { renderWithProviders } from '../../../test/renderWithProviders.jsx';

vi.mock('../../../../hooks/queries/index.js', () => ({
  usePlayerByEspnId: () => ({ data: null }),
  useActiveSeason: () => ({ data: null }),
  useIsApprovedMember: () => ({ data: false, isPending: false }),
  useIsLeagueAdmin: () => ({ data: false, isPending: false }),
  useIsParlayCommissioner: () => ({ data: false, isPending: false })
}));

// Stands in for the lazy import: the factory runs only when the chunk is
// requested, so counting its calls counts the requests.
const loadChunk = vi.fn();
vi.mock('../PlayerDetail.jsx', () => {
  loadChunk();
  return { default: () => <div data-testid="player-detail" /> };
});

const { PlayerDetailProvider } = await import('../PlayerDetailContext.jsx');
const { default: PlayerDetailMount } = await import('../PlayerDetailMount.jsx');

let navigate;
const Nav = () => { navigate = useNavigate(); return null; };

const renderAt = (entry) => renderWithProviders(
  <PlayerDetailProvider>
    <PlayerDetailMount />
    <Nav />
  </PlayerDetailProvider>,
  { initialEntries: [entry] }
);

beforeEach(() => loadChunk.mockClear());

describe('PlayerDetailMount', () => {
  it('requests no chunk while no player has been opened', async () => {
    renderAt('/teams');
    await act(async () => {});
    expect(loadChunk).not.toHaveBeenCalled();
    expect(screen.queryByTestId('player-detail')).toBeNull();
  });

  it('mounts the page on the first open and keeps it after the close', async () => {
    renderAt('/teams');
    await act(async () => navigate('/teams?player=p1'));
    expect(await screen.findByTestId('player-detail')).toBeInTheDocument();
    expect(loadChunk).toHaveBeenCalledTimes(1);

    await act(async () => navigate('/teams'));
    expect(screen.getByTestId('player-detail')).toBeInTheDocument();
  });
});
