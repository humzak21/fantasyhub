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

import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BarChart3, Calendar, Flame, History, House, Target, Users } from 'lucide-react';

import { toSeasonConfig } from '../../../../utils/seasonConfig.js';

let viewer;
let viewerTeam;
let queries;
let live;

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
  useLineupsForWeek: () => queries.lineups,
  useNflOpponentMap: () => ({ data: {} }),
  useMatchupHistory: () => ({ data: [], isPending: false, isError: false }),
  useStandings: () => queries.standings(),
  useDivisions: () => queries.divisions,
  useLiveWeek: () => ({ data: live })
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
  { id: 'rankings', label: 'Statistics', icon: BarChart3 },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'teams', label: 'Teams', icon: Users },
  { id: 'history', label: 'History', icon: History, customAccess: false },
  { id: 'pickems', label: "Pick'ems", icon: Target, customAccess: false },
  { id: 'playoffs', label: 'Playoffs', icon: Target, customAccess: false },
  { id: 'takes', label: 'Takes', icon: Flame, customAccess: false }
];
let openableTabs;
const shouldShowTab = (tab) => tab.customAccess !== false || openableTabs.includes(tab.id);

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
  openableTabs = [];
  live = null;
  viewer = member();
  viewerTeam = TEAMS[6];
  queries = {
    league: { activeSeason: SEASON, isLoading: false },
    config: toSeasonConfig({ id: 's2026', year: 2026, start_date: '2026-09-08', regular_season_weeks: 14, playoff_weeks: 3 }),
    rankings: { data: RANKINGS, isPending: false, isError: false, refetch: vi.fn() },
    lineups: { data: {}, isLoading: false },
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

  it('shows every team in the ranking, with their row marked to centre on', () => {
    render();

    const table = within(screen.getByRole('region', { name: 'Power Rankings table' })).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(14);
    expect(rows[6]).toHaveAttribute('data-viewer', 'true');
    expect(within(rows[6]).getAllByRole('cell')[0]).toHaveTextContent('7');
    expect(within(table).getByRole('columnheader', { name: 'Playoff%' })).toBeInTheDocument();
  });

  it('reads "Clinched" and "Out" for the two certain odds', () => {
    queries.rankings.data = RANKINGS.map((row, i) => ({ ...row, playoffOdds: i === 4 ? 100 : i === 8 ? 0 : 50 }));
    render();

    const table = within(screen.getByRole('region', { name: 'Power Rankings table' })).getByRole('table');
    expect(within(table).getByText('Clinched')).toBeInTheDocument();
    expect(within(table).getByText('Out')).toBeInTheDocument();
  });

  it('shows the division tables, every column of them', () => {
    render();

    const standings = screen.getByRole('region', { name: /^standings$/i });
    const tables = within(standings).getAllByRole('table');
    expect(tables).toHaveLength(2);
    for (const label of ['W-L', 'PF', 'PA', 'Diff', 'Win%', 'Streak']) {
      expect(within(tables[0]).getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
    expect(within(standings).getByRole('button', { name: /full standings/i })).toBeInTheDocument();
    expect(within(standings).queryByRole('link', { name: 'Path to the Playoffs' })).not.toBeInTheDocument();
  });
});

describe('HomePage — a game under way', () => {
  const starter = (overrides) => ({ started: true, rosterSlot: 'RB', projectedPoints: 20, ...overrides });

  const liveLineups = {
    isLoading: false,
    data: {
      t7: [
        starter({ actualPoints: 18.5, nflState: 'final' }),
        starter({ actualPoints: 5, nflState: 'in_progress' }),
        starter({ actualPoints: null, nflState: 'not_started' })
      ],
      t3: [starter({ actualPoints: 10, nflState: 'final' }), starter({ actualPoints: null, nflState: 'final' })]
    },
    live: {
      refreshedAt: '2026-11-01T19:42:00Z',
      games: {
        g1: { team1: { points: 23.5, projected: 118.2 }, team2: { points: 10, projected: 96.4 } }
      }
    }
  };

  const scored = (game) => ({ ...SEASON, schedule: [game, ...SEASON.schedule.slice(1)] });

  // The score counts up over 600ms, which a parallel run can stretch past a
  // findBy's timeout. Reduced motion puts the final figure on the first paint.
  const matchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = (query) => ({ ...matchMedia(query), matches: query.includes('reduced-motion') });
  });
  afterEach(() => {
    window.matchMedia = matchMedia;
  });

  it('offers Path to the Playoffs from the standings, on the viewer\'s team', () => {
    openableTabs = ['playoffs'];
    render();
    const standings = screen.getByRole('region', { name: /^standings$/i });
    const link = within(standings).getByRole('link', { name: 'Path to the Playoffs' });
    expect(link.getAttribute('href')).toContain(`/playoffs?tab=path&team=${viewerTeam.id}`);
  });

  it('shows the score so far as live, not as a projection or a result', () => {
    queries.lineups = liveLineups;
    render();

    const hero = screen.getByRole('region', { name: /your matchup/i });
    expect(within(hero).getByText('23.5')).toBeInTheDocument();
    expect(within(hero).getByText('live')).toBeInTheDocument();
    expect(within(hero).queryByText('proj')).not.toBeInTheDocument();
    expect(within(hero).getByText('In progress')).toBeInTheDocument();
    expect(within(hero).getByText('You lead by 13.5')).toBeInTheDocument();
    expect(within(hero).getByText(/^as of /)).toBeInTheDocument();
    expect(within(hero).getByText('1 yet to play · proj 118.2')).toBeInTheDocument();
  });

  it('gives way to an imported score', () => {
    queries.lineups = liveLineups;
    queries.league = {
      ...queries.league,
      activeSeason: scored({ ...SEASON.schedule[0], team1Score: 121.2, team2Score: 99.4, isCompleted: true })
    };
    render();

    const hero = screen.getByRole('region', { name: /your matchup/i });
    expect(within(hero).getByText('121.2')).toBeInTheDocument();
    expect(within(hero).queryByText('live')).not.toBeInTheDocument();
    expect(within(hero).queryByText(/yet to play/)).not.toBeInTheDocument();
    expect(within(hero).getByText('Won by 21.80')).toBeInTheDocument();
  });
});

