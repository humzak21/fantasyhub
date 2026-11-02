/**
 * Live, Official and Week N: what the drawer shows, and which it opens on. The
 * real table is rendered, because the rank column and the viewer's row are part
 * of what is being asserted. The arithmetic is in `computeStandings.test.js`.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

let live;
let viewer;
const YEAR = 2026;

vi.mock('../../../contexts/ViewerContext.jsx', () => ({ useViewer: () => viewer }));

vi.mock('../../../../hooks/queries/index.js', () => ({
  useActualWeek: () => 2,
  useSeasonConfig: () => ({ startDate: '2026-09-08', playoffStartWeek: 15 }),
  useLiveWeek: () => ({ data: live }),
  useSeasons: () => ({ data: [] }),
  useSeasonTeams: () => ({ data: [] }),
  useSeasonGames: () => ({ data: [] }),
  useDivisions: () => ({ data: [] }),
  useStandings: () => ({ data: null }),
  useLeagueMutations: () => ({})
}));

const { default: StandingsDrawer } = await import('../StandingsDrawer');

const DIVISIONS = [
  { id: 1, name: 'North' },
  { id: 2, name: 'South' }
];

const team = (id, division_id) => ({ id, name: `Team ${id}`, owner: `Owner ${id}`, division_id });
const TEAMS = [team('a', 1), team('b', 1), team('c', 1), team('d', 2), team('e', 2), team('f', 2)];

const game = (id, week, team1Id, team2Id, team1Score, team2Score) => ({
  id,
  week,
  type: 'regular',
  team1Id,
  team2Id,
  team1Score,
  team2Score
});

const GAMES = [
  game('g1', 1, 'a', 'b', 110, 100),
  game('g2', 1, 'c', 'd', 90, 95),
  game('g3', 1, 'e', 'f', 80, 70),
  game('g4', 2, 'a', 'b', null, null),
  game('g5', 2, 'c', 'd', null, null),
  game('g6', 2, 'e', 'f', null, null)
];

const row = (id, divisionId, divisionRank, wins, losses, seed) => ({
  id,
  teamId: id,
  name: `Team ${id}`,
  owner: `Owner ${id}`,
  divisionId,
  wins,
  losses,
  ties: 0,
  pointsFor: 100,
  pointsAgainst: 90,
  pointDifferential: 10,
  winPercentage: wins / (wins + losses),
  currentStreak: { type: 'none', length: 0 },
  divisionRank,
  isPlayoffSpot: true,
  playoffSeed: seed,
  isBye: seed <= 2,
  isWildcard: seed > 2
});

const OFFICIAL = {
  divisions: [
    { divisionId: 1, teams: [row('a', 1, 1, 1, 0, 1), row('b', 1, 2, 0, 1, 5), row('c', 1, 3, 0, 1, 6)] },
    { divisionId: 2, teams: [row('d', 2, 1, 1, 0, 2), row('e', 2, 2, 1, 0, 3), row('f', 2, 3, 0, 1, 4)] }
  ],
  unassigned: []
};

/** Team b overtakes team a in the week in progress. */
const LIVE_WEEK = {
  live: true,
  refreshedAt: '2026-11-01T19:42:00Z',
  games: {
    g4: { team1: { points: 40 }, team2: { points: 90 } },
    g5: { team1: { points: 0 }, team2: { points: 0 } }
  }
};

const renderDrawer = (props) =>
  render(
    <MemoryRouter>
      <StandingsDrawer
        open
        onOpenChange={vi.fn()}
        seasonId="s1"
        teams={TEAMS}
        divisions={DIVISIONS}
        standings={OFFICIAL}
        games={GAMES}
        currentWeek={2}
        seasonYear={YEAR}
        {...props}
      />
    </MemoryRouter>
  );

const tab = (name) => screen.getByRole('tab', { name });
const north = () => screen.getByRole('heading', { name: 'North' }).parentElement.parentElement;
const namesIn = (scope) => within(scope).getAllByRole('table')[0];

beforeEach(() => {
  live = null;
  viewer = { user: null, isAdmin: true, teamOwnerNames: [] };
});

