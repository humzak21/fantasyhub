/**
 * The franchise profile's week view. The arithmetic is
 * `utils/franchiseWeeks`' and tested there; this pins what the reader does —
 * where it opens, stepping between weeks, and opening a player — and that an
 * opponent's name is masked for a signed-out viewer.
 *
 * Week 1: A 120 – B 90 (A's lineup stored). Week 2: A 95 – C 110. Week 3 is
 * scheduled and unscored, so the view opens on week 2.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, within } from '../../../../../test/renderWithProviders.jsx';

const history = { getSeasonWeekSource: vi.fn(), getPlayerCareer: vi.fn() };
const nflSchedule = { getNflScheduleForSeason: vi.fn() };

vi.mock('../../../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({ history, nflSchedule })
}));

const { default: FranchiseWeekByWeek } = await import('../FranchiseWeekByWeek.jsx');

const game = (week, team1Id, team2Id, team1Score, team2Score) => ({
  id: `g${week}${team1Id}`, week, type: 'regular', team1Id, team2Id, team1Score, team2Score, isBlowout: false, isClose: false
});
const pw = (week, playerId, name, position, slot, started, actualPoints) => ({
  week, teamId: 'tA', playerId, name, position, slot, started, actualPoints, proTeamId: 2, proTeam: 'BUF', statBreakdown: null
});

const SOURCE = {
  season: { id: 's30', year: 2030, nflSeasonYear: 2030, regularSeasonWeeks: 3, playoffWeeks: 0, totalWeeks: 3, isCompleted: false },
  franchises: [
    { id: 'fA', owner_name: 'Owner A', display_name: 'Owner A' },
    { id: 'fB', owner_name: 'Owner B', display_name: 'Owner B' },
    { id: 'fC', owner_name: 'Owner C', display_name: 'Owner C' }
  ],
  teams: [
    { id: 'tA', franchiseId: 'fA', name: 'Team A', owner: 'Owner A' },
    { id: 'tB', franchiseId: 'fB', name: 'Team B', owner: 'Owner B' },
    { id: 'tC', franchiseId: 'fC', name: 'Team C', owner: 'Owner C' }
  ],
  games: [game(1, 'tA', 'tB', 120, 90), game(2, 'tA', 'tC', 95, 110), game(3, 'tA', 'tB', null, null)],
  playerWeeks: [
    pw(1, 'p1', 'Josh Allen', 'QB', 'QB', true, 30),
    pw(1, 'p2', 'Bench Back', 'RB', 'BE', false, 12),
    pw(2, 'p1', 'Josh Allen', 'QB', 'QB', true, 22)
  ],
  lineups: [],
  ranks: [],
  events: []
};

const SEASONS = [{ id: 's30', year: 2030, isCurrent: true }];
const SIGNED_OUT = { user: null, isAdmin: false, teamOwnerNames: [] };
const MEMBER = { user: { email: 'a@example.com', user_metadata: { display_name: 'Owner A' } }, isAdmin: false, teamOwnerNames: ['Owner A', 'Owner B', 'Owner C'] };

beforeEach(() => {
  vi.clearAllMocks();
  history.getSeasonWeekSource.mockResolvedValue(SOURCE);
  history.getPlayerCareer.mockResolvedValue({
    player: { id: 'p1', name: 'Josh Allen', position: 'QB', proTeam: 'BUF' },
    weeks: [
      { seasonId: 's30', year: 2030, week: 1, teamId: 'tA', franchiseId: 'fA', teamName: 'Team A', owner: 'Owner A', started: true, actualPoints: 30 },
      { seasonId: 's30', year: 2030, week: 2, teamId: 'tA', franchiseId: 'fA', teamName: 'Team A', owner: 'Owner A', started: true, actualPoints: 22 }
    ]
  });
  nflSchedule.getNflScheduleForSeason.mockResolvedValue([]);
});

const renderView = (viewer = MEMBER) =>
  renderWithProviders(
    <FranchiseWeekByWeek franchiseId="fA" seasons={SEASONS} seasonId="s30" onSeasonChange={() => {}} viewer={viewer} />
  );

const weekChip = (label) => within(screen.getByRole('group', { name: 'Weeks' })).getByRole('button', { name: new RegExp(`^${label}:`) });

describe('FranchiseWeekByWeek', () => {
  it('opens on the latest played week and reads the season it was given', async () => {
    renderView();
    expect(await screen.findByRole('button', { name: /^Week 2: Lost/ })).toHaveAttribute('aria-pressed', 'true');
    expect(history.getSeasonWeekSource).toHaveBeenCalledWith('s30');
    expect(weekChip('Week 3')).toHaveAccessibleName('Week 3: Not played');
  });

  it('steps between weeks and shows that week’s lineup', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByRole('button', { name: /^Week 2: Lost/ });

    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(weekChip('Week 1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Bench Back/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeDisabled();
  });

  it('opens a player’s sheet with their rank that week', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(await screen.findByRole('button', { name: /^Week 1:/ }));
    await user.click(screen.getByRole('button', { name: /Josh Allen/ }));

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Rank that week')).toBeInTheDocument();
    expect(within(sheet).getByText(/Among players on a league roster/)).toBeInTheDocument();
    expect(await within(sheet).findByText('In this league')).toBeInTheDocument();
    expect(history.getPlayerCareer).toHaveBeenCalledWith('p1');
  });

  it('masks the opponent for a signed-out viewer', async () => {
    renderView(SIGNED_OUT);
    await screen.findByRole('button', { name: /^Week 2: Lost/ });
    expect(screen.queryByText(/Owner C/)).not.toBeInTheDocument();
  });

  it('says so when the franchise had no team that season', async () => {
    renderWithProviders(
      <FranchiseWeekByWeek franchiseId="fZ" seasons={SEASONS} seasonId="s30" onSeasonChange={() => {}} viewer={MEMBER} />
    );
    expect(await screen.findByText('No team in 2030')).toBeInTheDocument();
  });
});
