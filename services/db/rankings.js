/**
 * Power rankings: live calculation inputs and the snapshot history.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { PowerRankingCalculator } from '../powerRankingCalculator.js';
import { formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { createLogger } from './logger.js';
import { getDivisionsForSeason } from './divisions.js';
import { getCurrentWeek, getSeasonGames, toUiGame } from './games.js';
import { getAllPlayers } from './players.js';
import { getAllRosters } from './rosters.js';
import { resolveSeasonYear } from './seasons.js';
import { getTeamsForSeason } from './teams.js';

const log = createLogger('db:rankings');
// Power rankings - always calculate live for accuracy
export async function calculatePowerRankings(ctx, seasonId, weekNumber = null) {

  log.debug('=== calculatePowerRankings called ===', { weekNumber });

  try {
    // Always use live calculation with rank change comparison
    // This ensures accuracy regardless of stored data
    log.debug('Calculating live rankings with rank changes');
    return await getPowerRankingsForWeek(ctx, seasonId, weekNumber || await getCurrentWeek(ctx, seasonId));
  } catch (error) {
    throwDbError(error, 'Calculate power rankings');
  }
}

// New method to calculate live power rankings using JavaScript PowerRankingCalculator
export async function calculateLivePowerRankings(ctx, seasonId, weekNumber = null, skipPreviousWeekLookup = false) {

  log.debug('=== calculateLivePowerRankings called ===', {
    seasonId: seasonId?.substring(0, 8),
    weekNumber,
    skipPreviousWeekLookup
  });

  try {
    // Get season data for regularSeasonWeeks
    const { data: season, error: seasonError } = await ctx.client
      .from('seasons')
      .select('*')
      .eq('id', seasonId)
      .single();

    if (seasonError) throw seasonError;

    // Get divisions for the season
    const { data: divisions, error: divisionsError } = await ctx.client
      .from('divisions')
      .select('*')
      .eq('season_id', seasonId)
      .order('display_order', { ascending: true });

    if (divisionsError) {
      log.error('Error fetching divisions:', divisionsError);
      throw divisionsError;
    }

    log.debug('[calculateLivePowerRankings] Divisions fetched:', {
      count: divisions?.length || 0,
      divisions: divisions
    });

    // Get teams for the season
    const { data: teams, error: teamsError } = await ctx.client
      .from('teams')
      .select('*')
      .eq('season_id', seasonId)
      .order('id', { ascending: true });

    if (teamsError) throw teamsError;

    // Get games for the season
    const { data: games, error: gamesError } = await ctx.client
      .from('games')
      .select('*')
      .eq('season_id', seasonId)
      .order('week', { ascending: true });

    if (gamesError) throw gamesError;

    // Get current week if not specified
    const currentWeek = weekNumber || await getCurrentWeek(ctx, seasonId);

    // Format games to match PowerRankingCalculator expectations
    const formattedGames = games.map(toUiGame);

    // Get all players for the season with their stats
    const players = await getAllPlayers(ctx, seasonId);

    // Get all rosters for the season and attach to teams
    const rostersByTeam = await getAllRosters(ctx, seasonId);

    // Attach roster data to teams with division IDs
    const teamsWithRosters = teams.map(team => ({
      ...team,
      roster: rostersByTeam[team.id]?.roster || [],
      divisionId: team.division_id
    }));

    // Create PowerRankingCalculator instance with divisions and regularSeasonWeeks
    const regularSeasonWeeks = season.regular_season_weeks || season.regularSeasonWeeks || 14;

    log.debug('[calculateLivePowerRankings] Creating PowerRankingCalculator:', {
      teamsCount: teamsWithRosters.length,
      divisionsCount: divisions?.length || 0,
      regularSeasonWeeks,
      currentWeek,
      sampleTeamDivisionId: teamsWithRosters[0]?.division_id
    });

    const calculator = new PowerRankingCalculator(
      teamsWithRosters,
      formattedGames,
      currentWeek,
      players,
      null, // viewingWeek (use current)
      divisions || [],
      regularSeasonWeeks
    );

    // Calculate all team stats with power rankings
    const teamStats = await calculator.calculateAllTeamStats();

    // Sort by power rating (highest first) and assign ranks
    const sortedTeams = teamStats.sort((a, b) => (b.powerRating || 0) - (a.powerRating || 0));

    // Get previous week's rankings for rank change calculation (only if not skipped)
    let previousWeekRankings = null;
    if (currentWeek > 1 && !skipPreviousWeekLookup) {
      log.debug(`Fetching previous week rankings for week ${currentWeek - 1}, season ${seasonId}`);
      try {
        // Only try to get from history table, don't recursively calculate
        const { data: historicalData, error: histError } = await ctx.client
          .from('power_rankings_history')
          .select('team_id, rank')
          .eq('season_id', seasonId)
          .eq('week_number', currentWeek - 1)
          .order('rank', { ascending: true });

        log.debug('Query result:', {
          error: histError?.message,
          dataCount: historicalData?.length
        });

        if (histError) {
          log.error('Error fetching previous week rankings:', histError);
        } else if (historicalData && historicalData.length > 0) {
          log.debug(`✓ Found ${historicalData.length} previous rankings`);
          previousWeekRankings = historicalData.map(row => ({
            teamId: row.team_id,
            id: row.team_id,
            rank: row.rank
          }));
        } else {
          log.warn(`No previous week rankings found for week ${currentWeek - 1}`);
        }
      } catch (error) {
        log.error('Could not fetch previous week rankings:', error);
      }
    }

    // Format results to match expected structure
    return sortedTeams.map((team, index) => {
      const currentRank = index + 1;
      let rankChange = 0;
      let previousRank = currentRank;

      // Calculate rank change if we have previous week data
      if (previousWeekRankings && previousWeekRankings.length > 0) {
        const prevEntry = previousWeekRankings.find(prev =>
          (prev.teamId === team.id || prev.id === team.id)
        );
        if (prevEntry) {
          previousRank = prevEntry.rank || currentRank;
          rankChange = previousRank - currentRank;
        }
      }

      return {
        teamId: team.id,
        id: team.id,
        name: team.name,
        owner: team.owner,
        rank: currentRank,
        powerRating: team.powerRating || 0,
        rankChange: rankChange,
        previousRank: previousRank,
        powerRatingComponents: team.powerRatingComponents || {
          performanceScore: 0,
          teamStrength: 0,
          strengthOfSchedule: 0,
          momentumScore: 0,
          consistencyScore: 0,
          injuryScore: 0,
          clutchScore: 0,
          allPlayWinPct: 0
        },
        wins: team.wins || 0,
        losses: team.losses || 0,
        ties: team.ties || 0,
        pointsFor: team.pointsFor || 0,
        pointsAgainst: team.pointsAgainst || 0,
        winPercentage: team.winPercentage || 0,
        pointDifferential: team.pointDifferential || 0,
        gamesPlayed: team.gamesPlayed || 0,
        averagePointsFor: team.averagePointsFor || 0,
        averagePointsAgainst: team.averagePointsAgainst || 0,
        // Add missing fields that the UI expects
        strengthOfSchedule: team.strengthOfSchedule || 0,
        opponentWinPercentage: team.opponentWinPercentage || 0,
        recentForm: team.recentForm || 0,
        currentStreak: team.currentStreak || { type: 'none', length: 0 },
        qualityWins: team.qualityWins || 0,
        badLosses: team.badLosses || 0,
        blowoutWins: team.blowoutWins || 0,
        closeWins: team.closeWins || 0,
        closeLosses: team.closeLosses || 0,
        // Playoff odds
        playoffOdds: team.playoffOdds || 0
      };
    }).sort((a, b) => b.powerRating - a.powerRating);

  } catch (error) {
    throwDbError(error, 'Calculate live power rankings');
    return [];
  }
}

export async function getPowerRankingsForWeek(ctx, seasonId, weekNumber) {

  try {
    // Always calculate live rankings to ensure accuracy
    // Don't trust historical data - calculate fresh from game data
    const currentWeekRankings = await calculateLivePowerRankings(ctx, seasonId, weekNumber, true);

    // Calculate previous week's rankings live to compare
    if (weekNumber > 1) {
      const previousWeekRankings = await calculateLivePowerRankings(ctx, seasonId, weekNumber - 1, true);

      // Add rank changes by comparing live calculations
      currentWeekRankings.forEach(team => {
        const prevEntry = previousWeekRankings.find(prev =>
          prev.teamId === team.teamId || prev.id === team.id
        );

        if (prevEntry) {
          team.previousRank = prevEntry.rank;
          team.rankChange = prevEntry.rank - team.rank; // Positive = moved up, negative = moved down
        } else {
          team.previousRank = team.rank;
          team.rankChange = 0;
        }
      });
    } else {
      // Week 1 - no previous week to compare
      currentWeekRankings.forEach(team => {
        team.previousRank = team.rank;
        team.rankChange = 0;
      });
    }

    return currentWeekRankings;
  } catch (error) {
    throwDbError(error, 'Get power rankings for week');
    return [];
  }
}

export async function getPowerRankingsHistory(ctx, seasonId, weekNumber = null) {

  try {
    let query = ctx.client
      .from('power_rankings_history')
      .select(`
        *,
        teams (name, owner)
      `)
      .eq('season_id', seasonId);

    if (weekNumber !== null) {
      query = query.eq('week_number', weekNumber);
    }

    const { data, error } = await query
      .order('week_number', { ascending: false })
      .order('rank', { ascending: true });

    if (error) throw error;

    return data.map(formatFromDatabase);
  } catch (error) {
    throwDbError(error, 'Get power rankings history');
  }
}

export async function saveWeeklyPowerRankingsSnapshot(ctx, seasonId, weekNumber, snapshotType = 'weekly') {

  try {
    // Calculate live power rankings using JavaScript PowerRankingCalculator
    const powerRankings = await calculateLivePowerRankings(ctx, seasonId, weekNumber);

    if (!powerRankings || powerRankings.length === 0) {
      return 0;
    }

    // Delete existing rankings for this week
    const { error: deleteError } = await ctx.client
      .from('power_rankings_history')
      .delete()
      .eq('season_id', seasonId)
      .eq('week_number', weekNumber);

    // A failed delete is not fatal — the insert below may still land — but it
    // means the week is about to hold two snapshots, which is worth knowing.
    if (deleteError) {
      log.warn(`could not clear week ${weekNumber} snapshot before rewriting it:`, deleteError.message);
    }

    // Prepare snapshot data - only store current week's rankings
    // Rank changes will be calculated dynamically when fetching data
    const snapshotData = powerRankings.map((team) => {
      const teamId = team.teamId || team.id;

      return {
        season_id: seasonId,
        week_number: weekNumber,
        team_id: teamId,
        rank: team.rank,
        power_rating: team.powerRating,
        performance_score: team.powerRatingComponents?.performanceScore || 0,
        team_strength: team.powerRatingComponents?.teamStrength || 0,
        strength_of_schedule: team.powerRatingComponents?.strengthOfSchedule || 0,
        momentum_score: team.powerRatingComponents?.momentumScore || 0,
        consistency_score: team.powerRatingComponents?.consistencyScore || 0,
        injury_score: team.powerRatingComponents?.injuryScore || 0,
        clutch_score: team.powerRatingComponents?.clutchScore || 0,
        all_play_win_pct: team.powerRatingComponents?.allPlayWinPct || 0,
        wins: team.wins,
        losses: team.losses,
        ties: team.ties,
        points_for: team.pointsFor,
        points_against: team.pointsAgainst,
        win_percentage: team.winPercentage,
        point_differential: team.pointDifferential,
        snapshot_type: snapshotType
      };
    });

    // Insert new snapshot data
    const { data, error } = await ctx.client
      .from('power_rankings_history')
      .insert(snapshotData)
      .select();

    if (error) throw error;

    return data.length;
  } catch (error) {
    throwDbError(error, 'Save power rankings snapshot');
    return 0;
  }
}

export async function checkWeeklySnapshotStatus(ctx, seasonYear) {
  const year = await resolveSeasonYear(ctx, seasonYear);

  try {
    const { data, error } = await ctx.client
      .rpc('should_trigger_weekly_snapshot', {
        season_year: year
      });

    if (error) throw error;

    return data?.[0] || { should_trigger: false, reason: 'No data returned' };
  } catch (error) {
    throwDbError(error, 'Check weekly snapshot status');
    return { should_trigger: false, reason: 'Error checking status' };
  }
}

export async function executeWeeklySnapshotIfNeeded(ctx, seasonYear) {
  const year = await resolveSeasonYear(ctx, seasonYear);

  try {
    const { data, error } = await ctx.client
      .rpc('execute_weekly_snapshot_if_needed', {
        season_year: year
      });

    if (error) throw error;

    return data;
  } catch (error) {
    throwDbError(error, 'Execute weekly snapshot');
    return { status: 'error', error_message: error.message };
  }
}

export async function getCurrentNFLWeek(ctx, seasonYear) {
  const year = await resolveSeasonYear(ctx, seasonYear);

  try {
    const { data, error } = await ctx.client
      .rpc('get_current_nfl_week', {
        season_year: year
      });

    if (error) throw error;

    return data || 1;
  } catch (error) {
    return 1;
  }
}

export async function getAvailableSnapshotWeeks(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .rpc('get_available_snapshot_weeks', {
        season_id: seasonId
      });

    if (error) throw error;

    return data || [];
  } catch (error) {
    throwDbError(error, 'Get available snapshot weeks');
    return [];
  }
}

/**
 * Rankings as they stood in a given week, for the week the user is *viewing*.
 *
 * This is the calculation the UI runs when you page back through the season.
 * It lived in `useSupabaseFantasyData.getPowerRankingsForWeek` as five inline
 * `dataManager.client.from(...)` queries — the hook reaching around the manager
 * it wraps, straight into the database. Same queries, same calculator
 * arguments, now on the data layer's side of the boundary.
 *
 * It differs from `calculateLivePowerRankings` in two ways that matter:
 * rosters are not attached (the viewed week's roster is not reconstructable
 * from the current one), and it calls `getRankings()`, which applies the
 * previous week's ranks to produce rank *changes*, rather than
 * `calculateAllTeamStats()`.
 *
 * @param {object} ctx
 * @param {string} seasonId
 * @param {{ week: number, viewingWeek?: number|null, currentWeek: number }} options
 */
