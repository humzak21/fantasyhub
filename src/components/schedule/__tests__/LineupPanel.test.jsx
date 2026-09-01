/**
 * The lineup disclosure on a schedule card.
 *
 * The behaviour that carries weight is *which table it reads*. A week that is
 * over is a past-tense question and must come from `player_week_stats` — who
 * actually started, with what they actually scored. A week that is still live
 * is a present-tense question, and `player_week_stats` cannot answer one: it is
 * written once a week by the cron, so it describes a roster that has since
 * taken waivers. Reading the wrong one is invisible on screen (the names are
 * all plausible) and wrong, which is exactly why it is asserted here.
 *
 * It must also fetch nothing until the disclosure is opened.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor, within } from '../../../test/renderWithProviders.jsx';

const rosters = { getCurrentLineupsForWeek: vi.fn(async () => []) };
const playerWeekStats = { getPlayerWeekStatsForWeek: vi.fn(async () => []) };
const nflSchedule = { getNflScheduleForSeason: vi.fn(async () => []) };

/** Four weeks in, so week 5 is live and weeks 1-4 are history. */
const ACTUAL_WEEK = 5;
const startDate = new Date(Date.now() - (ACTUAL_WEEK - 1) * 7 * 86_400_000 - 86_400_000)
  .toISOString()
  .slice(0, 10);

const SEASON_ROW = {
  id: 's1',
  year: 2026,
  espn_season_year: 2026,
  start_date: startDate,
  timezone: 'UTC',
  regular_season_weeks: 14,
  playoff_weeks: 3,
  is_active: true
};

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // `useActiveSeason` drops the data layer's own memo before refetching, and
  // that reaches for a real Supabase client. Without this the season query
  // fails, `useActualWeek` stays at its 1 default, and every week looks live.
  getContext: () => ({ seasonsCache: new Map(), activeSeasonId: null }),
  getDb: () => ({
    rosters,
    playerWeekStats,
    nflSchedule,
    users: { isParlayCommissioner: async () => false },
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

const { default: ScheduleManager } = await import('../ScheduleManager.jsx');

const TEAM_1 = { id: 't1', name: 'Team One', owner: 'Arya Shah' };
const TEAM_2 = { id: 't2', name: 'Team Two', owner: 'Rohit Ramki' };

const SEASON = {
  ...SEASON_ROW,
  teams: [TEAM_1, TEAM_2],
  totalWeeks: 17,
  regularSeasonWeeks: 14
};

const gameForWeek = (week) => ({
  id: `g-${week}`,
  week,
  team1Id: 't1',
  team2Id: 't2',
  team1Score: 101.2,
  team2Score: 99.4,
  isCompleted: week < ACTUAL_WEEK,
  type: 'regular'
});

/** The `rosters` prop is only the disclosure's "is there anything here" gate. */
const ROSTER_PROP = {
  t1: { roster: [{ id: 'x' }] },
  t2: { roster: [{ id: 'y' }] }
};

const row = (over) => ({
  id: 'r1',
  teamId: 't1',
  rosterSlot: 'QB',
  started: true,
  position: 'QB',
  proTeamId: 2,
  actualPoints: null,
  projectedPoints: null,
  injuryStatus: null,
  player: { name: 'Josh Allen', position: 'QB', proTeamId: 2 },
  ...over
});

const renderWeek = (week) =>
  renderWithProviders(
    <ScheduleManager season={SEASON} schedule={[gameForWeek(week)]} currentWeek={week} rosters={ROSTER_PROP} />
  );

const openLineups = async () => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /lineups/i }));
};

beforeEach(() => {
  vi.clearAllMocks();
  rosters.getCurrentLineupsForWeek.mockResolvedValue([]);
  playerWeekStats.getPlayerWeekStatsForWeek.mockResolvedValue([]);
  nflSchedule.getNflScheduleForSeason.mockResolvedValue([]);
});

