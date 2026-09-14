/**
 * The record book, rendered from a source the data layer could have returned.
 *
 * What is worth pinning at this level, rather than in the engine's own tests:
 * a card is a ranked list that shows five and opens to the rest, a game card's
 * toggle swaps the regular season for the bracket, and a signed-out viewer sees
 * masked franchises. The History tab is members-only in the shell, but this
 * component masks for whoever renders it — it cannot know how it was reached.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fireEvent,
  renderWithProviders,
  screen,
  within
} from '../../../../test/renderWithProviders.jsx';

const history = { getRecordBookSource: vi.fn() };

vi.mock('../../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({ history })
}));

const { default: RecordBook } = await import('../RecordBook.jsx');

const IDS = { A: 'f-alpha01', B: 'f-bravo02', C: 'f-charl03', D: 'f-delta04' };

const FRANCHISES = Object.entries(IDS).map(([key, id]) => ({
  id,
  owner_name: `Owner ${key}`,
  display_name: `Owner ${key}`
}));

const team = (key, extra = {}) => ({
  id: `t-${key}`,
  seasonId: 's24',
  franchiseId: IDS[key],
  name: `Team ${key}`,
  owner: `Owner ${key}`,
  madePlayoffs: false,
  playoffFinish: 'none',
  finalRank: null,
  ...extra
});

const game = (week, a, sa, b, sb, type = 'regular') => ({
  id: `g-${week}-${a}${b}`,
  seasonId: 's24',
  week,
  type,
  team1Id: `t-${a}`,
  team2Id: `t-${b}`,
  team1Score: sa,
  team2Score: sb,
  isBlowout: Math.abs(sa - sb) >= 30,
  isClose: Math.abs(sa - sb) <= 5
});

const SOURCE = {
  seasons: [{ id: 's24', year: 2024, isCompleted: true, regularSeasonWeeks: 3 }],
  franchises: FRANCHISES,
  teams: [
    team('A', { madePlayoffs: true, playoffFinish: 'champion', finalRank: 1 }),
    team('B', { madePlayoffs: true, playoffFinish: '2nd', finalRank: 2 }),
    team('C', { finalRank: 4 }),
    team('D', { finalRank: 3 })
  ],
  games: [
    game(1, 'A', 120, 'B', 100), game(1, 'C', 90, 'D', 95),
    game(2, 'A', 130, 'C', 80), game(2, 'B', 110, 'D', 108),
    game(3, 'A', 100, 'D', 100), game(3, 'B', 140, 'C', 70),
    game(4, 'A', 110, 'B', 105, 'playoff_championship')
  ],
  transactions: [],
  trades: [],
  bids: [],
  lineups: []
};

beforeEach(() => {
  vi.clearAllMocks();
  history.getRecordBookSource.mockResolvedValue(SOURCE);
});

describe('RecordBook', () => {
  it('opens on the all-time records, grouped by subject, with ties sharing a place', async () => {
    renderWithProviders(<RecordBook franchises={FRANCHISES} />);

    expect(await screen.findByRole('heading', { name: 'Winning' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Playoffs' })).toBeInTheDocument();

    // A and B have two wins each, D one; C's zero is not a placing.
    const wins = screen.getByRole('region', { name: 'Most wins' });
    const rows = within(wins).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    // Each row reads rank first, value last.
    const figures = rows.map((row) => within(row).getAllByText(/^\d+$/).map((cell) => cell.textContent));
    expect(figures).toEqual([['1', '2'], ['1', '2'], ['3', '1']]);
    expect(within(rows[0]).getByTitle('Tied for 1st')).toBeInTheDocument();
  });

  it('masks every franchise for a viewer who may not see names', async () => {
    renderWithProviders(<RecordBook franchises={FRANCHISES} />);

    const wins = await screen.findByRole('region', { name: 'Most wins' });
    expect(within(wins).getByText('Franchise f-alpha0')).toBeInTheDocument();
    expect(screen.queryByText('Owner A')).not.toBeInTheDocument();
  });

  it('shows five rows of a long list, opens to the rest, and switches a game card to the playoffs', async () => {
    renderWithProviders(<RecordBook franchises={FRANCHISES} />);
    await screen.findByRole('heading', { name: 'Winning' });

    // Radix tabs activate on mouse down.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Single Season' }), { button: 0 });

    const highScore = await screen.findByRole('region', { name: 'Highest score' });
    expect(within(highScore).getAllByRole('listitem')).toHaveLength(5);

    fireEvent.click(within(highScore).getByRole('button', { name: /Show top 12/ }));
    expect(within(highScore).getAllByRole('listitem')).toHaveLength(12);

    fireEvent.click(within(highScore).getByRole('button', { name: 'Playoffs' }));
    const playoff = within(highScore).getAllByRole('listitem');
    expect(playoff).toHaveLength(2);
    expect(within(playoff[0]).getByText('110.0')).toBeInTheDocument();
    expect(within(highScore).queryByRole('button', { name: /Show top/ })).not.toBeInTheDocument();
  });

  it('says so when the record book does not load', async () => {
    history.getRecordBookSource.mockRejectedValue(new Error('permission denied for table games'));

    renderWithProviders(<RecordBook franchises={FRANCHISES} />);

    expect(await screen.findByText(/permission denied for table games/)).toBeInTheDocument();
  });
});