describe('StandingsDrawer views', () => {
  it('opens on Live while a game is on', () => {
    live = LIVE_WEEK;
    renderDrawer();

    expect(tab('Live')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/^As of /)).toBeInTheDocument();
  });

  it('opens on Official otherwise, even with a snapshot on file', () => {
    live = { ...LIVE_WEEK, live: false };
    renderDrawer();

    expect(tab('Official')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText(/^As of /)).not.toBeInTheDocument();
  });

  it('has no Live option with no week in progress', () => {
    renderDrawer();

    expect(screen.queryByRole('tab', { name: 'Live' })).not.toBeInTheDocument();
    expect(tab('Official')).toBeInTheDocument();
  });

  it('shows the week in progress, and who it has moved', () => {
    live = LIVE_WEEK;
    renderDrawer();

    const table = namesIn(north());
    const [, first] = within(table).getAllByRole('row');

    expect(first).toHaveTextContent('Team b');
    expect(first).toHaveTextContent('Up 1 from the official standings');
    expect(first).toHaveTextContent('1-1-0');
    expect(within(table).getAllByRole('row')[3]).toHaveTextContent('No change from the official standings');
  });

  it('shows no movement on Official, and uses the RPC\'s own rows', async () => {
    live = LIVE_WEEK;
    renderDrawer();

    await userEvent.click(tab('Official'));

    const [, first] = within(namesIn(north())).getAllByRole('row');
    expect(first).toHaveTextContent('Team a');
    expect(first).not.toHaveTextContent('official standings');
  });

  it('offers the scored weeks, and shows the table as it stood', async () => {
    live = LIVE_WEEK;
    renderDrawer();

    await userEvent.click(tab('Week'));

    expect(screen.getByRole('combobox', { name: 'Standings as of week' })).toHaveTextContent('Week 1');
    expect(screen.getByText('After week 1')).toBeInTheDocument();
    const [, first] = within(namesIn(north())).getAllByRole('row');
    expect(first).toHaveTextContent('1-0-0');
  });

  it('marks the viewer\'s row', () => {
    viewer = {
      user: { id: 'u1', user_metadata: { name: 'Owner b' } },
      isAdmin: true,
      teamOwnerNames: TEAMS.map((t) => ({ ownerName: t.owner, teamName: t.name }))
    };
    renderDrawer();

    expect(screen.getAllByRole('row').filter((r) => r.classList.contains('ff-viewer-row'))).toHaveLength(1);
  });

  it('draws the projected bracket under the tables, labelled', () => {
    renderDrawer();

    const bracket = screen.getByRole('region', { name: 'Playoff bracket' });
    expect(within(bracket).getByText('Projected')).toBeInTheDocument();
    expect(within(bracket).getByText('If the season ended today.')).toBeInTheDocument();
    expect(within(bracket).getAllByText('Team a').length).toBeGreaterThan(0);
  });

  it('re-draws it from the view on show', () => {
    live = LIVE_WEEK;
    renderDrawer();

    const bracket = screen.getByRole('region', { name: 'Playoff bracket' });
    expect(within(bracket).getByText('If this week ended now.')).toBeInTheDocument();
  });

  it('has no bracket before seeds existed', () => {
    renderDrawer({ seasonYear: 2025 });
    expect(screen.queryByRole('region', { name: 'Playoff bracket' })).not.toBeInTheDocument();
  });

  it('forgets a choice when it closes, so the next open follows the games', async () => {
    live = LIVE_WEEK;
    const { rerender } = renderDrawer();
    await userEvent.click(tab('Official'));

    await userEvent.click(screen.getByRole('button', { name: 'Close standings drawer' }));
    rerender(
      <MemoryRouter>
        <StandingsDrawer open onOpenChange={vi.fn()} seasonId="s1" teams={TEAMS} divisions={DIVISIONS} standings={OFFICIAL} games={GAMES} currentWeek={2} seasonYear={YEAR} />
      </MemoryRouter>
    );

    expect(tab('Live')).toHaveAttribute('aria-selected', 'true');
  });
});
