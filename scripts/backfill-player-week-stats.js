#!/usr/bin/env node

/**
 * Backfill `player_week_stats` and `team_week_lineups` for past seasons.
 *
 * Player-week scoring starts with the 2026 season, because that is when the
 * sync started keeping the rosters its matchup fetch was already downloading.
 * The lineup records — efficiency, perfect lineups, points left on the bench,
 * avoidable losses — need every season. ESPN still serves past weeks'
 * `mMatchupScore` with each side's roster, so this runs the sync's own
 * player-stats step (`syncPlayerStats`) over every week of each season, which
 * writes both tables through `upsertPlayerWeekStats` exactly as the weekly job
 * does.
 *
 * Idempotent on (season, week, player) and (season, week, team). `--dry-run`
 * fetches and maps, prints how many roster rows and settled lineups each week
 * would produce, and writes nothing — run it on one week first. A week ESPN
 * returns no rosters for is reported and skipped; lineup records then start
 * at the first season that has data, and are null (never zero) before it.
 *
 * A side effect worth knowing: the power ranking computes its roster
 * components from `player_week_stats`, so a live view of a 2020-25 week gains
 * the components it used to drop as unknown. Stored snapshots are untouched.
 *
 * Usage:
 *   node scripts/backfill-player-week-stats.js               # every completed season from 2020
 *   node scripts/backfill-player-week-stats.js 2020          # one season
 *   node scripts/backfill-player-week-stats.js 2020 1 --dry-run   # one week, no writes
 */

import '../services/db/client.server.js';

import { createScheduleFetcher } from '../services/espnScheduleFetcher.js';
import { mapMatchupRosterEntries } from '../services/espnPlayerStatsMapper.js';
import { espnFor, seasonsToBackfill } from './backfill-transactions.js';
import { syncPlayerStats } from './sync-week.js';

function parseArgs(argv) {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) options[arg.slice(2)] = true;
  }
  return {
    yearArg: positional[0] ? Number.parseInt(positional[0], 10) : null,
    weekArg: positional[1] ? Number.parseInt(positional[1], 10) : null,
    options
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function backfillPlayerWeekStats(argv = []) {
  const { yearArg, weekArg, options } = parseArgs(argv);
  if (weekArg != null && yearArg == null) throw new Error('Name the season before the week.');

  const seasons = await seasonsToBackfill(yearArg);

  for (const season of seasons) {
    const espn = espnFor(season);
    const fetcher = await createScheduleFetcher(espn.leagueId, espn.seasonYear, espn.espnS2, espn.swid);
    const lastWeek = (season.regular_season_weeks ?? 14) + (season.playoff_weeks ?? 3);
    const weeks = weekArg != null ? [weekArg] : Array.from({ length: lastWeek }, (_, i) => i + 1);

    for (const week of weeks) {
      const weekData = await fetcher.getSingleWeek(week);
      const matchups = weekData?.matchups ?? [];
      const entries = mapMatchupRosterEntries(matchups, week);

      if (entries.length === 0) {
        console.warn(`⚠️  ${season.year} week ${week}: ESPN returned no rosters — skipped`);
      } else if (options['dry-run']) {
        const withActual = entries.filter((entry) => entry.actualPoints != null).length;
        const teams = new Set(entries.map((entry) => entry.espnTeamId)).size;
        console.log(
          `   ${season.year} week ${week}: ${entries.length} roster rows across ${teams} teams, ` +
          `${withActual} with actual points`
        );
      } else {
        const result = await syncPlayerStats(season.id, week, matchups);
        console.log(
          `🧍 ${season.year} week ${week}: ${result.upserted} player rows, ` +
          `${result.playersCreated} players created`
        );
        for (const miss of result.errors.slice(0, 5)) {
          console.warn(`   skipped ${miss.espnPlayerId ?? '?'}: ${miss.reason ?? miss.error}`);
        }
      }

      await sleep(750);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  backfillPlayerWeekStats(process.argv.slice(2)).catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
