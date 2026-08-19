#!/usr/bin/env node

/**
 * The weekly ESPN sync (§7.2).
 *
 * Replaces `weeklyUpdate.js`, which needed a human to pass a week number, was
 * pinned to a hardcoded `DEFAULT_SEASON_ID`, wrote to a year-suffixed table by
 * name, and left no record that it had run.
 *
 * Everything it needs comes from the active season row: the season id, the week
 * count, the playoff boundary and the ESPN league/season. With no arguments it
 * syncs the current week of the active season, which is exactly what the
 * scheduled job does — see `.github/workflows/sync-week.yml`.
 *
 * Every step is an idempotent upsert against ESPN, the source of truth, so a
 * failed or partial run is fixed by running it again. Each run writes a
 * `sync_runs` row.
 *
 * Usage:
 *   node scripts/sync-week.js                 # current week of the active season
 *   node scripts/sync-week.js 5               # re-sync a specific week
 *   node scripts/sync-week.js 5 <season-id>   # target a season explicitly
 *
 * Options: --skip-rosters --skip-scores --skip-transactions --skip-player-stats
 *          --skip-snapshot
 *          --dry-run   resolve and report the target, write nothing
 */

import '../services/db/client.server.js';

import { createRosterUpdateScript } from '../services/espnRosterUpdater.js';
import { buildTeamIndex } from '../services/espnGameMapper.js';
import { mapMatchupRosterEntries } from '../services/espnPlayerStatsMapper.js';
import { createScheduleFetcher } from '../services/espnScheduleFetcher.js';
import { getDb, getContext } from '../services/db/index.js';
import { ESPNTransactionFetcher } from '../services/espnTransactionFetcher.js';
import { ESPN_CONFIG } from '../config/espn-config.js';
import { deriveCurrentWeek, deriveWeekStart, toSeasonConfig } from '../utils/seasonConfig.js';

/**
 * Reasons to do nothing, and the one reason to shout.
 *
 * The cron runs every week of the year, including the ones either side of the
 * season. A completed season and a season that has not started yet are both
 * "nothing to sync", so they exit 0 and leave the log quiet. A season with no
 * `start_date` is different: every derived date is wrong, the week number is
 * meaningless, and silence would hide it — so that one throws and names the
 * column. The guard lives here rather than in the workflow so a manual run
 * behaves exactly like the scheduled one.
 *
 * @returns {string|null} why to stop, or null to carry on.
 */
export function reasonToSkip(row, season, now = new Date()) {
  if (row.is_completed) {
    return `season ${season.year} is completed — nothing to sync`;
  }

  if (!season.startDate) {
    throw new Error(
      `Season ${season.year} has no start_date. Every week number is derived from it; ` +
      'set seasons.start_date to the Tuesday week 1 begins.'
    );
  }

  if (now < deriveWeekStart(season, 1)) {
    return `season ${season.year} starts ${season.startDate} — nothing to sync yet`;
  }

  return null;
}

/**
 * Resolve what to sync from the database rather than from arguments.
 */
async function resolveTarget({ seasonIdArg, weekArg }) {
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
  const skip = reasonToSkip(data, season);

  return {
    skip,
    season,
    seasonId: season.id,
    weekNumber: weekArg || deriveCurrentWeek(season),
    weekWasDerived: !weekArg,
    espn: {
      leagueId: season.espnLeagueId || ESPN_CONFIG.leagueId,
      seasonYear: season.espnSeasonYear || ESPN_CONFIG.seasonYear,
      espnS2: ESPN_CONFIG.espnS2,
      swid: ESPN_CONFIG.swid
    }
  };
}

function parseArgs(argv) {
  const positional = argv.filter(arg => !arg.startsWith('--'));
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) options[arg.slice(2)] = true;
  }

  return {
    weekArg: positional[0] ? Number.parseInt(positional[0], 10) : null,
    seasonIdArg: positional[1] || null,
    options
  };
}

