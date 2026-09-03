/**
 * The parlay section of the pick'ems form.
 *
 * The rules worth pinning down are the ones a future change could quietly
 * break: it must render *nothing* without a pick'em week (that is the whole of
 * "only when pick'ems is activated"), it must not offer a submit outside the
 * window, and the free-text path must reach the data layer as a null player id
 * rather than being swallowed by the autocomplete.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '../../../test/renderWithProviders.jsx';

const parlay = {
  getMyParlayPick: vi.fn(async () => null),
  getParlayPicksForWeek: vi.fn(async () => []),
  getSeasonParlayPicks: vi.fn(async () => []),
  submitParlayPick: vi.fn(async () => ({}))
};

const players = { searchPlayers: vi.fn(async () => []) };
const nflSchedule = { getNflScheduleForSeason: vi.fn(async () => []) };

/**
 * The league's two halves, for the division columns. Teams come back in
 * database shape (`division_id`) because `getTeamsForSeason` deliberately does
 * not `formatFromDatabase` them; divisions come back camelCased because
 * `getDivisionsForSeason` does.
 */
const teams = {
  getTeamsForSeason: vi.fn(async () => [
    { id: 't1', name: 'Team Arya', owner: 'Arya Shah', division_id: 'd1' },
    { id: 't2', name: 'Team Rohit', owner: 'Rohit Ramki', division_id: 'd2' }
  ])
};

const divisions = {
  getDivisionsForSeason: vi.fn(async () => [
    { id: 'd1', name: 'The Dawg Pound', displayOrder: 1 },
    { id: 'd2', name: 'The Kennel', displayOrder: 2 }
  ])
};

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    parlay,
    players,
    nflSchedule,
    teams,
    divisions,
    users: { isParlayCommissioner: async () => false, isApprovedMember: async () => true },
    seasons: { getActiveSeason: async () => null }
  })
}));

/**
 * `useAuth` is mocked rather than `useViewer`, because the hooks and the
 * component read the viewer from *different* places on purpose: the component
 * takes `user`/`isAdmin` from ViewerContext, while `useMyParlayPick` reads
 * `isAuthenticated` from AuthContext to decide whether to issue the query at
 * all. In production those are the same value — ViewerContext derives its own
 * from `useAuth`. Stubbing the root keeps them agreeing here too; stubbing
 * `useViewer` alone would leave the query disabled and quietly test nothing.
 */
const auth = {
  user: { id: 'u1', user_metadata: { name: 'Arya Shah' } },
  isAuthenticated: true,
  isAdmin: false,
  loading: false,
  signIn: vi.fn(),
  signOut: vi.fn()
};

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => auth
}));

const { default: ParlayPickSection } = await import('../ParlayPickSection.jsx');

const WEEK = {
  id: 'pew-1',
  seasonId: 'season-1',
  weekNumber: 3,
  submissionOpensAt: '2026-09-08T08:00:00Z',
  submissionClosesAt: '2026-09-11T00:00:00Z',
  resultsRevealAt: '2026-09-16T00:00:00Z'
};

const OPEN = { status: 'open', message: 'Submissions are open!', timeInfo: '2d remaining' };
const CLOSED = { status: 'closed', message: 'Submissions are closed', timeInfo: '' };
const UPCOMING = { status: 'upcoming', message: 'Not open yet', timeInfo: 'Opens Tuesday' };

beforeEach(() => {
  vi.clearAllMocks();
  parlay.getMyParlayPick.mockResolvedValue(null);
  parlay.getParlayPicksForWeek.mockResolvedValue([]);
  players.searchPlayers.mockResolvedValue([]);
  nflSchedule.getNflScheduleForSeason.mockResolvedValue([]);
  teams.getTeamsForSeason.mockResolvedValue([
    { id: 't1', name: 'Team Arya', owner: 'Arya Shah', division_id: 'd1' },
    { id: 't2', name: 'Team Rohit', owner: 'Rohit Ramki', division_id: 'd2' }
  ]);
  divisions.getDivisionsForSeason.mockResolvedValue([
    { id: 'd1', name: 'The Dawg Pound', displayOrder: 1 },
    { id: 'd2', name: 'The Kennel', displayOrder: 2 }
  ]);
  Object.assign(auth, { isAuthenticated: true, isAdmin: false, user: { id: 'u1', user_metadata: { name: 'Arya Shah' } } });
});

