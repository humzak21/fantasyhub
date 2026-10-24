/**
 * JITS-47: a chat data table's player column gets faces for the names it can
 * match to exactly one player, and leaves everything else as text.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let players = [];
const usePlayersByName = vi.fn(() => ({ data: players }));
vi.mock('../../../../hooks/queries/index.js', () => ({ usePlayersByName: (...args) => usePlayersByName(...args) }));

const { default: QueryData } = await import('../QueryData.jsx');

const QUERY = {
  sql: 'select player, points from lineups',
  ok: true,
  columns: ['player', 'points'],
  rows: [['Puka Nacua', 31.4], ['Josh Allen', 28.2], ['Some Free Agent', 3]],
  rowCount: 3
};

describe('QueryData', () => {
  it('looks up the player column and draws a face only where the name is one player', () => {
    players = [
      { name: 'Puka Nacua', espnPlayerId: 4426515, position: 'WR' },
      { name: 'Josh Allen', espnPlayerId: 3918298, position: 'QB' },
      { name: 'Josh Allen', espnPlayerId: 3127313, position: 'LB' }
    ];
    const { container } = render(<QueryData queries={[QUERY]} />);
    expect(usePlayersByName).toHaveBeenCalledWith(['Puka Nacua', 'Josh Allen', 'Some Free Agent']);
    const srcs = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toHaveLength(1);
    expect(srcs[0]).toContain('/full/4426515.png');
    expect(screen.getByText('Josh Allen')).toBeInTheDocument();
    expect(screen.getByText('Some Free Agent')).toBeInTheDocument();
  });

  it('asks for nothing when no column names players', () => {
    usePlayersByName.mockClear();
    render(<QueryData queries={[{ ...QUERY, columns: ['owner', 'points'] }]} />);
    expect(usePlayersByName).toHaveBeenCalledWith([]);
  });
});
