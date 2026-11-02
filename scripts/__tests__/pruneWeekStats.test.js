/**
 * The repair deletes from production, so what is under test is what it will not
 * do: touch a week in progress, write without being told to, or remove a row
 * that holds a result.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  seasons: { getSeason: vi.fn() },
  playerWeekStats: { findLeftBehindRows: vi.fn(), deletePlayerWeekRows: vi.fn() }
}));
const seasonRow = vi.hoisted(() => ({ value: null }));

vi.mock('../../services/db/client.server.js', () => ({}));
vi.mock('../backfill-transactions.js', () => ({ espnFor: () => ({}) }));
vi.mock('../../services/espnScheduleFetcher.js', () => ({
  createScheduleFetcher: async () => ({
    getSingleWeek: async () => ({
      matchups: [{
        espnWinner: 'HOME',
        homeTeam: {
          teamId: 1,
          rosterForCurrentScoringPeriod: {
            entries: [{ lineupSlotId: 0, playerPoolEntry: { player: { id: 101, defaultPositionId: 1 } } }]
          }
        }
      }]
    })
  })
}));
vi.mock('../../services/db/index.js', () => ({
  getDb: () => db,
  getContext: () => ({
    client: {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: seasonRow.value, error: null }) }) })
      })
    }
  })
}));

const { finishedWeeks, planWeek, prunePlayerWeekStats } = await import('../prune-player-week-stats.js');

const SEASON = {
  id: 'season-1',
  year: 2026,
  is_completed: false,
  start_date: '2026-09-08',
  regular_season_weeks: 14,
  playoff_weeks: 3
};

const row = (overrides = {}) => ({
  id: 'row-1',
  teamId: 'team-a',
  rosterSlot: 'QB',
  started: true,
  actualPoints: null,
  projectedPoints: 20.42,
  player: { name: 'A Quarterback' },
  ...overrides
});

describe('finishedWeeks', () => {
  it('stops before the week in progress', () => {
    // Monday of week 8: its Monday-night game has not been played.
    expect(finishedWeeks(SEASON, new Date('2026-11-02T18:00:00Z'))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('includes that week once the next has begun', () => {
    expect(finishedWeeks(SEASON, new Date('2026-11-03T18:00:00Z'))).toHaveLength(8);
  });

  it('has nothing to offer before the first week is over', () => {
    expect(finishedWeeks(SEASON, new Date('2026-09-10T18:00:00Z'))).toEqual([]);
  });

  it('runs a completed season to its last playoff week', () => {
    expect(finishedWeeks({ ...SEASON, is_completed: true })).toHaveLength(17);
  });
});

describe('planWeek', () => {
  it('counts the starters and picks out any row with a result', () => {
    const plan = planWeek([
      row(),
      row({ id: 'row-2', started: false }),
      row({ id: 'row-3', actualPoints: 0 })
    ]);

    expect(plan.ids).toEqual(['row-1', 'row-2', 'row-3']);
    expect(plan.started).toBe(2);
    // A settled 0 is a result, not a missing one.
    expect(plan.withResult.map((r) => r.id)).toEqual(['row-3']);
  });
});

describe('prunePlayerWeekStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    seasonRow.value = { ...SEASON, is_completed: true };
    db.seasons.getSeason.mockResolvedValue({ teams: [{ id: 'team-a', name: 'Team A', espn_team_id: 1 }] });
    db.playerWeekStats.findLeftBehindRows.mockResolvedValue([row()]);
    db.playerWeekStats.deletePlayerWeekRows.mockImplementation(async (ids) => ids.length);
  });

  it('deletes nothing without --apply', async () => {
    await prunePlayerWeekStats(['2026', '3']);

    expect(db.playerWeekStats.findLeftBehindRows).toHaveBeenCalledOnce();
    expect(db.playerWeekStats.deletePlayerWeekRows).not.toHaveBeenCalled();
  });

  it('deletes the rows it printed with --apply', async () => {
    await prunePlayerWeekStats(['2026', '3', '--apply']);

    expect(db.playerWeekStats.deletePlayerWeekRows).toHaveBeenCalledWith(['row-1']);
  });

  it('refuses a week holding a row with a result, even with --apply', async () => {
    db.playerWeekStats.findLeftBehindRows.mockResolvedValue([row(), row({ id: 'row-2', actualPoints: 12 })]);

    await expect(prunePlayerWeekStats(['2026', '3', '--apply'])).rejects.toThrow(/Refused week/);
    expect(db.playerWeekStats.deletePlayerWeekRows).not.toHaveBeenCalled();
  });

  it('fails loudly when the database removed fewer rows than it was asked to', async () => {
    db.playerWeekStats.deletePlayerWeekRows.mockResolvedValue(0);

    await expect(prunePlayerWeekStats(['2026', '3', '--apply'])).rejects.toThrow(/1 rows and 0 went/);
  });

  it('refuses a week that is not over', async () => {
    seasonRow.value = SEASON;

    await expect(prunePlayerWeekStats(['2026', '16', '--apply'])).rejects.toThrow(/not a finished week/);
    expect(db.playerWeekStats.findLeftBehindRows).not.toHaveBeenCalled();
  });

  it('needs a season', async () => {
    await expect(prunePlayerWeekStats([])).rejects.toThrow(/Name the season/);
  });
});
