/**
 * A player in a box score opens his page over the sheet. Both are Radix
 * dialogs: the click writes `?player=` and the sheet stays where it is.
 */

import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { renderWithProviders, screen } from '../../../test/renderWithProviders.jsx';

const ROWS = {
  t1: [{ id: 'r1', playerId: 'p1', espnPlayerId: 3918298, playerName: 'Josh Allen', position: 'QB', rosterSlot: 'QB', actualPoints: 24.5, proTeamId: 2 }],
  t2: [{ id: 'r2', playerId: 'p2', espnPlayerId: 4362628, playerName: "Ja'Marr Chase", position: 'WR', rosterSlot: 'WR', actualPoints: 18.1, proTeamId: 4 }]
};

vi.mock('../../../../hooks/queries/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useWeekPlayerStats: () => ({ data: ROWS, isLoading: false }),
  useNflOpponentMap: () => ({ data: {} }),
  usePlayerByEspnId: () => ({ data: undefined, isSuccess: false, isError: false })
}));

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getContext: () => ({ seasonsCache: new Map(), activeSeasonId: null }),
  getDb: () => ({
    users: { isParlayCommissioner: async () => false, isApprovedMember: async () => false, isLeagueAdmin: async () => false },
    seasons: { getActiveSeason: async () => null }
  })
}));

const { PlayerDetailProvider } = await import('../../players/PlayerDetailContext.jsx');
const { MatchupBoxScoreSheet } = await import('../MatchupBoxScoreSheet.jsx');

const Search = () => <output data-testid="search">{useLocation().search}</output>;

const GAME = {
  seasonId: 's1', year: 2023, week: 5,
  team1Id: 't1', team2Id: 't2', team1Name: 'Bills Mafia', team2Name: 'Bengal Tigers',
  team1Score: 120.4, team2Score: 99.2, type: 'regular'
};

describe('MatchupBoxScoreSheet', () => {
  it('opens a player over the sheet and leaves the sheet open', async () => {
    renderWithProviders(
      <PlayerDetailProvider>
        <MatchupBoxScoreSheet game={GAME} onClose={() => {}} />
        <Search />
      </PlayerDetailProvider>,
      { initialEntries: ['/history?tab=headtohead'] }
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Josh Allen' }));

    const params = new URLSearchParams(screen.getByTestId('search').textContent);
    expect(params.get('player')).toBe('p1');
    expect(params.get('tab')).toBe('headtohead');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText("Ja'Marr Chase")).toBeInTheDocument();
  });
});
