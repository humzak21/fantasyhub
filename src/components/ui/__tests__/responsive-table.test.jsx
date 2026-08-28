/**
 * The contract worth testing here is not "does it look right at 375px" — jsdom
 * cannot answer that, and a test that pretends to is the kind this refactor
 * deleted. It is: *both* branches render from *one* column definition, and
 * each column lands in the slot its `priority` asks for.
 *
 * That is what stops the card layout and the table layout drifting apart,
 * which is the failure every hand-written mobile twin in this repo hit.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { ResponsiveDataTable } from '../responsive-table.jsx';

const columns = [
  { key: 'rank', header: '#', priority: 'primary', cell: (r) => <span>#{r.rank}</span> },
  { key: 'team', header: 'Team', priority: 'primary', cell: (r) => <span>{r.team}</span> },
  { key: 'record', header: 'Record', priority: 'secondary', cell: (r) => r.record },
  { key: 'ppg', header: 'PPG', priority: 'secondary', cell: (r) => r.ppg },
  { key: 'sos', header: 'SoS', priority: 'detail', cell: (r) => r.sos },
];

const data = [
  { id: 'a', rank: 1, team: 'Team Alpha', record: '5-1', ppg: 118.4, sos: 0.51 },
  { id: 'b', rank: 2, team: 'Team Beta', record: '4-2', ppg: 112.9, sos: 0.47 },
];

describe('ResponsiveDataTable', () => {
  it('renders every column in the table branch', () => {
    render(<ResponsiveDataTable columns={columns} data={data} />);

    const table = screen.getByRole('table');
    for (const c of columns) {
      expect(within(table).getByRole('columnheader', { name: c.header })).toBeInTheDocument();
    }
    expect(within(table).getAllByRole('row')).toHaveLength(data.length + 1);
  });

  it('renders one card per row from the same definition', () => {
    const { container } = render(<ResponsiveDataTable columns={columns} data={data} />);

    // The card branch is the `sm:hidden` sibling of the table branch.
    const cardStack = container.querySelector('.sm\\:hidden');
    expect(cardStack.children).toHaveLength(data.length);
    expect(within(cardStack).getByText('Team Alpha')).toBeInTheDocument();
  });

  it('keeps detail columns behind a disclosure on the card', () => {
    const { container } = render(<ResponsiveDataTable columns={columns} data={data} />);
    const card = container.querySelector('.sm\\:hidden').firstElementChild;

    // `record` is secondary — visible. `SoS` is detail — not yet.
    expect(within(card).getByText('Record')).toBeInTheDocument();
    expect(within(card).queryByText('SoS')).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: /more/i }));
    expect(within(card).getByText('SoS')).toBeInTheDocument();
  });

  it('does not treat expanding a card as selecting the row', () => {
    const onRowClick = vi.fn();
    const { container } = render(
      <ResponsiveDataTable columns={columns} data={data} onRowClick={onRowClick} />
    );
    const card = container.querySelector('.sm\\:hidden').firstElementChild;

    fireEvent.click(within(card).getByRole('button', { name: /more/i }));
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.click(within(card).getByText('Team Alpha'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state instead of an empty table', () => {
    render(<ResponsiveDataTable columns={columns} data={[]} empty="No teams yet." />);

    expect(screen.getByText('No teams yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
