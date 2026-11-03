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
import { ROW_TONE, VIEWER_RAIL } from '../table-tones.js';

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

describe('ResponsiveDataTable, the scroll layout', () => {
  const scrollColumns = [
    { key: 'rank', header: 'Rank', cell: (r) => `#${r.rank}`, scroll: { pin: true, width: 3, header: '#' } },
    { key: 'team', header: 'Team', cell: (r) => r.team, scroll: { fluid: '11ch' } },
    { key: 'sos', header: 'SoS', cell: (r) => r.sos, scroll: { width: 3 } },
    { key: 'record', header: 'Record', cell: (r) => r.record, scroll: { shown: true, width: 3.5, header: 'W-L', cell: (r) => `(${r.record})` } },
    { key: 'owner', header: 'Owner', cell: (r) => `${r.team} owner`, scroll: { only: true, width: 8 } },
  ];

  const renderScroll = (scroll = {}) =>
    render(
      <ResponsiveDataTable columns={scrollColumns} data={data} scroll={{ label: 'League table', ...scroll }} />
    );

  const phone = () => within(document.querySelector('[data-layout="scroll"]'));
  const wide = () => within(document.querySelector('[data-layout="wide"]'));

  it('gives each item one row in place of the cards', () => {
    renderScroll();

    expect(phone().getAllByRole('row')).toHaveLength(3);
    expect(document.querySelector('[data-layout="cards"]')).not.toBeInTheDocument();
  });

  it('names the region it scrolls in', () => {
    renderScroll();
    expect(screen.getByRole('region', { name: 'League table' })).toBeInTheDocument();
  });

  it('reads in the order given, with unlisted columns after', () => {
    renderScroll({ order: ['rank', 'team', 'record'] });

    const headers = phone().getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['#', 'Team', 'W-L', 'SoS', 'Owner']);
  });

  it('uses the smaller cell where a column offers one, and its own otherwise', () => {
    renderScroll();

    const [, first] = phone().getAllByRole('row');
    expect(within(first).getByText('(5-1)')).toBeInTheDocument();
    expect(within(first).getByText('0.51')).toBeInTheDocument();
    expect(wide().getByText('5-1')).toBeInTheDocument();
  });

  it('keeps a scroll-only column off the wide table', () => {
    renderScroll();

    expect(wide().queryByText('Owner')).not.toBeInTheDocument();
    expect(phone().getByText('Owner')).toBeInTheDocument();
  });

  it('pins the leading column in the opaque tone of its row', () => {
    renderScroll({ tone: (row) => (row.rank === 1 ? ROW_TONE.bye : ROW_TONE.base) });

    const [, first, second] = phone().getAllByRole('row');
    expect(first).toHaveClass(ROW_TONE.bye);
    expect(second).toHaveClass(ROW_TONE.base);
    expect(within(first).getByText('#1')).toHaveClass('sticky', 'bg-inherit');
  });

  it('gives the row of the viewer their tone and rail, over any other tone', () => {
    renderScroll({ tone: () => ROW_TONE.bye, isViewer: (row) => row.rank === 2 });

    const [, first, second] = phone().getAllByRole('row');
    expect(second).toHaveClass(ROW_TONE.viewer);
    expect(within(second).getByText('#2')).toHaveClass(VIEWER_RAIL);
    expect(first).toHaveClass(ROW_TONE.bye);
    expect(within(first).getByText('#1')).not.toHaveClass(VIEWER_RAIL);
  });

  it('opens the row on a click, as the wide table does', () => {
    const onRowClick = vi.fn();
    render(
      <ResponsiveDataTable columns={scrollColumns} data={data} onRowClick={onRowClick} scroll={{ label: 'League table' }} />
    );

    fireEvent.click(phone().getAllByRole('row')[2]);
    expect(onRowClick).toHaveBeenCalledWith(data[1], 1);
  });
});

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

    // The card branch is the `md:hidden` sibling of the table branch.
    const cardStack = container.querySelector('.md\\:hidden');
    expect(cardStack.children).toHaveLength(data.length);
    expect(within(cardStack).getByText('Team Alpha')).toBeInTheDocument();
  });

  it('keeps detail columns behind a disclosure on the card', () => {
    const { container } = render(<ResponsiveDataTable columns={columns} data={data} />);
    const card = container.querySelector('.md\\:hidden').firstElementChild;

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
    const card = container.querySelector('.md\\:hidden').firstElementChild;

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
