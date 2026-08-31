/**
 * The Takes tab.
 *
 * Three things are load-bearing here and none of them are visual:
 *
 *   * The board groups by milestone in **resolve order**, so the next thing to
 *     be settled reads first regardless of when it was posted.
 *   * The signed-out render still works. The shell no longer routes a
 *     signed-out viewer here — `/takes` is gated on `isAuthenticated` — but the
 *     component must not assume that gate: it is what renders during the window
 *     where the session has not resolved yet, and it would be quietly wrong if
 *     the gate ever moved.
 *   * The +1 control is absent on your own take. RLS refuses a self co-sign, so
 *     a button offering one can only ever produce an error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within } from '../../../test/renderWithProviders.jsx';

const takes = { getTakesForSeason: vi.fn() };

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    takes,
    users: { isParlayCommissioner: async () => false },
    seasons: { getActiveSeason: async () => SEASON }
  })
}));

let auth = { user: null, isAuthenticated: false, isAdmin: false, loading: false };

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => auth
}));

const { default: TakesManager } = await import('../TakesManager.jsx');

const SEASON = {
  id: 's1',
  year: 2026,
  start_date: '2026-09-01',
  regular_season_weeks: 14,
  playoff_weeks: 3,
  teams: []
};

const AUTHOR = 'u1';
const READER = 'u2';

const BOARD = {
  takes: [
    {
      id: 'late',
      userId: AUTHOR,
      body: 'Somebody wins it from the 6 seed',
      targetType: 'end_of_season',
      targetWeek: null,
      status: 'pending',
      createdAt: '2026-09-01T12:00:00Z',
      takeParticipants: []
    },
    {
      id: 'early',
      userId: AUTHOR,
      body: 'Nobody goes 14-0',
      targetType: 'week',
      targetWeek: 3,
      status: 'correct',
      createdAt: '2026-09-05T12:00:00Z',
      resolvedAt: '2026-09-20T12:00:00Z',
      takeParticipants: [{ id: 'p1', userId: READER, createdAt: '2026-09-06T12:00:00Z' }]
    }
  ],
  displayNames: { [AUTHOR]: 'Humza Khalil', [READER]: 'Arya Shah' }
};

const renderTab = () =>
  renderWithProviders(<TakesManager season={SEASON} loading={false} />);

beforeEach(() => {
  vi.clearAllMocks();
  takes.getTakesForSeason.mockResolvedValue(BOARD);
  auth = { user: null, isAuthenticated: false, isAdmin: false, loading: false };
});

describe('TakesManager, signed out', () => {
  // Not reachable through the tab any more — see the file header.
  it('shows the board and says what signing in is for', async () => {
    renderTab();

    expect(await screen.findByText('Nobody goes 14-0')).toBeInTheDocument();
    expect(screen.getByText('Somebody wins it from the 6 seed')).toBeInTheDocument();
    expect(screen.getByText('Sign in to post a take.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /post a take/i })).not.toBeInTheDocument();
  });

  it('orders sections by when takes resolve, not by when they were posted', async () => {
    renderTab();
    await screen.findByText('Nobody goes 14-0');

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    // 'late' was posted first but resolves last, so week 3 leads.
    expect(headings).toEqual(['Week 3', 'End of season']);
  });

  it('shows the co-sign count without offering the control', async () => {
    renderTab();
    await screen.findByText('Nobody goes 14-0');

    expect(screen.getByText(/1 co-sign/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\+1/ })).not.toBeInTheDocument();
  });

  it('renders the grade the admin gave', async () => {
    renderTab();
    await screen.findByText('Nobody goes 14-0');

    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});

describe('TakesManager, signed in', () => {
  it('offers the composer', async () => {
    auth = {
      user: { id: READER, user_metadata: { name: 'Arya Shah' } },
      isAuthenticated: true,
      isAdmin: false,
      loading: false
    };

    renderTab();
    await screen.findByText('Nobody goes 14-0');

    expect(screen.getByRole('button', { name: /post a take/i })).toBeInTheDocument();
    expect(screen.queryByText('Sign in to post a take.')).not.toBeInTheDocument();
  });

  it('hides the +1 on the viewer\'s own takes', async () => {
    // Both takes here belong to AUTHOR, and RLS refuses a self co-sign — so a
    // +1 button on either could only ever produce an error toast.
    auth = {
      user: { id: AUTHOR, user_metadata: { name: 'Humza Khalil' } },
      isAuthenticated: true,
      isAdmin: false,
      loading: false
    };

    renderTab();
    await screen.findByText('Nobody goes 14-0');

    expect(screen.queryByRole('button', { name: /^\+1$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /joined/i })).not.toBeInTheDocument();
  });

  it('offers a +1 on somebody else\'s ungraded take, and shows the one already joined', async () => {
    auth = {
      user: { id: READER, user_metadata: { name: 'Arya Shah' } },
      isAuthenticated: true,
      isAdmin: false,
      loading: false
    };

    renderTab();
    await screen.findByText('Nobody goes 14-0');

    // 'late' is ungraded and not theirs → joinable.
    expect(screen.getByRole('button', { name: /^\+1$/ })).toBeInTheDocument();
    // 'early' is graded → frozen, so no control at all despite their co-sign.
    expect(screen.queryByRole('button', { name: /joined/i })).not.toBeInTheDocument();
  });
});

describe('TakesManager, empty board', () => {
  it('invites the reader to be first rather than rendering a blank tab', async () => {
    takes.getTakesForSeason.mockResolvedValue({ takes: [], displayNames: {} });

    renderTab();

    expect(await screen.findByText('No takes yet')).toBeInTheDocument();
  });
});

describe('TakesManager, loading', () => {
  it('keeps the header up and stands in below it', () => {
    renderWithProviders(<TakesManager season={SEASON} loading />);

    // Never `return null`: that renders a blank tab with no way to tell a slow
    // query from a broken one.
    expect(screen.getByRole('heading', { level: 1, name: 'Takes' })).toBeInTheDocument();
    expect(within(screen.getByRole('status')).getByText('Loading')).toBeInTheDocument();
  });
});
