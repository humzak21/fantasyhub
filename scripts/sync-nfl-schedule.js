#!/usr/bin/env node

/**
 * Import the NFL calendar from ESPN.
 *
 * The start-of-season job for `nfl_schedule`, and the backfill for every season
 * before this one. The weekly sync re-runs the same import for the active
 * season on its own (see `scripts/sync-week.js`), so in ordinary operation
 * nobody needs to run this — it exists for the first import of a year and for
 * repairing one by hand.
 *
 * ESPN's `proTeamSchedules_wl` needs no cookies, so unlike every other script
 * here this one talks to ESPN without credentials. It still needs Supabase
 * write access.
 *
 * Every step is an idempotent upsert keyed on (season_year, week, pro_team_id),
 * so re-running is how a failed run is fixed — the promise the rest of `scripts/`
 * makes too.
 *
 * Usage:
 *   node scripts/sync-nfl-schedule.js              # the active season's year
 *   node scripts/sync-nfl-schedule.js 2025         # one year
 *   node scripts/sync-nfl-schedule.js --backfill   # 2020 through the active year
 *
 * Options: --backfill   every season from 2020 to the active one
 *          --dry-run    fetch and map, report, write nothing
 */

import '../services/db/client.server.js';

import { fetchProTeamSchedules } from '../services/espnNflScheduleFetcher.js';
import { mapProTeamSchedules } from '../services/espnNflScheduleMapper.js';
import { getDb, getContext } from '../services/db/index.js';

/**
 * The first season worth having. 2020 is where this league's own history
 * starts (`historical_seasons` and the unified views both begin there), so a
 * calendar older than that has nothing to join to.
 */
const FIRST_BACKFILL_YEAR = 2020;

function parseArgs(argv) {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) options[arg.slice(2)] = true;
  }

  return {
    yearArg: positional[0] ? Number.parseInt(positional[0], 10) : null,
    options
  };
}

/**
 * The active season's NFL year.
 *
 * `espn_season_year` rather than `year`: they are the same today and
 * `createSeason` sets them together, but the ESPN year is the one this endpoint
 * is keyed on and so is the one to ask with.
 */
async function activeSeasonYear() {
  const { data, error } = await getContext()
    .client.from('v_active_season')
    .select('year, espn_season_year')
    .single();

  if (error || !data) {
    throw new Error(
      `No active season found. Mark one with seasons.is_active = true, or pass a year. (${error?.message ?? ''})`
    );
  }

  return data.espn_season_year ?? data.year;
}

/**
 * Fetch, map and store one NFL season.
 *
 * Warnings are printed and the import continues. They describe ESPN disagreeing
 * with itself — a `byeWeek` field that does not match the schedule, a team
 * count that is not 32 — and the schedule is the stronger evidence in each
 * case. A shape change is different and throws from the fetcher.
 */
export async function syncNflSeason(seasonYear, { dryRun = false } = {}) {
  const proTeams = await fetchProTeamSchedules(seasonYear);
  const { rows, warnings, weekSpan, teamCount } = mapProTeamSchedules(proTeams, seasonYear);

  for (const warning of warnings) console.warn(`⚠️  ${seasonYear}: ${warning}`);

  const byes = rows.filter((row) => row.opponent_pro_team_id === null).length;
  console.log(
    `🗓️  ${seasonYear}: ${teamCount} teams · weeks 1-${weekSpan} · ` +
    `${rows.length} team-weeks (${byes} byes)`
  );

  if (rows.length === 0) {
    return { seasonYear, upserted: 0, warnings, skipped: 'no rows' };
  }

  if (dryRun) {
    console.log('   --dry-run: nothing was written.');
    return { seasonYear, upserted: 0, warnings, dryRun: true };
  }

  const result = await getDb().nflSchedule.upsertNflSchedule(seasonYear, rows);
  console.log(`   ✅ ${result.upserted} rows written`);

  return { seasonYear, upserted: result.upserted, warnings };
}

export async function syncNflSchedule(argv = []) {
  const { yearArg, options } = parseArgs(argv);

  if (yearArg !== null && Number.isNaN(yearArg)) {
    throw new Error('Season year must be a number');
  }

  const latest = yearArg ?? (await activeSeasonYear());

  const years = options.backfill
    ? Array.from(
        { length: Math.max(0, latest - FIRST_BACKFILL_YEAR + 1) },
        (_unused, index) => FIRST_BACKFILL_YEAR + index
      )
    : [latest];

  if (years.length === 0) {
    throw new Error(`Nothing to import: ${latest} is before ${FIRST_BACKFILL_YEAR}`);
  }

  console.log(
    `🏈 NFL schedule: ${years.length === 1 ? years[0] : `${years[0]}-${years[years.length - 1]}`}` +
    `${options['dry-run'] ? ' (dry run)' : ''}`
  );

  const results = [];
  const failures = [];

  for (const year of years) {
    try {
      // Sequential rather than concurrent: it is at most seven requests to an
      // undocumented endpoint, and a backfill that hammers it is how a working
      // provider becomes a rate-limited one.
      results.push(await syncNflSeason(year, { dryRun: Boolean(options['dry-run']) }));
    } catch (error) {
      // One unpublished or unreachable year must not lose the other six.
      failures.push({ year, error: error.message });
      console.error(`❌ ${year}: ${error.message}`);
    }
  }

  const total = results.reduce((sum, result) => sum + result.upserted, 0);
  console.log(`✅ ${total} team-weeks across ${results.length} season(s)`);

  return { results, failures, total };
}

/**
 * Only run when executed directly. Importing this module must not sync
 * production — the mistake recorded in aug2026_refactor/07-frontend.md §7.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  syncNflSchedule(process.argv.slice(2))
    .then((result) => {
      if (result.failures.length) process.exit(1);
    })
    .catch((error) => {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    });
}
