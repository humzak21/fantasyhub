/**
 * A season's summary above its standings: its division winners, its 1 seed and
 * its punishment. Every name is the season's own team, so it masks as the
 * standings do.
 *
 * A two-team, three-week season: A wins every game.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within } from '../../../../test/renderWithProviders.jsx';

const history = {
  getSeasonDetail: vi.fn(),
  getRecordBookSource: vi.fn(),
  getDivisionTitleSource: vi.fn()
};

vi.mock('../../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({ history })
}));

const { default: SeasonDetail } = await import('../SeasonDetail.jsx');

const SEASON = { id: 's1', year: 2024, league_size: 2, regular_season_weeks: 3 };

const teamRow = (id, owner, wins, losses) => ({
  id,
  team_id: id,
  owner_name: owner,
  team_name: `${owner}'s team`,
  franchise_id: `f-${id}`,
  franchise: { id: `f-${id}`, owner_name: owner, display_name: owner },
  regular_season_wins: wins,
  regular_season_losses: losses,
  points_for: 100,
  points_against: 90,
  final_rank: wins > losses ? 1 : 2
});

const game = (week, a, b) => ({
  id: `g${week}`, seasonId: 's1', week, type: 'regular', team1Id: 'ta', team2Id: 'tb', team1Score: a, team2Score: b
});

beforeEach(() => {
  history.getSeasonDetail.mockResolvedValue({
    teams: [teamRow('ta', 'Owner A', 3, 0), teamRow('tb', 'Owner B', 0, 3)],
    awards: []
  });
  history.getDivisionTitleSource.mockResolvedValue({
    standings: [
      { team_id: 'ta', team_name: 'A', franchise_id: 'f-ta', season_id: 's1', season_year: 2024, division_id: 'd1', wins: 3, losses: 0, ties: 0, points_for: 100, points_against: 90 }
    ],
    divisions: [{ id: 'd1', name: 'The Kennel' }],
    completedSeasonIds: ['s1']
  });
  history.getRecordBookSource.mockResolvedValue({
    seasons: [{ id: 's1', year: 2024, isCompleted: true, regularSeasonWeeks: 3 }],
    teams: [
      { id: 'ta', seasonId: 's1', franchiseId: 'f-ta' },
      { id: 'tb', seasonId: 's1', franchiseId: 'f-tb' }
    ],
    games: [game(1, 120, 100), game(2, 120, 100), game(3, 120, 100)]
  });
});

const VIEWER = { user: { id: 'u1' }, isAdmin: true, teamOwnerNames: ['Owner A'] };

describe('SeasonDetail', () => {
  it('names the division winner, the 1 seed and the punishment, with their weeks', async () => {
    renderWithProviders(<SeasonDetail season={SEASON} seasonYear={2024} {...VIEWER} />);

    const summary = await screen.findByRole('list', { name: 'How the season was decided' });
    expect(await within(summary).findByText('The Kennel winner')).toBeInTheDocument();
    expect(await within(summary).findByText('1 seed')).toBeInTheDocument();
    expect(within(summary).getByText(/Locked week 2, 2–0 with 1 to play/)).toBeInTheDocument();
    expect(within(summary).getByText('Punishment')).toBeInTheDocument();
    expect(within(summary).getAllByText('Owner B').length).toBe(1);
  });

  it('masks the summary for a viewer who may not read the league', async () => {
    renderWithProviders(<SeasonDetail season={SEASON} seasonYear={2024} />);

    const summary = await screen.findByRole('list', { name: 'How the season was decided' });
    expect(await within(summary).findByText('Division winner')).toBeInTheDocument();
    expect(summary).not.toHaveTextContent('Owner A');
    expect(summary).not.toHaveTextContent('The Kennel');
  });
});