/**
 * Write the week's matchups: scores onto the games that exist, rows for the
 * ones that do not.
 *
 * This used to refuse outright when a week had no games ("import the schedule
 * first"), because creating them was the staging pipeline's job. Both now go
 * through `upsertEspnGames`, so a week that was never imported, or a matchup
 * ESPN rescheduled, heals itself on the next run instead of needing a separate
 * import and an admin in a browser.
 *
 * The guarantee that made the old version safe is kept, and now lives in the
 * mapper: `type` is set when a row is created and never touched again, so the
 * 2025 postseason types corrected by hand in migration 20260805100000 survive
 * every sync.
 */
async function syncScores(seasonId, weekNumber, espnMatchups, currentScoringPeriod) {
  const db = getDb();
  const season = await db.seasons.getSeason(seasonId);

  const result = await db.games.upsertEspnGames(seasonId, espnMatchups, {
    week: weekNumber,
    teams: season.teams,
    currentScoringPeriod,
    regularSeasonWeeks: season.regularSeasonWeeks ?? season.regular_season_weeks
  });

  return {
    created: result.inserted,
    updated: result.updated,
    unchanged: result.unchanged,
    errors: result.unmatched
  };
}

/**
 * Store what every rostered player scored this week.
 *
 * The data arrives with the scores: `mMatchupScore` attaches
 * `rosterForCurrentScoringPeriod` to each side of every matchup, and it has
 * been parsed and discarded on every sync since the fetcher was written. This
 * step costs no extra ESPN request — it reads the payload step B already
 * fetched — which is the whole reason it lives here rather than in a job of its
 * own.
 *
 * Runs in playoff weeks too. The ranking math ignores them, but a complete
 * table is worth more than the handful of rows saved by skipping.
 */
async function syncPlayerStats(seasonId, weekNumber, espnMatchups) {
  const db = getDb();
  const season = await db.seasons.getSeason(seasonId);

  const entries = mapMatchupRosterEntries(espnMatchups, weekNumber);

  if (entries.length === 0) {
    return { upserted: 0, playersCreated: 0, errors: [{ error: 'ESPN returned no roster entries' }] };
  }

  const result = await db.playerWeekStats.upsertPlayerWeekStats(
    seasonId, weekNumber, entries, season.teams
  );

  return {
    upserted: result.upserted,
    playersCreated: result.playersCreated,
    errors: result.skipped
  };
}

async function syncTransactions(seasonId, espn) {
  const db = getDb();
  const season = await db.seasons.getSeason(seasonId);

  const fetcher = new ESPNTransactionFetcher(
    espn.leagueId, espn.seasonYear, espn.espnS2, espn.swid
  );
  const summary = await fetcher.getSeasonTransactionSummary(espn.seasonYear);

  if (!summary || summary.length === 0) {
    return { updated: 0, errors: [{ error: 'ESPN returned no transaction data' }] };
  }

  const teams = buildTeamIndex(season.teams);
  const rows = [];
  const errors = [];

  for (const entry of summary) {
    const team = teams.find(entry.espnTeamId, entry.ownerName);
    if (!team) {
      errors.push({ team: entry.ownerName, error: 'no matching team in this season' });
      continue;
    }

    const franchiseId = team.franchiseId ?? team.franchise_id ?? null;
    if (!franchiseId) {
      errors.push({ team: entry.ownerName, error: 'team has no franchise_id' });
      continue;
    }

    rows.push({
      season_id: seasonId,
      franchise_id: franchiseId,
      team_id: team.id,
      owner_name: entry.ownerName,
      espn_team_id: entry.espnTeamId,
      free_agent_adds: entry.free_agent_adds,
      waiver_claims: entry.waiver_claims,
      trades: entry.trades,
      drops: entry.drops,
      faab_spent: entry.faab_spent,
      last_synced_at: new Date().toISOString()
    });
  }

  if (rows.length === 0) return { updated: 0, errors };

  // One upsert for the whole league rather than 14 round trips.
  const { error } = await getContext().client
    .from('transactions')
    .upsert(rows, { onConflict: 'franchise_id,season_id', ignoreDuplicates: false });

  if (error) {
    errors.push({ error: error.message });
    return { updated: 0, errors };
  }

  return { updated: rows.length, errors };
}

