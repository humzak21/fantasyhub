/**
 * When the weekly sync should do nothing, and when it should shout.
 *
 * The cron fires every week of the year. Between February and September there
 * is nothing to sync, and a job that fails every week is a job nobody reads —
 * so out-of-season runs exit quietly. A season with no `start_date` is the one
 * case that must not be quiet: every week number in the app is derived from it,
 * so a missing one makes the sync silently target the wrong week.
 */

import { describe, it, expect } from 'vitest';

import { reasonToSkip } from '../sync-week.js';
import { toSeasonConfig } from '../../utils/seasonConfig.js';

const seasonRow = (overrides = {}) => ({
  id: 'season-2026',
  year: 2026,
  start_date: '2026-09-08',
  timezone: 'America/New_York',
  regular_season_weeks: 14,
  playoff_weeks: 3,
  is_active: true,
  is_completed: false,
  ...overrides
});

const check = (overrides, now) => {
  const row = seasonRow(overrides);
  return reasonToSkip(row, toSeasonConfig(row), now);
};

describe('reasonToSkip', () => {
  it('carries on once the season has started', () => {
    expect(check({}, new Date('2026-10-01T12:00:00Z'))).toBeNull();
  });

  it('skips a completed season', () => {
    expect(check({ is_completed: true }, new Date('2026-10-01T12:00:00Z')))
      .toMatch(/completed/);
  });

  it('skips a season that has not started yet', () => {
    expect(check({}, new Date('2026-08-18T12:00:00Z'))).toMatch(/starts 2026-09-08/);
  });

  it('carries on from the first instant of week 1', () => {
    // Midnight on the start date, in the season's own zone.
    expect(check({}, new Date('2026-09-08T04:00:00Z'))).toBeNull();
  });

  // Quiet here would mean syncing week 1 of a season that has no week 1, or
  // whatever week the fallback happened to produce.
  it('throws, naming the column, when the season has no start date', () => {
    expect(() => check({ start_date: null }, new Date('2026-10-01T12:00:00Z')))
      .toThrow(/start_date/);
  });

  it('skips a completed season even when its start date is missing', () => {
    expect(check({ is_completed: true, start_date: null }, new Date('2026-10-01T12:00:00Z')))
      .toMatch(/completed/);
  });

  /**
   * `--force` is applied by `syncWeek`, not here. This function's job is to
   * report the truth about the season window; whether to obey it is the
   * caller's call, and keeping that split is what lets the forced run still
   * print *why* it should not have run.
   */
  it('still reports the reason when the caller intends to override it', () => {
    expect(check({}, new Date('2026-09-01T12:00:00Z'))).toMatch(/starts 2026-09-08/);
  });
});
