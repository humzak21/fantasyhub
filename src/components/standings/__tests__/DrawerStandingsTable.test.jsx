/**
 * The standings table, in both playoff formats — and its admin controls.
 *
 * `ResponsiveDataTable` renders a card stack and a real table and hides one
 * with CSS, which jsdom does not apply; both are visible to Testing Library.
 * Assertions are scoped to `role="table"` so a match is one match.
 */

import { render, screen, within } from '../../../test/renderWithProviders.jsx';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import DrawerStandingsTable from '../DrawerStandingsTable';

const team = (id, name, divisionId, wins, losses, pointsFor) => ({
  id,
  name,
  owner: `${name} owner`,
  divisionId,
  wins,
  losses,
  ties: 0,
  pointsFor,
  pointsAgainst: 1000,
  pointDifferential: pointsFor - 1000,
  winPercentage: wins / (wins + losses)
});

const divisions = [
  { id: 1, name: 'Assholes' },
  { id: 2, name: 'Ninjas' }
];

/** Division 1 is stacked: under the 2026 rule it sends four of the six. */
const teams = [
  team('a1', 'Alpha', 1, 11, 1, 1500),
  team('a2', 'Bravo', 1, 10, 2, 1450),
  team('a3', 'Charlie', 1, 9, 3, 1400),
  team('a4', 'Delta', 1, 8, 4, 1350),
  team('a5', 'Echo', 1, 2, 10, 900),
  team('b1', 'Foxtrot', 2, 10, 2, 1480),
  team('b2', 'Golf', 2, 5, 7, 1200),
  team('b3', 'Hotel', 2, 4, 8, 1000),
  team('b4', 'India', 2, 3, 9, 950)
];

const baseProps = {
  teams,
  divisions,
  // Empty, so the component takes its client-side fallback path — the one the
  // drawer runs on while the RPC is still in flight.
  standings: { divisions: [], unassigned: [] },
  currentWeek: 13,
  onClose: vi.fn(),
  isAdmin: true
};

/** Every table on the page, merged — the two divisions render one each. */
const rowFor = (name) => {
  const cells = screen
    .getAllByRole('table')
    .flatMap((table) => within(table).queryAllByText(name));
  expect(cells.length).toBeGreaterThan(0);
  return cells[0].closest('tr');
};

describe('DrawerStandingsTable, 2026 and later', () => {
  it('seeds the two division winners and marks them as byes', () => {
    render(<DrawerStandingsTable {...baseProps} seasonYear={2026} />);

    expect(within(rowFor('Alpha')).getByText('Bye')).toBeInTheDocument();
    expect(within(rowFor('Foxtrot')).getByText('Bye')).toBeInTheDocument();
    expect(within(rowFor('Alpha')).getByTitle('Playoff seed 1')).toBeInTheDocument();
    expect(within(rowFor('Foxtrot')).getByTitle('Playoff seed 2')).toBeInTheDocument();
  });

  it('marks the four league-wide wildcards, three of them from one division', () => {
    render(<DrawerStandingsTable {...baseProps} seasonYear={2026} />);

    for (const [name, seed] of [
      ['Bravo', 3],
      ['Charlie', 4],
      ['Delta', 5],
      ['Golf', 6]
    ]) {
      const row = rowFor(name);
      expect(within(row).getByText('WC')).toBeInTheDocument();
      expect(within(row).getByTitle(`Playoff seed ${seed}`)).toBeInTheDocument();
    }
  });

  it('leaves a fourth-in-division team qualified and a third-in-division team out', () => {
    render(<DrawerStandingsTable {...baseProps} seasonYear={2026} />);

    // Delta is 4th in the stacked division and holds seed 5.
    expect(within(rowFor('Delta')).getByText('WC')).toBeInTheDocument();
    // Hotel is 3rd in the weak division — a qualifier under the old rule only.
    expect(within(rowFor('Hotel')).queryByText('WC')).not.toBeInTheDocument();
    expect(within(rowFor('Hotel')).queryByText('Bye')).not.toBeInTheDocument();
  });

  it('still shows division rank, which the seed does not replace', () => {
    render(<DrawerStandingsTable {...baseProps} seasonYear={2026} />);
    const cells = within(rowFor('Delta')).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('4');
  });

  it('renders the seeds the RPC supplied when the standings have arrived', () => {
    render(
      <DrawerStandingsTable
        {...baseProps}
        seasonYear={2026}
        standings={{
          divisions: [
            {
              divisionId: 1,
              divisionName: 'Assholes',
              teams: [
                { ...teams[0], divisionRank: 1, isPlayoffSpot: true, playoffSeed: 1, isBye: true, isWildcard: false },
                { ...teams[1], divisionRank: 2, isPlayoffSpot: true, playoffSeed: 3, isBye: false, isWildcard: true }
              ]
            }
          ],
          unassigned: []
        }}
      />
    );

    expect(within(rowFor('Alpha')).getByText('Bye')).toBeInTheDocument();
    expect(within(rowFor('Bravo')).getByText('WC')).toBeInTheDocument();
    expect(within(rowFor('Bravo')).getByTitle('Playoff seed 3')).toBeInTheDocument();
  });
});

