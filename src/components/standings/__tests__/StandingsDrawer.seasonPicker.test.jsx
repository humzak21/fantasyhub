/**
 * The admin's season picker on the standings drawer.
 *
 * Divisions are per-season rows, and Manage mode is the only place a team is
 * moved between them — so the drawer has to be able to look at a season other
 * than the active one, for the one viewer allowed to change it. Everybody
 * else gets the active season and no control.
 */

import React from 'react';
import { render, screen, within } from '../../../test/renderWithProviders.jsx';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let viewerValue;
const mutateAsync = vi.fn();

vi.mock('../../../contexts/ViewerContext.jsx', () => ({
  ViewerProvider: ({ children }) => children,
  useViewer: () => viewerValue
}));

const SEASONS = [
  { id: 'season-2026', year: 2026, isActive: true, isCompleted: false },
  { id: 'season-2025', year: 2025, isActive: false, isCompleted: true }
];

const hookCalls = { seasonTeams: [], divisions: [], standings: [], mutations: [] };

vi.mock('../../../../hooks/queries/index.js', () => ({
  useSeasons: ({ enabled } = {}) => ({ data: enabled ? SEASONS : undefined }),
  useSeasonTeams: (seasonId) => {
    hookCalls.seasonTeams.push(seasonId);
    return { data: [{ id: 'team-x', name: 'Team X', wins: 1, losses: 0, ties: 0 }], isPending: false };
  },
  useSeasonGames: () => ({ data: [] }),
  useDivisions: (seasonId) => {
    hookCalls.divisions.push(seasonId);
    return { data: [{ id: 51, name: 'Old Division' }], isPending: false };
  },
  useStandings: (seasonId) => {
    hookCalls.standings.push(seasonId);
    return { data: { divisions: [], unassigned: [] }, isPending: false };
  },
  useLeagueMutations: (seasonId) => {
    hookCalls.mutations.push(seasonId);
    const mutation = { mutateAsync };
    return {
      createDivision: mutation,
      renameDivision: mutation,
      deleteDivision: mutation,
      assignTeamToDivision: mutation
    };
  }
}));

vi.mock('../DrawerStandingsTable', () => ({
  default: ({ teams, divisions, seasonYear, currentWeek, onTeamDivisionChange, seasonPicker }) => (
    <div data-testid="standings-table">
      {/* The picker sits in the table's header row, beside Manage. */}
      <div data-testid="header-controls">{seasonPicker}</div>
      <div>Teams: {teams?.length || 0}</div>
      <div>Divisions: {divisions?.length || 0}</div>
      <div>Season: {seasonYear ?? 'none'}</div>
      <div>Week: {currentWeek ?? 'none'}</div>
      <button type="button" onClick={() => onTeamDivisionChange?.('team-x', 51)}>
        Move Team X
      </button>
    </div>
  )
}));

import StandingsDrawer from '../StandingsDrawer';

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  seasonId: 'season-2026',
  teams: [
    { id: '1', name: 'Team 1', wins: 5, losses: 2, ties: 0 },
    { id: '2', name: 'Team 2', wins: 4, losses: 3, ties: 0 }
  ],
  divisions: [{ id: 'div1', name: 'Division 1' }, { id: 'div2', name: 'Division 2' }],
  standings: { divisions: [], unassigned: [] },
  currentWeek: 8,
  seasonYear: 2026,
  loading: false,
  isAuthenticated: true,
  onDivisionRename: vi.fn(),
  onTeamDivisionChange: vi.fn(),
  onCreateDivision: vi.fn()
};

beforeEach(() => {
  mutateAsync.mockReset();
  Object.values(hookCalls).forEach((list) => list.splice(0));
});

describe('StandingsDrawer season picker', () => {
  it('shows no picker to a non-admin, and the active season only', () => {
    viewerValue = { user: { id: 'u1' }, isAdmin: false, teamOwnerNames: [] };
    render(<StandingsDrawer {...baseProps} />);

    expect(screen.queryByLabelText('Season')).not.toBeInTheDocument();
    expect(screen.getByTestId('standings-table')).toHaveTextContent('Season: 2026');
    expect(screen.getByText(/through week 8/i)).toBeInTheDocument();
  });

  it('opens on the active season for the admin, fed by the props', () => {
    viewerValue = { user: { id: 'admin' }, isAdmin: true, teamOwnerNames: [] };
    render(<StandingsDrawer {...baseProps} />);

    // Inline with the table's header controls, not in a header of its own.
    expect(within(screen.getByTestId('header-controls')).getByLabelText('Season')).toBeInTheDocument();
    const table = screen.getByTestId('standings-table');
    expect(table).toHaveTextContent('Teams: 2');
    expect(table).toHaveTextContent('Divisions: 2');
    expect(table).toHaveTextContent('Season: 2026');
    // Nothing season-scoped is fetched until another season is picked.
    expect(hookCalls.seasonTeams).toHaveLength(0);
  });

  it('switches the table to the picked season, with that season\'s own data and mutations', async () => {
    viewerValue = { user: { id: 'admin' }, isAdmin: true, teamOwnerNames: [] };
    const user = userEvent.setup();
    render(<StandingsDrawer {...baseProps} />);

    await user.click(screen.getByLabelText('Season'));
    await user.click(await screen.findByRole('option', { name: '2025' }));

    const table = screen.getByTestId('standings-table');
    expect(table).toHaveTextContent('Season: 2025');
    expect(table).toHaveTextContent('Teams: 1');
    expect(table).toHaveTextContent('Divisions: 1');
    expect(table).toHaveTextContent('Week: none');
    expect(screen.getByText('2025 season · final')).toBeInTheDocument();

    expect(hookCalls.seasonTeams).toContain('season-2025');
    expect(hookCalls.divisions).toContain('season-2025');
    expect(hookCalls.standings).toContain('season-2025');
    expect(hookCalls.mutations).toContain('season-2025');
    expect(hookCalls.mutations).not.toContain('season-2026');

    // A move goes through the picked season's mutation, not the app's
    // active-season handler.
    await user.click(screen.getByRole('button', { name: 'Move Team X' }));
    expect(mutateAsync).toHaveBeenCalledWith({ teamId: 'team-x', divisionId: 51 });
    expect(baseProps.onTeamDivisionChange).not.toHaveBeenCalled();
  });

  it('returns to the prop-fed active season when it is picked again', async () => {
    viewerValue = { user: { id: 'admin' }, isAdmin: true, teamOwnerNames: [] };
    const user = userEvent.setup();
    render(<StandingsDrawer {...baseProps} />);

    await user.click(screen.getByLabelText('Season'));
    await user.click(await screen.findByRole('option', { name: '2025' }));
    expect(screen.getByTestId('standings-table')).toHaveTextContent('Season: 2025');

    await user.click(screen.getByLabelText('Season'));
    await user.click(await screen.findByRole('option', { name: '2026 (active)' }));

    const table = screen.getByTestId('standings-table');
    expect(table).toHaveTextContent('Season: 2026');
    expect(table).toHaveTextContent('Teams: 2');
    expect(screen.getByText(/through week 8/i)).toBeInTheDocument();
  });
});
