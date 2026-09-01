/**
 * The Results tab, browsing seasons.
 *
 * The behaviour worth pinning is that the tab has a season of its own. It used
 * to render whatever award list its parent handed it and fetch tallies for the
 * active season, so a finished season's charts disappeared the moment a new
 * season went active — with the rows still sitting there, public-read.
 *
 * The second is that the picker only appears when it can do something: with one
 * viewable season a dropdown is a control with a single option.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '../../../test/renderWithProviders.jsx';

const SEASON_2025 = {
  seasonId: 's-2025', year: 2025, name: '2025',
  isActive: false, isCompleted: true,
  votedAwardCount: 2, voteCount: 5, voterCount: 3
};
const SEASON_2026 = {
  seasonId: 's-2026', year: 2026, name: '2026',
  isActive: true, isCompleted: false,
  votedAwardCount: 1, voteCount: 2, voterCount: 2
};

const AWARDS = {
  's-2025': [{ id: 'a1', title: 'Best Manager', category: 'voted' }],
  's-2026': [{ id: 'b1', title: 'Worst Trade', category: 'voted' }]
};
const RESULTS = {
  's-2025': { a1: { 'Humza Khalil': 3, 'Arya Shah': 2 } },
  's-2026': { b1: { 'Rohit Ramki': 2 } }
};

const awards = {
  getBallotSeasons: vi.fn(async () => [SEASON_2026, SEASON_2025]),
  getAwards: vi.fn(async (seasonId) => AWARDS[seasonId] ?? []),
  getAwardResults: vi.fn(async (seasonId) => RESULTS[seasonId] ?? {})
};

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({ awards, seasons: { getActiveSeason: async () => null } })
}));

const { default: AwardsResults } = await import('../AwardsResults.jsx');

beforeEach(() => {
  vi.clearAllMocks();
  awards.getBallotSeasons.mockResolvedValue([SEASON_2026, SEASON_2025]);
});

describe('AwardsResults', () => {
  it('shows a finished season even though the active one has not released', async () => {
    // The case that shipped broken: 2026 is live and unreleased, 2025 is done.
    renderWithProviders(
      <AwardsResults activeSeasonId="s-2026" activeSeasonResultsReleased={false} />
    );

    expect(await screen.findByText('Best Manager')).toBeInTheDocument();
    expect(screen.getByText(/2025 · 3 voters, 5 votes cast/)).toBeInTheDocument();
    expect(awards.getAwards).toHaveBeenCalledWith('s-2025');
  });

  it('hides the picker when only one season is viewable', async () => {
    renderWithProviders(
      <AwardsResults activeSeasonId="s-2026" activeSeasonResultsReleased={false} />
    );

    await screen.findByText('Best Manager');
    expect(screen.queryByLabelText('Season')).not.toBeInTheDocument();
  });

  it('defaults to the active season once its results are released', async () => {
    renderWithProviders(
      <AwardsResults activeSeasonId="s-2026" activeSeasonResultsReleased />
    );

    expect(await screen.findByText('Worst Trade')).toBeInTheDocument();
    expect(screen.getByLabelText('Season')).toBeInTheDocument();
  });

  it('refetches when the viewer picks another season', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AwardsResults activeSeasonId="s-2026" activeSeasonResultsReleased />
    );

    await screen.findByText('Worst Trade');
    await user.click(screen.getByLabelText('Season'));
    await user.click(await screen.findByRole('option', { name: '2025' }));

    expect(await screen.findByText('Best Manager')).toBeInTheDocument();
    await waitFor(() => expect(awards.getAwardResults).toHaveBeenCalledWith('s-2025'));
  });

  it('says so when there is nothing to show', async () => {
    awards.getBallotSeasons.mockResolvedValue([]);

    renderWithProviders(
      <AwardsResults activeSeasonId="s-2026" activeSeasonResultsReleased={false} />
    );

    expect(await screen.findByText('No results to show yet')).toBeInTheDocument();
  });
});
