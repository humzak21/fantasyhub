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

    // Yellow row, no chip: the key above the divisions says what yellow means.
    expect(rowFor('Alpha')).toHaveClass('bg-warning/15');
    expect(rowFor('Foxtrot')).toHaveClass('bg-warning/15');
    expect(within(rowFor('Alpha')).getByText('First-round bye')).toHaveClass('sr-only');
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
      expect(row).toHaveClass('bg-success/10');
      expect(within(row).getByText('Wild card')).toHaveClass('sr-only');
      expect(within(row).getByTitle(`Playoff seed ${seed}`)).toBeInTheDocument();
    }
  });

  it('leaves a fourth-in-division team qualified and a third-in-division team out', () => {
    render(<DrawerStandingsTable {...baseProps} seasonYear={2026} />);

    // Delta is 4th in the stacked division and holds seed 5.
    expect(rowFor('Delta')).toHaveClass('bg-success/10');
    // Hotel is 3rd in the weak division — a qualifier under the old rule only.
    expect(rowFor('Hotel')).not.toHaveClass('bg-success/10');
    expect(rowFor('Hotel')).not.toHaveClass('bg-warning/15');
    expect(within(rowFor('Hotel')).queryByText('Wild card')).not.toBeInTheDocument();
    expect(within(rowFor('Hotel')).queryByText('First-round bye')).not.toBeInTheDocument();
  });

  it('explains the two tints in a key above the first division', () => {
    render(<DrawerStandingsTable {...baseProps} seasonYear={2026} />);

    const key = screen.getByLabelText('Key');
    expect(within(key).getByText('Bye')).toBeInTheDocument();
    expect(within(key).getByText('Wild card')).toBeInTheDocument();
    // Above, not below: the key precedes every division heading in the DOM.
    const firstHeading = screen.getAllByRole('heading', { level: 3 })[0];
    expect(key.compareDocumentPosition(firstHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the seed in its own column after Win %, not on the name', () => {
    render(<DrawerStandingsTable {...baseProps} seasonYear={2026} />);

    const headers = within(screen.getAllByRole('table')[0])
      .getAllByRole('columnheader')
      .map((th) => th.textContent.trim());
    expect(headers.indexOf('Seed')).toBe(headers.indexOf('Win %') + 1);

    const cells = within(rowFor('Alpha')).getAllByRole('cell');
    expect(cells[headers.indexOf('Seed')]).toHaveTextContent('1');
    expect(cells[headers.indexOf('Team')]).not.toHaveTextContent('1');
    // A team outside the bracket has no seed, and says so rather than 0.
    expect(within(rowFor('Hotel')).getByLabelText('No seed')).toBeInTheDocument();
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

    expect(rowFor('Alpha')).toHaveClass('bg-warning/15');
    expect(rowFor('Bravo')).toHaveClass('bg-success/10');
    expect(within(rowFor('Bravo')).getByTitle('Playoff seed 3')).toBeInTheDocument();
  });
});

describe('DrawerStandingsTable, 2025 and earlier', () => {
  it('shows no seeds, byes or key — that season had none of them', () => {
    const { container } = render(<DrawerStandingsTable {...baseProps} seasonYear={2025} />);

    expect(screen.queryByLabelText('Key')).not.toBeInTheDocument();
    expect(screen.queryByText('First-round bye')).not.toBeInTheDocument();
    expect(screen.queryByText('Wild card')).not.toBeInTheDocument();
    expect(container.querySelectorAll('tr.bg-warning\\/15')).toHaveLength(0);
    expect(screen.queryByTitle('Playoff seed 1')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Seed' })).not.toBeInTheDocument();
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
    expect(screen.queryByText('First-round bye')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Key')).not.toBeInTheDocument();
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
