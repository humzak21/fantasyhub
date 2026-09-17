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
 *   * The Hell Nah control is absent on your own take, and on any take with no
 *     wager. RLS refuses both, so a button offering either can only ever
 *     produce an error — and a take with nothing staked has no side to take.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, within } from '../../../test/renderWithProviders.jsx';

const takes = { getTakesForSeason: vi.fn(), addFade: vi.fn() };

// The approval answer, per test. The board is members-only and "member" means
// approved: a signed-in account the admin has not approved yet must read as a
// visitor here, with copy that says so.
let approved = true;

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    takes,
    users: { isParlayCommissioner: async () => false, isApprovedMember: async () => approved },
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

/**
 * Board fixtures are dated relative to the run, not pinned.
 *
 * The Hell Nah window closes 72 hours after a take was last edited, so a fixed
 * `createdAt` makes these tests pass until three days after they were written
 * and then fail forever — which is exactly what happened to the original board
 * when the window shipped. Anything asserting on the control's presence has to
 * say which side of the deadline it means.
 */
const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const BOARD = {
  takes: [
    {
      id: 'late',
      userId: AUTHOR,
      body: 'Somebody wins it from the 6 seed',
      targetType: 'end_of_season',
      targetWeek: null,
      status: 'pending',
      wager: '$20',
      createdAt: hoursAgo(2),
      takeParticipants: []
    },
    {
      id: 'early',
      userId: AUTHOR,
      body: 'Nobody goes 14-0',
      targetType: 'week',
      targetWeek: 3,
      status: 'correct',
      wager: '40 FAAB',
      createdAt: hoursAgo(3),
      resolvedAt: hoursAgo(1),
      takeParticipants: [{ id: 'p1', userId: READER, createdAt: hoursAgo(2) }]
    }
  ],
  displayNames: { [AUTHOR]: 'Humza Khalil', [READER]: 'Arya Shah' }
};

const renderTab = () =>
  renderWithProviders(<TakesManager season={SEASON} loading={false} />);

beforeEach(() => {
  vi.clearAllMocks();
  takes.getTakesForSeason.mockResolvedValue(BOARD);
  takes.addFade.mockResolvedValue({ id: 'new-fade' });
  auth = { user: null, isAuthenticated: false, isAdmin: false, loading: false };
  // Both the "seen" mark and the confirmation opt-out live here, and both are
  // keyed per user — a test that inherited either would be testing the
  // previous test's state.
  localStorage.clear();
});

/** The signed-in, approved member who is not the author of anything. */
const signInAsReader = () => {
  auth = {
    user: { id: READER, user_metadata: { name: 'Arya Shah' } },
    isAuthenticated: true,
    isAdmin: false,
    loading: false
  };
};

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

  it('shows the hell nah count without offering the control', async () => {
    renderTab();
    await screen.findByText('Nobody goes 14-0');

    expect(screen.getByText(/1 hell nah/)).toBeInTheDocument();
    // Anchored: the card wrapper is itself `role="button"`, so its accessible
    // name is the whole card's text and an unanchored /hell nah/ matches it.
    expect(screen.queryByRole('button', { name: /^hell nah$/i })).not.toBeInTheDocument();
  });

  it('states what a Hell Nah costs wherever a wager is shown', async () => {
    renderTab();
    await screen.findByText('Nobody goes 14-0');

    // The terms are not decoration: the button is a financial commitment, and
    // it must not be possible to press one without the price beside it.
    expect(screen.getAllByText(/if this take hits, you owe \$20/i).length).toBeGreaterThan(0);
  });

  it('renders the grade the admin gave', async () => {
    renderTab();
    await screen.findByText('Nobody goes 14-0');

    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});

