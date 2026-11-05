/**
 * The player page's shell: opened by `?player=`, closed by Back, the X or
 * Escape, each of which drops the param and nothing else.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';

import { renderWithProviders } from '../../../test/renderWithProviders.jsx';

let profileQuery;
const refetch = vi.fn();
vi.mock('../../../../hooks/queries/index.js', () => ({
  usePlayerProfile: () => profileQuery,
  usePlayerCareers: () => ({ data: null }),
  usePlayerByEspnId: () => ({ data: null }),
  // What ViewerProvider reads.
  useActiveSeason: () => ({ data: null }),
  useIsApprovedMember: () => ({ data: false, isPending: false }),
  useIsLeagueAdmin: () => ({ data: false, isPending: false }),
  useIsParlayCommissioner: () => ({ data: false, isPending: false })
}));

const { PlayerDetailProvider } = await import('../PlayerDetailContext.jsx');
const { default: PlayerDetail } = await import('../PlayerDetail.jsx');

const LOADED = {
  data: { player: { id: 'p1', name: 'Josh Allen', position: 'QB' } },
  isSuccess: true,
  isPending: false,
  isError: false,
  refetch
};

const Search = () => <output data-testid="search">{useLocation().search}</output>;
const search = () => new URLSearchParams(screen.getByTestId('search').textContent);

const renderAt = (entry) => renderWithProviders(
  <PlayerDetailProvider>
    <PlayerDetail />
    <Search />
  </PlayerDetailProvider>,
  { initialEntries: [entry] }
);

const realWidth = window.innerWidth;
const setWidth = (width) => { window.innerWidth = width; };

beforeEach(() => {
  profileQuery = LOADED;
  refetch.mockClear();
  setWidth(1280);
});
afterEach(() => setWidth(realWidth));

describe('PlayerDetail', () => {
  it('renders nothing while no player is open', () => {
    renderAt('/teams');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens from the URL, titled with the player', async () => {
    renderAt('/teams?player=p1');
    const dialog = await screen.findByRole('dialog', { name: 'Josh Allen' });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector('[data-slot="sections"]')).not.toBeNull();
  });

  it('closes with the X, keeping the page\'s own params', async () => {
    renderAt('/rankings?view=statistics&player=p1');
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(search().has('player')).toBe(false);
    expect(search().get('view')).toBe('statistics');
  });

  it('closes on Escape', async () => {
    renderAt('/teams?player=p1');
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(search().has('player')).toBe(false);
  });

  it('is a full-screen page with a back arrow below md', async () => {
    setWidth(375);
    renderAt('/teams?player=p1');
    const dialog = await screen.findByRole('dialog', { name: 'Josh Allen' });
    expect(dialog.className).toContain('slide-in-from-right-full');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(search().has('player')).toBe(false);
  });

  it('shows a skeleton while the player loads', async () => {
    profileQuery = { data: undefined, isPending: true, isError: false, refetch };
    renderAt('/teams?player=p1');
    expect(await screen.findByRole('status', { name: 'Loading player' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Player' })).toBeInTheDocument();
  });

  it('offers a retry when the player fails to load', async () => {
    profileQuery = { data: undefined, isPending: false, isError: true, refetch };
    renderAt('/teams?player=p1');
    expect(await screen.findByText("Couldn't load this player")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('says so when there is no such player', async () => {
    profileQuery = { data: null, isSuccess: true, isPending: false, isError: false, refetch };
    renderAt('/teams?player=nobody');
    await waitFor(() => expect(screen.getByText('Player not found')).toBeInTheDocument());
  });
});
