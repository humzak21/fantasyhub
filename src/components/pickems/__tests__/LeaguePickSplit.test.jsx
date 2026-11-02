/**
 * "How the league picked": the read behind each card's split, and its explainer.
 *
 * What must not break: nothing is shown, and nothing is fetched, while picks can
 * still change; once the window closes every matchup has its shares; a W marks a
 * matchup's winner only once the game is scored; the cards and the note share
 * one request. The split as drawn, masking included, is in MatchupPickCard.test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '../../../test/renderWithProviders.jsx';

const pickems = { getAllPicksForWeek: vi.fn(async () => []) };

// `isAdmin` on the auth fixture is this test's switch. The viewer no longer
// reads it from the session; it asks `is_admin()`, stubbed here to answer it.
vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    pickems,
    users: {
      isParlayCommissioner: async () => false,
      isApprovedMember: async () => true,
      isLeagueAdmin: async () => Boolean(auth.isAdmin)
    },
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

const { LeaguePickSplitNote, useLeaguePickSplit } = await import('../LeaguePickSplit.jsx');

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

/** Each matchup's split, as a card would read it. */
function Shares({ pickEmWeek, games, closed }) {
  const { byGame } = useLeaguePickSplit({ pickEmWeek, games, closed });
  if (!byGame) return null;

  return (
    <ul aria-label="Shares">
      {[...byGame.values()].flatMap((matchup) =>
        matchup.sides.map((side) => (
          <li key={side.team.id}>
            {side.team.name}: {side.share}
            {side.won && ' won'}
          </li>
        ))
      )}
    </ul>
  );
}

const renderBoth = ({ closed = true, games = GAMES, pickEmWeek = WEEK } = {}) =>
  renderWithProviders(
    <>
      <LeaguePickSplitNote pickEmWeek={pickEmWeek} games={games} closed={closed} />
      <Shares pickEmWeek={pickEmWeek} games={games} closed={closed} />
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

describe('the league split', () => {
  it('shows nothing and fetches nothing while picks are still open', () => {
    renderBoth({ closed: false });

    expect(screen.queryByText('How the league picked')).not.toBeInTheDocument();
    expect(pickems.getAllPicksForWeek).not.toHaveBeenCalled();
  });

  it('gives every matchup its shares once picks close', async () => {
    renderBoth();

    expect(await screen.findByText('Glizzy Galaxy: 75')).toBeInTheDocument();
    expect(screen.getByText('i chase brown kids: 25')).toBeInTheDocument();
    expect(screen.getByText('Lightskin Empire: 50')).toBeInTheDocument();
    expect(screen.getByText('Comeback season: 50')).toBeInTheDocument();
  });

  it('marks no winner before the week is scored', async () => {
    renderBoth();

    await screen.findByText('Glizzy Galaxy: 75');
    expect(screen.queryByText(/won$/)).not.toBeInTheDocument();
  });

  it("marks each matchup's winner once it is scored, whoever the league backed", async () => {
    renderBoth({ games: SCORED });

    expect(await screen.findByText('i chase brown kids: 25 won')).toBeInTheDocument();
    expect(screen.getByText('Lightskin Empire: 50 won')).toBeInTheDocument();
    expect(screen.getByText('Glizzy Galaxy: 75')).toBeInTheDocument();
  });

  it('explains the split in a sentence that ends at picking a team to win', async () => {
    renderBoth();

    expect(
      await screen.findByText(
        'Picks are locked, and 4 members submitted. Each matchup below shows the percentage of those submissions that picked each team to win.'
      )
    ).toBeInTheDocument();
  });

  it("asks for the league's picks once for the cards and their note together", async () => {
    renderBoth();

    await screen.findByText('Glizzy Galaxy: 75');
    expect(pickems.getAllPicksForWeek).toHaveBeenCalledTimes(1);
  });

  it('says nobody submitted, instead of a page of empty splits', async () => {
    pickems.getAllPicksForWeek.mockResolvedValue([]);
    renderBoth();

    expect(await screen.findByText('Picks are locked, and nobody submitted any this week.')).toBeInTheDocument();
  });

  it('says so when the picks cannot be loaded', async () => {
    pickems.getAllPicksForWeek.mockRejectedValue(new Error('offline'));
    renderBoth();

    expect(await screen.findByText('Could not load how the league picked this week.')).toBeInTheDocument();
  });

  it("renders nothing, and fetches nothing, without a pick'em row or a matchup", () => {
    const { unmount } = renderBoth({ pickEmWeek: null });
    expect(screen.queryByText('How the league picked')).not.toBeInTheDocument();
    unmount();

    renderBoth({ games: [] });
    expect(screen.queryByText('How the league picked')).not.toBeInTheDocument();
    expect(pickems.getAllPicksForWeek).not.toHaveBeenCalled();
  });
});
