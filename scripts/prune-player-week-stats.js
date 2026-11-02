#!/usr/bin/env node

/**
 * Remove the `player_week_stats` rows ESPN does not report for a finished week.
 *
 * The weekly sync removes these itself now (`findLeftBehindRows`, through
 * `upsertPlayerWeekStats`). This is for the rows it left before it did: every
 * player dropped between a week's Tuesday write and its finalize kept a row
 * with a projection and no result, which reads as an extra starter.
 *
 * It re-reads each week from ESPN and deletes, and that is all it does. Running
 * `backfill-player-week-stats` would remove them too, but it rewrites every
 * other row of the week as well, and it does not stop at the week in progress.
 * A week's rows that ESPN does report are not touched here.
 *
 * It prints every row and writes nothing unless given `--apply`, unlike the
 * other scripts here, because the output is the review. A row that has a result
 * is not the bug this exists for, so its week is refused whatever the flags say.
 *
 * Usage:
 *   node scripts/prune-player-week-stats.js 2026            # print what would go
 *   node scripts/prune-player-week-stats.js 2026 3          # one week
 *   node scripts/prune-player-week-stats.js 2026 --apply    # delete it
 */

import '../services/db/client.server.js';

import { getContext, getDb } from '../services/db/index.js';
import { mapMatchupRosterEntries } from '../services/espnPlayerStatsMapper.js';
import { createScheduleFetcher } from '../services/espnScheduleFetcher.js';
import { deriveCurrentWeek, toSeasonConfig } from '../utils/seasonConfig.js';
import { espnFor } from './backfill-transactions.js';

function parseArgs(argv) {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  return {
    yearArg: positional[0] ? Number.parseInt(positional[0], 10) : null,
    weekArg: positional[1] ? Number.parseInt(positional[1], 10) : null,
    apply: argv.includes('--apply')
  };
}

/**
 * The weeks of a season that are over. A week in progress is left alone: its
 * rows are the roster as of Tuesday, and its finalize is still to come.
 */
export function finishedWeeks(seasonRow, now = new Date()) {
  const last = seasonRow.is_completed
    ? (seasonRow.regular_season_weeks ?? 14) + (seasonRow.playoff_weeks ?? 3)
    : deriveCurrentWeek(toSeasonConfig(seasonRow), now) - 1;

  return Array.from({ length: Math.max(last, 0) }, (_, i) => i + 1);
}

/** The rows a week would lose, and any that make it unsafe to touch. */
export function planWeek(leftBehind = []) {
  return {
    ids: leftBehind.map((row) => row.id),
    started: leftBehind.filter((row) => row.started).length,
    withResult: leftBehind.filter((row) => row.actualPoints != null)
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function prunePlayerWeekStats(argv = []) {
  const { yearArg, weekArg, apply } = parseArgs(argv);
  if (!yearArg) throw new Error('Name the season: prune-player-week-stats 2026 [week] [--apply]');

  const { data: seasonRow, error } = await getContext().client
    .from('seasons')
    .select('*')
    .eq('year', yearArg)
    .single();
  if (error || !seasonRow) throw new Error(`No season row for ${yearArg}: ${error?.message ?? ''}`);

  const db = getDb();
  const { teams } = await db.seasons.getSeason(seasonRow.id);
  const teamName = new Map(teams.map((team) => [team.id, team.name]));

  const finished = finishedWeeks(seasonRow);
  if (weekArg != null && !finished.includes(weekArg)) {
    throw new Error(`${yearArg} week ${weekArg} is not a finished week (1-${finished.length}).`);
  }

  const espn = espnFor(seasonRow);
  const fetcher = await createScheduleFetcher(espn.leagueId, espn.seasonYear, espn.espnS2, espn.swid);

  let total = 0;
  let removed = 0;
  const refused = [];

  for (const week of weekArg != null ? [weekArg] : finished) {
    const weekData = await fetcher.getSingleWeek(week);
    const entries = mapMatchupRosterEntries(weekData?.matchups ?? [], week);

    if (entries.length === 0) {
      console.warn(`⚠️  ${yearArg} week ${week}: ESPN returned no rosters — left alone`);
      continue;
    }

    const leftBehind = await db.playerWeekStats.findLeftBehindRows(seasonRow.id, week, entries, teams);
    const { ids, started, withResult } = planWeek(leftBehind);
    const reportedTeams = new Set(entries.map((entry) => entry.espnTeamId)).size;

    console.log(
      `   ${yearArg} week ${week}: ESPN reports ${entries.length} rows across ${reportedTeams} teams, ` +
      `${ids.length} stored rows are not among them (${started} started)`
    );
    for (const row of leftBehind) {
      console.log(
        `      ${teamName.get(row.teamId) ?? row.teamId} · ${row.rosterSlot} ${row.player?.name ?? row.espnPlayerId} · ` +
        `proj ${row.projectedPoints ?? '—'} · actual ${row.actualPoints ?? '—'} · written ${row.updatedAt}`
      );
    }

    if (withResult.length > 0) {
      refused.push(week);
      console.error(`❌ ${yearArg} week ${week}: ${withResult.length} of those rows have a result. Left alone.`);
    } else {
      total += ids.length;
      if (apply) removed += await db.playerWeekStats.deletePlayerWeekRows(ids);
    }

    await sleep(750);
  }

  console.log(apply ? `🧹 removed ${removed} of ${total} rows` : `Would remove ${total} rows. Nothing written; --apply deletes them.`);
  if (apply && removed !== total) throw new Error(`Asked to remove ${total} rows and ${removed} went.`);
  if (refused.length > 0) throw new Error(`Refused week(s) ${refused.join(', ')}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  prunePlayerWeekStats(process.argv.slice(2)).catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
