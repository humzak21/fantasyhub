/**
 * The Make Picks page, around its cards.
 *
 * The explainer belongs inside the week's card, and the split on each matchup.
 * Every game stays on the page, a finished one locked. Once the window closes a
 * pick is what was submitted, not a draft. The cards' own reads and the parlay
 * have tests of their own and are stubbed here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '../../../test/renderWithProviders.jsx';

const pickems = { getAllPicksForWeek: vi.fn(async () => []) };

// `isAdmin` on the auth fixture is this test's switch. The viewer no longer
// reads it from the session; it asks `is_admin()`, stubbed here to answer it.
vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    pickems,
    users: {
      isParlayCommissioner: async () => false,
      isApprovedMember: async () => true,
      isLeagueAdmin: async () => Boolean(auth.isAdmin)
    },
    seasons: { getActiveSeason: async () => null }
  })
}));

const boardArgs = vi.fn();

vi.mock('../useMatchupBoard.js', () => ({
  useMatchupBoard: (args) => {
    boardArgs(args);
    return { rowsByTeam: {}, live: null, opponents: {}, outlooks: {}, isLoading: false };
  }
}));

vi.mock('../ParlayPickSection', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('section', { 'aria-label': 'Weekly TD Parlay' })
  };
});

const auth = {
  user: { id: 'u1', user_metadata: { name: 'Arya Shah' } },
  isAuthenticated: true,
  isAdmin: true,
  loading: false,
  signIn: vi.fn(),
  signOut: vi.fn()
};

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => auth
}));

const { default: PickEmsSubmission } = await import('../PickEmsSubmission.jsx');

const HOUR = 60 * 60 * 1000;

const week = (opensIn, closesIn, revealsIn) => ({
  id: 'pew-2',
  seasonId: 'season-1',
  weekNumber: 2,
  submissionOpensAt: new Date(Date.now() + opensIn * HOUR).toISOString(),
  submissionClosesAt: new Date(Date.now() + closesIn * HOUR).toISOString(),
  resultsRevealAt: new Date(Date.now() + revealsIn * HOUR).toISOString()
});

const GAMES = [
  {
    id: 'g1',
    isCompleted: false,
    team1Id: 't1',
    team2Id: 't2',
    team1: { id: 't1', name: 'Glizzy Galaxy', owner: 'Aaron Wadhwa' },
    team2: { id: 't2', name: 'i chase brown kids', owner: 'Aashish Gatamaneni' }
  }
];

const renderPage = (pickEmWeek, props = {}) =>
  renderWithProviders(
    <PickEmsSubmission
      season={{ id: 'season-1', year: 2026 }}
      currentWeek={2}
      pickEmWeek={pickEmWeek}
      games={GAMES}
      {...props}
      user={auth.user}
      isApproved
      isAdmin
      onSubmitPicks={vi.fn()}
    />
  );

beforeEach(() => {
  vi.clearAllMocks();
  // Unsubmitted choices are kept as a per-week draft in localStorage
  // (pickDraft.js); one test's typing must not be the next test's form.
  localStorage.clear();
  pickems.getAllPicksForWeek.mockResolvedValue([
    { userId: 'u1', gameId: 'g1', pickedTeamId: 't1', predictedWinnerTeamId: 't1' },
    { userId: 'u2', gameId: 'g1', pickedTeamId: 't2', predictedWinnerTeamId: 't2' }
  ]);
});

describe('PickEmsSubmission', () => {
  it("puts the note in the week's card and the split on the matchup once picks close", async () => {
    renderPage(week(-48, -1, 72));

    const note = await screen.findByText('How the league picked');
    const weekCard = screen.getByText("Week 2 Pick'ems").closest('.rounded-xl');
    const matchup = screen.getByRole('radio', { name: /Glizzy Galaxy/ }).closest('.rounded-xl');

    expect(weekCard).toContainElement(note);
    expect(weekCard).not.toContainElement(matchup);
    await vi.waitFor(() => expect(matchup).toHaveTextContent('50.0%'));
  });

  it('puts the parlay above the matchups, where it is not forgotten', () => {
    renderPage(week(-48, 24, 72));

    const parlay = screen.getByRole('region', { name: 'Weekly TD Parlay' });
    const matchup = screen.getByRole('radio', { name: /Glizzy Galaxy/ });

    expect(parlay.compareDocumentPosition(matchup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows neither while picks are still open', () => {
    renderPage(week(-48, 24, 72));

    expect(screen.queryByText('How the league picked')).not.toBeInTheDocument();
    expect(screen.queryByText("League's picks")).not.toBeInTheDocument();
    expect(pickems.getAllPicksForWeek).not.toHaveBeenCalled();
  });

  it('keeps a finished game on the page, locked, beside one still to pick', () => {
    const games = [
      GAMES[0],
      {
        id: 'g2',
        isCompleted: true,
        winnerTeamId: 't3',
        team1Score: 120,
        team2Score: 100,
        team1Id: 't3',
        team2Id: 't4',
        team1: { id: 't3', name: 'Finished Winners', owner: 'A' },
        team2: { id: 't4', name: 'Finished Losers', owner: 'B' }
      }
    ];
    renderPage(week(-48, 24, 72), { games });

    expect(screen.getByRole('radio', { name: /Finished Winners/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Glizzy Galaxy/ })).toBeEnabled();
  });

  it('reads a draft as a pick while the window is open, and only then', () => {
    localStorage.setItem(
      'pickems:draft:u1:pew-2',
      JSON.stringify({ picks: { g1: 't2' }, savedAt: Date.now() })
    );
    const userPicks = [{ gameId: 'g1', predictedWinnerTeamId: 't1' }];

    renderPage(week(-48, -1, 72), { userPicks });

    expect(boardArgs).toHaveBeenLastCalledWith(expect.objectContaining({ picks: { g1: 't1' } }));
    expect(screen.getByRole('radio', { name: /Glizzy Galaxy/ })).toBeChecked();
  });
});
