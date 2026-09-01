/**
 * The NFL calendar: who each pro team plays in each week.
 *
 * One row per team per week — both sides of every game, plus an explicit row
 * for every bye — keyed by `season_year` rather than by `season_id`. The NFL's
 * calendar is not ours: it is the same for every league, it exists for years we
 * have no fantasy season row for, and tying it to one would mean re-importing
 * it per season for no gain. See the migration comment on the table.
 *
 * Written by `scripts/sync-nfl-schedule.js` and by the weekly sync's
 * `nflSchedule` step; read by `hooks/queries/useNflSchedule.js`. The planning
 * is pure and lives in `services/espnNflScheduleMapper.js` — this module only
 * moves rows.
 *
 * There is deliberately one reader. "One week's opponents" and "a team's bye"
 * are projections of a season's rows, not separate queries: a season is ~576
 * rows, TanStack caches it once, and every derived view is a `select` over that
 * single cache entry, so two views cannot disagree about the same week.
 *
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { createLogger } from './logger.js';

const log = createLogger('db:nflSchedule');

/** The conflict target, spelled once. Matches the unique constraint. */
const CONFLICT_TARGET = 'season_year,week,pro_team_id';

/**
 * Columns named explicitly rather than `*`, so a column added later does not
 * silently start crossing the wire to every browser.
 */
const SCHEDULE_COLUMNS = `
  season_year,
  week,
  pro_team_id,
  opponent_pro_team_id,
  is_home,
  game_time,
  espn_game_id,
  start_time_tbd,
  stats_official
`;

/**
 * Write a whole season's calendar.
 *
 * Idempotent: the unique key is (season_year, week, pro_team_id), so re-running
 * rewrites the same rows rather than doubling them. That is what makes the
 * weekly re-upsert safe, and the weekly re-upsert is what picks up flex
 * scheduling — the NFL moves late-season kickoffs, and a schedule imported in
 * September and never revisited would show the wrong time for them.
 *
 * The whole season goes in one statement rather than one per week: it is ~576
 * rows, which is a single round trip, and a partial write would leave the
 * calendar disagreeing with itself.
 *
 * @param {object} ctx
 * @param {number} seasonYear
 * @param {Array}  rows from `services/espnNflScheduleMapper.js`
 * @returns {Promise<{upserted: number, seasonYear: number}>}
 */
export async function upsertNflSchedule(ctx, seasonYear, rows = []) {
  try {
    if (!seasonYear) throw new Error('A season year is required');

    if (rows.length === 0) {
      log.warn(`${seasonYear}: nothing to write`);
      return { upserted: 0, seasonYear };
    }

    const stamped = rows.map((row) => ({ ...row, updated_at: new Date().toISOString() }));

    const { error } = await ctx.client
      .from('nfl_schedule')
      .upsert(stamped, { onConflict: CONFLICT_TARGET, ignoreDuplicates: false });

    if (error) throw error;

    log.info(`${seasonYear}: ${stamped.length} team-weeks written`);

    return { upserted: stamped.length, seasonYear };
  } catch (error) {
    throwDbError(error, 'Upsert NFL schedule');
  }
}

/**
 * One NFL season's calendar, flat and camelCased.
 *
 * Returns `[]` only when the season genuinely has no rows — a year nobody has
 * imported yet. A failure throws `DbError`, because a caller cannot tell an
 * outage from an unimported season if both come back empty, and the chip that
 * reads this would print "BYE" for a whole league on a bad request.
 *
 * @param {object} ctx
 * @param {number} seasonYear
 * @returns {Promise<object[]>}
 */
export async function getNflScheduleForSeason(ctx, seasonYear) {
  try {
    if (!seasonYear) return [];

    const { data, error } = await ctx.client
      .from('nfl_schedule')
      .select(SCHEDULE_COLUMNS)
      .eq('season_year', seasonYear)
      .order('week', { ascending: true });

    if (error) throw error;

    return (data || []).map(formatFromDatabase);
  } catch (error) {
    throwDbError(error, 'Get NFL schedule for season');
  }
}
