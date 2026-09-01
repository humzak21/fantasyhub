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

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    rosters,
    playerWeekStats,
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
