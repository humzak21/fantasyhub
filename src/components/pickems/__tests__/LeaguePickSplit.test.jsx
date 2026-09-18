/**
 * "How the league picked" — the team boxes and their explainer.
 *
 * What must not break: nothing is shown, and nothing is fetched, while picks
 * can still change; once the window closes every team gets a box with its
 * share; a W marks a matchup's winner only once the game is scored; the boxes
 * and their note share one request; and a viewer who sees masked names sees
 * them masked here too, initials included.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within } from '../../../test/renderWithProviders.jsx';
import { getMaskedOwnerName, getMaskedTeamName } from '../../../utils/displayNameUtils';

const pickems = { getAllPicksForWeek: vi.fn(async () => []) };

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    pickems,
    users: { isParlayCommissioner: async () => false, isApprovedMember: async () => true },
    seasons: { getActiveSeason: async () => null }
  })
}));

const auth = {
  user: { id: 'u1', user_metadata: { name: 'Arya Shah' } },
  isAuthenticated: true,
  isAdmin: true,
  loading: false,
  signIn: vi.fn(),
  signOut: vi.fn()
};

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => auth
}));

const { default: LeaguePickSplit, LeaguePickSplitNote } = await import('../LeaguePickSplit.jsx');

const WEEK = { id: 'pew-2', seasonId: 'season-1', weekNumber: 2 };

const team = (id, name, owner) => ({ id, name, owner, franchiseId: `f-${id}` });

const GAMES = [
  {
    id: 'g1',
    isCompleted: false,
    winnerTeamId: null,
    team1Id: 'aaaa1111-0000-0000-0000-000000000001',
    team2Id: 'bbbb2222-0000-0000-0000-000000000002',
    team1: team('aaaa1111-0000-0000-0000-000000000001', 'Glizzy Galaxy', 'Aaron Wadhwa'),
    team2: team('bbbb2222-0000-0000-0000-000000000002', 'i chase brown kids', 'Aashish Gatamaneni')
  },
  {
    id: 'g2',
    isCompleted: false,
    winnerTeamId: null,
    team1Id: 'cccc3333-0000-0000-0000-000000000003',
    team2Id: 'dddd4444-0000-0000-0000-000000000004',
    team1: team('cccc3333-0000-0000-0000-000000000003', 'Lightskin Empire', 'Humza Khalil'),
    team2: team('dddd4444-0000-0000-0000-000000000004', 'Comeback season', 'Arya Shah')
  }
];

const [G1, G2] = GAMES;

/** The same week once it is scored: the underdog wins g1, team 1 wins g2. */
const SCORED = [
  { ...G1, isCompleted: true, winnerTeamId: G1.team2Id },
  { ...G2, isCompleted: true, winnerTeamId: G2.team1Id }
];

const pick = (userId, game, side) => {
  const teamId = game[`team${side}Id`];
  return { userId, gameId: game.id, pickedTeamId: teamId, predictedWinnerTeamId: teamId };
};

/** Four members: g1 goes 3-1 to Glizzy Galaxy, g2 splits 2-2. */
const PICKS = [
  pick('u1', G1, 1), pick('u2', G1, 1), pick('u3', G1, 1), pick('u4', G1, 2),
  pick('u1', G2, 2), pick('u2', G2, 1), pick('u3', G2, 1), pick('u4', G2, 2)
];

const renderBoth = ({ closed = true, games = GAMES } = {}) =>
  renderWithProviders(
    <>
      <LeaguePickSplitNote pickEmWeek={WEEK} games={games} closed={closed} />
      <LeaguePickSplit pickEmWeek={WEEK} games={games} closed={closed} week={2} />
    </>
  );

/** The boxes, once the picks have landed in them. */
const findBoxes = async () => {
  const grid = await screen.findByRole('list', { name: 'How the league picked week 2' });
  await vi.waitFor(() => expect(grid).toHaveTextContent('75.0%'));
  return within(grid).getAllByRole('listitem');
};

const wonFlags = (boxes) => boxes.map((box) => box.textContent.includes('Won:'));

beforeEach(() => {
  vi.clearAllMocks();
  pickems.getAllPicksForWeek.mockResolvedValue(PICKS);
  Object.assign(auth, {
    isAuthenticated: true,
    isAdmin: true,
    user: { id: 'u1', user_metadata: { name: 'Arya Shah' } }
  });
});

