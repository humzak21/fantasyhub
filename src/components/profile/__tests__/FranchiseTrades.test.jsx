import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { FranchiseTrades } from '../FranchiseTrades.jsx';

const state = vi.hoisted(() => ({ book: null, isLoading: false, viewer: null }));

vi.mock('../../../contexts/ViewerContext.jsx', () => ({ useViewer: () => state.viewer }));
vi.mock('../../../../hooks/queries/index.js', () => ({
  useRecordBook: () => ({ data: state.book, isLoading: state.isLoading })
}));

const franchises = [
  { id: 'fA', name: 'Alpha', owner_name: 'Ann Alpha' },
  { id: 'fB', name: 'Bravo', owner_name: 'Bo Bravo' },
  { id: 'fC', name: 'Charlie', owner_name: 'Cy Charlie' }
];

const player = (name) => ({ espnPlayerId: name, name, position: 'RB' });

const trade = (id, year, week, partner) => ({
  id,
  year,
  week,
  processedAt: null,
  directed: true,
  players: [],
  sides: [
    { franchiseId: 'fA', received: [player(`${id} in`)], dropped: [] },
    { franchiseId: partner, received: [player(`${id} out`)], dropped: [] }
  ]
});

const renderTrades = (franchiseId = 'fA') =>
  render(
    <MemoryRouter>
      <FranchiseTrades franchiseId={franchiseId} franchises={franchises} />
    </MemoryRouter>
  );

describe('FranchiseTrades', () => {
  beforeEach(() => {
    state.isLoading = false;
    state.viewer = {
      user: { user_metadata: { display_name: 'Ann Alpha' } },
      isAdmin: true,
      teamOwnerNames: ['Ann Alpha']
    };
    state.book = {
      trades: [trade('t3', 2026, 5, 'fB'), trade('t2', 2025, 3, 'fB'), trade('t1', 2024, 2, 'fC')]
    };
  });

  it('lists every trade, each side and its players', () => {
    renderTrades();

    expect(within(screen.getByRole('list', { name: 'Trades' })).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('t3 in')).toBeInTheDocument();
    expect(screen.getByText('t1 out')).toBeInTheDocument();
    expect(screen.getByText('3 trades')).toBeInTheDocument();
  });

  it('totals each partner, most first', () => {
    renderTrades();

    const rows = within(screen.getByRole('list', { name: 'Trade partners' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Bravo');
    expect(rows[0]).toHaveTextContent('2 trades');
    expect(rows[0]).toHaveTextContent('Last in 2026');
    expect(rows[1]).toHaveTextContent('Charlie');
    expect(rows[1]).toHaveTextContent('1 trade');
  });

  it('has no section for a franchise that has never traded', () => {
    state.book = { trades: [trade('t1', 2024, 2, 'fC')] };
    const { container } = renderTrades('fB');

    expect(container).toBeEmptyDOMElement();
  });

  it('masks the partners as the rest of the page does', () => {
    state.viewer = { user: null, isAdmin: false, teamOwnerNames: [] };
    renderTrades();

    expect(screen.queryByText('Bravo')).not.toBeInTheDocument();
    expect(screen.queryByText('Bo Bravo')).not.toBeInTheDocument();
  });

  it('holds the shape while the record book loads', () => {
    state.isLoading = true;
    state.book = null;
    renderTrades();

    expect(screen.getByLabelText('Loading trades')).toBeInTheDocument();
  });
});
