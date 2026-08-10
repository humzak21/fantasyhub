/**
 * Games, weeks and schedule generation. Scores here are the single source of
 * truth; everything else about a record is derived from them.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import * as models from '../../types/index.js';
import { buildTeamIndex, planGameWrites } from '../espnGameMapper.js';
import { formatForDatabase, formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { createLogger } from './logger.js';
import { saveWeeklyPowerRankingsSnapshot } from './rankings.js';
import { getSeason } from './seasons.js';
import { getTeamsForSeason } from './teams.js';

const log = createLogger('db:games');

/**
 * A game row in the shape the UI and the ranking calculator consume.
 *
 * It is deliberately dual-shaped — the database row's snake_case keys *plus*
 * camelCase aliases — because components read both spellings. This exact
 * mapping was written out four times (the hook's `refreshData`, the hook's
 * `getPowerRankingsForWeek`, `calculateLivePowerRankings`, and the mobile
 * shell); one of them forgetting a field is precisely the silent-`undefined`
 * bug §5.3 describes. It lives here now, once.
 *
 * `isCompleted` is derived rather than read: a game is complete when both
 * scores are present, which is the same rule the `games.is_completed`
 * generated column uses.
 */
export function toUiGame(row) {
  return {
    ...row,
    team1Id: row.team1_id,
    team2Id: row.team2_id,
    team1Score: row.team1_score,
    team2Score: row.team2_score,
    winnerTeamId: row.winner_team_id,
    isCompleted: row.team1_score !== null && row.team2_score !== null
  };
}