export async function calculateRankingsForViewedWeek(ctx, seasonId, { week, viewingWeek = null, currentWeek }) {
  try {
    const [teams, games, players, divisions, seasonRow] = await Promise.all([
      getTeamsForSeason(ctx, seasonId),
      getSeasonGames(ctx, seasonId),
      getAllPlayers(ctx, seasonId),
      getDivisionsForSeason(ctx, seasonId),
      ctx.client.from('seasons').select('*').eq('id', seasonId).single()
    ]);

    const previousRankings = week > 1 ? await getPreviousWeekRanks(ctx, seasonId, week) : null;

    const regularSeasonWeeks = seasonRow.data?.regular_season_weeks || 14;

    const calculator = new PowerRankingCalculator(
      teams,
      games,
      currentWeek,
      players,
      viewingWeek || week, // viewing week drives historical calculations
      null, // analyticsService
      divisions,
      regularSeasonWeeks
    );

    return await calculator.getRankings(previousRankings);
  } catch (error) {
    throwDbError(error, 'Calculate rankings for viewed week');
  }
}

/**
 * The ranks recorded for the week before `week`, or null if none were stored.
 * Missing history is normal (nobody snapshotted that week) and must not fail
 * the calculation, so this reports and returns null rather than throwing.
 */
export async function getPreviousWeekRanks(ctx, seasonId, week) {
  try {
    const { data, error } = await ctx.client
      .from('power_rankings_history')
      .select('team_id, rank')
      .eq('season_id', seasonId)
      .eq('week_number', week - 1);

    if (error || !data?.length) {
      if (error) log.warn(`could not read week ${week - 1} ranks:`, error.message);
      return null;
    }

    return data.map((row) => ({ teamId: row.team_id, rank: row.rank }));
  } catch (error) {
    log.warn(`could not read week ${week - 1} ranks:`, error?.message ?? error);
    return null;
  }
}
