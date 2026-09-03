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
 * Options: --skip-pick-em-week --skip-rosters --skip-scores --skip-transactions
 *          --skip-player-stats --skip-nfl-schedule --skip-nfl-ratings
 *          --skip-finalize-prev --skip-parlay-grades --skip-snapshot
 *          --dry-run   resolve and report the target, write nothing
 *          --force     sync anyway when the season window says not to
 */

import '../services/db/client.server.js';

import { createRosterUpdateScript } from '../services/espnRosterUpdater.js';
import { buildTeamIndex } from '../services/espnGameMapper.js';
import { findStatBreakdown, mapMatchupRosterEntries } from '../services/espnPlayerStatsMapper.js';
import { fetchProTeamSchedules } from '../services/espnNflScheduleFetcher.js';
import { fetchPlayerWeekInfo } from '../services/espnPlayerInfoFetcher.js';
import {
  findMissingStatLines,
  gradeParlayPicks,
  scheduleKey,
  statKey
} from '../services/parlayGrader.js';
import { mapProTeamSchedules } from '../services/espnNflScheduleMapper.js';
import { syncNflRatings } from './sync-nfl-ratings.js';
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
 * This reports; it does not decide. `--force` lets the caller proceed past a
 * returned reason (see `syncWeek`), which is what makes a pre-season run
 * possible once ESPN has the rosters and projections but before week 1 starts.
 * The missing `start_date` case is deliberately a throw rather than a reason,
 * so it is *not* overridable: forcing past it would not sync early, it would
 * sync an arbitrary week.
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
    errors: result.unmatched,
    conflicts: result.conflicts ?? []
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

/**
 * Write the finished week's real results.
 *
 * **This step exists because nothing else in the schedule ever writes them.**
 * The cron runs Tuesday 05:00 ET, and `deriveCurrentWeek` rolls over at
 * Tuesday 00:00 ET — so the run always targets the week that has just *begun*,
 * and `getSingleWeek` filters ESPN's matchups strictly to that scoring period.
 * Week N-1's actual points, stat breakdowns and final scores were therefore
 * never fetched by any scheduled run: they existed only as the projections
 * written seven days earlier, which is what the lineups would have gone on
 * showing all season, and what would have left the parlay grader with nothing
 * to grade.
 *
 * One extra ESPN fetch, on Tuesdays only, and both writes are the same
 * idempotent upserts the current week uses — so a re-run replaces rather than
 * duplicates, and the projections are overwritten by the results they were
 * guesses at.
 *
 * Only when the week was derived: an explicit `node sync-week.js 5` means week
 * 5, and quietly rewriting week 4 as well would be a surprise.
 */
async function finalizePreviousWeek(seasonId, weekNumber, espn) {
  const previous = weekNumber - 1;

  const fetcher = await createScheduleFetcher(
    espn.leagueId, espn.seasonYear, espn.espnS2, espn.swid
  );
  const weekData = await fetcher.getSingleWeek(previous);

  if (!weekData?.matchups?.length) {
    throw new Error(`ESPN returned no matchups for week ${previous}`);
  }

  const scores = await syncScores(
    seasonId, previous, weekData.matchups, weekData.currentScoringPeriod
  );
  const playerStats = await syncPlayerStats(seasonId, previous, weekData.matchups);

  return { week: previous, scores, playerStats };
}

/**
 * Grade the TD parlay for every elapsed week nobody has graded yet.
 *
 * The decision is `services/parlayGrader.js`, which is pure; this assembles
 * what it reads and writes what it returns. Three sources, and the order they
 * are gathered in matters: the NFL calendar supplies `stats_official` (so this
 * runs after the calendar refresh), and `player_week_stats` supplies the
 * category breakdown (so it runs after `finalizePreviousWeek`, which is what
 * writes the finished week's).
 *
 * Grades *all* ungraded elapsed weeks rather than only week N-1. Only NULL
 * rows are selected, so a re-run is idempotent, a week that failed to grade is
 * caught up automatically, and a grade a human has already set by hand is
 * never overwritten.
 *
 * The write bypasses RLS through the service-role key, exactly as every other
 * step here does — no policy change was needed, and the browser's admin
 * override path is untouched.
 */