describe('DrawerStandingsTable, 2025 and earlier', () => {
  it('shows no seeds or byes — that season had neither', () => {
    render(<DrawerStandingsTable {...baseProps} seasonYear={2025} />);

    expect(screen.queryByText('Bye')).not.toBeInTheDocument();
    expect(screen.queryByText('WC')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Playoff seed 1')).not.toBeInTheDocument();
  });

  it('qualifies the top three of each division, including the weak one', () => {
    const { container } = render(<DrawerStandingsTable {...baseProps} seasonYear={2025} />);
    const qualifiers = container.querySelectorAll('tr.bg-success\\/10');

    // Six rows tinted: three per division, in a table-per-division layout.
    expect(qualifiers).toHaveLength(6);
    expect(rowFor('Hotel')).toHaveClass('bg-success/10'); // 3rd in the weak division
    expect(rowFor('Delta')).not.toHaveClass('bg-success/10'); // 4th in the strong one
  });

  it('treats a season with no year as a legacy season rather than guessing', () => {
    render(<DrawerStandingsTable {...baseProps} />);
    expect(screen.queryByText('Bye')).not.toBeInTheDocument();
  });
});

describe('DrawerStandingsTable manage mode', () => {
  const manageProps = { ...baseProps, isAuthenticated: true, seasonYear: 2026 };

  const openManage = async (user) => {
    await user.click(screen.getByRole('button', { name: /manage/i }));
  };

  it('prefills each rename dialog with its own division, not the last one opened', async () => {
    const user = userEvent.setup();
    render(<DrawerStandingsTable {...manageProps} onDivisionRename={vi.fn()} />);
    await openManage(user);

    await user.click(screen.getByRole('button', { name: 'Rename Ninjas' }));
    expect(screen.getByLabelText('Division Name')).toHaveValue('Ninjas');
  });

  it('keeps the create dialog empty after a rename dialog has been opened', async () => {
    const user = userEvent.setup();
    const onCreateDivision = vi.fn();
    render(<DrawerStandingsTable {...manageProps} onCreateDivision={onCreateDivision} onDivisionRename={vi.fn()} />);
    await openManage(user);

    // One `newDivisionName` used to back both dialogs, so opening a rename
    // prefilled the create box with that division's name.
    await user.click(screen.getByRole('button', { name: 'Rename Assholes' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /add/i }));

    expect(screen.getByLabelText('Division Name')).toHaveValue('');
  });

  it('renames the division the dialog was opened from', async () => {
    const user = userEvent.setup();
    const onDivisionRename = vi.fn();
    render(<DrawerStandingsTable {...manageProps} onDivisionRename={onDivisionRename} />);
    await openManage(user);

    await user.click(screen.getByRole('button', { name: 'Rename Ninjas' }));
    const input = screen.getByLabelText('Division Name');
    await user.clear(input);
    await user.type(input, 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onDivisionRename).toHaveBeenCalledWith(2, 'Renamed');
  });

  it('deletes a division only after confirming, and says what happens to its teams', async () => {
    const user = userEvent.setup();
    const onDivisionDelete = vi.fn();
    render(<DrawerStandingsTable {...manageProps} onDivisionDelete={onDivisionDelete} />);
    await openManage(user);

    await user.click(screen.getByRole('button', { name: 'Delete Ninjas' }));
    expect(screen.getByText(/4 teams will become unassigned/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDivisionDelete).toHaveBeenCalledWith(2);
  });

  it('offers no delete control when the caller wired no handler', async () => {
    const user = userEvent.setup();
    render(<DrawerStandingsTable {...manageProps} />);
    await openManage(user);

    expect(screen.queryByRole('button', { name: 'Delete Ninjas' })).not.toBeInTheDocument();
  });

  it('shows no management controls at all to a signed-out viewer', () => {
    render(<DrawerStandingsTable {...baseProps} seasonYear={2026} onDivisionDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /manage/i })).not.toBeInTheDocument();
  });
});
