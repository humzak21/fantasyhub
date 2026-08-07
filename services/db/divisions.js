/**
 * Divisions and the division-grouped standings the UI renders.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import * as models from '../../types/index.js';
import { formatForDatabase, formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
export async function getDivisions(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('divisions')
      .select('*')
      .eq('season_id', seasonId)
      .order('display_order');

    if (error) throw error;

    return data || [];
  } catch (error) {
    throwDbError(error, 'Get divisions');
    return [];
  }
}

// Division management methods
export async function getDivisionsForSeason(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('divisions')
      .select('*')
      .eq('season_id', seasonId)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return data?.map(formatFromDatabase) || [];
  } catch (error) {
    throwDbError(error, 'Get divisions for season');
    return [];
  }
}

export async function createDivision(ctx, seasonId, name, displayOrder = 1) {

  const division = models.createDivision(null, seasonId, name, displayOrder);

  if (!models.validateDivision(division)) {
    throw new Error('Invalid division data');
  }

  try {
    const divisionData = formatForDatabase({
      seasonId: division.seasonId,
      name: division.name,
      displayOrder: division.displayOrder
    });

    const { data, error } = await ctx.client
      .from('divisions')
      .insert(divisionData)
      .select()
      .single();

    if (error) throw error;

    // Clear season cache
    ctx.seasonsCache.delete(seasonId);

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Create division');
  }
}

export async function updateDivision(ctx, divisionId, updates) {

  try {
    const { data, error } = await ctx.client
      .from('divisions')
      .update(formatForDatabase(updates))
      .eq('id', divisionId)
      .select()
      .single();

    if (error) throw error;

    // Clear season cache if we have the season id
    if (data?.season_id) {
      ctx.seasonsCache.delete(data.season_id);
    }

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Update division');
  }
}

export async function deleteDivision(ctx, divisionId) {

  try {
    // First, get the season_id for cache clearing
    const { data: divisionData } = await ctx.client
      .from('divisions')
      .select('season_id')
      .eq('id', divisionId)
      .single();

    const { error } = await ctx.client
      .from('divisions')
      .delete()
      .eq('id', divisionId);

    if (error) throw error;

    // Clear season cache
    if (divisionData?.season_id) {
      ctx.seasonsCache.delete(divisionData.season_id);
    }

    return true;
  } catch (error) {
    throwDbError(error, 'Delete division');
    return false;
  }
}

export async function assignTeamToDivision(ctx, teamId, divisionId) {

  try {
    const { data, error } = await ctx.client
      .from('teams')
      .update({ division_id: divisionId })
      .eq('id', teamId)
      .select('season_id')
      .single();

    if (error) throw error;

    // Clear season cache
    if (data?.season_id) {
      ctx.seasonsCache.delete(data.season_id);
    }

    return true;
  } catch (error) {
    throwDbError(error, 'Assign team to division');
    return false;
  }
}

export async function getStandingsByDivision(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .rpc('get_standings_by_division', {
        season_id_param: seasonId
      });

    if (error) throw error;

    // Group the results by division
    const standingsByDivision = {};
    const unassigned = [];

    (data || []).forEach(team => {
      if (team.division_id) {
        if (!standingsByDivision[team.division_id]) {
          standingsByDivision[team.division_id] = {
            divisionId: team.division_id,
            divisionName: team.division_name,
            teams: []
          };
        }
        standingsByDivision[team.division_id].teams.push({
          teamId: team.team_id,
          id: team.team_id,
          name: team.team_name,
          owner: team.owner,
          divisionId: team.division_id,
          wins: team.wins,
          losses: team.losses,
          ties: team.ties,
          pointsFor: parseFloat(team.points_for || 0),
          pointsAgainst: parseFloat(team.points_against || 0),
          pointDifferential: parseFloat(team.point_differential || 0),
          winPercentage: parseFloat(team.win_percentage || 0),
          currentStreak: {
            type: team.streak_type || 'none',
            length: team.streak_length || 0
          },
          divisionRank: team.division_rank,
          isPlayoffSpot: team.playoff_position
        });
      } else {
        unassigned.push({
          teamId: team.team_id,
          id: team.team_id,
          name: team.team_name,
          owner: team.owner,
          divisionId: null,
          wins: team.wins,
          losses: team.losses,
          ties: team.ties,
          pointsFor: parseFloat(team.points_for || 0),
          pointsAgainst: parseFloat(team.points_against || 0),
          pointDifferential: parseFloat(team.point_differential || 0),
          winPercentage: parseFloat(team.win_percentage || 0),
          currentStreak: {
            type: team.streak_type || 'none',
            length: team.streak_length || 0
          }
        });
      }
    });

    return {
      divisions: Object.values(standingsByDivision),
      unassigned
    };
  } catch (error) {
    throwDbError(error, 'Get standings by division');
    return { divisions: [], unassigned: [] };
  }
}
