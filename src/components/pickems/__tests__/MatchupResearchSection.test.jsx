/**
 * The matchup research cards.
 *
 * Three behaviours carry weight. It is collapsed by default and fetches nothing
 * until opened — a hundred-odd player rows on a page most people visit to
 * click two buttons is a cost nobody asked for. A team with no synced roster
 * must say so, rather than rendering an empty card that reads as "this team is
 * starting nobody". And it must read the *live* roster: it used to read
 * `player_week_stats`, a table the cron writes once a week, which on
 * 2026-08-31 had it naming 122 of 125 starters wrongly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../../../test/renderWithProviders.jsx';

const rosters = { getCurrentLineupsForWeek: vi.fn(async () => []) };
/** Kept mocked so a regression back to this source fails loudly rather than
 *  falling through to a real client. */
const playerWeekStats = { getPlayerWeekStatsForWeek: vi.fn(async () => []) };
const nflSchedule = { getNflScheduleForSeason: vi.fn(async () => []) };

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    rosters,
    playerWeekStats,
    nflSchedule,
    users: { isParlayCommissioner: async () => false },
    seasons: { getActiveSeason: async () => null }
  })
}));

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({
    user: { id: 'u1', user_metadata: { name: 'Arya Shah' } },
    isAuthenticated: true,
    isAdmin: true,
    loading: false
  })
}));

const { default: MatchupResearchSection } = await import('../MatchupResearchSection.jsx');

const TEAM_1 = { id: 't1', name: 'Team One', owner: 'Arya Shah' };
const TEAM_2 = { id: 't2', name: 'Team Two', owner: 'Rohit Ramki' };

const GAMES = [{ id: 'g1', team1: TEAM_1, team2: TEAM_2 }];
const BYE_GAME = [{ id: 'g2', team1: TEAM_1, team2: null, type: 'bye' }];

const ROWS = [
  {
    id: 'r1',
    teamId: 't1',
    rosterSlot: 'QB',
    started: true,
    projectedPoints: 21.4,
    actualPoints: null,
    player: { name: 'Josh Allen', position: 'QB' }
  },
  {
    id: 'r2',
    teamId: 't1',
    rosterSlot: 'BE',
    started: false,
    projectedPoints: 9,
    actualPoints: null,
    player: { name: 'A Benchwarmer', position: 'RB' }
  },
  {
    id: 'r3',
    teamId: 't2',
    rosterSlot: 'WR',
    started: true,
    projectedPoints: 15.1,
    actualPoints: null,
    player: { name: 'Justin Jefferson', position: 'WR' }
  }
];

beforeEach(() => {
  vi.clearAllMocks();
  rosters.getCurrentLineupsForWeek.mockResolvedValue([]);
  playerWeekStats.getPlayerWeekStatsForWeek.mockResolvedValue([]);
});

