/**
 * The History tab, rendered against the data layer it now reads.
 *
 * The empty state is the interesting case. It used to tell the admin to run
 * four scripts by name — `buildFranchiseRegistry.js`, `importHistoricalSeason.js`
 * and two more — every one of which had been deleted in the August 2026
 * refactor. Someone following those instructions would have found nothing to
 * run and no way to add a season. History is now filled by finalizing a season,
 * so that is what the empty state has to say.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '../../../test/renderWithProviders.jsx';

const history = {
  getSeasonsTimeline: vi.fn(),
  getFranchisesWithCareerStats: vi.fn(),
  getChampionships: vi.fn(),
  getSeasonDetail: vi.fn()
};

// Only `getDb` is stubbed: the query layer imports `DbErrorKind` from the same
// module to decide what is worth retrying.
vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    history,
    transactions: { getTransactionLeaderboard: async () => [] }
  })
}));

const { default: LeagueHistoryManager } = await import('../LeagueHistoryManager.jsx');

const FRANCHISE = {
  id: 'f-eshan',
  franchise_id: 'f-eshan',
  owner_name: 'Eshan Kaul',
  display_name: 'Eshan Kaul',
  is_active: true,
  joined_year: 2020,
  total_seasons: 6,
  seasons_played: 6,
  total_wins: 42,
  total_losses: 41,
  total_ties: 0,
  championships: 1,
  total_championships: 1,
  avg_win_percentage: 0.506,
  playoff_appearances: 3,
  avg_points_per_game: 118.2,
  career_points_for: 9800
};

const SEASON = {
  id: 'season-2025',
  year: 2025,
  league_size: 14,
  regular_season_weeks: 14,
  playoff_weeks: 3,
  is_completed: true,
  status: 'archived',
  playoff_results: {
    champion: {
      franchise_id: 'f-eshan',
      franchise: FRANCHISE,
      team_name: 'U dont have 🐎 🍆',
      record: '9-5'
    },
    runner_up: null,
    third_place: null
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  history.getSeasonDetail.mockResolvedValue({ teams: [], awards: [] });
});

describe('LeagueHistoryManager', () => {
  it('shows the finalized seasons and their champions', async () => {
    history.getSeasonsTimeline.mockResolvedValue([SEASON]);
    history.getFranchisesWithCareerStats.mockResolvedValue([FRANCHISE]);
    history.getChampionships.mockResolvedValue([]);

    renderWithProviders(<LeagueHistoryManager />);

    expect(await screen.findByText('2025 Season')).toBeInTheDocument();
    expect(screen.getByText('1 Seasons')).toBeInTheDocument();
    // The podium is masked for a signed-out viewer, which is the default here.
    expect(screen.getByText('9-5')).toBeInTheDocument();
  });

  it('points an empty league at finalizing a season, not at deleted scripts', async () => {
    history.getSeasonsTimeline.mockResolvedValue([]);
    history.getFranchisesWithCareerStats.mockResolvedValue([]);
    history.getChampionships.mockResolvedValue([]);

    renderWithProviders(<LeagueHistoryManager />);

    expect(await screen.findByText(/No league history yet/)).toBeInTheDocument();
    expect(screen.getByText(/finalized in Season Management/)).toBeInTheDocument();
    expect(screen.queryByText(/importHistoricalSeason/)).not.toBeInTheDocument();
  });

  it('reports a failure to load rather than showing an empty league', async () => {
    history.getSeasonsTimeline.mockRejectedValue(new Error('permission denied for view'));
    history.getFranchisesWithCareerStats.mockRejectedValue(new Error('permission denied for view'));
    history.getChampionships.mockResolvedValue([]);

    renderWithProviders(<LeagueHistoryManager />);

    expect(await screen.findByText(/permission denied for view/)).toBeInTheDocument();
  });
});