async function syncParlayGrades(seasonId, weekNumber, espn) {
  const db = getDb();

  const picks = await db.parlay.getUngradedMatchedPicks(seasonId, weekNumber);
  if (picks.length === 0) {
    return { graded: 0, tds: 0, noTds: 0, skipped: {}, konaRecovered: 0 };
  }

  const weeks = [...new Set(picks.map((pick) => pick.week))];

  // The calendar is season-wide and already cached by the step before this;
  // one read covers every week in the batch.
  const scheduleRows = await db.nflSchedule.getNflScheduleForSeason(espn.seasonYear);
  const scheduleByTeam = {};
  for (const row of scheduleRows) {
    scheduleByTeam[scheduleKey(row.week, row.proTeamId)] = row;
  }

  const statsByEspnPlayerId = {};
  for (const week of weeks) {
    const rows = await db.playerWeekStats.getPlayerWeekStatsForWeek(seasonId, week);
    for (const row of rows) {
      if (row.espnPlayerId == null) continue;
      statsByEspnPlayerId[statKey(week, row.espnPlayerId)] = row;
    }
  }

  // A player dropped before the sync ran has no row for the week he played,
  // and fringe goal-line backs — the players this parlay invites — are exactly
  // who gets dropped. Ask ESPN about those ids directly. A failure here is
  // absorbed: the picks it would have rescued simply stay pending, which is
  // the same outcome as before the fallback existed.
  let konaRecovered = 0;
  const missing = findMissingStatLines({ picks, statsByEspnPlayerId, scheduleByTeam });

  for (const week of [...new Set(missing.map((gap) => gap.week))]) {
    const ids = missing.filter((gap) => gap.week === week).map((gap) => gap.espnPlayerId);

    try {
      const entries = await fetchPlayerWeekInfo({
        leagueId: espn.leagueId,
        seasonYear: espn.seasonYear,
        week,
        espnPlayerIds: ids,
        espnS2: espn.espnS2,
        swid: espn.swid
      });

      for (const entry of entries) {
        const player = entry?.player ?? entry;
        const espnPlayerId = player?.id ?? null;
        if (espnPlayerId == null) continue;

        // The same predicates the matchup path uses — shared, not restated, so
        // a season total can never be read as one week's production.
        const statBreakdown = findStatBreakdown(player, week);
        if (!statBreakdown) continue;

        statsByEspnPlayerId[statKey(week, espnPlayerId)] = {
          espnPlayerId,
          proTeamId: player?.proTeamId ?? null,
          statBreakdown
        };
        konaRecovered += 1;
      }
    } catch (error) {
      console.warn(`⚠️  parlay grades: kona lookup for week ${week} failed: ${error.message}`);
    }
  }

  const { grades, skipped } = gradeParlayPicks({ picks, statsByEspnPlayerId, scheduleByTeam });

  const { updated, errors } = await db.parlay.applyParlayGrades(grades);

  const skipCounts = {};
  for (const miss of skipped) {
    skipCounts[miss.reason] = (skipCounts[miss.reason] ?? 0) + 1;
  }

  return {
    graded: updated,
    tds: grades.filter((grade) => grade.scoredTd).length,
    noTds: grades.filter((grade) => !grade.scoredTd).length,
    konaRecovered,
    skipped: skipCounts,
    errors
  };
}

/**
 * Refresh the NFL calendar for this season.
 *
 * A re-import of the whole season rather than of this week, because the NFL
 * moves games: flex scheduling rewrites late-season kickoff times weeks in
 * advance, and a calendar imported in September and never revisited would show
 * the wrong time for them all year. The write is one idempotent upsert of ~576
 * rows, so re-importing the whole thing costs a single round trip and removes
 * the question of which weeks are stale.
 *
 * The one step here that needs no ESPN credentials: `proTeamSchedules_wl` is a
 * public endpoint about the NFL, not about our league. It also does not touch
 * the matchup payload the scores and player-stats steps share, so it neither
 * costs nor depends on their fetch.
 *
 * Keyed on the ESPN season year, not the season id — see
 * `services/db/nflSchedule.js` for why this table is not season-scoped.
 */