/**
 * Snapshot the completed week's power rankings.
 *
 * `saveWeeklyPowerRankingsSnapshot` clears the week before inserting, so
 * re-running replaces the snapshot rather than duplicating it.
 */
async function snapshotRankings(seasonId, weekNumber) {
  const db = getDb();
  const rows = await db.rankings.saveWeeklyPowerRankingsSnapshot(seasonId, weekNumber, 'weekly');
  return { teamsSnapshotted: rows };
}

async function openRunLog(seasonId, weekNumber, trigger) {
  const { data, error } = await getContext().client
    .from('sync_runs')
    .insert({ season_id: seasonId, week_number: weekNumber, trigger, status: 'running' })
    .select('id')
    .single();

  // A missing run log must not stop the sync — the sync is the point, the log
  // is the record of it.
  if (error) {
    console.warn(`⚠️  could not open a sync_runs row: ${error.message}`);
    return null;
  }
  return data.id;
}

async function closeRunLog(runId, { status, steps, error }) {
  if (!runId) return;
  const { error: updateError } = await getContext().client
    .from('sync_runs')
    .update({ status, steps, error: error ?? null, finished_at: new Date().toISOString() })
    .eq('id', runId);

  if (updateError) console.warn(`⚠️  could not close sync_runs row: ${updateError.message}`);
}