/** Every game of a season, in schedule order, in the UI shape. */
export async function getSeasonGames(ctx, seasonId) {
  try {
    const { data, error } = await ctx.client
      .from('games')
      .select('*')
      .eq('season_id', seasonId)
      .order('week', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;

    return (data || []).map(toUiGame);
  } catch (error) {
    throwDbError(error, 'Get season games');
  }
}

/**
 * Write ESPN matchups into `games`. The only ESPN→schedule path there is.
 *
 * Used by both `scripts/sync-schedule.js` (whole season, once a year) and
 * `scripts/sync-week.js` (one week, every week), so the season-start import and
 * the weekly sync cannot drift apart the way the staging RPC and `syncScores`
 * did. Idempotent: re-running writes nothing.
 *
 * The planning is in `services/espnGameMapper.js`; this function is the I/O
 * around it — one read, one batched insert, one update per changed row.
 *
 * @param {Object}  [options]
 * @param {number}  [options.week]        limit to a single week
 * @param {Array}   [options.teams]       season teams, if already loaded
 * @param {number}  [options.currentScoringPeriod] ESPN's current period
 * @param {number}  [options.regularSeasonWeeks]   for playoff round math
 * @param {string}  [options.userId]      stamped on inserted rows
 * @param {boolean} [options.dryRun]      plan and report, write nothing
 * @returns {Promise<{inserted: number, updated: number, unchanged: number,
 *   unmatched: Array, plan: Object}>}
 */
export async function upsertEspnGames(ctx, seasonId, matchups, options = {}) {
  const {
    week = null,
    teams: providedTeams = null,
    currentScoringPeriod = null,
    regularSeasonWeeks = 14,
    userId = null,
    dryRun = false
  } = options;

  try {
    const teams = providedTeams ?? (await getTeamsForSeason(ctx, seasonId));

    let query = ctx.client
      .from('games')
      .select('id, week, team1_id, team2_id, team1_score, team2_score, type, espn_matchup_id, espn_scoring_period_id')
      .eq('season_id', seasonId);
    if (week != null) query = query.eq('week', week);

    const { data: existingGames, error: readError } = await query;
    if (readError) throw readError;

    const plan = planGameWrites({
      seasonId,
      matchups,
      existingGames: existingGames || [],
      teamIndex: buildTeamIndex(teams),
      regularSeasonWeeks,
      currentScoringPeriod,
      userId,
      week
    });

    // A dry run reports the writes it *would* make — counting them as zero
    // would make an unplanned import look identical to a no-op.
    if (dryRun) {
      return {
        inserted: plan.inserts.length,
        updated: plan.updates.length,
        unchanged: plan.unchanged,
        unmatched: plan.unmatched,
        plan,
        dryRun: true
      };
    }

    if (plan.inserts.length > 0) {
      // Conflict on the ESPN id rather than (season, week, teams): byes have a
      // null team2_id, and Postgres treats nulls as distinct, so the older key
      // cannot keep a bye from being inserted twice.
      const { error: insertError } = await ctx.client
        .from('games')
        .upsert(plan.inserts, {
          onConflict: 'season_id,espn_matchup_id',
          ignoreDuplicates: false
        });

      if (insertError) throw insertError;
    }

    for (const { id, patch } of plan.updates) {
      const { error: updateError } = await ctx.client.from('games').update(patch).eq('id', id);
      if (updateError) throw updateError;
    }

    if (plan.inserts.length > 0 || plan.updates.length > 0) {
      ctx.seasonsCache.delete(seasonId);
    }

    log.info(
      `espn games: ${plan.inserts.length} inserted, ${plan.updates.length} updated, ` +
      `${plan.unchanged} unchanged, ${plan.unmatched.length} unmatched`
    );

    return {
      inserted: plan.inserts.length,
      updated: plan.updates.length,
      unchanged: plan.unchanged,
      unmatched: plan.unmatched,
      plan
    };
  } catch (error) {
    throwDbError(error, 'Upsert ESPN games');
  }
}

// Game management with database functions
export async function addGame(ctx, seasonId, week, team1Id, team2Id, team1Score = null, team2Score = null, type = 'regular') {

  const game = models.createGame(week, team1Id, team2Id, team1Score, team2Score, type);

  if (!models.validateGame(game)) {
    throw new Error('Invalid game data');
  }

  try {
    const gameData = formatForDatabase({
      seasonId,
      week: game.week,
      team1Id: game.team1Id,
      team2Id: game.team2Id,
      team1Score: game.team1Score,
      team2Score: game.team2Score,
      type: game.type
    });

    const { data, error } = await ctx.client
      .from('games')
      .upsert(gameData, {
        onConflict: 'season_id,week,team1_id,team2_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) throw error;

    // If game has scores, update using database function for calculations
    if (team1Score !== null && team2Score !== null) {
      const { error: updateError } = await ctx.client
        .rpc('update_game_result', {
          game_id: data.id,
          team1_score: team1Score,
          team2_score: team2Score
        });

      if (updateError) throw updateError;
    }

    // Clear season cache
    ctx.seasonsCache.delete(seasonId);

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Add game');
  }
}

export async function updateGameScore(ctx, seasonId, gameId, team1Score, team2Score) {

  try {
    const { data, error } = await ctx.client
      .rpc('update_game_result', {
        game_id: gameId,
        team1_score: team1Score,
        team2_score: team2Score
      });

    if (error) throw error;

    // Clear season cache
    ctx.seasonsCache.delete(seasonId);

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Update game score');
  }
}

// Week management
export async function completeWeek(ctx, seasonId, weekNumber) {

  try {
    const { data, error } = await ctx.client
      .from('weeks')
      .update({
        is_completed: true,
        completed_at: new Date().toISOString()
      })
      .eq('season_id', seasonId)
      .eq('week_number', weekNumber)
      .select()
      .single();

    if (error) throw error;

    // Automatically save power rankings snapshot for this week
    try {
      await saveWeeklyPowerRankingsSnapshot(ctx, seasonId, weekNumber, 'auto');
    } catch (snapshotError) {
      log.warn('Failed to save power rankings snapshot:', snapshotError);
      // Don't throw - week completion should succeed even if snapshot fails
    }

    // Clear season cache
    ctx.seasonsCache.delete(seasonId);

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Complete week');
  }
}

// Analytics helpers
export async function getCurrentWeek(ctx, seasonId) {

  try {
    // Check games table to determine completed weeks
    // A week is considered completed if all its games have scores
    const { data: games, error } = await ctx.client
      .from('games')
      .select('week, team1_score, team2_score')
      .eq('season_id', seasonId)
      .order('week');

    if (error) throw error;

    if (!games || games.length === 0) {
      return 1; // No games yet, start at week 1
    }

    // Group games by week and check if each week is completed
    const weekStatus = {};
    games.forEach(game => {
      if (!weekStatus[game.week]) {
        weekStatus[game.week] = { total: 0, completed: 0 };
      }
      weekStatus[game.week].total++;
      if (game.team1_score !== null && game.team2_score !== null) {
        weekStatus[game.week].completed++;
      }
    });

    // Find the last completed week
    let lastCompletedWeek = 0;
    const weeks = Object.keys(weekStatus).map(Number).sort((a, b) => a - b);

    for (const week of weeks) {
      const status = weekStatus[week];
      if (status.completed === status.total && status.total > 0) {
        lastCompletedWeek = week;
      } else {
        // Found first incomplete week, stop here
        break;
      }
    }

    // Current week is the week after the last completed week
    return lastCompletedWeek + 1;
  } catch (error) {
    throwDbError(error, 'Get current week');
    return 1;
  }
}

// Helper method to get the last completed week
export async function getLastCompletedWeek(ctx, seasonId) {

  try {
    const currentWeek = await getCurrentWeek(ctx, seasonId);
    // Last completed week is current week - 1 (unless we're at week 1)
    return Math.max(1, currentWeek - 1);
  } catch (error) {
    throwDbError(error, 'Get last completed week');
    return 1;
  }
}

// Helper method to get all completed weeks as an array
export async function getCompletedWeeks(ctx, seasonId) {

  try {
    // Check games table to get all completed weeks
    const { data: games, error } = await ctx.client
      .from('games')
      .select('week, team1_score, team2_score')
      .eq('season_id', seasonId)
      .order('week');

    if (error) throw error;

    if (!games || games.length === 0) {
      return [];
    }

    // Group games by week and check if each week is completed
    const weekStatus = {};
    games.forEach(game => {
      if (!weekStatus[game.week]) {
        weekStatus[game.week] = { total: 0, completed: 0 };
      }
      weekStatus[game.week].total++;
      if (game.team1_score !== null && game.team2_score !== null) {
        weekStatus[game.week].completed++;
      }
    });

    // Get all completed weeks
    const completedWeeks = [];
    Object.keys(weekStatus).forEach(week => {
      const weekNum = parseInt(week);
      const status = weekStatus[week];
      if (status.completed === status.total && status.total > 0) {
        completedWeeks.push(weekNum);
      }
    });

    return completedWeeks.sort((a, b) => a - b);
  } catch (error) {
    throwDbError(error, 'Get completed weeks');
    return [];
  }
}

export async function getGamesForWeek(ctx, seasonId, weekNumber) {

  try {
    const { data, error } = await ctx.client
      .from('games')
      .select('*')
      .eq('season_id', seasonId)
      .eq('week', weekNumber)
      .order('id');

    if (error) throw error;

    return data.map(formatFromDatabase);
  } catch (error) {
    // For games queries, just return empty array instead of throwing
    return [];
  }
}

export async function getCompletedGames(ctx, seasonId, upToWeek = null) {

  try {
    let query = ctx.client
      .from('games')
      .select('*')
      .eq('season_id', seasonId)
      .eq('is_completed', true);

    if (upToWeek !== null) {
      query = query.lte('week', upToWeek);
    }

    const { data, error } = await query.order('week', { ascending: true });

    if (error) throw error;

    return data.map(formatFromDatabase);
  } catch (error) {
    // For games queries, just return empty array instead of throwing
    return [];
  }
}

// Schedule generation (remains mostly the same but saves to database)
export async function generateRoundRobinSchedule(ctx, seasonId) {

  const season = await getSeason(ctx, seasonId);
  if (!season) {
    throw new Error('Season not found');
  }

  const teams = season.teams;
  const teamCount = teams.length;

  if (teamCount % 2 !== 0) {
    throw new Error('Round robin requires even number of teams');
  }

  const rounds = teamCount - 1;
  const matchesPerRound = teamCount / 2;
  let week = 1;
  const games = [];

  try {
    // Delete existing schedule
    await ctx.client
      .from('games')
      .delete()
      .eq('season_id', seasonId);

    for (let round = 0; round < rounds && week <= season.regularSeasonWeeks; round++) {
      for (let match = 0; match < matchesPerRound; match++) {
        let team1Index, team2Index;

        if (match === 0) {
          team1Index = 0;
          team2Index = round + 1;
        } else {
          team1Index = (round - match + teamCount) % (teamCount - 1) + 1;
          team2Index = (round + match) % (teamCount - 1) + 1;
        }

        const team1 = teams[team1Index];
        const team2 = teams[team2Index];

        if (team1 && team2) {
          games.push(formatForDatabase({
            seasonId,
            week,
            team1Id: team1.id,
            team2Id: team2.id,
            type: 'regular'
          }));
        }
      }
      week++;
    }

    const { data, error } = await ctx.client
      .from('games')
      .insert(games)
      .select();

    if (error) throw error;

    // Clear season cache
    ctx.seasonsCache.delete(seasonId);

    return data.map(formatFromDatabase);
  } catch (error) {
    throwDbError(error, 'Generate schedule');
  }
}
