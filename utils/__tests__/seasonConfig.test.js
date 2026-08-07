import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  arePickEmsOpen,
  areAwardsReleased,
  deriveCurrentWeek,
  derivePickEmSchedule,
  deriveWeekEnd,
  deriveWeekStart,
  getSeasonConfig,
  isCurrentSeason,
  isPlayoffWeek,
  listWeeks,
  setSeasonConfig,
  toSeasonConfig,
  zonedWallClockToInstant
} from '../seasonConfig.js';

/** The live 2025 row, as `v_active_season` returns it. */
const season2025 = {
  id: '96925672-2fd4-4cf6-a86b-eec9b9303e89',
  year: 2025,
  start_date: '2025-09-02',
  timezone: 'America/New_York',
  regular_season_weeks: 14,
  playoff_weeks: 3,
  total_weeks: 17,
  status: 'active',
  espn_league_id: '67674700',
  espn_season_year: 2025,
  awards_release_at: '2025-12-09T05:00:00+00:00',
  pickem_open_offset_days: 0,
  pickem_open_time: '04:00:00',
  pickem_close_offset_days: 2,
  pickem_close_time: '20:00:00',
  pickem_reveal_offset_days: 7,
  pickem_reveal_time: '12:00:00'
};

afterEach(() => {
  setSeasonConfig(null);
  vi.useRealTimers();
});

describe('toSeasonConfig', () => {
  it('normalises a database row', () => {
    const config = toSeasonConfig(season2025);

    expect(config.year).toBe(2025);
    expect(config.startDate).toBe('2025-09-02');
    expect(config.weekCount).toBe(17);
    expect(config.playoffStartWeek).toBe(15);
    expect(config.pickEm.closeOffsetDays).toBe(2);
  });

  it('derives week count and playoff start when the view columns are absent', () => {
    const { total_weeks: _ignored, ...withoutTotals } = season2025;
    const config = toSeasonConfig(withoutTotals);

    expect(config.weekCount).toBe(17);
    expect(config.playoffStartWeek).toBe(15);
  });
});

describe('zonedWallClockToInstant', () => {
  it('resolves wall-clock time through a DST boundary', () => {
    // Same wall clock, different UTC offsets: EDT in September, EST in December.
    expect(zonedWallClockToInstant('2025-09-02', '00:00', 'America/New_York').toISOString())
      .toBe('2025-09-02T04:00:00.000Z');
    expect(zonedWallClockToInstant('2025-12-09', '00:00', 'America/New_York').toISOString())
      .toBe('2025-12-09T05:00:00.000Z');
  });
});

describe('deriveWeekStart', () => {
  const config = toSeasonConfig(season2025);

  it('matches the constant it replaced', () => {
    // utils/weekCalculator.js used new Date('2025-09-02T00:00:00-04:00').
    expect(deriveWeekStart(config, 1).toISOString())
      .toBe(new Date('2025-09-02T00:00:00-04:00').toISOString());
  });

  it('holds midnight local across the DST change', () => {
    // Week 15 begins 2025-12-09, after EST starts: 05:00Z, not 04:00Z.
    expect(deriveWeekStart(config, 15).toISOString()).toBe('2025-12-09T05:00:00.000Z');
  });

  it('ends one millisecond before the next week begins', () => {
    expect(deriveWeekEnd(config, 3).getTime())
      .toBe(deriveWeekStart(config, 4).getTime() - 1);
  });
});

describe('deriveCurrentWeek', () => {
  const config = toSeasonConfig(season2025);

  it('returns 1 before the season starts', () => {
    expect(deriveCurrentWeek(config, new Date('2025-08-01T12:00:00Z'))).toBe(1);
  });

  it('rolls over at midnight Tuesday in the league time zone', () => {
    // 23:59 ET Monday is still week 1; one minute later is week 2.
    expect(deriveCurrentWeek(config, new Date('2025-09-09T03:59:00Z'))).toBe(1);
    expect(deriveCurrentWeek(config, new Date('2025-09-09T04:01:00Z'))).toBe(2);
  });

  it('clamps to the season week count', () => {
    expect(deriveCurrentWeek(config, new Date('2026-08-03T12:00:00Z'))).toBe(17);
  });

  it('has no opinion when no season is configured', () => {
    expect(deriveCurrentWeek(null, new Date('2025-10-01T12:00:00Z'))).toBe(1);
  });
});

