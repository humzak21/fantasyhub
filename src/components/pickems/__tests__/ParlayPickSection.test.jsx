/**
 * The parlay section of the pick'ems form.
 *
 * The rules worth pinning down are the ones a future change could quietly
 * break: it must render *nothing* without a pick'em week (that is the whole of
 * "only when pick'ems is activated"), it must not offer a submit outside the
 * window, and the free-text path must reach the data layer as a null player id
 * rather than being swallowed by the autocomplete.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '../../../test/renderWithProviders.jsx';

const parlay = {
  getMyParlayPick: vi.fn(async () => null),
  getParlayPicksForWeek: vi.fn(async () => []),
  getSeasonParlayPicks: vi.fn(async () => []),
  submitParlayPick: vi.fn(async () => ({}))
};

const players = { searchPlayers: vi.fn(async () => []) };

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    parlay,
    players,
    users: { isParlayCommissioner: async () => false },
    seasons: { getActiveSeason: async () => null }
  })
}));

/**
 * `useAuth` is mocked rather than `useViewer`, because the hooks and the
 * component read the viewer from *different* places on purpose: the component
 * takes `user`/`isAdmin` from ViewerContext, while `useMyParlayPick` reads
 * `isAuthenticated` from AuthContext to decide whether to issue the query at
 * all. In production those are the same value — ViewerContext derives its own
 * from `useAuth`. Stubbing the root keeps them agreeing here too; stubbing
 * `useViewer` alone would leave the query disabled and quietly test nothing.
 */
const auth = {
  user: { id: 'u1', user_metadata: { name: 'Arya Shah' } },
  isAuthenticated: true,
  isAdmin: false,
  loading: false,
  signIn: vi.fn(),
  signOut: vi.fn()
};

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => auth
}));

const { default: ParlayPickSection } = await import('../ParlayPickSection.jsx');

const WEEK = {
  id: 'pew-1',
  seasonId: 'season-1',
  weekNumber: 3,
  submissionOpensAt: '2026-09-08T08:00:00Z',
  submissionClosesAt: '2026-09-11T00:00:00Z',
  resultsRevealAt: '2026-09-16T00:00:00Z'
};

const OPEN = { status: 'open', message: 'Submissions are open!', timeInfo: '2d remaining' };
const CLOSED = { status: 'closed', message: 'Submissions are closed', timeInfo: '' };
const UPCOMING = { status: 'upcoming', message: 'Not open yet', timeInfo: 'Opens Tuesday' };

beforeEach(() => {
  vi.clearAllMocks();
  parlay.getMyParlayPick.mockResolvedValue(null);
  parlay.getParlayPicksForWeek.mockResolvedValue([]);
  players.searchPlayers.mockResolvedValue([]);
  Object.assign(auth, { isAuthenticated: true, isAdmin: false, user: { id: 'u1', user_metadata: { name: 'Arya Shah' } } });
});

describe('ParlayPickSection', () => {
  it('renders nothing when the week has no pick\'em row', () => {
    const { container } = renderWithProviders(
      <ParlayPickSection pickEmWeek={null} status={{ status: 'no-week' }} weekNumber={3} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('offers no submit before the window opens', async () => {
    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={UPCOMING} weekNumber={3} />
    );

    expect(await screen.findByText(/Weekly TD Parlay/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lock in pick/i })).not.toBeInTheDocument();
    expect(screen.getByText(/not open yet/i)).toBeInTheDocument();
  });

  it('offers no submit once the window has closed', async () => {
    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={CLOSED} weekNumber={3} />
    );

    expect(await screen.findByText(/Weekly TD Parlay/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lock in pick/i })).not.toBeInTheDocument();
  });

  it('asks an anonymous viewer to sign in rather than showing the form', async () => {
    Object.assign(auth, { isAuthenticated: false, user: null });

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    expect(await screen.findByText(/sign in to enter/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('sends a null player id when the name matched nothing', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    const input = await screen.findByRole('combobox');
    await user.type(input, 'Some Rookie');
    await user.click(screen.getByRole('button', { name: /lock in pick/i }));

    await waitFor(() =>
      expect(parlay.submitParlayPick).toHaveBeenCalledWith('pew-1', {
        playerId: null,
        playerName: 'Some Rookie'
      })
    );
  });

  it('sends the matched player id after choosing a suggestion', async () => {
    const user = userEvent.setup();
    players.searchPlayers.mockResolvedValue([
      { id: 'p-jj', name: 'Justin Jefferson', position: 'WR', teamAbbreviation: 'MIN' }
    ]);

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    const input = await screen.findByRole('combobox');
    await user.type(input, 'jeff');

    const option = await screen.findByRole('option', { name: /justin jefferson/i });
    await user.click(option);
    await user.click(screen.getByRole('button', { name: /lock in pick/i }));

    await waitFor(() =>
      expect(parlay.submitParlayPick).toHaveBeenCalledWith('pew-1', {
        playerId: 'p-jj',
        playerName: 'Justin Jefferson'
      })
    );
  });

  it('shows the existing pick locked, with no edit control, once closed', async () => {
    parlay.getMyParlayPick.mockResolvedValue({
      id: 'pick-1',
      playerId: 'p-jj',
      playerNameRaw: 'Justin Jefferson',
      scoredTd: true,
      player: { position: 'WR', teamAbbreviation: 'MIN' }
    });

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={CLOSED} weekNumber={3} />
    );

    expect(await screen.findByText('Justin Jefferson')).toBeInTheDocument();
    expect(screen.getByText(/scored a td/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
  });

  it('lists the league\'s picks once the week is revealed', async () => {
    parlay.getParlayPicksForWeek.mockResolvedValue([
      { id: 'a', userId: 'u1', playerNameRaw: 'Justin Jefferson', scoredTd: true, player: {} },
      { id: 'b', userId: 'u2', playerNameRaw: 'Bijan Robinson', scoredTd: null, player: {} }
    ]);

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={CLOSED} weekNumber={3} />
    );

    expect(await screen.findByText('Bijan Robinson')).toBeInTheDocument();
    expect(screen.getByText(/the league.s picks/i)).toBeInTheDocument();
  });

  it('does not ask for the league\'s picks while the week is open', async () => {
    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    await screen.findByRole('combobox');
    expect(parlay.getParlayPicksForWeek).not.toHaveBeenCalled();
  });
});
