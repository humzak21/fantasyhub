#!/usr/bin/env node

/**
 * Snapshot ESPN's Football Power Index into `nfl_team_ratings`.
 *
 * The weekly sync runs this on its own (the `nflRatings` step in
 * `scripts/sync-week.js`), so in ordinary operation nobody needs to run it —
 * it exists for the first import and for repairing a week by hand.
 *
 * There is deliberately no `--backfill`: ESPN serves the *current* FPI only,
 * so a past week's snapshot cannot be fetched after the fact — which is the
 * whole reason the weekly snapshot exists. A missed week is simply missing;
 * the ranking's `nflSos` component reads the latest week that landed.
 *
 * Like `sync-nfl-schedule.js`, this talks to ESPN without credentials (the
 * power index is public) but still needs Supabase write access.
 *
 * Idempotent: keyed on (season_year, week, pro_team_id), so re-running a week
 * rewrites its snapshot — the promise the rest of `scripts/` makes too.
 *
 * Usage:
 *   node scripts/sync-nfl-ratings.js          # the active season's current week
 *   node scripts/sync-nfl-ratings.js 5        # file the snapshot under week 5
 *
 * Options: --dry-run   fetch and map, report, write nothing
 */

import '../services/db/client.server.js';

import { fetchNflPowerIndex } from '../services/espnFpiFetcher.js';
import { mapPowerIndexPayload } from '../services/espnFpiMapper.js';
import { getDb, getContext } from '../services/db/index.js';
import { deriveCurrentWeek, toSeasonConfig } from '../utils/seasonConfig.js';

function parseArgs(argv) {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) options[arg.slice(2)] = true;
  }

  return {
    weekArg: positional[0] ? Number.parseInt(positional[0], 10) : null,
    options
  };
}

/** The active season's ESPN year and current week, from the season row. */
async function resolveTarget() {
  const { data, error } = await getContext()
    .client.from('v_active_season')
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `No active season found. Mark one with seasons.is_active = true. (${error?.message ?? ''})`
    );
  }

  const season = toSeasonConfig(data);
  return {
    seasonYear: season.espnSeasonYear ?? season.year,
    week: deriveCurrentWeek(season)
  };
}

/**
 * Fetch, map and store one week's snapshot.
 *
 * Warnings are printed and the import continues — they describe payload gaps
 * (an unmapped abbreviation, a team without an fpi value) where a partial
 * snapshot still beats none. A shape change throws from the fetcher.
 */
export async function syncNflRatings(seasonYear, weekNumber, { dryRun = false } = {}) {
  const payload = await fetchNflPowerIndex();
  const { rows, warnings, teamCount } = mapPowerIndexPayload(payload, {
    seasonYear,
    week: weekNumber
  });

  for (const warning of warnings) console.warn(`⚠️  ${seasonYear} week ${weekNumber}: ${warning}`);

  console.log(
    `📈 FPI ${seasonYear} week ${weekNumber}: ${teamCount} teams mapped ` +
    `(ESPN last updated ${payload.lastUpdated ?? 'unknown'})`
  );

  if (rows.length === 0) {
    return { seasonYear, week: weekNumber, upserted: 0, warnings, skipped: 'no rows' };
  }

  if (dryRun) {
    console.log('   --dry-run: nothing was written.');
    return { seasonYear, week: weekNumber, upserted: 0, warnings, dryRun: true };
  }

  const result = await getDb().nflTeamRatings.upsertNflTeamRatings(seasonYear, weekNumber, rows);
  console.log(`   ✅ ${result.upserted} rows written`);

  return { seasonYear, week: weekNumber, upserted: result.upserted, warnings };
}

async function main(argv = []) {
  const { weekArg, options } = parseArgs(argv);

  if (weekArg !== null && Number.isNaN(weekArg)) {
    throw new Error('Week number must be a number');
  }

  const target = await resolveTarget();
  const week = weekArg ?? target.week;

  return syncNflRatings(target.seasonYear, week, { dryRun: Boolean(options['dry-run']) });
}

/**
 * Only run when executed directly. Importing this module must not sync
 * production — the mistake recorded in aug2026_refactor/07-frontend.md §7.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