async function syncNflSchedule(seasonYear) {
  const proTeams = await fetchProTeamSchedules(seasonYear);
  const { rows, warnings, weekSpan } = mapProTeamSchedules(proTeams, seasonYear);

  if (rows.length === 0) {
    return { upserted: 0, errors: warnings.map((warning) => ({ error: warning })) };
  }

  const result = await getDb().nflSchedule.upsertNflSchedule(seasonYear, rows);

  return { upserted: result.upserted, weekSpan, errors: warnings.map((w) => ({ error: w })) };
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
  //
  // `--force` overrides that, and exists for the window this guard is too
  // blunt for: ESPN publishes rosters, projections and the NFL calendar well
  // before week 1 kicks off, so there is real data to sync during the days the
  // season row still calls "not started". Every step is an idempotent upsert,
  // so a forced run is overwritten by the first scheduled one rather than
  // fighting it. Never set this on the cron -- the quiet exit is the point
  // there.
  if (skip && !options.force) {
    console.log(`⏭️  ${skip}`);
    return { skipped: skip, seasonId };
  }

  if (skip) {
    console.warn(`⚠️  --force: ${skip}`);
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

    // Open the week's pick'ems. First, and before anything that talks to
    // ESPN: this needs only the database, and an ESPN outage must not cost
    // the league its picks for the week. Non-fatal for the same reason the
    // steps after it are — a missing pick'em row is one broken tab, and the
    // Wednesday roster refresh runs this step again. Playoff weeks have no
    // pick'ems, the same boundary the roster step uses.
    if (options['skip-pick-em-week']) {
      steps.pickEmWeek = { skipped: 'flag' };
    } else if (isPlayoffWeek) {
      steps.pickEmWeek = { skipped: 'playoff week' };
    } else {
      try {
        const week = await getDb().pickems.ensurePickEmWeek(seasonId, weekNumber);
        steps.pickEmWeek = { created: week.created, id: week.id };
        console.log(`🗳️  pick'em week: ${week.created ? 'created' : 'already open'}`);
      } catch (error) {
        steps.pickEmWeek = { failed: error.message };
        console.warn(`⚠️  pick'em week: ${error.message}`);
      }
    }

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
      // ESPN disagrees with a row that already has a result. `upsertEspnGames`
      // will not re-point those by itself; a person has to look.
      for (const clash of steps.scores.conflicts) {
        console.error(
          `❌ game ${clash.id} (ESPN matchup ${clash.matchupId}): ${clash.reason} — ` +
          `stored week ${clash.storedWeek} ${clash.storedTeams.join(' vs ')}, ` +
          `ESPN week ${clash.espnWeek} ${clash.espnTeams.join(' vs ')}`
        );
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

    // The finished week. Non-fatal like the steps around it: losing week N-1's
    // results costs the lineups their actuals and stalls the parlay grader,
    // both of which self-heal on the next run, whereas failing here would cost
    // this week's snapshot outright.
    //
    // Only on a derived run, and never for week 1 — there is no week 0.
    if (options['skip-finalize-prev']) {
      steps.finalizePrev = { skipped: 'flag' };
    } else if (!weekWasDerived) {
      steps.finalizePrev = { skipped: 'explicit week' };
    } else if (weekNumber <= 1) {
      steps.finalizePrev = { skipped: 'no previous week' };
    } else {
      try {
        steps.finalizePrev = await finalizePreviousWeek(seasonId, weekNumber, espn);
        console.log(
          `⏪ week ${steps.finalizePrev.week}: ` +
          `${steps.finalizePrev.scores.updated} scores updated, ` +
          `${steps.finalizePrev.playerStats.upserted} player rows`
        );
      } catch (error) {
        steps.finalizePrev = { failed: error.message };
        console.warn(`⚠️  finalize previous week: ${error.message}`);
      }
    }

    // Non-fatal, for the same reason as player stats: the opponent chips fall
    // back to showing nothing, which is a thinner page rather than a broken
    // one, and failing the run over it would cost the week's snapshot. It is
    // also the step most likely to fail on its own — a public endpoint nobody
    // promised us, reached without credentials.
    if (options['skip-nfl-schedule']) {
      steps.nflSchedule = { skipped: 'flag' };
    } else {
      try {
        steps.nflSchedule = await syncNflSchedule(espn.seasonYear);
        console.log(`🗓️  nfl schedule: ${steps.nflSchedule.upserted} team-weeks`);
        for (const miss of steps.nflSchedule.errors) {
          console.warn(`⚠️  nfl schedule: ${miss.error}`);
        }
      } catch (error) {
        steps.nflSchedule = { failed: error.message };
        console.warn(`⚠️  nfl schedule: ${error.message}`);
      }
    }

    // Non-fatal, same reasoning as the calendar above: without a fresh FPI
    // snapshot the ranking's NFL Schedule component reads last week's ratings
    // — or drops entirely for a first-ever run — which is a thinner ranking,
    // not a broken one. It runs before the snapshot step on purpose, so the
    // week's snapshot ranks on fresh FPI. Another public endpoint reached
    // without credentials, so it fails on its own schedule too.
    if (options['skip-nfl-ratings']) {
      steps.nflRatings = { skipped: 'flag' };
    } else {
      try {
        const ratings = await syncNflRatings(espn.seasonYear, weekNumber);
        steps.nflRatings = {
          upserted: ratings.upserted,
          errors: (ratings.warnings ?? []).map((warning) => ({ error: warning }))
        };
        console.log(`📈 nfl ratings: ${ratings.upserted} teams`);
      } catch (error) {
        steps.nflRatings = { failed: error.message };
        console.warn(`⚠️  nfl ratings: ${error.message}`);
      }
    }

    // Grading reads what the calendar and finalizePrev just wrote —
    // `stats_official` from the one, the category breakdowns from the other —
    // so it has to come after both. It does not depend on the ratings step
    // and could sit either side of it; here, so the three NFL fetches stay
    // together. Non-fatal: an ungraded pick reads as "Pending", which is
    // exactly what it was before this step existed.
    if (options['skip-parlay-grades']) {
      steps.parlayGrades = { skipped: 'flag' };
    } else {
      try {
        steps.parlayGrades = await syncParlayGrades(seasonId, weekNumber, espn);
        console.log(
          `🎯 parlay grades: ${steps.parlayGrades.graded} graded ` +
          `(${steps.parlayGrades.tds} TD, ${steps.parlayGrades.noTds} no TD)`
        );
        for (const [reason, count] of Object.entries(steps.parlayGrades.skipped)) {
          console.warn(`⚠️  parlay grades: ${count} skipped — ${reason}`);
        }
      } catch (error) {
        steps.parlayGrades = { failed: error.message };
        console.warn(`⚠️  parlay grades: ${error.message}`);
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
