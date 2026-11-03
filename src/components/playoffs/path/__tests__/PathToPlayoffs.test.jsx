/**
 * The tool as a member uses it. The arithmetic is `playoffPathCalculator`'s and
 * tested there; this pins what the page adds: the URL is the scenario, so a
 * press changes the link and a link restores the press.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

const viewer = { user: null, isAdmin: true, teamOwnerNames: [] };
vi.mock('../../../../contexts/ViewerContext.jsx', () => ({ useViewer: () => viewer }));
vi.mock('../../../../hooks/use-viewer-team.js', () => ({
  useViewerTeam: () => ({ team: { id: 't3' }, isLoading: false })
}));

const { default: PathToPlayoffs } = await import('../PathToPlayoffs.jsx');

const teams = Array.from({ length: 14 }, (_, i) => ({
  id: `t${i + 1}`,
  name: `Team ${i + 1}`,
  owner: `Owner ${i + 1}`,
  divisionId: i % 2 ? 'west' : 'east',
  playoffSeed: i < 6 ? i + 1 : null,
  wins: 7 - Math.floor(i / 2),
  losses: Math.floor(i / 2),
  ties: 0,
  winPercentage: (7 - Math.floor(i / 2)) / 7,
  pointsFor: 900 - i * 5,
  pointsAgainst: 800
}));

function schedule(scoredThrough) {
  const games = [];
  const ring = teams.map((team) => team.id);
  for (let week = 1; week <= 14; week += 1) {
    for (let g = 0; g < 7; g += 1) {
      const scored = week <= scoredThrough;
      games.push({
        id: `w${String(week).padStart(2, '0')}g${g}`,
        week,
        type: 'regular',
        team1Id: ring[g],
        team2Id: ring[13 - g],
        team1Score: scored ? 120 - g : null,
        team2Score: scored ? 100 + g : null
      });
    }
    ring.splice(1, 0, ring.pop());
  }
  return games;
}

const season = (scoredThrough = 7) => ({
  id: 's1',
  year: 2026,
  regular_season_weeks: 14,
  teams,
  schedule: schedule(scoredThrough)
});

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

const DIVISIONS = [{ id: 'east', name: 'East' }, { id: 'west', name: 'West' }];

const renderPath = (entry = '/playoffs?tab=path', props = {}) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <PathToPlayoffs season={season()} standingsRows={teams} divisions={DIVISIONS} {...props} />
      <Search />
    </MemoryRouter>
  );

const search = () => screen.getByTestId('search').textContent;

describe('PathToPlayoffs', () => {
  it('opens on the viewer\'s own team', () => {
    renderPath();
    expect(screen.getByRole('region', { name: 'Team 3 in this scenario' })).toBeInTheDocument();
    expect(screen.getByText('Seed 3 as it stands')).toBeInTheDocument();
  });

  it('opens on the team a link names', () => {
    renderPath('/playoffs?tab=path&team=t9');
    expect(screen.getByRole('region', { name: 'Team 9 in this scenario' })).toBeInTheDocument();
  });

  it('puts a decided game in the URL, and takes it back out on a second press', async () => {
    const user = userEvent.setup();
    renderPath();

    const schedulePanel = screen.getByText('Remaining schedule').closest('[class*="rounded"]');
    const [firstChoice] = within(schedulePanel).getAllByRole('button', { name: /^Team 3/ });

    await user.click(firstChoice);
    expect(search()).toMatch(/s=8[a-g][12]/);
    expect(firstChoice).toHaveAttribute('aria-pressed', 'true');

    await user.click(firstChoice);
    expect(search()).not.toContain('s=');
  });

  it('wins out in one press, and resets', async () => {
    const user = userEvent.setup();
    renderPath();

    await user.click(screen.getByRole('button', { name: 'Win out' }));
    expect(await screen.findByText('7 games decided')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reset/ }));
    expect(search()).not.toContain('s=');
  });

  it('restores a scenario from a shared link', () => {
    renderPath('/playoffs?tab=path&team=t3&s=8a1.9b2');
    expect(screen.getByText('2 games decided')).toBeInTheDocument();
  });

  it('shows the change column only once something is decided', () => {
    renderPath();
    expect(screen.queryByRole('columnheader', { name: /Change/ })).not.toBeInTheDocument();
  });

  it('reads each game as a pairing', () => {
    renderPath();
    const games = screen.getAllByRole('group', { name: /vs .*choose a winner/ });
    expect(within(games[0]).getByText('vs')).toBeInTheDocument();
    expect(within(games[0]).getAllByRole('button', { pressed: false })).toHaveLength(2);
  });

  it('moves the standings table as a game is decided', async () => {
    const user = userEvent.setup();
    renderPath();

    const table = screen.getByRole('table', { name: 'East in this scenario' });
    const before = within(table).getByText('Team 3').closest('tr').textContent;

    await user.click(screen.getByRole('button', { name: 'Win out' }));

    const after = within(screen.getByRole('table', { name: 'East in this scenario' }))
      .getByText('Team 3')
      .closest('tr').textContent;
    expect(after).not.toBe(before);
    expect(after).toContain('12–2');
  });

  it('lets typed points decide a game, and keeps them in the link', async () => {
    const user = userEvent.setup();
    renderPath();

    const [toggle] = screen.getAllByRole('button', { name: /^Points for/ });
    await user.click(toggle);
    const [first] = screen.getAllByRole('textbox', { name: /points, week 8/ });
    await user.type(first, '250');

    expect(search()).toMatch(/s=8[a-g][12]-25000-\d+/);
    expect(screen.getByText('1 game decided')).toBeInTheDocument();
  });

  it('says so when no games are left', () => {
    renderPath('/playoffs?tab=path', { season: season(14) });
    expect(screen.getByText('The regular season is over')).toBeInTheDocument();
  });

  it('waits for the standings', () => {
    renderPath('/playoffs?tab=path', { standingsRows: [] });
    expect(screen.getByText('No standings yet')).toBeInTheDocument();
  });
});