describe('LeaguePickSplit', () => {
  it('shows nothing and fetches nothing while picks are still open', () => {
    const { container } = renderBoth({ closed: false });

    expect(container).toBeEmptyDOMElement();
    expect(pickems.getAllPicksForWeek).not.toHaveBeenCalled();
  });

  it('shows one box per team, with its name, owner, initials and share, once picks close', async () => {
    renderBoth();

    const boxes = await findBoxes();
    expect(boxes).toHaveLength(4);

    // In matchup order — team 1 then team 2, then the next matchup. The grid
    // pours that order down its columns, which is what puts each matchup in a
    // column of its own; jsdom has no layout, so the order is what is asserted.
    const expected = [
      ['Glizzy Galaxy', 'Aaron Wadhwa', 'AW', '75.0%'],
      ['i chase brown kids', 'Aashish Gatamaneni', 'AG', '25.0%'],
      ['Lightskin Empire', 'Humza Khalil', 'HK', '50.0%'],
      ['Comeback season', 'Arya Shah', 'AS', '50.0%']
    ];
    expected.forEach((facts, index) => {
      for (const fact of facts) expect(boxes[index]).toHaveTextContent(fact);
    });

    // One team to a box.
    expect(boxes[0]).not.toHaveTextContent('i chase brown kids');
    expect(boxes[1]).not.toHaveTextContent('Glizzy Galaxy');
  });

  it('marks no winner before the week is scored', async () => {
    renderBoth();

    const boxes = await findBoxes();
    expect(wonFlags(boxes)).toEqual([false, false, false, false]);
    expect(screen.getByText(/Once the week is scored/)).toHaveTextContent(
      /marks each matchup’s winner\.$/
    );
  });

  it('puts a W on each matchup\'s winner once it is scored, whoever the league backed', async () => {
    renderBoth({ games: SCORED });

    const boxes = await findBoxes();
    // The 25% underdog won g1; Lightskin Empire won g2.
    expect(wonFlags(boxes)).toEqual([false, true, true, false]);
    expect(within(boxes[1]).getByText('W')).toBeInTheDocument();

    expect(screen.queryByText(/Once the week is scored/)).not.toBeInTheDocument();
    expect(screen.getByText(/marks each matchup’s winner/)).toBeInTheDocument();
  });

  it('explains the boxes in a sentence that ends at picking a team to win', async () => {
    renderBoth();

    const body = await screen.findByText(/4 members submitted/);
    expect(body.textContent).toBe(
      'Picks are locked, and 4 members submitted. Each box below shows the percentage of ' +
        'those submissions that picked that team to win.'
    );
    expect(screen.getByText('How the league picked')).toBeInTheDocument();
  });

  it('asks for the league\'s picks once for the boxes and their note together', async () => {
    renderBoth();

    await screen.findByText(/4 members submitted/);
    expect(pickems.getAllPicksForWeek).toHaveBeenCalledTimes(1);
    expect(pickems.getAllPicksForWeek).toHaveBeenCalledWith('pew-2');
  });

  it('masks names and initials for a viewer who cannot see them', async () => {
    Object.assign(auth, { isAuthenticated: false, isAdmin: false, user: null });
    renderBoth();

    const [first] = await findBoxes();
    expect(first).not.toHaveTextContent('Glizzy Galaxy');
    expect(first).not.toHaveTextContent('Aaron Wadhwa');
    expect(first).not.toHaveTextContent('AW');
    expect(first).toHaveTextContent(getMaskedTeamName(G1.team1, null, false, []));
    expect(first).toHaveTextContent(getMaskedOwnerName(G1.team1, null, false, []));
  });

  it('says nobody submitted, instead of a grid of empty boxes', async () => {
    pickems.getAllPicksForWeek.mockResolvedValue([]);
    renderBoth();

    expect(
      await screen.findByText('Picks are locked, and nobody submitted any this week.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText(/marks each matchup’s winner/)).not.toBeInTheDocument();
  });

  it('says so when the picks cannot be loaded', async () => {
    pickems.getAllPicksForWeek.mockRejectedValue(new Error('boom'));
    renderBoth();

    expect(
      await screen.findByText('Could not load how the league picked this week.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders nothing, and fetches nothing, without a pick\'em row or a matchup', () => {
    const { container } = renderWithProviders(
      <>
        <LeaguePickSplit pickEmWeek={null} games={GAMES} closed week={2} />
        <LeaguePickSplitNote pickEmWeek={WEEK} games={[]} closed />
      </>
    );

    expect(container).toBeEmptyDOMElement();
    expect(pickems.getAllPicksForWeek).not.toHaveBeenCalled();
  });
});
