#!/usr/bin/env node

/**
 * Import a whole season's schedule from ESPN.
 *
 * This is the start-of-season job: run it once the league's schedule exists on
 * ESPN and it writes the teams and every matchup straight into `teams` and
 * `games`. It replaces the staging-and-approval dance — `fetchSchedule.js full`
 * wrote three `espn_*` tables, and an admin then pressed "Assign to Season" in
 * the browser to run `assign_schedule_to_season`, which dropped the ESPN
 * matchup id, matched teams by owner-name string equality and flattened the
 * playoff bracket.
 *
 * Games are written by the same `upsertEspnGames` the weekly sync uses, so the
 * two cannot disagree. Every step is idempotent: re-running reports
 * "unchanged" and writes nothing.
 *
 * Usage:
 *   node scripts/sync-schedule.js                 # the active season
 *   node scripts/sync-schedule.js <season-id>     # a specific season
 *
 * Options: --dry-run      fetch and plan, write nothing
 *          --skip-teams   schedule only, leave team identity alone
 *          --manual       record the run as manually triggered
 */

import '../services/db/client.server.js';

import { createScheduleFetcher } from '../services/espnScheduleFetcher.js';
import { getDb, getContext } from '../services/db/index.js';
import { ESPN_CONFIG } from '../config/espn-config.js';
import { toSeasonConfig } from '../utils/seasonConfig.js';

/** Resolve the target season from the database, not from arguments. */
async function resolveTarget(seasonIdArg) {
  const client = getContext().client;

  const query = client.from(seasonIdArg ? 'seasons' : 'v_active_season').select('*');
  const { data, error } = seasonIdArg
    ? await query.eq('id', seasonIdArg).single()
    : await query.single();

  if (error || !data) {
    throw new Error(
      seasonIdArg
        ? `Season ${seasonIdArg} not found: ${error?.message ?? 'no row'}`
        : `No active season found. Mark one with seasons.is_active = true. (${error?.message ?? ''})`
    );
  }

  const season = toSeasonConfig(data);

  return {
    season,
    seasonId: season.id,
    espn: {
      leagueId: season.espnLeagueId || ESPN_CONFIG.leagueId,
      seasonYear: season.espnSeasonYear || season.year || ESPN_CONFIG.seasonYear,
      espnS2: ESPN_CONFIG.espnS2,
      swid: ESPN_CONFIG.swid
    }
  };
}

function parseArgs(argv) {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) options[arg.slice(2)] = true;
  }
  return { seasonIdArg: positional[0] || null, options };
}

/**
 * Record the run in `espn_schedule_imports`.
 *
 * That table used to be a staging queue an admin worked through; it is now just
 * the log of what this script did. The bulky `raw_data` payload is deliberately
 * not written — it was 1.4 MB a row and nothing ever read it back.
 *
 * Like `sync-week`'s run log, a failure to write it must not fail the import:
 * the games are the point, this is the record of them.
 */
async function writeImportLog({ seasonId, espn, scheduleData, teamResult, gameResult }) {
  const summary =
    `teams: ${teamResult.inserted} added / ${teamResult.updated} updated · ` +
    `games: ${gameResult.inserted} added / ${gameResult.updated} updated / ` +
    `${gameResult.unchanged} unchanged` +
    (gameResult.unmatched.length ? ` · ${gameResult.unmatched.length} unmatched` : '') +
    (gameResult.conflicts?.length ? ` · ${gameResult.conflicts.length} conflicted` : '');

  const { error } = await getContext().client.from('espn_schedule_imports').insert({
    espn_league_id: String(espn.leagueId),
    season_year: espn.seasonYear,
    league_name: scheduleData.leagueInfo.leagueName,
    team_count: scheduleData.leagueInfo.teamCount,
    total_matchups: scheduleData.totalMatchups,
    regular_season_matchups: scheduleData.regularSeasonMatchups,
    playoff_matchups: scheduleData.playoffMatchups,
    assigned_season_id: seasonId,
    assignment_status: 'ASSIGNED',
    assigned_at: new Date().toISOString(),
    assignment_notes: summary
  });

  if (error) console.warn(`⚠️  could not write the import log row: ${error.message}`);
  return summary;
}

