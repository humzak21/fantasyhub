/**
 * The tourney winners line. What must not break: it waits for the tourney's
 * last week to be scored, it names the winner by the floor, and it reads the
 * label the league asked for.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '../../../test/renderWithProviders.jsx';

const pickems = { getAllSeasonPicks: vi.fn(async () => []) };

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    pickems,
    users: {
      isParlayCommissioner: async () => false,
      isApprovedMember: async () => true,
      isLeagueAdmin: async () => true
    },
    seasons: { getActiveSeason: async () => null }
  })
}));

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({
    user: { id: 'u1', user_metadata: { name: 'Arya Shah' } },
    isAuthenticated: true,
    isAdmin: true,
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn()
  })
}));

const { default: TourneyWinners } = await import('../TourneyWinners.jsx');

const correctPicks = (userId, displayName, fromWeek, toWeek, perWeek = 1) =>
  Array.from({ length: toWeek - fromWeek + 1 }, (_, i) =>
    Array.from({ length: perWeek }, () => ({
      userId,
      displayName,
      weekNumber: fromWeek + i,
      gameCompleted: true,
      isCorrect: true,
      pointsEarned: 1
    }))
  ).flat();

beforeEach(() => vi.clearAllMocks());

describe('TourneyWinners', () => {
  it('names the weeks 1-8 winner once week 8 is scored', async () => {
    pickems.getAllSeasonPicks.mockResolvedValue([
      ...correctPicks('u2', 'Rohit Ramki', 1, 8, 3),
      ...correctPicks('u3', 'Humza Khalil', 1, 8, 2),
      // Higher total, but only four weeks entered: under the floor.
      ...correctPicks('u4', 'Sai Kumar', 1, 4, 7)
    ]);

    renderWithProviders(<TourneyWinners seasonId="s1" viewedWeek={9} finishedWeek={8} />);

    const strip = await screen.findByLabelText("Week 1-8 pick'em tournament winner");
    expect(strip).toHaveTextContent('Week 1-8 Tournament Winner:');
    expect(strip).toHaveTextContent('Rohit Ramki');
    expect(strip).toHaveTextContent('24 pts');
    expect(strip).not.toHaveTextContent('Sai Kumar');
  });

  it.each([
    ['before week 8 is scored', 9, 7],
    ['after week 9', 10, 9]
  ])('shows nothing and fetches nothing %s', (_, viewedWeek, finishedWeek) => {
    const { container } = renderWithProviders(
      <TourneyWinners seasonId="s1" viewedWeek={viewedWeek} finishedWeek={finishedWeek} />
    );

    expect(container).toBeEmptyDOMElement();
    expect(pickems.getAllSeasonPicks).not.toHaveBeenCalled();
  });
});
