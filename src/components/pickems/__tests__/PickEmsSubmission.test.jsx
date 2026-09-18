/**
 * Where "how the league picked" sits on the Make Picks page.
 *
 * The explainer belongs inside the week's card and the row directly under
 * that card, above the TD parlay — the league asked for it there, between the
 * two. The research panel and the parlay have tests of their own and are
 * stubbed here, so this suite is about the page's order and nothing else.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '../../../test/renderWithProviders.jsx';

const pickems = { getAllPicksForWeek: vi.fn(async () => []) };

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    pickems,
    users: { isParlayCommissioner: async () => false, isApprovedMember: async () => true },
    seasons: { getActiveSeason: async () => null }
  })
}));

vi.mock('../MatchupResearchSection', () => ({ default: () => null }));

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

const renderPage = (pickEmWeek) =>
  renderWithProviders(
    <PickEmsSubmission
      season={{ id: 'season-1', year: 2026 }}
      currentWeek={2}
      pickEmWeek={pickEmWeek}
      games={GAMES}
      user={auth.user}
      isApproved
      isAdmin
      onSubmitPicks={vi.fn()}
    />
  );

beforeEach(() => {
  vi.clearAllMocks();
  pickems.getAllPicksForWeek.mockResolvedValue([
    { userId: 'u1', gameId: 'g1', pickedTeamId: 't1', predictedWinnerTeamId: 't1' },
    { userId: 'u2', gameId: 'g1', pickedTeamId: 't2', predictedWinnerTeamId: 't2' }
  ]);
});

describe('PickEmsSubmission', () => {
  it('puts the league\'s split under the week card and above the parlay once picks close', async () => {
    renderPage(week(-48, -1, 72));

    const row = await screen.findByRole('list', { name: 'How the league picked week 2' });
    const note = await screen.findByText('How the league picked');
    const weekCard = screen.getByText("Week 2 Pick'ems").closest('.rounded-xl');
    const parlay = screen.getByRole('region', { name: 'Weekly TD Parlay' });

    // The explainer is inside the week's card; the row is not.
    expect(weekCard).toContainElement(note);
    expect(weekCard).not.toContainElement(row);

    const follows = (a, b) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(weekCard, row)).toBe(true);
    expect(follows(row, parlay)).toBe(true);
  });

  it('shows neither while picks are still open', () => {
    renderPage(week(-48, 24, 72));

    expect(screen.queryByText('How the league picked')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /How the league picked/ })).not.toBeInTheDocument();
    expect(pickems.getAllPicksForWeek).not.toHaveBeenCalled();
  });
});