describe('ScheduleManager lineups', () => {
  it('reads the week once for the whole card list, and again for no disclosure', async () => {
    // The week's lineups are no longer lazy — the card's projected score line
    // needs them before anything is expanded. What still holds is that it is
    // *one* query for fourteen cards, and that opening a disclosure adds no
    // fetch of its own: the panel reads the same cache entry.
    rosters.getCurrentLineupsForWeek.mockResolvedValue([row({ projectedPoints: 21.4 })]);

    renderWeek(ACTUAL_WEEK);
    await waitFor(() => expect(rosters.getCurrentLineupsForWeek).toHaveBeenCalledTimes(1));

    await openLineups();
    expect(await screen.findByText('Josh Allen')).toBeInTheDocument();

    expect(rosters.getCurrentLineupsForWeek).toHaveBeenCalledTimes(1);
  });

  it('renders no squad lists until the disclosure is opened', async () => {
    // The laziness that mattered is the DOM's, not the query's: a week of
    // fixtures must not carry fourteen squad lists.
    rosters.getCurrentLineupsForWeek.mockResolvedValue([row({ projectedPoints: 21.4 })]);

    renderWeek(ACTUAL_WEEK);
    await waitFor(() => expect(rosters.getCurrentLineupsForWeek).toHaveBeenCalled());

    expect(screen.queryByText('Josh Allen')).not.toBeInTheDocument();
  });

  it('asks neither table until it knows which week the league is in', async () => {
    // `useActualWeek()` answers 1 while the season loads, which is
    // indistinguishable from a real week 1. Firing on that default would send
    // a finished week to the live-roster query and total it off the current
    // roster for a render.
    renderWeek(3);

    expect(rosters.getCurrentLineupsForWeek).not.toHaveBeenCalled();
    expect(playerWeekStats.getPlayerWeekStatsForWeek).not.toHaveBeenCalled();
  });

  it('reads the live roster for the week the league is actually in', async () => {
    rosters.getCurrentLineupsForWeek.mockResolvedValue([row({ projectedPoints: 21.4 })]);

    renderWeek(ACTUAL_WEEK);
    await openLineups();

    expect(await screen.findByText('Josh Allen')).toBeInTheDocument();
    expect(rosters.getCurrentLineupsForWeek).toHaveBeenCalledWith('s1', ACTUAL_WEEK);
    expect(playerWeekStats.getPlayerWeekStatsForWeek).not.toHaveBeenCalled();
  });

  it('reads the stored week for a week that is over', async () => {
    playerWeekStats.getPlayerWeekStatsForWeek.mockResolvedValue([row({ actualPoints: 18.2 })]);

    renderWeek(3);
    await openLineups();

    expect(await screen.findByText('Josh Allen')).toBeInTheDocument();
    expect(playerWeekStats.getPlayerWeekStatsForWeek).toHaveBeenCalledWith('s1', 3);
    // The current roster would be an anachronism on a finished week.
    expect(rosters.getCurrentLineupsForWeek).not.toHaveBeenCalled();
  });

  it('labels a projection and leaves an actual bare', async () => {
    rosters.getCurrentLineupsForWeek.mockResolvedValue([
      row({ projectedPoints: 21.4 }),
      row({ id: 'r2', rosterSlot: 'RB', position: 'RB', actualPoints: 18.2, projectedPoints: 11, player: { name: 'Bijan Robinson', position: 'RB' } })
    ]);

    renderWeek(ACTUAL_WEEK);
    await openLineups();

    expect(await screen.findByText('21.4')).toBeInTheDocument();
    expect(screen.getByText('proj')).toBeInTheDocument();
    expect(screen.getByText('18.2')).toBeInTheDocument();
    // The settled player's own projection is gone, not merely dimmed.
    expect(screen.queryByText('11.0')).not.toBeInTheDocument();
  });

  it('shows the NFL opponent, and nothing at all for a team the calendar misses', async () => {
    rosters.getCurrentLineupsForWeek.mockResolvedValue([
      row({ projectedPoints: 21.4 }),
      row({
        id: 'r2',
        rosterSlot: 'RB',
        position: 'RB',
        proTeamId: 99,
        projectedPoints: 9,
        player: { name: 'Nobody Known', position: 'RB' }
      })
    ]);
    nflSchedule.getNflScheduleForSeason.mockResolvedValue([
      { proTeamId: 2, opponentProTeamId: 12, week: ACTUAL_WEEK, isHome: true, statsOfficial: false }
    ]);

    renderWeek(ACTUAL_WEEK);
    await openLineups();

    expect(await screen.findByText('vs KC')).toBeInTheDocument();
    // No placeholder for the unknown team — a guess here would read as a fact.
    expect(screen.queryByText('BYE')).not.toBeInTheDocument();
    expect(nflSchedule.getNflScheduleForSeason).toHaveBeenCalledWith(2026);
  });

  it('says so, rather than rendering an empty column, when a week has no lineups', async () => {
    // Every week before 2026 is this case: `player_week_stats` does not go back.
    renderWeek(3);
    await openLineups();

    expect(await screen.findByText(/no lineup data for this week/i)).toBeInTheDocument();
  });

  it('marks an injured player', async () => {
    rosters.getCurrentLineupsForWeek.mockResolvedValue([
      row({ injuryStatus: 'QUESTIONABLE', projectedPoints: 21.4 })
    ]);

    renderWeek(ACTUAL_WEEK);
    await openLineups();

    expect(await screen.findByLabelText('QUESTIONABLE')).toBeInTheDocument();
  });

  it('groups starters, bench and IR', async () => {
    rosters.getCurrentLineupsForWeek.mockResolvedValue([
      row({ projectedPoints: 21.4 }),
      row({ id: 'r2', rosterSlot: 'BE', position: 'RB', player: { name: 'A Benchwarmer', position: 'RB' } }),
      row({ id: 'r3', rosterSlot: 'IR', position: 'WR', player: { name: 'A Crock', position: 'WR' } })
    ]);

    renderWeek(ACTUAL_WEEK);
    await openLineups();

    const column = (await screen.findByText('Josh Allen')).closest('div.space-y-3');
    expect(within(column).getByText('Starters')).toBeInTheDocument();
    expect(within(column).getByText('Bench')).toBeInTheDocument();
    expect(within(column).getByText('Injured reserve')).toBeInTheDocument();
  });
});


