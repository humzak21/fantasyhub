/**
 * The board sorts from its headers. The order itself is `tableSort`'s and
 * tested there; this pins what the page adds: the default order, a rank that
 * stays with its franchise, and `aria-sort` following the cycle.
 */

import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, within } from '../../../../test/renderWithProviders.jsx';

import AllTimeLeaderboards from '../AllTimeLeaderboards.jsx';

const FRANCHISES = [
  { id: 'f1', display_name: 'One', owner_name: 'One', joined_year: 2020 },
  { id: 'f2', display_name: 'Two', owner_name: 'Two', joined_year: 2020 },
  { id: 'f3', display_name: 'Three', owner_name: 'Three', joined_year: 2020 }
];

const CAREERS = [
  { franchise_id: 'f1', championships: 0, avg_win_percentage: 0.4, avg_points_per_game: 120, total_wins: 30, total_losses: 40, playoff_appearances: 5 },
  { franchise_id: 'f2', championships: 2, avg_win_percentage: 0.6, avg_points_per_game: 100, total_wins: 40, total_losses: 30, playoff_appearances: 3 },
  { franchise_id: 'f3', championships: 0, avg_win_percentage: 0.5, avg_points_per_game: 110, total_wins: 35, total_losses: 35, playoff_appearances: 1 }
];

const setup = () => {
  renderWithProviders(
    <AllTimeLeaderboards franchises={FRANCHISES} careerStats={CAREERS} isAdmin teamOwnerNames={['One', 'Two', 'Three']} />
  );
  return within(screen.getByRole('table'));
};

/** The first cell of each body row: the rank, which belongs to the franchise. */
const ranks = (table) =>
  table.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent);

describe('AllTimeLeaderboards', () => {
  it('opens on championships, then win %', () => {
    expect(ranks(setup())).toEqual(['1', '2', '3']);
  });

  it('cycles a header through descending, ascending and back to default', async () => {
    const user = userEvent.setup();
    const table = setup();
    const header = () => table.getByRole('columnheader', { name: /Avg PF/ });
    const press = () => user.click(table.getByRole('button', { name: /Avg PF/ }));

    expect(header()).toHaveAttribute('aria-sort', 'none');

    await press();
    expect(header()).toHaveAttribute('aria-sort', 'descending');
    expect(ranks(table)).toEqual(['3', '2', '1']);

    await press();
    expect(header()).toHaveAttribute('aria-sort', 'ascending');
    expect(ranks(table)).toEqual(['1', '2', '3']);

    await press();
    expect(header()).toHaveAttribute('aria-sort', 'none');
    expect(ranks(table)).toEqual(['1', '2', '3']);
  });

  it('makes every column sortable', () => {
    const headers = setup().getAllByRole('columnheader');
    expect(headers).toHaveLength(7);
    for (const header of headers) expect(header).toHaveAttribute('aria-sort');
  });

  it('gives the card stack a sort control, since it has no headers', () => {
    setup();
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
  });
});
