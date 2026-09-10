/**
 * The automation log and the freshness signals behind it.
 *
 * Every scheduled job here runs *outside* the app — GitHub Actions cron jobs
 * that hold the service-role key and the ESPN cookies the browser never
 * sees — so the only way the app can tell whether they ran is what they
 * left behind. Two kinds of evidence:
 *
 *   * `sync_runs`, one row per invocation of `scripts/sync-week.js`, which is
 *     what both the weekly sync and the daily refresh execute. The row carries
 *     `trigger` (cron or a person), `status`, the wall-clock bounds, and a
 *     `steps` object with one entry per step: `{ ok }`, `{ skipped: why }`,
 *     `{ failed: message }`, or the step's own counts. The daily refresh is
 *     the same script with six `--skip-*` flags, so which job wrote a row is
 *     *derived* from which steps say `skipped: 'flag'` — see
 *     `classifyRun` in `src/components/admin/automations/automationCatalog.js`.
 *   * The tables the steps write. A run that reported success three days ago
 *     says nothing about whether the week's snapshot exists *now*; the row
 *     counts and newest timestamps in `getAutomationHealth` do.
 *
 * Read-only. The scripts are the only writers, and nothing in the browser can
 * start one: ESPN needs cookies only the workflows hold. Every function takes
 * the shared `ctx` ({ client, seasonsCache, activeSeasonId }) as its first
 * argument; see `./context.js`.
 */

import { throwDbError } from './errors.js';
import { snakeToCamel } from './caseMap.js';
import { createLogger } from './logger.js';

const log = createLogger('db:syncRuns');

const RUN_COLUMNS =
  'id, season_id, week_number, status, trigger, steps, error, started_at, finished_at, duration_ms';

/**
 * Camel-case the row's own columns only. `steps` is left verbatim: its keys
 * are already the script's camelCase step names, and the parlay step's
 * `skipped` map is keyed by free-text reasons that a key rewrite would mangle.
 */
function toRun(row) {
  const run = {};
  for (const [key, value] of Object.entries(row)) run[snakeToCamel(key)] = value;
  run.steps = row.steps ?? {};
  return run;
}

/**
 * Recent runs, newest first. Pass `seasonId` to scope to one season; the
 * default is every season, which is what the dashboard wants when the
 * active season has not started and the interesting rows are last year's.
 */
export async function getSyncRuns(ctx, { seasonId = null, limit = 40 } = {}) {
  try {
    let query = ctx.client
      .from('sync_runs')
      .select(RUN_COLUMNS)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (seasonId) query = query.eq('season_id', seasonId);

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map(toRun);
  } catch (error) {
    throwDbError(error, 'Get sync runs');
  }
}

/** Newest row of a table by a timestamp column, filtered — or null. */
async function newest(ctx, table, column, filter, select = column) {
  let query = ctx.client.from(table).select(select).order(column, { ascending: false }).limit(1);
  query = filter(query);
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Exact row count, without fetching rows. */
async function count(ctx, table, filter) {
  let query = ctx.client.from(table).select('id', { count: 'exact', head: true });
  query = filter(query);
  const { count: total, error } = await query;
  if (error) throw error;
  return total ?? 0;
}

/**
 * What the automations have actually left in the tables they own, for one
 * season. Each signal is the newest timestamp and, where it matters, the
 * newest week — the question the dashboard asks of each is "is this as
 * current as the calendar says it should be", which `sync_runs` alone cannot
 * answer.
 *
 * `seasonYear` keys the two NFL tables, which have no season FK. `throughWeek`
 * bounds the parlay's pending count to weeks that have actually elapsed; a
 * pick for the week in progress is not overdue.
 */
export async function getAutomationHealth(ctx, { seasonId, seasonYear, throughWeek = 0 }) {
  if (!seasonId) return null;

  try {
    const [
      snapshot,
      playerStats,
      roster,
      transaction,
      nflScheduleRow,
      nflScheduleRows,
      nflRating,
      pickEmWeekRows,
      pendingParlayGrades,
      scheduleImport
    ] = await Promise.all([
      newest(ctx, 'power_rankings_history', 'week_number', (q) =>
        q.eq('season_id', seasonId).eq('snapshot_type', 'weekly'), 'week_number, created_at'),
      newest(ctx, 'player_week_stats', 'week', (q) => q.eq('season_id', seasonId), 'week, updated_at'),
      newest(ctx, 'rosters', 'created_at', (q) => q.eq('team.season_id', seasonId),
        'created_at, team:teams!inner(season_id)'),
      newest(ctx, 'transactions', 'last_synced_at', (q) => q.eq('season_id', seasonId)),
      seasonYear
        ? newest(ctx, 'nfl_schedule', 'updated_at', (q) => q.eq('season_year', seasonYear))
        : null,
      seasonYear ? count(ctx, 'nfl_schedule', (q) => q.eq('season_year', seasonYear)) : 0,
      seasonYear
        ? newest(ctx, 'nfl_team_ratings', 'week', (q) => q.eq('season_year', seasonYear),
          'week, fetched_at')
        : null,
      ctx.client.from('pick_em_weeks').select('week_number').eq('season_id', seasonId)
        .then(({ data, error }) => { if (error) throw error; return data ?? []; }),
      throughWeek > 0
        ? count(ctx, 'td_parlay_picks', (q) =>
          q.eq('season_id', seasonId).is('scored_td', null).lte('week', throughWeek))
        : 0,
      newest(ctx, 'espn_schedule_imports', 'imported_at', (q) =>
        q.eq('assigned_season_id', seasonId), 'imported_at, assignment_notes')
    ]);

    return {
      snapshot: snapshot
        ? { week: snapshot.week_number, at: snapshot.created_at }
        : null,
      playerStats: playerStats
        ? { week: playerStats.week, at: playerStats.updated_at }
        : null,
      rosters: roster ? { at: roster.created_at } : null,
      transactions: transaction ? { at: transaction.last_synced_at } : null,
      nflSchedule: { rows: nflScheduleRows, at: nflScheduleRow?.updated_at ?? null },
      nflRatings: nflRating ? { week: nflRating.week, at: nflRating.fetched_at } : null,
      pickEmWeeks: pickEmWeekRows.map((row) => row.week_number).sort((a, b) => a - b),
      pendingParlayGrades,
      scheduleImport: scheduleImport
        ? { at: scheduleImport.imported_at, summary: scheduleImport.assignment_notes }
        : null
    };
  } catch (error) {
    log.warn('automation health read failed', error);
    throwDbError(error, 'Get automation health');
  }
}