describe('ScheduleManager projected score line', () => {
  it('projects the total from the lineup while a game has no score', async () => {
    rosters.getCurrentLineupsForWeek.mockResolvedValue([
      row({ teamId: 't1', projectedPoints: 21.4 }),
      row({ id: 'r2', teamId: 't1', rosterSlot: 'RB', projectedPoints: 11.1 }),
      row({ id: 'r3', teamId: 't2', rosterSlot: 'WR', projectedPoints: 14.3 })
    ]);

    renderWithProviders(
      <ScheduleManager
        season={SEASON}
        schedule={[{ ...gameForWeek(ACTUAL_WEEK), team1Score: null, team2Score: null }]}
        currentWeek={ACTUAL_WEEK}
        rosters={ROSTER_PROP}
      />
    );

    // 21.4 + 11.1 against 14.3, both still projections.
    expect(await screen.findByText('32.5')).toBeInTheDocument();
    expect(screen.getByText('14.3')).toBeInTheDocument();
    expect(screen.getAllByText('proj')).toHaveLength(2);
  });

  it('shows the imported score instead, once there is one', async () => {
    rosters.getCurrentLineupsForWeek.mockResolvedValue([
      row({ teamId: 't1', projectedPoints: 21.4 })
    ]);

    renderWithProviders(
      <ScheduleManager
        season={SEASON}
        schedule={[gameForWeek(ACTUAL_WEEK)]}
        currentWeek={ACTUAL_WEEK}
        rosters={ROSTER_PROP}
      />
    );

    expect(await screen.findByText('101.2')).toBeInTheDocument();
    expect(screen.getByText('99.4')).toBeInTheDocument();
    // Replaced, not shown beside it.
    expect(screen.queryByText('21.4')).not.toBeInTheDocument();
    expect(screen.queryByText('proj')).not.toBeInTheDocument();
  });

  it('leaves the em dash alone for a week with no player data', async () => {
    // Every season before 2026 is this case.
    renderWithProviders(
      <ScheduleManager
        season={SEASON}
        schedule={[{ ...gameForWeek(ACTUAL_WEEK), team1Score: null, team2Score: null }]}
        currentWeek={ACTUAL_WEEK}
        rosters={ROSTER_PROP}
      />
    );

    await waitFor(() => expect(rosters.getCurrentLineupsForWeek).toHaveBeenCalled());

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('proj')).not.toBeInTheDocument();
  });

  it('stops calling the total a projection once every starter has played', async () => {
    rosters.getCurrentLineupsForWeek.mockResolvedValue([
      row({ teamId: 't1', actualPoints: 18.2, projectedPoints: 21.4 }),
      row({ id: 'r2', teamId: 't1', rosterSlot: 'RB', actualPoints: 4, projectedPoints: 11 })
    ]);

    renderWithProviders(
      <ScheduleManager
        season={SEASON}
        schedule={[{ ...gameForWeek(ACTUAL_WEEK), team1Score: null, team2Score: null }]}
        currentWeek={ACTUAL_WEEK}
        rosters={ROSTER_PROP}
      />
    );

    expect(await screen.findByText('22.2')).toBeInTheDocument();
    expect(screen.queryByText('proj')).not.toBeInTheDocument();
  });
});
