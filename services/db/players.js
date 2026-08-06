/**
 * Players: the ESPN player registry and the season-wide player read.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { mapESPNInjuryStatus } from './espnMapping.js';
export async function syncPlayerFromESPN(ctx, espnPlayerId, name, position, nflTeam, playerStats = {}) {

  try {
    // Build player data object
    const playerData = {
      espn_player_id: espnPlayerId,
      name: name,
      position: position,
      team_abbreviation: nflTeam,
      is_active: true,
      updated_at: new Date().toISOString()
    };

    // Add points data if provided
    if (playerStats.seasonProjectedPoints !== undefined) {
      playerData.season_projected_points = playerStats.seasonProjectedPoints;
    }
    if (playerStats.seasonActualPoints !== undefined) {
      playerData.season_actual_points = playerStats.seasonActualPoints;
    }
    if (playerStats.projectedPoints !== undefined) {
      playerData.projected_points = playerStats.projectedPoints;
    }
    if (playerStats.actualPoints !== undefined) {
      playerData.actual_points = playerStats.actualPoints;
    }
    if (playerStats.gamesPlayed !== undefined) {
      playerData.games_played = playerStats.gamesPlayed;
    }
    if (playerStats.injuryStatus !== undefined) {
      playerData.injury_status = mapESPNInjuryStatus(playerStats.injuryStatus);
    }
    if (playerStats.percentOwned !== undefined) {
      playerData.percent_owned = playerStats.percentOwned;
    }
    if (playerStats.percentStarted !== undefined) {
      playerData.percent_started = playerStats.percentStarted;
    }
    if (playerStats.proTeamName !== undefined) {
      playerData.pro_team_name = playerStats.proTeamName;
    }
    if (playerStats.proTeam !== undefined) {
      playerData.pro_team_id = playerStats.proTeam;
    }

    // Add sync timestamp if we have stats data
    if (Object.keys(playerStats).length > 0) {
      playerData.last_stats_sync = new Date().toISOString();
      playerData.espn_last_updated = new Date().toISOString();
    }

    // Insert or update player
    const { data, error } = await ctx.client
      .from('players')
      .upsert(playerData, {
        onConflict: 'espn_player_id'
      })
      .select('id')
      .single();

    if (error) throw error;

    return data.id;
  } catch (error) {
    throwDbError(error, 'Sync player from ESPN');
  }
}

export async function getAllPlayers(ctx, seasonId = null) {

  try {
    let query = ctx.client
      .from('players')
      .select(`
        id,
        espn_player_id,
        name,
        position,
        team_abbreviation,
        jersey_number,
        is_active,
        projected_points,
        actual_points,
        season_projected_points,
        season_actual_points,
        games_played,
        average_points_per_game,
        projected_average,
        injury_status,
        percent_owned,
        percent_started,
        pro_team_id,
        pro_team_name,
        last_stats_sync,
        espn_last_updated
      `)
      .eq('is_active', true)
      .order('season_projected_points', { ascending: false });

    // If seasonId is provided, get only players rostered in that season
    if (seasonId) {
      query = ctx.client
        .from('rosters')
        .select(`
          team_id,
          roster_slot,
          acquisition_type,
          acquisition_week,
          added_date,
          cost,
          is_keeper,
          team:teams!inner (
            id,
            name,
            season_id
          ),
          player:players (
            id,
            espn_player_id,
            name,
            position,
            team_abbreviation,
            jersey_number,
            is_active,
            projected_points,
            actual_points,
            season_projected_points,
            season_actual_points,
            games_played,
            average_points_per_game,
            projected_average,
            injury_status,
            percent_owned,
            percent_started,
            pro_team_id,
            pro_team_name,
            last_stats_sync,
            espn_last_updated
          )
        `)
        .eq('team.season_id', seasonId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // If seasonId was provided, extract players from roster data
    if (seasonId) {
      const playersMap = new Map();
      (data || []).forEach(rosterEntry => {
        const player = rosterEntry.player;
        if (player && !playersMap.has(player.id)) {
          playersMap.set(player.id, formatFromDatabase(player));
        }
      });
      return Array.from(playersMap.values());
    }

    return formatFromDatabase(data || []);
  } catch (error) {
    throwDbError(error, 'Get all players');
  }
}