export async function syncWeek(argv = []) {
  const { weekArg, seasonIdArg, options } = parseArgs(argv);

  if (weekArg !== null && Number.isNaN(weekArg)) {
    throw new Error('Week number must be a number');
  }

  const { skip, season, seasonId, weekNumber, weekWasDerived, espn } =
    await resolveTarget({ seasonIdArg, weekArg });

  // Out of season. Exit 0 so the weekly cron stays quiet rather than mailing a
  // failure every week between February and September.
  if (skip) {
    console.log(`⏭️  ${skip}`);
    return { skipped: skip, seasonId };
  }

  if (weekNumber < 1 || weekNumber > season.weekCount) {
    throw new Error(`Week ${weekNumber} is outside this season's 1..${season.weekCount}`);
  }
  if (!espn.leagueId) {
    throw new Error('No ESPN league id. Set seasons.espn_league_id for this season.');
  }

  console.log(`🏈 Syncing ${season.year} week ${weekNumber}${weekWasDerived ? ' (derived)' : ''}`);
  console.log(`   season ${seasonId} · ESPN league ${espn.leagueId} · private: ${espn.espnS2 ? 'yes' : 'no'}`);

  if (options['dry-run']) {
    console.log('   --dry-run: resolved the target, writing nothing.');
    return { dryRun: true, seasonId, weekNumber };
  }

  const runId = await openRunLog(seasonId, weekNumber, options.manual ? 'manual' : 'cron');
  const steps = {};

  try {
    // Roster syncing stops once the playoffs start so team records stay frozen
    // at the end of the regular season. The boundary is the season row's
    // regular_season_weeks + 1, not a hardcoded week 15.
    const isPlayoffWeek = weekNumber >= season.playoffStartWeek;

    if (options['skip-rosters'] || isPlayoffWeek) {
      steps.rosters = { skipped: isPlayoffWeek ? 'playoff week' : 'flag' };
      console.log(`📋 rosters: skipped (${steps.rosters.skipped})`);
    } else {
      const rosterScript = await createRosterUpdateScript(
        espn.leagueId, espn.seasonYear, espn.espnS2, espn.swid
      );
      await rosterScript.runWeeklyUpdate();
      steps.rosters = { ok: true };
      console.log('📋 rosters: synced');
    }

    // Scores and player stats are two readings of the same ESPN payload — the
    // matchup carries both the final score and the roster that produced it — so
    // it is fetched once here instead of once per step.
    const wantsScores = !options['skip-scores'];
    const wantsPlayerStats = !options['skip-player-stats'];
    let weekData = null;

    if (wantsScores || wantsPlayerStats) {
      const fetcher = await createScheduleFetcher(
        espn.leagueId, espn.seasonYear, espn.espnS2, espn.swid
      );
      weekData = await fetcher.getSingleWeek(weekNumber);
    }

    if (!wantsScores) {
      steps.scores = { skipped: 'flag' };
    } else {
      if (!weekData?.matchups?.length) {
        throw new Error(`ESPN returned no matchups for week ${weekNumber}`);
      }

      steps.scores = await syncScores(
        seasonId, weekNumber, weekData.matchups, weekData.currentScoringPeriod
      );
      console.log(
        `📊 scores: ${steps.scores.updated} updated, ${steps.scores.created} created, ` +
        `${steps.scores.unchanged} already current`
      );
      for (const miss of steps.scores.errors) {
        console.error(`❌ week ${miss.week} matchup ${miss.matchupId}: ${miss.reason}`);
      }
    }

    // Non-critical, like transactions: the rankings degrade to team-level
    // components without this week's rows, which is a worse ranking but not a
    // broken site. Failing the run would also cost us the snapshot.
    if (!wantsPlayerStats) {
      steps.playerStats = { skipped: 'flag' };
    } else {
      try {
        if (!weekData?.matchups?.length) {
          throw new Error(`ESPN returned no matchups for week ${weekNumber}`);
        }

        steps.playerStats = await syncPlayerStats(seasonId, weekNumber, weekData.matchups);
        console.log(
          `🧍 player stats: ${steps.playerStats.upserted} rows, ` +
          `${steps.playerStats.playersCreated} players created`
        );
        for (const miss of steps.playerStats.errors) {
          console.warn(`⚠️  player ${miss.espnPlayerId ?? '?'}: ${miss.reason ?? miss.error}`);
        }
      } catch (error) {
        steps.playerStats = { failed: error.message };
        console.warn(`⚠️  player stats: ${error.message}`);
      }
    }

    // Transactions are non-critical: a failure here is recorded but does not
    // fail the run, because scores and rosters are what the site reads.
    if (options['skip-transactions']) {
      steps.transactions = { skipped: 'flag' };
    } else {
      try {
        steps.transactions = await syncTransactions(seasonId, espn);
        console.log(`🔁 transactions: ${steps.transactions.updated} teams`);
      } catch (error) {
        steps.transactions = { failed: error.message };
        console.warn(`⚠️  transactions: ${error.message}`);
      }
    }

    if (options['skip-snapshot']) {
      steps.snapshot = { skipped: 'flag' };
    } else {
      steps.snapshot = await snapshotRankings(seasonId, weekNumber);
      console.log(`📸 snapshot: ${steps.snapshot.teamsSnapshotted} teams at week ${weekNumber}`);
    }

    await closeRunLog(runId, { status: 'success', steps });
    console.log('✅ sync complete');
    return { seasonId, weekNumber, steps };
  } catch (error) {
    await closeRunLog(runId, { status: 'failed', steps, error: error.message });
    throw error;
  }
}

/**
 * Only run when executed directly. Importing this module must not sync
 * production — the mistake recorded in aug2026_refactor/07-frontend.md §7.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  syncWeek(process.argv.slice(2)).catch(error => {
    console.error(`❌ ${error.message}`);
    if (/401|403/.test(error.message)) {
      console.error('   Private league — check ESPN_S2 / ESPN_SWID.');
    }
    process.exit(1);
  });
}