describe('derivePickEmSchedule', () => {
  const config = toSeasonConfig(season2025);

  it('reproduces the stored pick_em_weeks row for week 4 (EDT)', () => {
    expect(derivePickEmSchedule(config, 4)).toEqual({
      submissionOpensAt: '2025-09-23T08:00:00.000Z',
      submissionClosesAt: '2025-09-26T00:00:00.000Z',
      resultsRevealAt: '2025-09-30T16:00:00.000Z'
    });
  });

  it('reproduces the stored pick_em_weeks row for week 12 (EST)', () => {
    expect(derivePickEmSchedule(config, 12)).toEqual({
      submissionOpensAt: '2025-11-18T09:00:00.000Z',
      submissionClosesAt: '2025-11-21T01:00:00.000Z',
      resultsRevealAt: '2025-11-25T17:00:00.000Z'
    });
  });
});

describe('arePickEmsOpen', () => {
  const config = toSeasonConfig(season2025);

  it('uses the stored close time when a pick_em_weeks row is supplied', () => {
    const storedWeek = { submission_closes_at: '2025-09-26T00:00:00Z' };

    expect(arePickEmsOpen(config, 4, storedWeek, new Date('2025-09-25T23:59:00Z'))).toBe(true);
    expect(arePickEmsOpen(config, 4, storedWeek, new Date('2025-09-26T00:01:00Z'))).toBe(false);
  });

  it('falls back to the season rule when there is no stored row', () => {
    // Thursday 19:59 ET open, 20:01 ET closed.
    expect(arePickEmsOpen(config, 4, null, new Date('2025-09-25T23:59:00Z'))).toBe(true);
    expect(arePickEmsOpen(config, 4, null, new Date('2025-09-26T00:01:00Z'))).toBe(false);
  });

  it('is closed before the week opens', () => {
    expect(arePickEmsOpen(config, 4, null, new Date('2025-09-23T07:00:00Z'))).toBe(false);
  });
});

describe('areAwardsReleased', () => {
  const config = toSeasonConfig(season2025);

  it('gates on the season release instant', () => {
    expect(areAwardsReleased(config, new Date('2025-12-09T04:59:00Z'))).toBe(false);
    expect(areAwardsReleased(config, new Date('2025-12-09T05:01:00Z'))).toBe(true);
  });

  it('never unlocks when no release date is set', () => {
    const noDate = toSeasonConfig({ ...season2025, awards_release_at: null });
    expect(areAwardsReleased(noDate, new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('isCurrentSeason', () => {
  beforeEach(() => setSeasonConfig(season2025));

  it('prefers the row status over the year', () => {
    expect(isCurrentSeason({ year: 2019, status: 'active' })).toBe(true);
    expect(isCurrentSeason({ year: 2025, status: 'archived' })).toBe(false);
  });

  it('falls back to is_active, then to the configured year', () => {
    expect(isCurrentSeason({ year: 2024, is_active: true })).toBe(true);
    expect(isCurrentSeason({ year: 2025 })).toBe(true);
    expect(isCurrentSeason({ year: 2024 })).toBe(false);
  });

  it('handles a missing season', () => {
    expect(isCurrentSeason(null)).toBe(false);
  });
});

describe('season shape helpers', () => {
  it('knows which weeks are playoff weeks', () => {
    const config = toSeasonConfig(season2025);
    expect(isPlayoffWeek(config, 14)).toBe(false);
    expect(isPlayoffWeek(config, 15)).toBe(true);
  });

  it('lists every week once', () => {
    expect(listWeeks(toSeasonConfig(season2025))).toHaveLength(17);
    expect(listWeeks(null)).toEqual([]);
  });
});

describe('module singleton', () => {
  it('round-trips through set/get and clears', () => {
    expect(getSeasonConfig()).toBeNull();
    setSeasonConfig(season2025);
    expect(getSeasonConfig().year).toBe(2025);
    setSeasonConfig(null);
    expect(getSeasonConfig()).toBeNull();
  });
});