describe('HomePage — the standings read Live or Official', () => {
  /** The RPC's rows, ranked in id order, so a live upset has a place to move from. */
  const ranked = (rows) => rows.map((team, i) => ({ ...team, divisionRank: i + 1 }));
  /** Team 2 is beating Team 1 in the week in progress. */
  const LIVE_WEEK = {
    live: true,
    refreshedAt: '2026-11-01T19:42:00Z',
    games: { g2: { team1: { points: 40 }, team2: { points: 90 } } }
  };
  const east = () => {
    const standings = screen.getByRole('region', { name: /^standings$/i });
    return within(standings).getAllByRole('table')[0];
  };

  beforeEach(() => {
    queries.standings = () => ({
      data: {
        divisions: [
          { divisionId: 'd1', teams: ranked(TEAMS.slice(0, 7)) },
          { divisionId: 'd2', teams: ranked(TEAMS.slice(7)) }
        ]
      },
      isPending: false,
      isError: false
    });
  });

  it('offers no toggle with no week in progress, and shows the RPC\'s rows', () => {
    render();

    const standings = screen.getByRole('region', { name: /^standings$/i });
    expect(within(standings).queryByRole('tab', { name: 'Live' })).not.toBeInTheDocument();
    expect(within(standings).queryByRole('tab', { name: 'Official' })).not.toBeInTheDocument();
    const [, first] = within(east()).getAllByRole('row');
    expect(first).toHaveTextContent('Team 1');
  });

  it('opens on Live while a game is on, and marks who it has moved', () => {
    live = LIVE_WEEK;
    render();

    const standings = screen.getByRole('region', { name: /^standings$/i });
    expect(within(standings).getByRole('tab', { name: 'Live' })).toHaveAttribute('aria-selected', 'true');
    expect(within(standings).queryByRole('tab', { name: 'Week' })).not.toBeInTheDocument();
    expect(within(standings).getByText(/^As of /)).toBeInTheDocument();

    const [, first] = within(east()).getAllByRole('row');
    expect(first).toHaveTextContent('Team 2');
    expect(first).toHaveTextContent('Up 1 from the official standings');
    expect(first).toHaveTextContent('1–0');
  });

  it('opens on Official without a game on, and Official is the RPC\'s own rows', async () => {
    live = LIVE_WEEK;
    render();

    const standings = screen.getByRole('region', { name: /^standings$/i });
    await userEvent.click(within(standings).getByRole('tab', { name: 'Official' }));

    expect(within(standings).queryByText(/^As of /)).not.toBeInTheDocument();
    const [, first] = within(east()).getAllByRole('row');
    expect(first).toHaveTextContent('Team 1');
    expect(first).not.toHaveTextContent('official standings');
  });

  it('defaults to Official once the games are done, with Live still on offer', () => {
    live = { ...LIVE_WEEK, live: false };
    render();

    const standings = screen.getByRole('region', { name: /^standings$/i });
    expect(within(standings).getByRole('tab', { name: 'Official' })).toHaveAttribute('aria-selected', 'true');
    expect(within(standings).getByRole('tab', { name: 'Live' })).toBeInTheDocument();
  });
});

describe('HomePage — a member with no team', () => {
  it("shows the week's scoreboard and the ranking from the top", () => {
    viewerTeam = null;
    render();

    const board = screen.getByRole('region', { name: /this week/i });
    expect(within(board).getByText('Team 1')).toBeInTheDocument();
    expect(within(board).getByText('Team 2')).toBeInTheDocument();

    const table = within(screen.getByRole('region', { name: 'Power Rankings table' })).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[0]).getAllByRole('cell')[0]).toHaveTextContent('1');
    expect(rows.some((row) => row.getAttribute('data-viewer') === 'true')).toBe(false);
  });
});

describe('HomePage — one widget failing', () => {
  it('a query error is that widget’s error card; the others render', () => {
    queries.rankings = { data: undefined, isPending: false, isError: true, refetch: vi.fn() };
    render();

    const rankings = screen.getByRole('region', { name: /^power rankings$/i });
    expect(within(rankings).getByRole('alert')).toHaveTextContent(/couldn't load power rankings/i);
    expect(within(rankings).getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^standings$/i })).toBeInTheDocument();
  });

  it('a render crash is caught at the widget, not the page', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    queries.standings = () => {
      throw new Error('boom');
    };
    render();

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load standings/i);
    expect(screen.getByRole('region', { name: /^power rankings$/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /your matchup/i })).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    spy.mockRestore();
  });
});
