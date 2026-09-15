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
    // B beat D by 0.04 — the kind of margin quarterback scoring produces.
    game(2, 'A', 130, 'C', 80), game(2, 'B', 110, 'D', 109.96),
    game(3, 'A', 100, 'D', 100), game(3, 'B', 140, 'C', 70),
    game(4, 'A', 110, 'B', 105, 'playoff_championship')
  ],
  // A's count is one past its stored trades, as when the sync has counted a
  // trade it has not yet stored move by move.
  transactions: [
    { seasonId: 's24', franchiseId: IDS.A, trades: 3 },
    { seasonId: 's24', franchiseId: IDS.B, trades: 1 },
    { seasonId: 's24', franchiseId: IDS.C, trades: 1 }
  ],
  trades: [
    {
      id: 'trade-1',
      seasonId: 's24',
      week: 2,
      processedAt: '2024-09-12T15:00:00.000Z',
      franchiseIds: [IDS.A, IDS.B],
      players: [
        { espnPlayerId: 11, name: 'Runner One', position: 'RB' },
        { espnPlayerId: 12, name: 'Catcher Two', position: 'WR' },
        { espnPlayerId: 13, name: 'Spare Three', position: 'TE' }
      ],
      fromFranchiseIds: [IDS.B, IDS.A, IDS.A],
      toFranchiseIds: [IDS.A, IDS.B, null]
    },
    {
      id: 'trade-1-drop',
      seasonId: 's24',
      week: 2,
      processedAt: '2024-09-12T15:00:01.000Z',
      franchiseIds: [IDS.A],
      players: [{ espnPlayerId: 13, name: 'Spare Three', position: 'TE' }],
      fromFranchiseIds: [IDS.A],
      toFranchiseIds: [null]
    },
    {
      id: 'trade-2',
      seasonId: 's24',
      week: 3,
      processedAt: '2024-09-19T15:00:00.000Z',
      franchiseIds: [IDS.C, IDS.A],
      players: [{ espnPlayerId: 14, name: 'Kicker Four', position: 'K' }],
      fromFranchiseIds: [IDS.C],
      toFranchiseIds: [IDS.A]
    }
  ],
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

    // A career total has no season it was set in, so it is never marked new.
    expect(within(wins).queryByText('New record')).not.toBeInTheDocument();
  });

  it('keeps one neutral list per All-Time rate, and flags the trade count the commissioner inflates', async () => {
    renderWithProviders(<RecordBook franchises={FRANCHISES} />);
    await screen.findByRole('heading', { name: 'Winning' });

    for (const title of ['Win %', 'Points per game', 'Points against per game', 'Point differential per game']) {
      expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
    }
    for (const title of [
      'Worst win %',
      'Lowest points per game',
      'Fewest points against per game',
      'Worst point differential per game',
      'Worst lineup efficiency'
    ]) {
      expect(screen.queryByRole('region', { name: title })).not.toBeInTheDocument();
    }

    // No minimum games: every franchise with a game is on the win % board.
    expect(within(screen.getByRole('region', { name: 'Win %' })).getAllByRole('listitem')).toHaveLength(4);

    const trades = screen.getByRole('region', { name: 'Most trades' });
    expect(within(trades).getByText(/commissioner's count is inflated/)).toBeInTheDocument();
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

    // The fixture's only season is the most recent one, so its #1 is marked —
    // and only the #1.
    const [first, second] = within(highScore).getAllByRole('listitem');
    expect(within(first).getByText('New record')).toBeInTheDocument();
    expect(within(second).queryByText('New record')).not.toBeInTheDocument();

    fireEvent.click(within(highScore).getByRole('button', { name: /Show top 12/ }));
    expect(within(highScore).getAllByRole('listitem')).toHaveLength(12);

    fireEvent.click(within(highScore).getByRole('button', { name: 'Playoffs' }));
    const playoff = within(highScore).getAllByRole('listitem');
    expect(playoff).toHaveLength(2);
    expect(within(playoff[0]).getByText('110.00')).toBeInTheDocument();
    expect(within(highScore).queryByRole('button', { name: /Show top/ })).not.toBeInTheDocument();

    // Scores and margins read to the hundredth: 0.04 must not print as 0.0.
    const narrowest = screen.getByRole('region', { name: 'Narrowest win' });
    const [closest] = within(narrowest).getAllByRole('listitem');
    expect(within(closest).getByText('0.04')).toBeInTheDocument();
    expect(within(closest).getByText(/110\.00–109\.96/)).toBeInTheDocument();
  });

  it('adds the league as one team to the Single Season tab, by week and by season', async () => {
    const onViewFranchise = vi.fn();
    renderWithProviders(<RecordBook franchises={FRANCHISES} onViewFranchise={onViewFranchise} />);
    await screen.findByRole('heading', { name: 'Winning' });
    expect(screen.queryByRole('heading', { name: 'League-wide' })).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Single Season' }), { button: 0 });
    expect(await screen.findByRole('heading', { name: 'League-wide' })).toBeInTheDocument();

    // Week 2: 130 + 80 + 110 + 109.96.
    const weeks = screen.getByRole('region', { name: 'Highest-scoring week' });
    const [top] = within(weeks).getAllByRole('listitem');
    expect(within(top).getByText('Week 2, 2024')).toBeInTheDocument();
    expect(within(top).getByText('429.96')).toBeInTheDocument();
    expect(within(top).getByText('107.49 per team')).toBeInTheDocument();
    // No franchise behind the row, so nothing to open.
    expect(within(weeks).queryAllByRole('button')).toHaveLength(0);

    // The week's floor names who set it, masked like every other name.
    const floor = screen.getByRole('region', { name: 'Highest weekly low score' });
    const [highestLow] = within(floor).getAllByRole('listitem');
    expect(within(highestLow).getByText('Week 1, 2024')).toBeInTheDocument();
    expect(within(highestLow).getByText('Franchise f-charl0')).toBeInTheDocument();

    const seasons = screen.getByRole('region', { name: 'Most points in a season' });
    const [season] = within(seasons).getAllByRole('listitem');
    expect(within(season).getByText('1,244.96')).toBeInTheDocument();
    expect(within(season).getByText('3 weeks · 6 games')).toBeInTheDocument();

    // The team-level counterpart: C had the week's lowest score all three weeks.
    const lows = screen.getByRole('region', { name: 'Most weekly low scores' });
    const [lowest] = within(lows).getAllByRole('listitem');
    expect(within(lowest).getByText('Franchise f-charl0')).toBeInTheDocument();
    expect(within(lowest).getByText('3')).toBeInTheDocument();
    expect(onViewFranchise).not.toHaveBeenCalled();
  });

  it('opens a trade record to the trades behind it, instead of the franchise', async () => {
    const onViewFranchise = vi.fn();
    renderWithProviders(<RecordBook franchises={FRANCHISES} onViewFranchise={onViewFranchise} />);
    await screen.findByRole('heading', { name: 'Winning' });

    const card = screen.getByRole('region', { name: 'Most trades' });
    const [first] = within(card).getAllByRole('listitem');
    const toggle = within(first).getByRole('button', { expanded: false });
    fireEvent.click(toggle);

    expect(onViewFranchise).not.toHaveBeenCalled();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Newest first, and the drop ESPN filed as a trade of its own is not one.
    const trades = within(first).getByRole('list', { name: 'Trades' });
    expect(trades.children).toHaveLength(2);
    const [latest, earlier] = trades.children;
    expect(within(latest).getByText(/^Wk 3 · /)).toBeInTheDocument();
    expect(
      within(within(latest).getByRole('list', { name: 'Franchise f-alpha0 received' })).getByText('Kicker Four')
    ).toBeInTheDocument();

    // Each side lists what it received; the drop that made room is not received by anyone.
    const alphaGot = within(earlier).getByRole('list', { name: 'Franchise f-alpha0 received' });
    const bravoGot = within(earlier).getByRole('list', { name: 'Franchise f-bravo0 received' });
    expect(within(alphaGot).getByText('Runner One')).toBeInTheDocument();
    expect(within(bravoGot).getByText('Catcher Two')).toBeInTheDocument();
    expect(within(bravoGot).queryByText('Spare Three')).not.toBeInTheDocument();
    expect(within(earlier).getByText('Dropped Spare Three')).toBeInTheDocument();

    // The count is ESPN's; where it runs past the trades on record, that is said.
    expect(within(first).getByText('1 more counted trade has no detail on record.')).toBeInTheDocument();
    expect(screen.queryByText('Owner A')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(within(first).queryByRole('list', { name: 'Trades' })).not.toBeInTheDocument();
  });

  it('says so when the record book does not load', async () => {
    history.getRecordBookSource.mockRejectedValue(new Error('permission denied for table games'));

    renderWithProviders(<RecordBook franchises={FRANCHISES} />);

    expect(await screen.findByText(/permission denied for table games/)).toBeInTheDocument();
  });
});