describe('ParlayPickSection', () => {
  it('renders nothing when the week has no pick\'em row', () => {
    const { container } = renderWithProviders(
      <ParlayPickSection pickEmWeek={null} status={{ status: 'no-week' }} weekNumber={3} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('offers no submit before the window opens', async () => {
    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={UPCOMING} weekNumber={3} />
    );

    expect(await screen.findByText(/Weekly TD Parlay/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lock in pick/i })).not.toBeInTheDocument();
    expect(screen.getByText(/not open yet/i)).toBeInTheDocument();
  });

  it('offers no submit once the window has closed', async () => {
    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={CLOSED} weekNumber={3} />
    );

    expect(await screen.findByText(/Weekly TD Parlay/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lock in pick/i })).not.toBeInTheDocument();
  });

  it('asks an anonymous viewer to sign in rather than showing the form', async () => {
    Object.assign(auth, { isAuthenticated: false, user: null });

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    expect(await screen.findByText(/sign in to enter/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('sends a null player id when the name matched nothing', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    const input = await screen.findByRole('combobox');
    await user.type(input, 'Some Rookie');
    await user.click(screen.getByRole('button', { name: /lock in pick/i }));

    await waitFor(() =>
      expect(parlay.submitParlayPick).toHaveBeenCalledWith('pew-1', {
        playerId: null,
        playerName: 'Some Rookie'
      })
    );
  });

  it('sends the matched player id after choosing a suggestion', async () => {
    const user = userEvent.setup();
    players.searchPlayers.mockResolvedValue([
      { id: 'p-jj', name: 'Justin Jefferson', position: 'WR', teamAbbreviation: 'MIN' }
    ]);

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    const input = await screen.findByRole('combobox');
    await user.type(input, 'jeff');

    const option = await screen.findByRole('option', { name: /justin jefferson/i });
    await user.click(option);
    await user.click(screen.getByRole('button', { name: /lock in pick/i }));

    await waitFor(() =>
      expect(parlay.submitParlayPick).toHaveBeenCalledWith('pew-1', {
        playerId: 'p-jj',
        playerName: 'Justin Jefferson'
      })
    );
  });

  it('shows the existing pick locked, with no edit control, once closed', async () => {
    parlay.getMyParlayPick.mockResolvedValue({
      id: 'pick-1',
      playerId: 'p-jj',
      playerNameRaw: 'Justin Jefferson',
      scoredTd: true,
      player: { position: 'WR', teamAbbreviation: 'MIN' }
    });

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={CLOSED} weekNumber={3} />
    );

    expect(await screen.findByText('Justin Jefferson')).toBeInTheDocument();
    expect(screen.getByText(/scored a td/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
  });

  it('lists the league\'s picks while the week is still open', async () => {
    parlay.getParlayPicksForWeek.mockResolvedValue([
      {
        id: 'a',
        userId: 'u1',
        displayName: 'Arya Shah',
        playerNameRaw: 'Justin Jefferson',
        scoredTd: null,
        player: {}
      }
    ]);

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    // The whole point of the change: no waiting for the deadline.
    expect(await screen.findByText('Justin Jefferson')).toBeInTheDocument();
    expect(screen.getByText(/the league.s picks/i)).toBeInTheDocument();
  });

  it('asks for the league\'s picks even on an open week', async () => {
    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    await screen.findByRole('combobox');
    await waitFor(() => expect(parlay.getParlayPicksForWeek).toHaveBeenCalledWith('pew-1'));
  });

  it('says the parlay runs by division', async () => {
    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    expect(
      await screen.findByText(/separated into divisions, 7 picks per each parlay/i)
    ).toBeInTheDocument();
  });
});

/**
 * The board is two parlays, not one list.
 *
 * Nothing on a pick says which division it belongs to — the column is derived
 * from the member's display name matching a `teams.owner`. The cases worth
 * pinning are the ones that would seat somebody wrongly rather than fail: a
 * name that matches nobody, and a division nobody has entered yet.
 */
describe('ParlayPickSection · division columns', () => {
  // Each column is a labelled region, so the assertions can name a division
  // instead of reaching for a DOM ancestor.
  const column = (name) => screen.getByRole('region', { name });

  // Division names go through the same masking as everywhere else, and this
  // test's viewer owns no team (the active season is null here, so
  // `teamOwnerNames` is empty). Admin is how these assertions get to see the
  // real names; the last test in this block is the other half of that rule.
  beforeEach(() => {
    Object.assign(auth, { isAdmin: true });
  });

  it('splits the picks into a column per division, under the real names', async () => {
    parlay.getParlayPicksForWeek.mockResolvedValue([
      {
        id: 'a',
        userId: 'u1',
        displayName: 'Arya Shah',
        playerNameRaw: 'Justin Jefferson',
        scoredTd: null,
        player: {}
      },
      {
        id: 'b',
        userId: 'u2',
        displayName: 'Rohit Ramki',
        playerNameRaw: 'Bijan Robinson',
        scoredTd: null,
        player: {}
      }
    ]);

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    await screen.findByText('Justin Jefferson');

    expect(column('The Dawg Pound')).toHaveTextContent('Justin Jefferson');
    expect(column('The Dawg Pound')).not.toHaveTextContent('Bijan Robinson');
    expect(column('The Kennel')).toHaveTextContent('Bijan Robinson');
  });

  it('renders an empty division rather than hiding it', async () => {
    parlay.getParlayPicksForWeek.mockResolvedValue([
      {
        id: 'a',
        userId: 'u1',
        displayName: 'Arya Shah',
        playerNameRaw: 'Justin Jefferson',
        scoredTd: null,
        player: {}
      }
    ]);

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    await screen.findByText('Justin Jefferson');

    expect(column('The Kennel')).toHaveTextContent(/nobody in this division has picked yet/i);
  });

  it('keeps a pick whose name matches no owner out of both divisions', async () => {
    parlay.getParlayPicksForWeek.mockResolvedValue([
      {
        id: 'c',
        userId: 'u9',
        displayName: 'Somebody Else',
        playerNameRaw: 'Some Goal Line Back',
        scoredTd: null,
        player: {}
      }
    ]);

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    await screen.findByText('Some Goal Line Back');

    expect(column('Not matched to a division')).toHaveTextContent('Some Goal Line Back');
    expect(column('The Dawg Pound')).not.toHaveTextContent('Some Goal Line Back');
  });

  it('gives a signed-out viewer the generic division labels', async () => {
    Object.assign(auth, { isAdmin: false, isAuthenticated: false, user: null });
    parlay.getParlayPicksForWeek.mockResolvedValue([
      {
        id: 'a',
        userId: 'u1',
        displayName: 'Arya Shah',
        playerNameRaw: 'Justin Jefferson',
        scoredTd: null,
        player: {}
      }
    ]);

    renderWithProviders(
      <ParlayPickSection pickEmWeek={WEEK} status={OPEN} weekNumber={3} />
    );

    // The board is public; the league's names are not.
    expect(await screen.findByText('Justin Jefferson')).toBeInTheDocument();
    expect(column('Division 1')).toBeInTheDocument();
    expect(screen.queryByText('The Dawg Pound')).not.toBeInTheDocument();
  });
});

/**
 * The NFL opponent chips, on the committed pick and on every suggestion.
 *
 * A bye is the single most decision-relevant thing this section can say about
 * a touchdown pick, and an unknown must not be dressed up as one — a free-text
 * pick has no `player` at all, and printing "BYE" beside it would be inventing
 * a fact about somebody who is playing.
 */
describe('ParlayPickSection · opponent chips', () => {
  const SEASON_YEAR = 2026;

  /** BUF(2) away at KC(12) in week 3; DET(8) is off. */
  const NFL_ROWS = [
    { seasonYear: SEASON_YEAR, week: 3, proTeamId: 2, opponentProTeamId: 12, isHome: false },
    { seasonYear: SEASON_YEAR, week: 3, proTeamId: 12, opponentProTeamId: 2, isHome: true },
    { seasonYear: SEASON_YEAR, week: 3, proTeamId: 8, opponentProTeamId: null, isHome: null }
  ];

  const pickOn = (proTeamId) => ({
    id: 'pick-1',
    playerId: 'p1',
    playerNameRaw: 'Josh Allen',
    scoredTd: null,
    player: { id: 'p1', name: 'Josh Allen', position: 'QB', teamAbbreviation: 'BUF', proTeamId }
  });

  const render = () =>
    renderWithProviders(
      <ParlayPickSection
        pickEmWeek={WEEK}
        seasonYear={SEASON_YEAR}
        status={OPEN}
        weekNumber={3}
      />
    );

  beforeEach(() => {
    nflSchedule.getNflScheduleForSeason.mockResolvedValue(NFL_ROWS);
  });

  it('shows the opponent beside the committed pick', async () => {
    parlay.getMyParlayPick.mockResolvedValue(pickOn(2));

    render();

    expect(await screen.findByText('@ KC')).toBeInTheDocument();
  });

  it('shows BYE when the picked player’s team is off', async () => {
    parlay.getMyParlayPick.mockResolvedValue(pickOn(8));

    render();

    expect(await screen.findByText('BYE')).toBeInTheDocument();
  });

  it('shows nothing for a free-text pick, which has no player to look up', async () => {
    parlay.getMyParlayPick.mockResolvedValue({
      id: 'pick-2',
      playerId: null,
      playerNameRaw: 'Some Goal Line Back',
      scoredTd: null,
      player: null
    });

    render();

    expect(await screen.findByText('Some Goal Line Back')).toBeInTheDocument();
    expect(screen.queryByText('BYE')).not.toBeInTheDocument();
    expect(screen.queryByText(/^(vs|@) /)).not.toBeInTheDocument();
  });

  it('shows the opponent on autocomplete suggestions', async () => {
    const user = userEvent.setup();
    players.searchPlayers.mockResolvedValue([
      { id: 'p1', name: 'Josh Allen', position: 'QB', teamAbbreviation: 'BUF', proTeamId: 2 },
      { id: 'p2', name: 'Jahmyr Gibbs', position: 'RB', teamAbbreviation: 'DET', proTeamId: 8 }
    ]);

    render();

    // The list needs two characters — see `showList` in the component.
    await user.type(await screen.findByLabelText(/your player/i), 'ja');
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    expect(await screen.findByText('@ KC')).toBeInTheDocument();
    expect(await screen.findByText('BYE')).toBeInTheDocument();
  });

  it('asks the calendar for the season year, once, for both chip sites', async () => {
    parlay.getMyParlayPick.mockResolvedValue(pickOn(2));

    render();

    await screen.findByText('@ KC');
    // The current pick and the picker share one cache entry; a second key
    // would let the two disagree about the same week.
    expect(nflSchedule.getNflScheduleForSeason).toHaveBeenCalledWith(SEASON_YEAR);
    expect(nflSchedule.getNflScheduleForSeason).toHaveBeenCalledTimes(1);
  });
});
