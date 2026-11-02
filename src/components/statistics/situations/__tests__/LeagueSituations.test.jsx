/**
 * The Statistics tab's season stories. The rules are `utils/recordBook/situations`'s
 * and tested there; this pins what the reader sees and, because the tab is
 * open to signed-out visitors, that no name reaches a viewer who may not read it.
 *
 * A two-team, three-week season: A wins every game, so A takes the 1 seed and
 * B the punishment, each locked in week 2 with one game left.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../../../../test/renderWithProviders.jsx';

const history = { getRecordBookSource: vi.fn(), getFranchisesWithCareerStats: vi.fn() };

vi.mock('../../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({ history })
}));

const { default: LeagueSituations } = await import('../LeagueSituations.jsx');

const game = (week, a, b) => ({
  id: `g${week}`, seasonId: 's1', week, type: 'regular', team1Id: 'ta', team2Id: 'tb', team1Score: a, team2Score: b
});

beforeEach(() => {
  history.getFranchisesWithCareerStats.mockResolvedValue([
    { id: 'f-alpha01', owner_name: 'Owner A', display_name: 'Owner A' },
    { id: 'f-bravo02', owner_name: 'Owner B', display_name: 'Owner B' }
  ]);
  history.getRecordBookSource.mockResolvedValue({
    seasons: [{ id: 's1', year: 2024, isCompleted: true, regularSeasonWeeks: 3 }],
    teams: [
      { id: 'ta', seasonId: 's1', franchiseId: 'f-alpha01', madePlayoffs: true, playoffFinish: 'champion' },
      { id: 'tb', seasonId: 's1', franchiseId: 'f-bravo02', madePlayoffs: false, playoffFinish: 'none' }
    ],
    games: [game(1, 165, 90), game(2, 120, 100), game(3, 130, 110)]
  });
});

const scoped = { user: { id: 'u1', user_metadata: { name: 'Owner A' } }, isAdmin: true, teamOwnerNames: ['Owner A'] };

describe('LeagueSituations', () => {
  it('shows who locked each end and when, with the punishee\'s path', async () => {
    renderWithProviders(<LeagueSituations {...scoped} />);

    expect((await screen.findAllByText('Owner A')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Wk 2 · 2–0, 1 to play/).length).toBeGreaterThan(0);
    expect(screen.getByRole('list', { name: '2024, week by week' })).toHaveTextContent('Week 1: L');
  });

  it('re-reads the starts by their length', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeagueSituations {...scoped} />);

    await screen.findAllByText('Owner A');
    expect(screen.getAllByText('3-0').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('tab', { name: '2 games' }));
    expect(screen.getAllByText('2-0').length).toBeGreaterThan(0);
  });

  it('masks every name for a viewer who may not read the league', async () => {
    renderWithProviders(<LeagueSituations />);

    expect((await screen.findAllByText(/Franchise f-alpha0/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Owner A')).toBeNull();
    expect(document.body).not.toHaveTextContent('Owner B');
  });
});
