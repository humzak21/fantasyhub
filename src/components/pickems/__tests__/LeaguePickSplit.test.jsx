/**
 * "How the league picked" — the row of matchups and its explainer.
 *
 * What must not break: nothing is shown, and nothing is fetched, while picks
 * can still change; once the window closes every team gets a box with its
 * share; the row and its note share one request; and a viewer who
 * sees masked names sees them masked here too, initials included.
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
const CLOSED = { status: 'closed' };

const team = (id, name, owner) => ({ id, name, owner, franchiseId: `f-${id}` });

const GAMES = [
  {
    id: 'g1',
    team1Id: 'aaaa1111-0000-0000-0000-000000000001',
    team2Id: 'bbbb2222-0000-0000-0000-000000000002',
    team1: team('aaaa1111-0000-0000-0000-000000000001', 'Glizzy Galaxy', 'Aaron Wadhwa'),
    team2: team('bbbb2222-0000-0000-0000-000000000002', 'i chase brown kids', 'Aashish Gatamaneni')
  },
  {
    id: 'g2',
    team1Id: 'cccc3333-0000-0000-0000-000000000003',
    team2Id: 'dddd4444-0000-0000-0000-000000000004',
    team1: team('cccc3333-0000-0000-0000-000000000003', 'Lightskin Empire', 'Humza Khalil'),
    team2: team('dddd4444-0000-0000-0000-000000000004', 'Comeback season', 'Arya Shah')
  }
];

const [G1, G2] = GAMES;

const pick = (userId, game, side) => {
  const teamId = game[`team${side}Id`];
  return { userId, gameId: game.id, pickedTeamId: teamId, predictedWinnerTeamId: teamId };
};

/** Four members: g1 goes 3-1 to Glizzy Galaxy, g2 splits 2-2. */
const PICKS = [
  pick('u1', G1, 1), pick('u2', G1, 1), pick('u3', G1, 1), pick('u4', G1, 2),
  pick('u1', G2, 2), pick('u2', G2, 1), pick('u3', G2, 1), pick('u4', G2, 2)
];

const renderBoth = (status = CLOSED) =>
  renderWithProviders(
    <>
      <LeaguePickSplitNote pickEmWeek={WEEK} games={GAMES} status={status} />
      <LeaguePickSplit pickEmWeek={WEEK} games={GAMES} status={status} week={2} />
    </>
  );

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
  it.each(['open', 'upcoming', 'no-week'])(
    'shows nothing and fetches nothing while the week is %s',
    (status) => {
      const { container } = renderBoth({ status });

      expect(container).toBeEmptyDOMElement();
      expect(pickems.getAllPicksForWeek).not.toHaveBeenCalled();
    }
  );

  it('shows one box per team, with its name, owner, initials and share, once picks close', async () => {
    renderBoth();

    const row = await screen.findByRole('list', { name: 'How the league picked week 2' });
    await vi.waitFor(() => expect(row).toHaveTextContent('75.0%'));

    const boxes = within(row).getAllByRole('listitem');
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

  it('marks the viewer\'s own pick on that team\'s box alone', async () => {
    renderBoth();

    const row = await screen.findByRole('list', { name: 'How the league picked week 2' });
    await vi.waitFor(() => expect(row).toHaveTextContent('75.0%'));

    // u1 took Glizzy Galaxy in g1 and Comeback season in g2.
    const picked = within(row)
      .getAllByRole('listitem')
      .map((box) => box.textContent.includes('Your pick'));
    expect(picked).toEqual([true, false, false, true]);
  });

  it('explains the row in the card above it, with the number who submitted', async () => {
    renderBoth();

    expect(await screen.findByText(/4 members submitted/)).toHaveTextContent(
      'A check marks your own pick.'
    );
    expect(screen.getByText('How the league picked')).toBeInTheDocument();
  });

  it('leaves the check out of the explainer for a viewer who did not pick', async () => {
    Object.assign(auth, { user: { id: 'u9', user_metadata: { name: 'Arya Shah' } } });
    renderBoth();

    const note = await screen.findByText(/4 members submitted/);
    expect(note).not.toHaveTextContent('check');
  });

  it('asks for the league\'s picks once for the row and its note together', async () => {
    renderBoth();

    await screen.findByText(/4 members submitted/);
    expect(pickems.getAllPicksForWeek).toHaveBeenCalledTimes(1);
    expect(pickems.getAllPicksForWeek).toHaveBeenCalledWith('pew-2');
  });

  it('shows the split after the reveal as well as before it', async () => {
    renderBoth({ status: 'completed' });

    expect(
      await screen.findByRole('list', { name: 'How the league picked week 2' })
    ).toBeInTheDocument();
  });

  it('masks names and initials for a viewer who cannot see them', async () => {
    Object.assign(auth, { isAuthenticated: false, isAdmin: false, user: null });
    renderBoth();

    const row = await screen.findByRole('list', { name: 'How the league picked week 2' });
    await vi.waitFor(() => expect(row).toHaveTextContent('75.0%'));

    const [first] = within(row).getAllByRole('listitem');
    expect(first).not.toHaveTextContent('Glizzy Galaxy');
    expect(first).not.toHaveTextContent('Aaron Wadhwa');
    expect(first).not.toHaveTextContent('AW');
    expect(first).toHaveTextContent(getMaskedTeamName(G1.team1, null, false, []));
    expect(first).toHaveTextContent(getMaskedOwnerName(G1.team1, null, false, []));
  });

  it('says nobody submitted, instead of a row of empty boxes', async () => {
    pickems.getAllPicksForWeek.mockResolvedValue([]);
    renderBoth();

    expect(
      await screen.findByText('Picks are locked, and nobody submitted any this week.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('says so when the picks cannot be loaded', async () => {
    pickems.getAllPicksForWeek.mockRejectedValue(new Error('boom'));
    renderBoth();

    expect(
      await screen.findByText('Could not load how the league picked this week.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders nothing for a week with no pick\'em row', () => {
    const { container } = renderWithProviders(
      <LeaguePickSplit pickEmWeek={null} games={GAMES} status={CLOSED} week={2} />
    );

    expect(container).toBeEmptyDOMElement();
    expect(pickems.getAllPicksForWeek).not.toHaveBeenCalled();
  });
});
