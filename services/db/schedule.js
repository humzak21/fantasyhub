/**
 * ESPN schedule imports and their assignment to a season.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { formatForDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { createLogger } from './logger.js';

const log = createLogger('db:schedule');
// ESPN Schedule Management Functions
export async function getPendingScheduleImports(ctx) {

  try {
    // Three probe queries against espn_schedule_imports/espn_teams/espn_matchups
    // used to run here and have their results thrown away — debugging residue
    // costing three round trips on every call. Removed.

    // Skip RLS by using direct query without user_id filtering
    const { data, error } = await ctx.client
      .from('espn_schedule_imports')
      .select(`
        id,
        espn_league_id,
        season_year,
        league_name,
        team_count,
        total_matchups,
        imported_at,
        assignment_status
      `)
      .eq('assignment_status', 'PENDING')
      .order('imported_at', { ascending: false });


    if (error) {
      throw error;
    }

    // Format the data to match expected interface (id -> import_id)
    const formattedData = (data || []).map(item => ({
      ...item,
      import_id: item.id
    }));

    return formattedData;
  } catch (error) {
    throwDbError(error, 'Get pending schedule imports');
    return []; // Return empty array on error
  }
}

export async function assignScheduleToSeason(ctx, importId, seasonId, notes = null) {

  try {
    // First, import teams from ESPN import to the main teams table
    await importTeamsFromESPNImport(ctx, importId, seasonId);

    // Then handle the schedule assignment (this can be database function or manual)
    try {
      const { data, error } = await ctx.client.rpc('assign_schedule_to_season', {
        p_import_id: importId,
        p_season_id: seasonId,
        p_notes: notes
      });

      if (error) throw error;
      return data;
    } catch (rpcError) {
      // If the RPC doesn't exist, handle assignment manually
      if (rpcError.code === '42883') { // function does not exist
        return await manualAssignScheduleToSeason(ctx, importId, seasonId, notes);
      }
      throw rpcError;
    }
  } catch (error) {
    throwDbError(error, 'Assign schedule to season');
  }
}

export async function importTeamsFromESPNImport(ctx, importId, seasonId) {

  try {
    // Get teams from ESPN import
    const { data: espnTeams, error: teamsError } = await ctx.client
      .from('espn_teams')
      .select('*')
      .eq('import_id', importId);

    if (teamsError) throw teamsError;

    log.debug(`🏈 Importing ${espnTeams.length} teams from ESPN import to season...`);

    const importedTeams = [];
    const errors = [];

    for (const espnTeam of espnTeams) {
      try {
        // Check if team already exists for this season
        const { data: existingTeam } = await ctx.client
          .from('teams')
          .select('id')
          .eq('season_id', seasonId)
          .eq('espn_team_id', espnTeam.espn_team_id)
          .single();

        if (existingTeam) {
          log.debug(`   Skipping ${espnTeam.team_name} - already exists`);
          continue;
        }

        log.debug(`   Adding: ${espnTeam.team_name} (Owner: ${espnTeam.owner_name || 'Unknown'})`);

        const teamData = {
          season_id: seasonId,
          name: espnTeam.team_name,
          owner: espnTeam.owner_name || espnTeam.abbreviation || '',
          espn_team_id: espnTeam.espn_team_id,
          wins: espnTeam.record?.wins || 0,
          losses: espnTeam.record?.losses || 0,
          ties: espnTeam.record?.ties || 0,
          points_for: espnTeam.record?.pointsFor || 0,
          points_against: espnTeam.record?.pointsAgainst || 0,
          win_percentage: 0,
          point_differential: 0,
          average_points_for: 0,
          average_points_against: 0,
          strength_of_schedule: 0,
          opponent_win_percentage: 0,
          quality_wins: 0,
          bad_losses: 0,
          blowout_wins: 0,
          close_wins: 0,
          close_losses: 0,
          recent_form: 0,
          current_streak: { type: 'none', length: 0 },
          power_rating: 0,
          previous_rank: null,
          rank_change: 0
        };

        const { data: newTeam, error: insertError } = await ctx.client
          .from('teams')
          .insert(formatForDatabase(teamData))
          .select()
          .single();

        if (insertError) throw insertError;

        importedTeams.push(newTeam);

      } catch (error) {
        log.error(`   ❌ Failed to import ${espnTeam.team_name}: ${error.message}`);
        errors.push({ team: espnTeam.team_name, error: error.message });
      }
    }

    log.debug(`✅ Team import completed! Imported: ${importedTeams.length}, Errors: ${errors.length}`);

    return {
      imported: importedTeams,
      errors,
      success: errors.length === 0
    };

  } catch (error) {
    throwDbError(error, 'Import teams from ESPN import');
  }
}

export async function manualAssignScheduleToSeason(ctx, importId, seasonId, notes = null) {

  try {
    // Update the import record to mark it as assigned
    const { error: updateError } = await ctx.client
      .from('espn_schedule_imports')
      .update({
        assignment_status: 'assigned',
        assigned_season_id: seasonId,
        assigned_at: new Date().toISOString(),
        assignment_notes: notes
      })
      .eq('id', importId);

    if (updateError) throw updateError;

    return {
      success: true,
      message: 'Schedule and teams successfully assigned to season'
    };

  } catch (error) {
    throwDbError(error, 'Manual assign schedule to season');
  }
}

export async function getScheduleImportDetails(ctx, importId) {

  try {
    const { data: importData, error: importError } = await ctx.client
      .from('espn_schedule_imports')
      .select('*')
      .eq('id', importId)
      .single();

    if (importError) throw importError;

    const { data: teams, error: teamsError } = await ctx.client
      .from('espn_teams')
      .select('*')
      .eq('import_id', importId)
      .order('espn_team_id');

    if (teamsError) throw teamsError;

    const { data: matchups, error: matchupsError } = await ctx.client
      .from('espn_matchups')
      .select('*')
      .eq('import_id', importId)
      .order('week')
      .order('espn_matchup_id');

    if (matchupsError) throw matchupsError;

    return {
      import: importData,
      teams: teams || [],
      matchups: matchups || []
    };
  } catch (error) {
    throwDbError(error, 'Get schedule import details');
  }
}

export async function getAssignedSchedules(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('espn_schedule_imports')
      .select(`
        *,
        espn_teams (*),
        espn_matchups (*)
      `)
      .eq('assigned_season_id', seasonId)
      .eq('assignment_status', 'ASSIGNED');

    if (error) throw error;

    return data || [];
  } catch (error) {
    throwDbError(error, 'Get assigned schedules');
  }
}

export async function rejectScheduleImport(ctx, importId, notes = null) {

  try {
    const { data, error } = await ctx.client
      .from('espn_schedule_imports')
      .update({
        assignment_status: 'REJECTED',
        assignment_notes: notes,
        assigned_at: new Date().toISOString()
      })
      .eq('id', importId)
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    throwDbError(error, 'Reject schedule import');
  }
}