describe('TakesManager, signed in', () => {
  beforeEach(() => {
    approved = true;
  });

  it('offers the composer', async () => {
    signInAsReader();

    renderTab();
    await screen.findByText('Nobody goes 14-0');

    expect(screen.getByRole('button', { name: /post a take/i })).toBeInTheDocument();
    expect(screen.queryByText('Sign in to post a take.')).not.toBeInTheDocument();
  });

  it('tells an unapproved account it is waiting, rather than asking it to sign in', async () => {
    approved = false;
    auth = {
      user: { id: READER, user_metadata: { name: 'Arya Shah' } },
      isAuthenticated: true,
      isAdmin: false,
      loading: false
    };

    renderTab();
    await screen.findByText('Nobody goes 14-0');

    expect(await screen.findByText('Your account is awaiting approval.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /post a take/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Sign in to post a take.')).not.toBeInTheDocument();
  });

  it('hides the Hell Nah on the viewer\'s own takes', async () => {
    // Both takes here belong to AUTHOR, and RLS refuses fading your own — so a
    // button on either could only ever produce an error toast.
    auth = {
      user: { id: AUTHOR, user_metadata: { name: 'Humza Khalil' } },
      isAuthenticated: true,
      isAdmin: false,
      loading: false
    };

    renderTab();
    await screen.findByText('Nobody goes 14-0');

    expect(screen.queryByRole('button', { name: /^hell nah$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hell nah'd/i })).not.toBeInTheDocument();
  });

  it('offers a Hell Nah on somebody else\'s ungraded, staked take', async () => {
    auth = {
      user: { id: READER, user_metadata: { name: 'Arya Shah' } },
      isAuthenticated: true,
      isAdmin: false,
      loading: false
    };

    renderTab();
    await screen.findByText('Nobody goes 14-0');

    // 'late' is ungraded, staked and not theirs → fadeable.
    expect(screen.getByRole('button', { name: /^hell nah$/i })).toBeInTheDocument();
    // 'early' is graded → frozen, so no control at all despite their fade.
    expect(screen.queryByRole('button', { name: /hell nah'd/i })).not.toBeInTheDocument();
  });

  it('offers nothing to fade on a take with no wager', async () => {
    // The rule the migration added to `take_participants insert own`: nothing
    // staked, no side to take. Not a disabled button and not a "0 hell nahs" —
    // the whole affordance is absent.
    takes.getTakesForSeason.mockResolvedValue({
      takes: [{ ...BOARD.takes[0], id: 'bare', wager: null, takeParticipants: [] }],
      displayNames: BOARD.displayNames
    });
    auth = {
      user: { id: READER, user_metadata: { name: 'Arya Shah' } },
      isAuthenticated: true,
      isAdmin: false,
      loading: false
    };

    renderTab();
    await screen.findByText('Somebody wins it from the 6 seed');

    // Scoped to the card: the page description explains the Hell Nah window
    // to everybody, so an unscoped /hell nah/ now matches the header.
    const card = screen.getByText('Somebody wins it from the 6 seed').closest('[role="button"]');
    expect(screen.queryByRole('button', { name: /^hell nah$/i })).not.toBeInTheDocument();
    expect(within(card).queryByText(/hell nah/i)).not.toBeInTheDocument();
    expect(within(card).queryByText(/the bet/i)).not.toBeInTheDocument();
  });
});

describe('TakesManager, the Hell Nah window', () => {
  // Three days after the take was last edited, both halves shut: nobody new
  // can fade it and nobody already on it can step off. Those are RLS policies
  // — `take_participants insert own` and `take_participants withdraw own` —
  // and these assertions are about the UI not offering a button the database
  // is going to refuse.

  const oldTake = (overrides = {}) => ({
    ...BOARD.takes[0],
    id: 'stale',
    createdAt: hoursAgo(80),
    ...overrides
  });

  beforeEach(() => {
    approved = true;
    signInAsReader();
  });

  it('withdraws the control once the window has closed', async () => {
    takes.getTakesForSeason.mockResolvedValue({
      takes: [oldTake()],
      displayNames: BOARD.displayNames
    });

    renderTab();
    await screen.findByText('Somebody wins it from the 6 seed');

    expect(screen.queryByRole('button', { name: /^hell nah$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/^Hell Nahs closed /)).toBeInTheDocument();
  });

  it('gives the window back when the take is edited', async () => {
    // `edited_at`, not `created_at`: the take people are fading is the
    // reworded one, so everybody gets three days on the new wording.
    takes.getTakesForSeason.mockResolvedValue({
      takes: [oldTake({ editedAt: hoursAgo(1) })],
      displayNames: BOARD.displayNames
    });

    renderTab();
    await screen.findByText('Somebody wins it from the 6 seed');

    expect(screen.getByRole('button', { name: /^hell nah$/i })).toBeInTheDocument();
    expect(screen.getByText(/^Hell Nahs close /)).toBeInTheDocument();
  });

  it('keeps a fade visible but unwithdrawable after the window', async () => {
    // The state survives the control. This is the one place a member checks
    // whether they are on the hook for a take, and the answer does not change
    // just because they can no longer act on it.
    takes.getTakesForSeason.mockResolvedValue({
      takes: [
        oldTake({ takeParticipants: [{ id: 'p9', userId: READER, createdAt: hoursAgo(79) }] })
      ],
      displayNames: BOARD.displayNames
    });

    renderTab();
    await screen.findByText('Somebody wins it from the 6 seed');

    // The state stays and the control goes. `queryByRole('button')` cannot say
    // that here — the card itself is a `role="button"`, so its accessible name
    // carries every word inside it — so this asserts on the element.
    const chip = screen.getByText(/hell nah'd/i);
    expect(chip.tagName).toBe('SPAN');
    expect(chip.closest('button')).toBeNull();
    expect(screen.getByText(/^Hell Nahs closed /)).toBeInTheDocument();
  });
});

describe('TakesManager, the Hell Nah confirmation', () => {
  beforeEach(() => {
    approved = true;
    signInAsReader();
  });

  it('confirms before committing the viewer to somebody else\'s wager', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Somebody wins it from the 6 seed');

    await user.click(screen.getByRole('button', { name: /^hell nah$/i }));

    // Nothing is written on the first click — the dialog is the write.
    expect(takes.addFade).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/if this take hits, you owe \$20/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/take it back until/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^hell nah$/i }));

    expect(takes.addFade).toHaveBeenCalledWith({ takeId: 'late', seasonId: 's1' });
  });

  it('confirms the sheet\'s Hell Nah too, not just the card\'s', async () => {
    // Both controls route through `requestFade` in the manager rather than
    // owning a dialog each — otherwise "has this member opted out" would have
    // two answers, and the board renders a dozen cards beside the one sheet.
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Somebody wins it from the 6 seed');

    await user.click(screen.getByText('Somebody wins it from the 6 seed'));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: /^hell nah$/i }));

    expect(takes.addFade).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /^hell nah$/i }));

    expect(takes.addFade).toHaveBeenCalledWith({ takeId: 'late', seasonId: 's1' });
  });

  it('writes nothing when the viewer backs out', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Somebody wins it from the 6 seed');

    await user.click(screen.getByRole('button', { name: /^hell nah$/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    expect(takes.addFade).not.toHaveBeenCalled();
  });

  it('skips the dialog for good once the box is ticked', async () => {
    // Per person, per browser, and a preference rather than a rule: it
    // suppresses the explanation and nothing else. A dialog that cannot be
    // dismissed permanently is one that gets clicked through unread.
    const user = userEvent.setup();
    const { unmount } = renderTab();
    await screen.findByText('Somebody wins it from the 6 seed');

    await user.click(screen.getByRole('button', { name: /^hell nah$/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('checkbox', { name: /don't show this again/i }));
    await user.click(within(dialog).getByRole('button', { name: /^hell nah$/i }));

    expect(takes.addFade).toHaveBeenCalledTimes(1);
    unmount();

    renderTab();
    await screen.findByText('Somebody wins it from the 6 seed');
    await user.click(screen.getByRole('button', { name: /^hell nah$/i }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(takes.addFade).toHaveBeenCalledTimes(2);
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
