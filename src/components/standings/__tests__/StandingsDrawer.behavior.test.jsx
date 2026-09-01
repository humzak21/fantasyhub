import React from 'react';
import { render, screen } from '../../../test/renderWithProviders.jsx';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import StandingsDrawer, { StandingsTrigger } from '../StandingsDrawer';

vi.mock('../DrawerStandingsTable', () => ({
  default: ({ teams, divisions, loading, seasonYear, onDivisionDelete }) => (
    <div data-testid="standings-table">
      <div>Teams: {teams?.length || 0}</div>
      <div>Divisions: {divisions?.length || 0}</div>
      <div>Season: {seasonYear ?? 'none'}</div>
      <div>Delete wired: {onDivisionDelete ? 'yes' : 'no'}</div>
      {loading && <div>Loading…</div>}
    </div>
  ),
}));

// jsdom has no layout engine: assigning window.innerWidth does not re-evaluate
// a single CSS media query, so a test that "simulates a 375px viewport" and then
// asserts the same things it asserts at 1024px is testing nothing. Three such
// tests lived here and passed at every width, including widths where the
// component was visibly broken. Real viewport coverage is the Playwright smoke
// job; what is left here is behaviour, which jsdom can actually observe.
describe('StandingsDrawer', () => {
  const baseProps = {
    teams: [
      { id: '1', name: 'Team 1', wins: 5, losses: 2, ties: 0 },
      { id: '2', name: 'Team 2', wins: 4, losses: 3, ties: 0 },
    ],
    divisions: [{ id: 'div1', name: 'Division 1' }],
    standings: { divisions: [], unassigned: [] },
    currentWeek: 8,
    loading: false,
    isAuthenticated: true,
    onDivisionRename: vi.fn(),
    onTeamDivisionChange: vi.fn(),
    onCreateDivision: vi.fn(),
  };

  it('renders nothing until it is opened', () => {
    render(<StandingsDrawer {...baseProps} open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByTestId('standings-table')).not.toBeInTheDocument();
  });

  it('is a real dialog when open, which the hand-rolled panel never was', () => {
    render(<StandingsDrawer {...baseProps} open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Standings' })).toBeInTheDocument();
    expect(screen.getByTestId('standings-table')).toBeInTheDocument();
  });

  it('says which week it is showing', () => {
    render(<StandingsDrawer {...baseProps} open onOpenChange={vi.fn()} />);
    expect(screen.getByText(/through week 8/i)).toBeInTheDocument();
  });

  it('offers a close control and reports the close upward', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<StandingsDrawer {...baseProps} open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on Escape', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<StandingsDrawer {...baseProps} open onOpenChange={onOpenChange} />);

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('passes its data through to the table', () => {
    render(<StandingsDrawer {...baseProps} open onOpenChange={vi.fn()} />);

    const table = screen.getByTestId('standings-table');
    expect(table).toHaveTextContent('Teams: 2');
    expect(table).toHaveTextContent('Divisions: 1');
  });

  it('passes the season year down, since qualification changed in 2026', () => {
    // Not read from `getSeasonConfig()` inside the table: the drawer renders
    // whichever season it was handed, and the rule is a property of that season.
    render(
      <StandingsDrawer {...baseProps} open onOpenChange={vi.fn()} seasonYear={2026} />
    );
    expect(screen.getByTestId('standings-table')).toHaveTextContent('Season: 2026');
  });

  it('forwards the delete-division handler when one is wired', () => {
    render(
      <StandingsDrawer
        {...baseProps}
        open
        onOpenChange={vi.fn()}
        onDivisionDelete={vi.fn()}
      />
    );
    expect(screen.getByTestId('standings-table')).toHaveTextContent('Delete wired: yes');
  });

  it('forwards the loading state rather than hiding the panel', () => {
    render(<StandingsDrawer {...baseProps} open onOpenChange={vi.fn()} loading />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('opens on an empty league without falling over', () => {
    render(
      <StandingsDrawer
        {...baseProps}
        open
        onOpenChange={vi.fn()}
        teams={[]}
        divisions={[]}
        standings={{ divisions: [], unassigned: [] }}
      />
    );

    const table = screen.getByTestId('standings-table');
    expect(table).toHaveTextContent('Teams: 0');
    expect(table).toHaveTextContent('Divisions: 0');
  });

  it('stays open across a data refresh', () => {
    const { rerender } = render(
      <StandingsDrawer {...baseProps} open onOpenChange={vi.fn()} />
    );
    expect(screen.getByTestId('standings-table')).toHaveTextContent('Teams: 2');

    rerender(
      <StandingsDrawer
        {...baseProps}
        open
        onOpenChange={vi.fn()}
        teams={[...baseProps.teams, { id: '3', name: 'Team 3', wins: 1, losses: 1, ties: 0 }]}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('standings-table')).toHaveTextContent('Teams: 3');
  });
});

describe('StandingsTrigger', () => {
  it('is a labelled button that reports its click', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<StandingsTrigger onClick={onClick} />);

    const trigger = screen.getByRole('button', { name: /open standings/i });
    await user.click(trigger);
    expect(onClick).toHaveBeenCalled();
  });
});