export async function syncSchedule(argv = []) {
  const { seasonIdArg, options } = parseArgs(argv);
  const { season, seasonId, espn } = await resolveTarget(seasonIdArg);

  if (!espn.leagueId) {
    throw new Error('No ESPN league id. Set seasons.espn_league_id for this season.');
  }

  console.log(`🗓️  Importing the ${season.year} schedule`);
  console.log(`   season ${seasonId} · ESPN league ${espn.leagueId} · private: ${espn.espnS2 ? 'yes' : 'no'}`);

  const fetcher = await createScheduleFetcher(
    espn.leagueId, espn.seasonYear, espn.espnS2, espn.swid
  );
  const scheduleData = await fetcher.getFullSeason();
  const matchups = Object.values(scheduleData.schedule).flat();

  if (matchups.length === 0) {
    throw new Error('ESPN returned no matchups for this season');
  }

  console.log(
    `   ESPN: ${scheduleData.leagueInfo.teamCount} teams, ${matchups.length} matchups ` +
    `(${scheduleData.playoffMatchups} postseason), weeks ${scheduleData.weekNumbers.join(', ')}`
  );

  const db = getDb();
  const dryRun = Boolean(options['dry-run']);

  const teamResult = options['skip-teams']
    ? { inserted: 0, updated: 0, unchanged: 0, errors: [], skipped: true }
    : dryRun
      ? { inserted: 0, updated: 0, unchanged: 0, errors: [], skipped: 'dry-run' }
      : await db.teams.upsertTeamsFromESPN(seasonId, scheduleData.teams);

  if (teamResult.errors?.length) {
    for (const failure of teamResult.errors) {
      console.warn(`⚠️  team ${failure.team ?? failure.espnTeamId}: ${failure.error}`);
    }
  }
  console.log(
    `👥 teams: ${teamResult.inserted} added, ${teamResult.updated} updated, ` +
    `${teamResult.unchanged} unchanged${teamResult.skipped ? ` (skipped: ${teamResult.skipped})` : ''}`
  );

  const gameResult = await db.games.upsertEspnGames(seasonId, matchups, {
    currentScoringPeriod: scheduleData.currentScoringPeriod,
    regularSeasonWeeks: season.regularSeasonWeeks,
    dryRun
  });

  const verb = dryRun ? 'would add' : 'added';
  const verb2 = dryRun ? 'would update' : 'updated';
  console.log(
    `🏈 games: ${gameResult.inserted} ${verb}, ${gameResult.updated} ${verb2}, ` +
    `${gameResult.unchanged} unchanged`
  );

  // A matchup whose teams cannot be resolved used to vanish without a trace —
  // the single worst behaviour of the function this replaces. Say so, loudly.
  for (const miss of gameResult.unmatched) {
    console.error(
      `❌ week ${miss.week} matchup ${miss.matchupId}: ${miss.reason} ` +
      `(ESPN teams ${miss.homeEspnTeamId} vs ${miss.awayEspnTeamId})`
    );
  }

  // A row ESPN disagrees with that already has a result. The import refuses to
  // re-point those on its own, so they need a person.
  for (const clash of gameResult.conflicts ?? []) {
    console.error(
      `❌ game ${clash.id} (ESPN matchup ${clash.matchupId}): ${clash.reason} — ` +
      `stored week ${clash.storedWeek} ${clash.storedTeams.join(' vs ')}, ` +
      `ESPN week ${clash.espnWeek} ${clash.espnTeams.join(' vs ')}`
    );
  }

  if (dryRun) {
    console.log('   --dry-run: nothing was written.');
    return { dryRun: true, seasonId, teamResult, gameResult };
  }

  const summary = await writeImportLog({ seasonId, espn, scheduleData, teamResult, gameResult });
  console.log(`✅ ${summary}`);

  return { seasonId, teamResult, gameResult };
}

/**
 * Only run when executed directly. Importing this module must not sync
 * production — the mistake recorded in aug2026_refactor/07-frontend.md §7.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  syncSchedule(process.argv.slice(2))
    .then((result) => {
      if (result.gameResult?.unmatched?.length || result.gameResult?.conflicts?.length) process.exit(1);
    })
    .catch((error) => {
      console.error(`❌ ${error.message}`);
      if (/401|403/.test(error.message)) {
        console.error('   Private league — check ESPN_S2 / ESPN_SWID.');
      }
      process.exit(1);
    });
}
