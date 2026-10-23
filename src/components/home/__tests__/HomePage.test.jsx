/**
 * The front door. What is pinned: who gets which shape (directory for a
 * visitor or an unapproved account, the dashboard for a member, nothing at all
 * while either answer is still in flight), that the directory is the nav's own
 * tab list filtered by the nav's own rule, that a member's dashboard is about
 * their team — their opponent, and five ranking rows with them in the middle —
 * and that one widget failing, by a query error or a render crash, leaves its
 * neighbours standing.
 *
 * Layout and breakpoints are not here: jsdom has none. The smoke job measures
 * /home at 375 and 1280.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BarChart3, Calendar, Flame, History, House, Target, Trophy, Users } from 'lucide-react';

import { toSeasonConfig } from '../../../../utils/seasonConfig.js';

let viewer;
let viewerTeam;
let queries;

vi.mock('../../../contexts/ViewerContext.jsx', () => ({ useViewer: () => viewer }));
// The widgets with suites (and hooks) of their own are markers here, so this
// file stays about the page's shapes.
vi.mock('../widgets/PickemsParlayWidget.jsx', () => ({
  default: () => <section aria-label="Pick'ems stub" />
}));
vi.mock('../widgets/RecordsCarousel.jsx', () => ({ default: () => <section aria-label="Records stub" /> }));
vi.mock('../widgets/RecentForm.jsx', () => ({ default: () => <section aria-label="Recent form stub" /> }));
vi.mock('../widgets/TakesWidget.jsx', () => ({ default: () => <section aria-label="Takes stub" /> }));
vi.mock('../../../hooks/use-viewer-team.js', () => ({
  useViewerTeam: () => ({ team: viewerTeam, isLoading: false })
}));
vi.mock('../../../../hooks/queries/index.js', () => ({
  useLeagueData: () => queries.league,
  useSeasonConfig: () => queries.config,
  useActualWeek: () => 7,
  useViewedWeek: () => ({ setViewedWeek: vi.fn() }),
  useRankingsForWeek: () => queries.rankings,
  useLineupsForWeek: () => ({ data: {}, isLoading: false }),
  useNflOpponentMap: () => ({ data: {} }),
  useMatchupHistory: () => ({ data: [], isPending: false, isError: false }),
  useStandings: () => queries.standings(),
  useDivisions: () => queries.divisions
}));

const { default: HomePage } = await import('../HomePage.jsx');

const TEAMS = Array.from({ length: 14 }, (_, i) => ({
  id: `t${i + 1}`,
  name: `Team ${i + 1}`,
  owner: `Owner ${i + 1}`,
  franchiseId: `f${i + 1}`,
  divisionId: i < 7 ? 'd1' : 'd2'
}));

const SEASON = {
  id: 's2026',
  year: 2026,
  name: '2026 Season',
  isCompleted: false,
  teams: TEAMS,
  schedule: [
    { id: 'g1', week: 7, type: 'regular', team1Id: 't7', team2Id: 't3', team1Score: null, team2Score: null },
    { id: 'g2', week: 7, type: 'regular', team1Id: 't1', team2Id: 't2', team1Score: null, team2Score: null }
  ]
};

const RANKINGS = TEAMS.map((team, i) => ({
  ...team,
  teamId: team.id,
  powerRating: 80 - i,
  wins: 6 - Math.floor(i / 3),
  losses: Math.floor(i / 3),
  ties: 0,
  rankChange: 0,
  playoffOdds: 50,
  powerRatingComponents: { luckPercentage: 0.01 }
}));

const TABS = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'rankings', label: 'Rankings', icon: Trophy },
  { id: 'statistics', label: 'Statistics', icon: BarChart3 },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'teams', label: 'Teams', icon: Users },
  { id: 'history', label: 'History', icon: History, customAccess: false },
  { id: 'pickems', label: "Pick'ems", icon: Target, customAccess: false },
  { id: 'takes', label: 'Takes', icon: Flame, customAccess: false }
];
const shouldShowTab = (tab) => tab.customAccess !== false;

const render = () =>
  rtlRender(
    <MemoryRouter initialEntries={['/home']}>
      <HomePage tabs={TABS} shouldShowTab={shouldShowTab} onOpenStandings={() => {}} />
    </MemoryRouter>
  );

const member = (over = {}) => ({
  user: { id: 'u7', user_metadata: { name: 'Owner 7' } },
  isAuthenticated: true,
  isAuthLoading: false,
  isApproved: true,
  isApprovalLoading: false,
  isAdmin: false,
  teamOwnerNames: TEAMS.map((t) => ({ ownerName: t.owner, teamName: t.name })),
  ...over
});

beforeEach(() => {
  viewer = member();
  viewerTeam = TEAMS[6];
  queries = {
    league: { activeSeason: SEASON, isLoading: false },
    config: toSeasonConfig({ id: 's2026', year: 2026, start_date: '2026-09-08', regular_season_weeks: 14, playoff_weeks: 3 }),
    rankings: { data: RANKINGS, isPending: false, isError: false, refetch: vi.fn() },
    standings: () => ({
      data: {
        divisions: [
          { divisionId: 'd1', teams: TEAMS.slice(0, 7) },
          { divisionId: 'd2', teams: TEAMS.slice(7) }
        ]
      },
      isPending: false,
      isError: false
    }),
    divisions: {
      data: [
        { id: 'd1', name: 'East' },
        { id: 'd2', name: 'West' }
      ],
      isPending: false,
      isError: false
    }
  };
});

describe('HomePage — who sees what', () => {
  it('gives a signed-out viewer the directory: the tabs they may open, and a way in', () => {
    viewer = { user: null, isAuthenticated: false, isAuthLoading: false, isApproved: false, isApprovalLoading: false, teamOwnerNames: [] };
    viewerTeam = null;
    render();

    const sections = screen.getByRole('navigation', { name: 'Sections' });
    const links = within(sections).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/rankings',
      '/statistics',
      '/schedule',
      '/teams'
    ]);
    expect(screen.getByText(/league members, sign in/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /your matchup/i })).not.toBeInTheDocument();
  });

  it('gives an account awaiting approval the directory without the sign-in line', () => {
    viewer = member({ isApproved: false, teamOwnerNames: [] });
    viewerTeam = null;
    render();

    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeInTheDocument();
    expect(screen.queryByText(/league members, sign in/i)).not.toBeInTheDocument();
  });

  it('draws neither shape while the approval is still unknown', () => {
    viewer = member({ isApproved: false, isApprovalLoading: true });
    render();

    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /your matchup/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });
});

describe('HomePage — a member who owns a team', () => {
  it("shows their matchup against this week's opponent", () => {
    render();

    const hero = screen.getByRole('region', { name: /your matchup/i });
    expect(within(hero).getByText('Team 7')).toBeInTheDocument();
    expect(within(hero).getByText('Team 3')).toBeInTheDocument();
    expect(within(hero).getByText(/week 7/i)).toBeInTheDocument();
    expect(within(hero).getByRole('button', { name: 'Head to head' })).toBeInTheDocument();
    expect(within(hero).getByRole('button', { name: 'Rosters' })).toBeInTheDocument();
  });

  it('shows five ranking rows with them in the middle', () => {
    render();

    const table = within(screen.getByRole('region', { name: /power rankings/i })).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['5', '6', '7', '8', '9']);
    expect(rows[2]).toHaveClass('ff-viewer-row');
  });

  it('reads "Clinched" and "Out" for the two certain odds', () => {
    queries.rankings.data = RANKINGS.map((row, i) => ({ ...row, playoffOdds: i === 4 ? 100 : i === 8 ? 0 : 50 }));
    render();

    const table = within(screen.getByRole('region', { name: /power rankings/i })).getByRole('table');
    expect(within(table).getByText('Clinched')).toBeInTheDocument();
    expect(within(table).getByText('Out')).toBeInTheDocument();
  });

  it('shows the division tables', () => {
    render();

    const standings = screen.getByRole('region', { name: /standings/i });
    expect(within(standings).getAllByRole('table')).toHaveLength(2);
    expect(within(standings).getByRole('button', { name: /full standings/i })).toBeInTheDocument();
  });
});

describe('HomePage — a member with no team', () => {
  it("shows the week's scoreboard and the top five", () => {
    viewerTeam = null;
    render();

    const board = screen.getByRole('region', { name: /this week/i });
    expect(within(board).getByText('Team 1')).toBeInTheDocument();
    expect(within(board).getByText('Team 2')).toBeInTheDocument();

    const table = within(screen.getByRole('region', { name: /power rankings/i })).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('HomePage — one widget failing', () => {
  it('a query error is that widget’s error card; the others render', () => {
    queries.rankings = { data: undefined, isPending: false, isError: true, refetch: vi.fn() };
    render();

    const rankings = screen.getByRole('region', { name: /power rankings/i });
    expect(within(rankings).getByRole('alert')).toHaveTextContent(/couldn't load power rankings/i);
    expect(within(rankings).getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^standings/i })).toBeInTheDocument();
  });

  it('a render crash is caught at the widget, not the page', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    queries.standings = () => {
      throw new Error('boom');
    };
    render();

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load standings/i);
    expect(screen.getByRole('region', { name: /power rankings/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /your matchup/i })).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    spy.mockRestore();
  });
});
