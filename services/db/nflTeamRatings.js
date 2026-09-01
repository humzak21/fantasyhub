/**
 * NFL team strength, from ESPN's Football Power Index.
 *
 * One row per pro team per fantasy week, keyed by `season_year` like
 * `nfl_schedule` and for the same reason: the NFL is league-independent. The
 * weekly rows are snapshots — ESPN serves only the current FPI, so what was
 * true in week 5 exists nowhere else once week 6 arrives.
 *
 * Written by `scripts/sync-nfl-ratings.js` and the weekly sync's `nflRatings`
 * step; read by `services/db/rankings.js` for the power ranking's `nflSos`
 * component. The planning is pure and lives in `services/espnFpiMapper.js` —
 * this module only moves rows.
 *
 * The domain is `nflTeamRatings`, not a `schedule` variant, for the same
 * prefix-collision reason `nflSchedule` is not `schedule`.
 *
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { createLogger } from './logger.js';

const log = createLogger('db:nflTeamRatings');

/** The conflict target, spelled once. Matches the unique constraint. */
const CONFLICT_TARGET = 'season_year,week,pro_team_id';

/**
 * Columns named explicitly rather than `*`, so a column added later does not
 * silently start crossing the wire to every browser.
 */
const RATING_COLUMNS = `
  season_year,
  week,
  pro_team_id,
  fpi,
  epa_offense,
  epa_defense,
  epa_special_teams,
  fpi_rank,
  sos_remaining_rank,
  projected_wins,
  projected_losses,
  playoff_probability,
  fetched_at
`;

/**
 * Write one week's snapshot of every team's rating.
 *
 * Idempotent: the unique key is (season_year, week, pro_team_id), so re-running
 * the sync rewrites the same snapshot rather than doubling it.
 *
 * @param {object} ctx
 * @param {number} seasonYear
 * @param {number} week the fantasy scoring period this snapshot serves
 * @param {Array}  rows from `services/espnFpiMapper.js`
 * @returns {Promise<{upserted: number, seasonYear: number, week: number}>}
 */
export async function upsertNflTeamRatings(ctx, seasonYear, week, rows = []) {
  try {
    if (!seasonYear) throw new Error('A season year is required');
    if (!week) throw new Error('A week is required');

    if (rows.length === 0) {
      log.warn(`${seasonYear} week ${week}: nothing to write`);
      return { upserted: 0, seasonYear, week };
    }

    const now = new Date().toISOString();
    const stamped = rows.map((row) => ({ ...row, fetched_at: now, updated_at: now }));

    const { error } = await ctx.client
      .from('nfl_team_ratings')
      .upsert(stamped, { onConflict: CONFLICT_TARGET, ignoreDuplicates: false });

    if (error) throw error;

    log.info(`${seasonYear} week ${week}: ${stamped.length} team ratings written`);

    return { upserted: stamped.length, seasonYear, week };
  } catch (error) {
    throwDbError(error, 'Upsert NFL team ratings');
  }
}

/**
 * The most recent snapshot for a season, keyed by proTeamId.
 *
 * "Latest" is enough: the `nflSos` component is live-view-only, so nothing
 * ever asks for an older week — those rows exist for reproducibility and
 * audit, not for a reader. Keeping only the max-week rows here means one
 * query and no per-consumer week arithmetic.
 *
 * An unimported year returns `{ week: null, byProTeamId: {} }` — a real
 * answer, which the caller degrades to a null component. A failed query
 * throws `DbError`: a caller that saw an empty map for both could not tell an
 * outage from a season nobody has synced.
 *
 * @param {object} ctx
 * @param {number} seasonYear
 * @returns {Promise<{ week: number|null, byProTeamId: Object }>}
 */
export async function getLatestNflTeamRatings(ctx, seasonYear) {
  try {
    if (!seasonYear) return { week: null, byProTeamId: {} };

    const { data, error } = await ctx.client
      .from('nfl_team_ratings')
      .select(RATING_COLUMNS)
      .eq('season_year', seasonYear)
      .order('week', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) return { week: null, byProTeamId: {} };

    // Rows arrive newest week first; the first row's week is the latest.
    const latestWeek = data[0].week;
    const byProTeamId = {};

    for (const row of data) {
      if (row.week !== latestWeek) break;
      const formatted = formatFromDatabase(row);
      byProTeamId[formatted.proTeamId] = formatted;
    }

    return { week: latestWeek, byProTeamId };
  } catch (error) {
    throwDbError(error, 'Get latest NFL team ratings');
  }
}
