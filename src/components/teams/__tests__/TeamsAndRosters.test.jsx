/**
 * The Teams tab's roster rows.
 *
 * Three things this asserts, all of them things that were silently wrong or
 * absent before: the injury dot reads `players.injury_status` (it used to read
 * a column `rosters` does not have, so it never fired), the opponent chip
 * shows nothing rather than a placeholder for a team the calendar does not
 * cover, and the projection is labelled — this tab has no week to have a
 * result for, so an unlabelled number would read as one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../../../test/renderWithProviders.jsx';

const nflSchedule = { getNflScheduleForSeason: vi.fn(async () => []) };

const SEASON_ROW = {
  id: 's1',
  year: 2026,
  espn_season_year: 2026,
  start_date: new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10),
  timezone: 'UTC',
  regular_season_weeks: 14,
  playoff_weeks: 3,
  is_active: true
};

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getContext: () => ({ seasonsCache: new Map(), activeSeasonId: null }),
  getDb: () => ({
    nflSchedule,
    users: { isParlayCommissioner: async () => false, isApprovedMember: async () => true },
    seasons: { getActiveSeason: async () => SEASON_ROW }
  })
}));

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({
    user: { id: 'u1', user_metadata: { name: 'Arya Shah' } },
    isAuthenticated: true,
    isAdmin: false,
    loading: false
  })
}));

const { default: TeamsAndRosters } = await import('../TeamsAndRosters.jsx');

const TEAMS = [{ id: 't1', name: 'Team One', owner: 'Arya Shah' }];

const ROSTERS = {
  t1: {
    roster: [
      {
        id: 'r1',
        rosterSlot: 'QB',
        player: {
          id: 'p1',
          name: 'Josh Allen',
          position: 'QB',
          proTeamId: 2,
          projectedPoints: 21.4,
          injuryStatus: 'QUESTIONABLE'
        }
      },
      {
        id: 'r2',
        rosterSlot: 'RB',
        player: {
          id: 'p2',
          name: 'Nobody Known',
          position: 'RB',
          proTeamId: 99,
          projectedPoints: null,
          injuryStatus: 'ACTIVE'
        }
      }
    ]
  }
};

/**
 * The chips arrive on a second query, and the roster re-renders around them —
 * so `waitFor` on the assertion, not `findBy` on the node: a node found while
 * that render is in flight can be replaced before the assertion reads it.
 */
const awaitChips = () => waitFor(() => expect(screen.getByText('@ KC')).toBeInTheDocument());

const renderTab = () =>
  renderWithProviders(
    <TeamsAndRosters season={SEASON_ROW} teams={TEAMS} rosters={ROSTERS} />
  );

beforeEach(() => {
  vi.clearAllMocks();
  nflSchedule.getNflScheduleForSeason.mockResolvedValue([
    { proTeamId: 2, opponentProTeamId: 12, week: 2, isHome: false, statsOfficial: false }
  ]);
});

describe('TeamsAndRosters', () => {
  it('asks the NFL calendar for the season year, not the season id', async () => {
    renderTab();
    await awaitChips();
    expect(nflSchedule.getNflScheduleForSeason).toHaveBeenCalledWith(2026);
  });

  it('renders no chip for a team the calendar does not cover', async () => {
    renderTab();
    await awaitChips();

    // Never a placeholder: a guess here would tell a manager something false.
    expect(screen.queryByText('BYE')).not.toBeInTheDocument();
    expect(screen.getByText('Nobody Known')).toBeInTheDocument();
  });

  it('labels the projection, and shows an em dash where there is none', async () => {
    renderTab();
    await awaitChips();

    expect(screen.getByText('21.4')).toBeInTheDocument();
    expect(screen.getByText('proj')).toBeInTheDocument();
    // Not "proj 0.0" — an unprojected player has not been projected to score
    // nothing. See the `?? null` in `services/espnRosterUpdater.js`.
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('marks an injured player, from the player row rather than the roster row', async () => {
    renderTab();
    expect(await screen.findByLabelText('QUESTIONABLE')).toBeInTheDocument();
  });
});
