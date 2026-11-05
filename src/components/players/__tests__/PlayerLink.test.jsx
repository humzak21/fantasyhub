import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

const KNOWN = { 3918298: { id: 'p9', espnPlayerId: 3918298, name: 'Josh Allen' } };
vi.mock('../../../../hooks/queries/index.js', () => ({
  usePlayerByEspnId: (espnPlayerId, { enabled } = {}) => (enabled
    ? { data: KNOWN[espnPlayerId] ?? null, isSuccess: true, isError: false }
    : { data: undefined, isSuccess: false, isError: false })
}));

const { PlayerDetailProvider } = await import('../PlayerDetailContext.jsx');
const { PlayerLink } = await import('../PlayerLink.jsx');

const Search = () => <output data-testid="search">{useLocation().search}</output>;

const renderInShell = (ui, entry = '/rankings?view=statistics') => render(
  <MemoryRouter initialEntries={[entry]}>
    <PlayerDetailProvider>
      {ui}
      <Search />
    </PlayerDetailProvider>
  </MemoryRouter>
);

describe('PlayerLink', () => {
  it('is plain text without the provider', () => {
    render(<PlayerLink playerId="p1" className="truncate">Josh Allen</PlayerLink>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Josh Allen').tagName).toBe('SPAN');
    expect(screen.getByText('Josh Allen')).toHaveClass('truncate');
  });

  it('is plain text with no id', () => {
    renderInShell(<PlayerLink>Josh Allen</PlayerLink>);
    expect(screen.queryByRole('button', { name: 'Josh Allen' })).toBeNull();
  });

  it('opens the player, keeping the page\'s own params, and stops the click there', async () => {
    const onRow = vi.fn();
    renderInShell(
      <div onClick={onRow}>
        <PlayerLink playerId="p1">Josh Allen</PlayerLink>
      </div>
    );
    const button = screen.getByRole('button', { name: 'Josh Allen' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    const params = new URLSearchParams(screen.getByTestId('search').textContent);
    expect(params.get('player')).toBe('p1');
    expect(params.get('view')).toBe('statistics');
    expect(onRow).not.toHaveBeenCalled();
  });

  it('looks an ESPN id up, then opens the league\'s player', async () => {
    renderInShell(<PlayerLink espnPlayerId={3918298}>Josh Allen</PlayerLink>);
    await userEvent.click(screen.getByRole('button', { name: 'Josh Allen' }));
    expect(new URLSearchParams(screen.getByTestId('search').textContent).get('player')).toBe('p9');
  });

  it('opens nothing when the ESPN id is nobody here', async () => {
    renderInShell(<PlayerLink espnPlayerId={1}>Nobody</PlayerLink>);
    await userEvent.click(screen.getByRole('button', { name: 'Nobody' }));
    expect(new URLSearchParams(screen.getByTestId('search').textContent).has('player')).toBe(false);
  });
});