describe('MatchupResearchSection', () => {
  it('is collapsed, and fetches nothing, until it is opened', async () => {
    renderWithProviders(<MatchupResearchSection seasonId="s1" week={3} games={GAMES} />);

    expect(screen.getByRole('button', { name: /research matchups/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(rosters.getCurrentLineupsForWeek).not.toHaveBeenCalled();
  });

  it('renders nothing at all without games', () => {
    const { container } = renderWithProviders(
      <MatchupResearchSection seasonId="s1" week={3} games={[]} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('fetches the week once opened and lists starters, not the bench', async () => {
    const user = userEvent.setup();
    rosters.getCurrentLineupsForWeek.mockResolvedValue(ROWS);

    renderWithProviders(<MatchupResearchSection seasonId="s1" week={3} games={GAMES} />);

    await user.click(screen.getByRole('button', { name: /research matchups/i }));
    expect(rosters.getCurrentLineupsForWeek).toHaveBeenCalledWith('s1', 3);

    const matchup = await screen.findByRole('button', { name: /team one/i });
    await user.click(matchup);

    expect(await screen.findByText('Josh Allen')).toBeInTheDocument();
    expect(screen.getByText('Justin Jefferson')).toBeInTheDocument();
    expect(screen.queryByText('A Benchwarmer')).not.toBeInTheDocument();
  });

  it('reads the live roster, never the weekly stats snapshot', async () => {
    const user = userEvent.setup();
    rosters.getCurrentLineupsForWeek.mockResolvedValue(ROWS);

    renderWithProviders(<MatchupResearchSection seasonId="s1" week={3} games={GAMES} />);
    await user.click(screen.getByRole('button', { name: /research matchups/i }));

    expect(await screen.findByRole('button', { name: /team one/i })).toBeInTheDocument();
    // The staleness bug this component was fixed for: `player_week_stats` is a
    // once-a-week historical table and cannot answer "who is starting now".
    expect(playerWeekStats.getPlayerWeekStatsForWeek).not.toHaveBeenCalled();
  });

  it('shows a starter with no projection rather than dropping them', async () => {
    const user = userEvent.setup();
    rosters.getCurrentLineupsForWeek.mockResolvedValue([
      {
        id: 'r9',
        teamId: 't1',
        rosterSlot: 'RB',
        started: true,
        projectedPoints: null,
        actualPoints: null,
        player: { name: 'Waiver Pickup', position: 'RB' }
      }
    ]);

    renderWithProviders(<MatchupResearchSection seasonId="s1" week={3} games={GAMES} />);
    await user.click(screen.getByRole('button', { name: /research matchups/i }));
    await user.click(await screen.findByRole('button', { name: /team one/i }));

    expect(await screen.findByText('Waiver Pickup')).toBeInTheDocument();
  });

  it('says so when a team has no synced roster rather than showing an empty lineup', async () => {
    const user = userEvent.setup();

    renderWithProviders(<MatchupResearchSection seasonId="s1" week={9} games={GAMES} />);

    await user.click(screen.getByRole('button', { name: /research matchups/i }));
    const matchup = await screen.findByRole('button', { name: /team one/i });
    await user.click(matchup);

    expect(await screen.findByText(/no roster has been synced/i)).toBeInTheDocument();
  });

  it('marks a bye instead of rendering a second, empty column', async () => {
    const user = userEvent.setup();
    rosters.getCurrentLineupsForWeek.mockResolvedValue(ROWS);

    renderWithProviders(<MatchupResearchSection seasonId="s1" week={3} games={BYE_GAME} />);

    await user.click(screen.getByRole('button', { name: /research matchups/i }));

    expect(await screen.findByText(/on bye/i)).toBeInTheDocument();
    expect(screen.queryByText('Team Two')).not.toBeInTheDocument();
  });
});

/**
 * The NFL opponent chip.
 *
 * The distinction worth protecting is bye-versus-unknown: a bye is asserted by
 * a row in `nfl_schedule`, and no row means the calendar has nothing to say.
 * Rendering the second as "BYE" would tell a reader their starter has the week
 * off when in fact they are playing, which is the one error a research panel
 * must not make.
 */
describe('MatchupResearchSection · opponent chips', () => {
  const SEASON_YEAR = 2026;

  /** BUF(2) away at KC(12); DET(8) is on a bye. */
  const NFL_ROWS = [
    { seasonYear: SEASON_YEAR, week: 3, proTeamId: 2, opponentProTeamId: 12, isHome: false },
    { seasonYear: SEASON_YEAR, week: 3, proTeamId: 12, opponentProTeamId: 2, isHome: true },
    { seasonYear: SEASON_YEAR, week: 3, proTeamId: 8, opponentProTeamId: null, isHome: null }
  ];

  const LINEUP = [
    {
      id: 'r1',
      teamId: 't1',
      proTeamId: 2,
      rosterSlot: 'QB',
      started: true,
      projectedPoints: 21.4,
      actualPoints: null,
      player: { name: 'Josh Allen', position: 'QB' }
    },
    {
      id: 'r2',
      teamId: 't1',
      proTeamId: 8,
      rosterSlot: 'RB',
      started: true,
      projectedPoints: 14.2,
      actualPoints: null,
      player: { name: 'Jahmyr Gibbs', position: 'RB' }
    },
    {
      id: 'r3',
      teamId: 't1',
      proTeamId: 99,
      rosterSlot: 'WR',
      started: true,
      projectedPoints: 9.1,
      actualPoints: null,
      player: { name: 'Unknown Team', position: 'WR' }
    }
  ];

  beforeEach(() => {
    rosters.getCurrentLineupsForWeek.mockResolvedValue(LINEUP);
    nflSchedule.getNflScheduleForSeason.mockResolvedValue(NFL_ROWS);
  });

  const open = async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MatchupResearchSection
        seasonId="s1"
        seasonYear={SEASON_YEAR}
        week={3}
        games={GAMES}
      />
    );
    await user.click(await screen.findByRole('button', { name: /research/i }));
    await user.click(await screen.findByRole('button', { name: /Team One/ }));
    return user;
  };

  it('shows the opponent, with home and away spelled differently', async () => {
    await open();

    expect(await screen.findByText('@ KC')).toBeInTheDocument();
  });

  it('shows BYE for a starter whose team is off', async () => {
    await open();

    expect(await screen.findByText('BYE')).toBeInTheDocument();
  });

  it('shows nothing for a player the calendar does not cover', async () => {
    await open();

    // proTeamId 99 has no row. The starter still renders, and its chip is
    // empty — never "vs null", and never "BYE", which would be a claim.
    const row = (await screen.findByText('Unknown Team')).closest('li');

    expect(row).toBeInTheDocument();
    expect(row.textContent).not.toMatch(/BYE|vs|@/);
  });

  it('asks the NFL calendar for the season year, not the season id', async () => {
    await open();

    expect(nflSchedule.getNflScheduleForSeason).toHaveBeenCalledWith(SEASON_YEAR);
  });

  it('does not query the calendar at all without a season year', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MatchupResearchSection seasonId="s1" week={3} games={GAMES} />);
    await user.click(await screen.findByRole('button', { name: /research/i }));
    await user.click(await screen.findByRole('button', { name: /Team One/ }));

    // The lineups still load; only the chips are absent.
    expect(await screen.findByText('Josh Allen')).toBeInTheDocument();
    expect(nflSchedule.getNflScheduleForSeason).not.toHaveBeenCalled();
  });
});
