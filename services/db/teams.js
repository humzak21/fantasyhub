/**
 * Teams: identity and roster attachment. Stat columns on `teams` are legacy —
 * `v_team_standings` is the source of truth for records since the P1 migration.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { formatForDatabase, formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { syncTeamRosterFromESPN } from './rosters.js';

/**
 * The season's teams as stored, in stable id order.
 *
 * Rows are returned in database shape, not `formatFromDatabase`d: the app
 * reads `team.division_id`, `team.points_for` and friends straight off these
 * objects, and the ranking calculator expects the same. Converting here would
 * have to be matched by a conversion in every consumer.
 */
export async function getTeamsForSeason(ctx, seasonId) {
  try {
    const { data, error } = await ctx.client
      .from('teams')
      .select('*')
      .eq('season_id', seasonId)
      .order('id', { ascending: true });

    if (error) throw error;

    return data || [];
  } catch (error) {
    throwDbError(error, 'Get teams for season');
  }
}

// Team management
export async function addTeamToSeason(ctx, seasonId, name, owner = '') {

  const team = {
    seasonId,
    name,
    owner,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    winPercentage: 0,
    pointDifferential: 0,
    averagePointsFor: 0,
    averagePointsAgainst: 0,
    strengthOfSchedule: 0,
    opponentWinPercentage: 0,
    qualityWins: 0,
    badLosses: 0,
    blowoutWins: 0,
    closeWins: 0,
    closeLosses: 0,
    recentForm: 0,
    currentStreak: { type: 'none', length: 0 },
    powerRating: 0,
    previousRank: null,
    rankChange: 0
  };

  if (!name || name.length === 0) {
    throw new Error('Invalid team data');
  }

  try {
    const { data, error } = await ctx.client
      .from('teams')
      .insert(formatForDatabase(team))
      .select()
      .single();

    if (error) throw error;

    const formattedTeam = formatFromDatabase(data);

    // Clear season cache to ensure fresh data on next fetch
    ctx.seasonsCache.delete(seasonId);

    return formattedTeam;
  } catch (error) {
    throwDbError(error, 'Add team');
  }
}

export async function updateTeam(ctx, seasonId, teamId, updates) {

  try {
    // Separate roster data from team updates
    const { roster, ...teamUpdates } = updates;

    // Update team record (if there are non-roster fields to update)
    let updatedTeam = null;
    if (Object.keys(teamUpdates).length > 0) {
      const formattedUpdates = formatForDatabase(teamUpdates);

      const { data, error } = await ctx.client
        .from('teams')
        .update(formattedUpdates)
        .eq('id', teamId)
        .eq('season_id', seasonId)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error(`No team found with id: ${teamId} and season_id: ${seasonId}`);
      }

      updatedTeam = formatFromDatabase(data[0]);
    }

    // Handle roster data using the database function
    if (roster && Array.isArray(roster)) {
      const currentWeek = updates.currentWeek || 1; // Default to week 1 if not provided
      await syncTeamRosterFromESPN(ctx, teamId, roster, currentWeek);
    }

    // Clear season cache
    ctx.seasonsCache.delete(seasonId);

    return updatedTeam || { id: teamId };
  } catch (error) {
    throwDbError(error, 'Update team');
  }
}

export async function removeTeamFromSeason(ctx, seasonId, teamId) {

  try {
    const { error } = await ctx.client
      .from('teams')
      .delete()
      .eq('id', teamId)
      .eq('season_id', seasonId);

    if (error) throw error;

    // Clear season cache
    ctx.seasonsCache.delete(seasonId);
  } catch (error) {
    throwDbError(error, 'Remove team');
  }
}
