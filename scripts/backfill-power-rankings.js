#!/usr/bin/env node

/**
 * Backfill `power_rankings_history` for the weeks of a completed season that
 * nobody snapshotted.
 *
 * 2025 is why this exists: weeks 1-6 were snapshotted by hand on 2025-10-07
 * and nothing wrote to the table again, because the weekly cron arrived with
 * the 2026 refactor. So the franchise profile's power-rank line ended at week
 * 6. This runs the historical calculator (`saveHistoricalPowerRankingsSnapshot`)
 * over each missing week and stores it as `backfill`.
 *
 * By default only missing weeks are written, and a stored week is left alone.
 * `--replace` rewrites every week of the season, so the whole season is one
 * formula — 2025's hand-made weeks 1-6 used the retired one. A week nobody
 * could rank (going into week 1 every team rates the same) gets no rows.
 * Weeks run in order, though nothing stored depends on it: a row carries its
 * rank, not its rank change.
 *
 * Usage:
 *   node scripts/backfill-power-rankings.js 2025
 *   node scripts/backfill-power-rankings.js 2025 --replace
 *   node scripts/backfill-power-rankings.js 2025 --dry-run
 */

import '../services/db/client.server.js';

import { getDb, getContext } from '../services/db/index.js';

function parseArgs(argv) {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) options[arg.slice(2)] = true;
  }
  return { year: positional[0] ? Number.parseInt(positional[0], 10) : null, options };
}

/** Weeks 1..total with no snapshot row. */
export function missingWeeks(totalWeeks, storedWeeks) {
  const stored = new Set(storedWeeks);
  return Array.from({ length: totalWeeks }, (_, i) => i + 1).filter((week) => !stored.has(week));
}

export async function backfillPowerRankings(argv = []) {
  const { year, options } = parseArgs(argv);
  if (!year) throw new Error('Name a season: node scripts/backfill-power-rankings.js 2025');

  const client = getContext().client;
  const { data: season, error } = await client
    .from('seasons')
    .select('id, year, is_completed, regular_season_weeks, playoff_weeks, total_weeks')
    .eq('year', year)
    .maybeSingle();
  if (error) throw error;
  if (!season) throw new Error(`No season row for ${year}`);
  // A completed season is what makes "every week is in the past" true, which
  // is what keeps the calculator off the live path. The active season has the
  // weekly cron.
  if (!season.is_completed) throw new Error(`${year} is not completed; the weekly sync snapshots it`);

  const totalWeeks = season.total_weeks ?? (season.regular_season_weeks ?? 14) + (season.playoff_weeks ?? 3);
  const { data: stored, error: storedError } = await client
    .from('power_rankings_history')
    .select('week_number')
    .eq('season_id', season.id);
  if (storedError) throw storedError;

  const replace = Boolean(options.replace);
  const weeks = replace
    ? missingWeeks(totalWeeks, [])
    : missingWeeks(totalWeeks, (stored ?? []).map((row) => row.week_number));
  if (weeks.length === 0) {
    console.log(`✅ ${year}: every week 1-${totalWeeks} already has a snapshot`);
    return;
  }
  console.log(
    `📸 ${year}: ${replace ? 'rewriting' : 'backfilling'} weeks ${weeks.join(', ')}${options['dry-run'] ? ' (dry run)' : ''}`
  );

  const db = getDb();
  for (const week of weeks) {
    const rows = await db.rankings.saveHistoricalPowerRankingsSnapshot(season.id, week, {
      currentWeek: totalWeeks + 1,
      replace,
      dryRun: Boolean(options['dry-run'])
    });
    if (rows.length === 0) {
      console.log(`   week ${week}: no ranking — every team rates the same, nothing to rank on${replace ? '; week cleared' : ''}`);
      continue;
    }
    const top = [...rows].sort((a, b) => a.rank - b.rank).slice(0, 3);
    const gamesPlayed = rows[0] ? rows[0].wins + rows[0].losses + (rows[0].ties ?? 0) : 0;
    console.log(
      `   week ${week}: ${rows.length} teams, ${gamesPlayed} games in · ` +
      `top ${top.map((row) => `#${row.rank} ${Number(row.power_rating).toFixed(1)}`).join(', ')}`
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  backfillPowerRankings(process.argv.slice(2)).catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
