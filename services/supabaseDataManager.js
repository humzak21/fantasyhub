import {
  createSeason, createTeam, createGame, createWeek, createDivision,
  validateSeason, validateTeam, validateGame, validateDivision,
  createPickEmWeek, createPickEmSubmission, validatePickEmWeek, validatePickEmSubmission,
  calculatePickEmSchedule, getPickEmTimeStatus, PICK_EM_STATUS,
  createAward, validateAward
} from '../types/index.js';
import { handleSupabaseError, formatForDatabase, formatFromDatabase } from './supabaseClient.js';
import { PowerRankingCalculator } from './powerRankingCalculator.js';
import { createClient } from '@supabase/supabase-js';

export class SupabaseDataManager {
  constructor() {
    this.seasonsCache = new Map();
    this.activeSeasonId = null;
    this._initialized = false;
    this.client = null;
    this.isAdminMode = false;
  }

  async initialize() {
    if (this._initialized) return;

    try {
      // Initialize client dynamically to ensure environment variables are loaded
      if (!this.client) {
        // Use proper environment variable detection for browser vs server
        const supabaseUrl = typeof window !== 'undefined'
          ? import.meta.env.VITE_SUPABASE_URL
          : (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);

        const supabaseServiceRoleKey = typeof window !== 'undefined'
          ? null
          : process.env.SUPABASE_SERVICE_ROLE_KEY;

        const supabaseAnonKey = typeof window !== 'undefined'
          ? import.meta.env.VITE_SUPABASE_ANON_KEY
          : (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);

        if (!supabaseUrl) {
          throw new Error('Missing SUPABASE_URL environment variable');
        }

        // Prefer service role key for Node.js scripts (admin access)
        if (supabaseServiceRoleKey) {
          this.client = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
            db: {
              schema: 'public'
            },
            global: {
              headers: {
                'x-client-info': 'fantasy-football-power-rankings-admin'
              }
            }
          });
          this.isAdminMode = true;
        } else if (supabaseAnonKey) {
          this.client = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
              autoRefreshToken: true,
              persistSession: true,
              detectSessionInUrl: true
            },
            db: {
              schema: 'public'
            },
            global: {
              headers: {
                'x-client-info': 'fantasy-football-power-rankings'
              }
            }
          });
          this.isAdminMode = false;
        } else {
          throw new Error('Missing Supabase authentication keys (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY)');
        }
      }

      if (!this.isAdminMode) {
        // Check if user is authenticated (browser mode) - but allow read-only access for non-authenticated users
        const { data: { user }, error } = await this.client.auth.getUser();

        // Store auth state but don't throw error - allow read-only access
        this.isAuthenticated = !!(user && !error);
      } else {
        this.isAuthenticated = true;
      }

      // Test database connection by checking if seasons table exists
      const { data: tableTest, error: tableError } = await this.client
        .from('seasons')
        .select('count', { count: 'exact', head: true });


      if (tableError) {
        if (tableError.code === '42P01') {
          throw new Error('Database tables not found. Please run the database migration.');
        }
        throw tableError;
      }

      this._initialized = true;
    } catch (error) {
      handleSupabaseError(error, 'Initialization');
    }
  }

  // Season management
  async createSeason(year, name = '', leagueSize = 14, regularSeasonWeeks = 14, playoffWeeks = 3) {

    await this.initialize();

    const season = createSeason(year, name, leagueSize, regularSeasonWeeks, playoffWeeks);

    if (!validateSeason(season)) {
      throw new Error('Invalid season data');
    }

    try {
      // Insert season
      const seasonData = formatForDatabase({
        year: season.year,
        name: season.name,
        leagueSize: season.leagueSize,
        regularSeasonWeeks: season.regularSeasonWeeks,
        playoffWeeks: season.playoffWeeks,
        isActive: season.isActive,
        isCompleted: season.isCompleted,
        stats: season.stats,
        playoffBracket: season.playoffBracket
      });


      const { data: insertedSeason, error: seasonError } = await this.client
        .from('seasons')
        .insert(seasonData)
        .select()
        .single();


      if (seasonError) throw seasonError;

      season.id = insertedSeason.id;

      // Create weeks
      const weeksData = [];
      for (let week = 1; week <= season.totalWeeks; week++) {
        const weekData = createWeek(week, season.id);
        weeksData.push(formatForDatabase({
          seasonId: season.id,
          weekNumber: weekData.weekNumber,
          isCompleted: weekData.isCompleted,
          powerRankings: weekData.powerRankings,
          weeklyStats: weekData.weeklyStats
        }));
      }

      const { error: weeksError } = await this.client
        .from('weeks')
        .insert(weeksData);

      if (weeksError) throw weeksError;

      // Cache the season
      const formattedSeason = formatFromDatabase(insertedSeason);
      // Ensure teams array exists
      if (!formattedSeason.teams) {
        formattedSeason.teams = [];
      }
      // Ensure schedule array exists
      if (!formattedSeason.schedule) {
        formattedSeason.schedule = [];
      }
      this.seasonsCache.set(formattedSeason.id, formattedSeason);

      return formattedSeason;
    } catch (error) {
      handleSupabaseError(error, 'Create season');
      throw error; // Ensure the error is re-thrown
    }
  }

  async getSeason(seasonId) {
    await this.initialize();

    // Check cache first
    if (this.seasonsCache.has(seasonId)) {
      return this.seasonsCache.get(seasonId);
    }

    try {
      const { data, error } = await this.client
        .from('seasons')
        .select(`
          *,
          teams (*),
          weeks (*),
          games (*)
        `)
        .eq('id', seasonId)
        .single();

      if (error) throw error;

      const formattedSeason = formatFromDatabase(data);

      // Transform the structure to match expected format
      formattedSeason.schedule = formattedSeason.games || [];
      delete formattedSeason.games;

      this.seasonsCache.set(seasonId, formattedSeason);
      return formattedSeason;
    } catch (error) {
      handleSupabaseError(error, 'Get season');
    }
  }

  async getAllSeasons() {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('seasons')
        .select(`
          *,
          teams (*)
        `)
        .order('year', { ascending: false });

      if (error) throw error;

      const seasons = data.map(season => {
        const formattedSeason = formatFromDatabase(season);
        // Ensure teams array exists
        if (!formattedSeason.teams) {
          formattedSeason.teams = [];
        }
        return formattedSeason;
      });

      // Update cache
      seasons.forEach(season => {
        this.seasonsCache.set(season.id, season);
      });

      return seasons;
    } catch (error) {
      handleSupabaseError(error, 'Get all seasons');
    }
  }

  async setActiveSeason(seasonId) {
    await this.initialize();

    try {
      // Deactivate all seasons
      await this.client
        .from('seasons')
        .update({ is_active: false })
        .neq('id', seasonId);

      // Activate the specified season
      const { data, error } = await this.client
        .from('seasons')
        .update({ is_active: true })
        .eq('id', seasonId)
        .select()
        .single();

      if (error) throw error;

      this.activeSeasonId = seasonId;
      const formattedSeason = formatFromDatabase(data);
      this.seasonsCache.set(seasonId, formattedSeason);

      return formattedSeason;
    } catch (error) {
      handleSupabaseError(error, 'Set active season');
    }
  }

  async getActiveSeason() {
    await this.initialize();

    if (this.activeSeasonId && this.seasonsCache.has(this.activeSeasonId)) {
      return this.seasonsCache.get(this.activeSeasonId);
    }

    try {
      const { data, error } = await this.client
        .from('seasons')
        .select(`
          *,
          teams (*)
        `)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      const formattedSeason = formatFromDatabase(data);
      // Ensure teams array exists
      if (!formattedSeason.teams) {
        formattedSeason.teams = [];
      }
      this.activeSeasonId = formattedSeason.id;
      this.seasonsCache.set(formattedSeason.id, formattedSeason);

      return formattedSeason;
    } catch (error) {
      handleSupabaseError(error, 'Get active season');
    }
  }

  async deleteSeason(seasonId) {
    await this.initialize();

    try {
      const { error } = await this.client
        .from('seasons')
        .delete()
        .eq('id', seasonId);

      if (error) throw error;

      this.seasonsCache.delete(seasonId);
      if (this.activeSeasonId === seasonId) {
        this.activeSeasonId = null;
      }

      return true;
    } catch (error) {
      handleSupabaseError(error, 'Delete season');
    }
  }

  // Team management
  async addTeamToSeason(seasonId, name, owner = '') {
    await this.initialize();

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
      const { data, error } = await this.client
        .from('teams')
        .insert(formatForDatabase(team))
        .select()
        .single();

      if (error) throw error;

      const formattedTeam = formatFromDatabase(data);

      // Clear season cache to ensure fresh data on next fetch
      this.seasonsCache.delete(seasonId);

      return formattedTeam;
    } catch (error) {
      handleSupabaseError(error, 'Add team');
    }
  }

  async updateTeam(seasonId, teamId, updates) {
    await this.initialize();

    try {
      // Separate roster data from team updates
      const { roster, ...teamUpdates } = updates;

      // Update team record (if there are non-roster fields to update)
      let updatedTeam = null;
      if (Object.keys(teamUpdates).length > 0) {
        const formattedUpdates = formatForDatabase(teamUpdates);

        const { data, error } = await this.client
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
        await this.syncTeamRosterFromESPN(teamId, roster, currentWeek);
      }

      // Clear season cache
      this.seasonsCache.delete(seasonId);

      return updatedTeam || { id: teamId };
    } catch (error) {
      handleSupabaseError(error, 'Update team');
    }
  }

  async syncTeamRosterFromESPN(teamId, rosterData, currentWeek = 1) {
    await this.initialize();

    try {
      // Get the team's user_id first
      const { data: teamData, error: teamError } = await this.client
        .from('teams')
        .select('user_id')
        .eq('id', teamId)
        .single();

      if (teamError) throw teamError;
      if (!teamData) throw new Error(`Team not found: ${teamId}`);


      // Since the database function doesn't handle user_id properly with service role,
      // let's do a manual sync instead
      await this.manualSyncTeamRoster(teamId, teamData.user_id, rosterData, currentWeek);

      return rosterData.length;
    } catch (error) {
      handleSupabaseError(error, 'Sync team roster from ESPN');
    }
  }

  async manualSyncTeamRoster(teamId, userId, rosterData, currentWeek = 1) {
    await this.initialize();

    try {
      // First, clear existing roster for this team
      const { error: deleteError } = await this.client
        .from('rosters')
        .delete()
        .eq('team_id', teamId);

      if (deleteError) throw deleteError;

      // Build roster data for bulk insert
      const rosterInserts = [];

      for (const player of rosterData) {
        // Sync player to database first with all stats data
        const playerId = await this.syncPlayerFromESPN(
          player.playerId,
          player.playerName,
          player.position,
          this.getNFLTeamAbbreviation(player.proTeam),
          {
            seasonProjectedPoints: player.seasonProjectedPoints,
            seasonActualPoints: player.seasonActualPoints,
            projectedPoints: player.projectedPoints,
            actualPoints: player.actualPoints,
            gamesPlayed: player.gamesPlayed,
            injuryStatus: player.injuryStatus,
            percentOwned: player.percentOwned,
            percentStarted: player.percentStarted,
            proTeamName: player.proTeamName,
            proTeam: player.proTeam
          }
        );

        rosterInserts.push({
          user_id: userId,
          team_id: teamId,
          player_id: playerId,
          roster_slot: this.mapESPNRosterSlot(player.rosterSlot, player.position),
          acquisition_type: 'free_agent',
          acquisition_week: currentWeek,
          cost: 0
        });
      }


      // Try disabling trigger temporarily for service role

      const { error: disableError } = await this.client.rpc('disable_roster_trigger');

      if (disableError) {

        const { data, error } = await this.client
          .from('rosters')
          .insert(rosterInserts)
          .select();

        if (error) {
          return await this.insertRosterOneByOne(rosterInserts);
        }

        return data || rosterInserts;
      } else {
        // Trigger disabled, now insert
        const { data, error } = await this.client
          .from('rosters')
          .insert(rosterInserts)
          .select();

        // Re-enable trigger
        await this.client.rpc('enable_roster_trigger');

        if (error) {
          return await this.insertRosterOneByOne(rosterInserts);
        }

        return data || rosterInserts;
      }

      return rosterInserts;
    } catch (error) {
      handleSupabaseError(error, 'Manual sync team roster');
    }
  }

  async fallbackRosterInsert(rosterEntries) {

    try {
      // Build values for bulk insert
      const insertQuery = `
        INSERT INTO rosters (user_id, team_id, player_id, roster_slot, acquisition_type, acquisition_week, cost)
        VALUES ${rosterEntries.map((_, i) =>
        `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`
      ).join(', ')}
        RETURNING id;
      `;

      const params = rosterEntries.flatMap(entry => [
        entry.user_id,
        entry.team_id,
        entry.player_id,
        entry.roster_slot,
        entry.acquisition_type,
        entry.acquisition_week,
        entry.cost
      ]);

      // Execute raw SQL that bypasses triggers
      const { data, error } = await this.client
        .rpc('execute_raw_sql', {
          query: insertQuery,
          parameters: params
        });

      if (error) {
        // Last resort: Insert one by one with minimal error handling
        return await this.insertRosterOneByOne(rosterEntries);
      }

      return data || rosterEntries;
    } catch (error) {
      return await this.insertRosterOneByOne(rosterEntries);
    }
  }

  async insertRosterOneByOne(rosterEntries) {
    const inserted = [];

    for (let i = 0; i < rosterEntries.length; i++) {
      const entry = rosterEntries[i];

      try {
        const { data, error } = await this.client
          .from('rosters')
          .insert(entry)
          .select()
          .single();

        if (error) {
        } else if (data) {
          inserted.push(data);
        } else {
        }
      } catch (exception) {
      }
    }

    return inserted;
  }

  async syncPlayerFromESPN(espnPlayerId, name, position, nflTeam, playerStats = {}) {
    await this.initialize();

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
        playerData.injury_status = this.mapESPNInjuryStatus(playerStats.injuryStatus);
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
      const { data, error } = await this.client
        .from('players')
        .upsert(playerData, {
          onConflict: 'espn_player_id'
        })
        .select('id')
        .single();

      if (error) throw error;

      return data.id;
    } catch (error) {
      handleSupabaseError(error, 'Sync player from ESPN');
    }
  }

  // Helper function to map ESPN injury status to database-allowed values
  mapESPNInjuryStatus(espnInjuryStatus) {
    if (!espnInjuryStatus) return 'ACTIVE';

    // Convert to uppercase and handle common ESPN injury status values
    const status = espnInjuryStatus.toString().toUpperCase().trim();

    // Direct matches
    const validStatuses = ['ACTIVE', 'QUESTIONABLE', 'DOUBTFUL', 'OUT', 'IR', 'SUSPENDED', 'PUP'];
    if (validStatuses.includes(status)) {
      return status;
    }

    // Handle common ESPN variations and mappings
    const statusMap = {
      'HEALTHY': 'ACTIVE',
      'Q': 'QUESTIONABLE',
      'D': 'DOUBTFUL',
      'O': 'OUT',
      'INJURED_RESERVE': 'IR',
      'RESERVE': 'IR',
      'PHYSICALLY_UNABLE_TO_PERFORM': 'PUP',
      'PUP_R': 'PUP',
      'SUSP': 'SUSPENDED',
      'SUS': 'SUSPENDED',
      'NA': 'ACTIVE',
      'PROBABLE': 'ACTIVE', // ESPN removed probable, treat as active
      'GTD': 'QUESTIONABLE', // Game Time Decision
      'GAME_TIME_DECISION': 'QUESTIONABLE'
    };

    return statusMap[status] || 'ACTIVE'; // Default to ACTIVE for unknown statuses
  }

  // Helper function to map ESPN pro team IDs to NFL team abbreviations
  getNFLTeamAbbreviation(proTeamId) {
    const teamMap = {
      1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
      9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
      17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
      25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU'
    };
    return teamMap[proTeamId] || null;
  }

  // Helper function to map ESPN roster slots to database roster slots
  mapESPNRosterSlot(espnSlot, position) {
    // ESPN roster slot mapping
    const slotMap = {
      0: 'QB',   // QB
      2: 'RB',   // RB  
      4: 'WR',   // WR
      6: 'TE',   // TE
      16: 'D/ST', // D/ST
      17: 'K',   // K
      20: 'BE',  // Bench
      21: 'IR',  // IR
      23: 'FLEX' // Flex
    };

    return slotMap[espnSlot] || 'BE';
  }

  // Roster management methods
  async getTeamRoster(teamId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('rosters')
        .select(`
          id,
          roster_slot,
          acquisition_type,
          acquisition_week,
          added_date,
          cost,
          is_keeper,
          player:players (
            id,
            espn_player_id,
            name,
            position,
            team_abbreviation,
            jersey_number,
            is_active
          )
        `)
        .eq('team_id', teamId)
        .order('roster_slot')
        .order('player.position')
        .order('player.name');

      if (error) throw error;

      return formatFromDatabase(data || []);
    } catch (error) {
      handleSupabaseError(error, 'Get team roster');
    }
  }

  async getAllRosters(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('rosters')
        .select(`
          id,
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
            owner,
            season_id
          ),
          player:players (
            id,
            espn_player_id,
            name,
            position,
            team_abbreviation,
            jersey_number,
            is_active
          )
        `)
        .eq('team.season_id', seasonId)
        .order('roster_slot')

      if (error) throw error;

      // Group by team and sort
      const rostersByTeam = {};
      (data || []).forEach(rosterEntry => {
        const teamId = rosterEntry.team_id;
        if (!rostersByTeam[teamId]) {
          rostersByTeam[teamId] = {
            team: rosterEntry.team,
            roster: []
          };
        }
        rostersByTeam[teamId].roster.push(formatFromDatabase(rosterEntry));
      });

      // Sort teams by name and roster entries by position, then name
      Object.values(rostersByTeam).forEach(teamRoster => {
        teamRoster.roster.sort((a, b) => {
          // First sort by roster slot (starters before bench)
          const slotOrder = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST', 'BE', 'IR'];
          const aSlotIndex = slotOrder.indexOf(a.rosterSlot) !== -1 ? slotOrder.indexOf(a.rosterSlot) : 999;
          const bSlotIndex = slotOrder.indexOf(b.rosterSlot) !== -1 ? slotOrder.indexOf(b.rosterSlot) : 999;

          if (aSlotIndex !== bSlotIndex) {
            return aSlotIndex - bSlotIndex;
          }

          // Then sort by player name
          const aName = a.player?.name || '';
          const bName = b.player?.name || '';
          return aName.localeCompare(bName);
        });
      });

      return rostersByTeam;
    } catch (error) {
      handleSupabaseError(error, 'Get all rosters');
    }
  }

  async getRosterStats(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('rosters')
        .select(`
          team_id,
          roster_slot,
          team:teams!inner (
            id,
            name,
            season_id
          ),
          player:players (
            position,
            team_abbreviation
          )
        `)
        .eq('team.season_id', seasonId);

      if (error) throw error;

      // Calculate roster composition stats
      const stats = {};
      (data || []).forEach(entry => {
        const teamId = entry.team_id;
        if (!stats[teamId]) {
          stats[teamId] = {
            teamName: entry.team.name,
            totalPlayers: 0,
            positions: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, 'D/ST': 0 },
            starters: 0,
            bench: 0,
            ir: 0
          };
        }

        stats[teamId].totalPlayers++;

        if (entry.player?.position) {
          stats[teamId].positions[entry.player.position] =
            (stats[teamId].positions[entry.player.position] || 0) + 1;
        }

        if (['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST'].includes(entry.roster_slot)) {
          stats[teamId].starters++;
        } else if (entry.roster_slot === 'BE') {
          stats[teamId].bench++;
        } else if (entry.roster_slot === 'IR') {
          stats[teamId].ir++;
        }
      });

      return stats;
    } catch (error) {
      handleSupabaseError(error, 'Get roster stats');
    }
  }

  async getAllPlayers(seasonId = null) {
    await this.initialize();

    try {
      let query = this.client
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
        query = this.client
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
      handleSupabaseError(error, 'Get all players');
    }
  }

  async removeTeamFromSeason(seasonId, teamId) {
    await this.initialize();

    try {
      const { error } = await this.client
        .from('teams')
        .delete()
        .eq('id', teamId)
        .eq('season_id', seasonId);

      if (error) throw error;

      // Clear season cache
      this.seasonsCache.delete(seasonId);
    } catch (error) {
      handleSupabaseError(error, 'Remove team');
    }
  }

  // Division management methods
  async getDivisionsForSeason(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('divisions')
        .select('*')
        .eq('season_id', seasonId)
        .order('display_order', { ascending: true });

      if (error) throw error;

      return data?.map(formatFromDatabase) || [];
    } catch (error) {
      handleSupabaseError(error, 'Get divisions for season');
      return [];
    }
  }

  async createDivision(seasonId, name, displayOrder = 1) {
    await this.initialize();

    const division = createDivision(null, seasonId, name, displayOrder);

    if (!validateDivision(division)) {
      throw new Error('Invalid division data');
    }

    try {
      const divisionData = formatForDatabase({
        seasonId: division.seasonId,
        name: division.name,
        displayOrder: division.displayOrder
      });

      const { data, error } = await this.client
        .from('divisions')
        .insert(divisionData)
        .select()
        .single();

      if (error) throw error;

      // Clear season cache
      this.seasonsCache.delete(seasonId);

      return formatFromDatabase(data);
    } catch (error) {
      handleSupabaseError(error, 'Create division');
    }
  }

  async updateDivision(divisionId, updates) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('divisions')
        .update(formatForDatabase(updates))
        .eq('id', divisionId)
        .select()
        .single();

      if (error) throw error;

      // Clear season cache if we have the season id
      if (data?.season_id) {
        this.seasonsCache.delete(data.season_id);
      }

      return formatFromDatabase(data);
    } catch (error) {
      handleSupabaseError(error, 'Update division');
    }
  }

  async deleteDivision(divisionId) {
    await this.initialize();

    try {
      // First, get the season_id for cache clearing
      const { data: divisionData } = await this.client
        .from('divisions')
        .select('season_id')
        .eq('id', divisionId)
        .single();

      const { error } = await this.client
        .from('divisions')
        .delete()
        .eq('id', divisionId);

      if (error) throw error;

      // Clear season cache
      if (divisionData?.season_id) {
        this.seasonsCache.delete(divisionData.season_id);
      }

      return true;
    } catch (error) {
      handleSupabaseError(error, 'Delete division');
      return false;
    }
  }

  async assignTeamToDivision(teamId, divisionId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('teams')
        .update({ division_id: divisionId })
        .eq('id', teamId)
        .select('season_id')
        .single();

      if (error) throw error;

      // Clear season cache
      if (data?.season_id) {
        this.seasonsCache.delete(data.season_id);
      }

      return true;
    } catch (error) {
      handleSupabaseError(error, 'Assign team to division');
      return false;
    }
  }

  async getStandingsByDivision(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
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
      handleSupabaseError(error, 'Get standings by division');
      return { divisions: [], unassigned: [] };
    }
  }

  // Game management with database functions
  async addGame(seasonId, week, team1Id, team2Id, team1Score = null, team2Score = null, type = 'regular') {
    await this.initialize();

    const game = createGame(week, team1Id, team2Id, team1Score, team2Score, type);

    if (!validateGame(game)) {
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

      const { data, error } = await this.client
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
        const { data: updatedGame, error: updateError } = await this.client
          .rpc('update_game_result', {
            game_id: data.id,
            team1_score: team1Score,
            team2_score: team2Score
          });

        if (updateError) throw updateError;
      }

      // Clear season cache
      this.seasonsCache.delete(seasonId);

      return formatFromDatabase(data);
    } catch (error) {
      handleSupabaseError(error, 'Add game');
    }
  }

  async updateGameScore(seasonId, gameId, team1Score, team2Score) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .rpc('update_game_result', {
          game_id: gameId,
          team1_score: team1Score,
          team2_score: team2Score
        });

      if (error) throw error;

      // Clear season cache
      this.seasonsCache.delete(seasonId);

      return formatFromDatabase(data);
    } catch (error) {
      handleSupabaseError(error, 'Update game score');
    }
  }

  // Week management
  async completeWeek(seasonId, weekNumber) {
    await this.initialize();

    try {
      const { data, error } = await this.client
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
        await this.saveWeeklyPowerRankingsSnapshot(seasonId, weekNumber, 'auto');
      } catch (snapshotError) {
        console.warn('Failed to save power rankings snapshot:', snapshotError);
        // Don't throw - week completion should succeed even if snapshot fails
      }

      // Clear season cache
      this.seasonsCache.delete(seasonId);

      return formatFromDatabase(data);
    } catch (error) {
      handleSupabaseError(error, 'Complete week');
    }
  }

  // Analytics helpers
  async getCurrentWeek(seasonId) {
    await this.initialize();

    try {
      // Check games table to determine completed weeks
      // A week is considered completed if all its games have scores
      const { data: games, error } = await this.client
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
      handleSupabaseError(error, 'Get current week');
      return 1;
    }
  }

  // Helper method to get the last completed week
  async getLastCompletedWeek(seasonId) {
    await this.initialize();

    try {
      const currentWeek = await this.getCurrentWeek(seasonId);
      // Last completed week is current week - 1 (unless we're at week 1)
      return Math.max(1, currentWeek - 1);
    } catch (error) {
      handleSupabaseError(error, 'Get last completed week');
      return 1;
    }
  }

  // Helper method to get all completed weeks as an array
  async getCompletedWeeks(seasonId) {
    await this.initialize();

    try {
      // Check games table to get all completed weeks
      const { data: games, error } = await this.client
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
      handleSupabaseError(error, 'Get completed weeks');
      return [];
    }
  }

  async getGamesForWeek(seasonId, weekNumber) {
    await this.initialize();

    try {
      const { data, error } = await this.client
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

  async getCompletedGames(seasonId, upToWeek = null) {
    await this.initialize();

    try {
      let query = this.client
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

  // Power rankings - always calculate live for accuracy
  async calculatePowerRankings(seasonId, weekNumber = null) {
    await this.initialize();

    console.log('=== calculatePowerRankings called ===', { weekNumber });

    try {
      // Always use live calculation with rank change comparison
      // This ensures accuracy regardless of stored data
      console.log('Calculating live rankings with rank changes');
      return await this.getPowerRankingsForWeek(seasonId, weekNumber || await this.getCurrentWeek(seasonId));
    } catch (error) {
      handleSupabaseError(error, 'Calculate power rankings');
    }
  }

  // New method to calculate live power rankings using JavaScript PowerRankingCalculator
  async calculateLivePowerRankings(seasonId, weekNumber = null, skipPreviousWeekLookup = false) {
    await this.initialize();

    console.log('=== calculateLivePowerRankings called ===', {
      seasonId: seasonId?.substring(0, 8),
      weekNumber,
      skipPreviousWeekLookup
    });

    try {
      // Get season data for regularSeasonWeeks
      const { data: season, error: seasonError } = await this.client
        .from('seasons')
        .select('*')
        .eq('id', seasonId)
        .single();

      if (seasonError) throw seasonError;

      // Get divisions for the season
      const { data: divisions, error: divisionsError } = await this.client
        .from('divisions')
        .select('*')
        .eq('season_id', seasonId)
        .order('display_order', { ascending: true });

      if (divisionsError) {
        console.error('Error fetching divisions:', divisionsError);
        throw divisionsError;
      }

      console.log('[calculateLivePowerRankings] Divisions fetched:', {
        count: divisions?.length || 0,
        divisions: divisions
      });

      // Get teams for the season
      const { data: teams, error: teamsError } = await this.client
        .from('teams')
        .select('*')
        .eq('season_id', seasonId)
        .order('id', { ascending: true });

      if (teamsError) throw teamsError;

      // Get games for the season
      const { data: games, error: gamesError } = await this.client
        .from('games')
        .select('*')
        .eq('season_id', seasonId)
        .order('week', { ascending: true });

      if (gamesError) throw gamesError;

      // Get current week if not specified
      const currentWeek = weekNumber || await this.getCurrentWeek(seasonId);

      // Format games to match PowerRankingCalculator expectations
      const formattedGames = games.map(game => ({
        ...game,
        team1Id: game.team1_id,
        team2Id: game.team2_id,
        team1Score: game.team1_score,
        team2Score: game.team2_score,
        isCompleted: game.team1_score !== null && game.team2_score !== null
      }));

      // Get all players for the season with their stats
      const players = await this.getAllPlayers(seasonId);

      // Get all rosters for the season and attach to teams
      const rostersByTeam = await this.getAllRosters(seasonId);

      // Attach roster data to teams with division IDs
      const teamsWithRosters = teams.map(team => ({
        ...team,
        roster: rostersByTeam[team.id]?.roster || [],
        divisionId: team.division_id
      }));

      // Create PowerRankingCalculator instance with divisions and regularSeasonWeeks
      const regularSeasonWeeks = season.regular_season_weeks || season.regularSeasonWeeks || 14;

      console.log('[calculateLivePowerRankings] Creating PowerRankingCalculator:', {
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
        null, // analyticsService
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
        console.log(`Fetching previous week rankings for week ${currentWeek - 1}, season ${seasonId}`);
        try {
          // Only try to get from history table, don't recursively calculate
          const { data: historicalData, error: histError } = await this.client
            .from('power_rankings_history')
            .select('team_id, rank')
            .eq('season_id', seasonId)
            .eq('week_number', currentWeek - 1)
            .order('rank', { ascending: true });

          console.log('Query result:', {
            error: histError?.message,
            dataCount: historicalData?.length
          });

          if (histError) {
            console.error('Error fetching previous week rankings:', histError);
          } else if (historicalData && historicalData.length > 0) {
            console.log(`✓ Found ${historicalData.length} previous rankings`);
            previousWeekRankings = historicalData.map(row => ({
              teamId: row.team_id,
              id: row.team_id,
              rank: row.rank
            }));
          } else {
            console.warn(`No previous week rankings found for week ${currentWeek - 1}`);
          }
        } catch (error) {
          console.error('Could not fetch previous week rankings:', error);
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
      handleSupabaseError(error, 'Calculate live power rankings');
      return [];
    }
  }

  async getPowerRankingsForWeek(seasonId, weekNumber) {
    await this.initialize();

    try {
      // Always calculate live rankings to ensure accuracy
      // Don't trust historical data - calculate fresh from game data
      const currentWeekRankings = await this.calculateLivePowerRankings(seasonId, weekNumber, true);

      // Calculate previous week's rankings live to compare
      if (weekNumber > 1) {
        const previousWeekRankings = await this.calculateLivePowerRankings(seasonId, weekNumber - 1, true);

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
      handleSupabaseError(error, 'Get power rankings for week');
      return [];
    }
  }

  async getPowerRankingsHistory(seasonId, weekNumber = null) {
    await this.initialize();

    try {
      let query = this.client
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
      handleSupabaseError(error, 'Get power rankings history');
    }
  }

  async saveWeeklyPowerRankingsSnapshot(seasonId, weekNumber, snapshotType = 'weekly') {
    await this.initialize();

    try {
      // Calculate live power rankings using JavaScript PowerRankingCalculator
      const powerRankings = await this.calculateLivePowerRankings(seasonId, weekNumber);

      if (!powerRankings || powerRankings.length === 0) {
        return 0;
      }

      // Delete existing rankings for this week
      const { error: deleteError } = await this.client
        .from('power_rankings_history')
        .delete()
        .eq('season_id', seasonId)
        .eq('week_number', weekNumber);

      if (deleteError) {
      }

      // Prepare snapshot data - only store current week's rankings
      // Rank changes will be calculated dynamically when fetching data
      const snapshotData = powerRankings.map((team, index) => {
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
      const { data, error } = await this.client
        .from('power_rankings_history')
        .insert(snapshotData)
        .select();

      if (error) throw error;

      return data.length;
    } catch (error) {
      handleSupabaseError(error, 'Save power rankings snapshot');
      return 0;
    }
  }

  async checkWeeklySnapshotStatus(seasonYear = 2025) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .rpc('should_trigger_weekly_snapshot', {
          season_year: seasonYear
        });

      if (error) throw error;

      return data?.[0] || { should_trigger: false, reason: 'No data returned' };
    } catch (error) {
      handleSupabaseError(error, 'Check weekly snapshot status');
      return { should_trigger: false, reason: 'Error checking status' };
    }
  }

  async executeWeeklySnapshotIfNeeded(seasonYear = 2025) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .rpc('execute_weekly_snapshot_if_needed', {
          season_year: seasonYear
        });

      if (error) throw error;

      return data;
    } catch (error) {
      handleSupabaseError(error, 'Execute weekly snapshot');
      return { status: 'error', error_message: error.message };
    }
  }

  async getCurrentNFLWeek(seasonYear = 2025) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .rpc('get_current_nfl_week', {
          season_year: seasonYear
        });

      if (error) throw error;

      return data || 1;
    } catch (error) {
      return 1;
    }
  }

  async getAvailableSnapshotWeeks(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .rpc('get_available_snapshot_weeks', {
          season_id: seasonId
        });

      if (error) throw error;

      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'Get available snapshot weeks');
      return [];
    }
  }

  // Schedule generation (remains mostly the same but saves to database)
  async generateRoundRobinSchedule(seasonId) {
    await this.initialize();

    const season = await this.getSeason(seasonId);
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
      await this.client
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

      const { data, error } = await this.client
        .from('games')
        .insert(games)
        .select();

      if (error) throw error;

      // Clear season cache
      this.seasonsCache.delete(seasonId);

      return data.map(formatFromDatabase);
    } catch (error) {
      handleSupabaseError(error, 'Generate schedule');
    }
  }

  // ESPN Schedule Management Functions
  async getPendingScheduleImports() {
    await this.initialize();

    try {
      // Check all ESPN tables to see if any data exists
      const importsCheck = await this.client
        .from('espn_schedule_imports')
        .select('*')
        .limit(5);

      const teamsCheck = await this.client
        .from('espn_teams')
        .select('*')
        .limit(5);

      const matchupsCheck = await this.client
        .from('espn_matchups')
        .select('*')
        .limit(5);

      // Skip RLS by using direct query without user_id filtering
      const { data, error } = await this.client
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
      handleSupabaseError(error, 'Get pending schedule imports');
      return []; // Return empty array on error
    }
  }

  async assignScheduleToSeason(importId, seasonId, notes = null) {
    await this.initialize();

    try {
      // First, import teams from ESPN import to the main teams table
      await this.importTeamsFromESPNImport(importId, seasonId);

      // Then handle the schedule assignment (this can be database function or manual)
      try {
        const { data, error } = await this.client.rpc('assign_schedule_to_season', {
          p_import_id: importId,
          p_season_id: seasonId,
          p_notes: notes
        });

        if (error) throw error;
        return data;
      } catch (rpcError) {
        // If the RPC doesn't exist, handle assignment manually
        if (rpcError.code === '42883') { // function does not exist
          return await this.manualAssignScheduleToSeason(importId, seasonId, notes);
        }
        throw rpcError;
      }
    } catch (error) {
      handleSupabaseError(error, 'Assign schedule to season');
    }
  }

  async importTeamsFromESPNImport(importId, seasonId) {
    await this.initialize();

    try {
      // Get teams from ESPN import
      const { data: espnTeams, error: teamsError } = await this.client
        .from('espn_teams')
        .select('*')
        .eq('import_id', importId);

      if (teamsError) throw teamsError;

      console.log(`🏈 Importing ${espnTeams.length} teams from ESPN import to season...`);

      const importedTeams = [];
      const errors = [];

      for (const espnTeam of espnTeams) {
        try {
          // Check if team already exists for this season
          const { data: existingTeam } = await this.client
            .from('teams')
            .select('id')
            .eq('season_id', seasonId)
            .eq('espn_team_id', espnTeam.espn_team_id)
            .single();

          if (existingTeam) {
            console.log(`   Skipping ${espnTeam.team_name} - already exists`);
            continue;
          }

          console.log(`   Adding: ${espnTeam.team_name} (Owner: ${espnTeam.owner_name || 'Unknown'})`);

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

          const { data: newTeam, error: insertError } = await this.client
            .from('teams')
            .insert(formatForDatabase(teamData))
            .select()
            .single();

          if (insertError) throw insertError;

          importedTeams.push(newTeam);

        } catch (error) {
          console.error(`   ❌ Failed to import ${espnTeam.team_name}: ${error.message}`);
          errors.push({ team: espnTeam.team_name, error: error.message });
        }
      }

      console.log(`✅ Team import completed! Imported: ${importedTeams.length}, Errors: ${errors.length}`);

      return {
        imported: importedTeams,
        errors,
        success: errors.length === 0
      };

    } catch (error) {
      handleSupabaseError(error, 'Import teams from ESPN import');
    }
  }

  async manualAssignScheduleToSeason(importId, seasonId, notes = null) {
    await this.initialize();

    try {
      // Update the import record to mark it as assigned
      const { error: updateError } = await this.client
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
      handleSupabaseError(error, 'Manual assign schedule to season');
    }
  }

  async getScheduleImportDetails(importId) {
    await this.initialize();

    try {
      const { data: importData, error: importError } = await this.client
        .from('espn_schedule_imports')
        .select('*')
        .eq('id', importId)
        .single();

      if (importError) throw importError;

      const { data: teams, error: teamsError } = await this.client
        .from('espn_teams')
        .select('*')
        .eq('import_id', importId)
        .order('espn_team_id');

      if (teamsError) throw teamsError;

      const { data: matchups, error: matchupsError } = await this.client
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
      handleSupabaseError(error, 'Get schedule import details');
    }
  }

  async getAssignedSchedules(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
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
      handleSupabaseError(error, 'Get assigned schedules');
    }
  }

  async rejectScheduleImport(importId, notes = null) {
    await this.initialize();

    try {
      const { data, error } = await this.client
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
      handleSupabaseError(error, 'Reject schedule import');
    }
  }

  // Data export (enhanced with database query)
  async exportSeasonData(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('seasons')
        .select(`
          *,
          teams (*),
          games (*),
          weeks (*),
          power_rankings_history (*)
        `)
        .eq('id', seasonId)
        .single();

      if (error) throw error;

      return {
        season: formatFromDatabase(data),
        exportedAt: new Date().toISOString(),
        version: '2.0'
      };
    } catch (error) {
      handleSupabaseError(error, 'Export season data');
    }
  }

  // ================================
  // PICK'EMS FUNCTIONALITY
  // ================================

  // Pick'em week management
  async createPickEmWeek(seasonId, weekNumber, customSchedule = null) {
    await this.initialize();

    try {
      const schedule = customSchedule || calculatePickEmSchedule(weekNumber);

      const { data, error } = await this.client.rpc('create_pick_em_week', {
        p_season_id: seasonId,
        p_week_number: weekNumber,
        p_submission_opens_at: schedule.submissionOpensAt,
        p_submission_closes_at: schedule.submissionClosesAt,
        p_results_reveal_at: schedule.resultsRevealAt
      });

      if (error) throw error;

      return data;
    } catch (error) {
      handleSupabaseError(error, 'Create pick em week');
    }
  }

  async getPickEmWeek(seasonId, weekNumber) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('pick_em_weeks')
        .select('*')
        .eq('season_id', seasonId)
        .eq('week_number', weekNumber)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return data ? formatFromDatabase(data) : null;
    } catch (error) {
      handleSupabaseError(error, 'Get pick em week');
    }
  }

  async getAllPickEmWeeks(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('pick_em_weeks')
        .select('*')
        .eq('season_id', seasonId)
        .order('week_number');

      if (error) throw error;

      return (data || []).map(formatFromDatabase);
    } catch (error) {
      handleSupabaseError(error, 'Get all pick em weeks');
    }
  }

  async getPickEmStatus(seasonId) {
    await this.initialize();

    try {
      // Get all pick'em weeks for the season
      const { data: pickEmWeeks, error: weeksError } = await this.client
        .from('pick_em_weeks')
        .select('*')
        .eq('season_id', seasonId)
        .order('week_number');

      if (weeksError) throw weeksError;

      if (!pickEmWeeks || pickEmWeeks.length === 0) {
        return [];
      }

      const now = new Date();
      const statusResults = [];

      for (const week of pickEmWeeks) {
        const submissionOpensAt = new Date(week.submission_opens_at);
        const submissionClosesAt = new Date(week.submission_closes_at);
        const resultsRevealAt = new Date(week.results_reveal_at);

        // Check if all games for this week are completed
        const { data: games, error: gamesError } = await this.client
          .from('games')
          .select('is_completed')
          .eq('season_id', seasonId)
          .eq('week', week.week_number);

        if (gamesError) throw gamesError;

        const allGamesCompleted = games && games.length > 0 && games.every(g => g.is_completed);

        // Determine status
        let status = 'upcoming';
        let canSubmit = false;
        let resultsAvailable = false;
        let timeInfo = '';

        if (now < submissionOpensAt) {
          status = 'upcoming';
          timeInfo = `Opens ${submissionOpensAt.toLocaleDateString()}`;
        } else if (now >= submissionOpensAt && now < submissionClosesAt) {
          status = 'open';
          canSubmit = true;
          timeInfo = `Closes ${submissionClosesAt.toLocaleDateString()}`;
        } else if (now >= submissionClosesAt) {
          status = 'closed';

          // Results are available if all games are completed OR we're past reveal time
          if (allGamesCompleted || now >= resultsRevealAt) {
            resultsAvailable = true;
            status = 'completed';
            timeInfo = 'Results Available';
          } else {
            timeInfo = `Results reveal ${resultsRevealAt.toLocaleDateString()}`;
          }
        }

        statusResults.push({
          weekNumber: week.week_number,
          pickEmWeekId: week.id,
          status,
          canSubmit,
          resultsAvailable,
          timeInfo,
          allGamesCompleted,
          submissionOpensAt: week.submission_opens_at,
          submissionClosesAt: week.submission_closes_at,
          resultsRevealAt: week.results_reveal_at
        });
      }

      return statusResults;
    } catch (error) {
      handleSupabaseError(error, 'Get pick em status');
      return [];
    }
  }

  // Pick'em submissions
  async submitPickEmPicks(pickEmWeekId, picks) {
    await this.initialize();

    if (!Array.isArray(picks) || picks.length === 0) {
      throw new Error('Picks must be a non-empty array');
    }

    // Validate all picks
    for (const pick of picks) {
      if (!validatePickEmSubmission({
        pickEmWeekId,
        gameId: pick.gameId,
        predictedWinnerTeamId: pick.predictedWinnerTeamId
      })) {
        throw new Error('Invalid pick submission data');
      }
    }

    try {
      const { data, error } = await this.client.rpc('submit_pick_em_picks', {
        p_pick_em_week_id: pickEmWeekId,
        p_picks: picks
      });

      if (error) throw error;

      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'Submit pick em picks');
    }
  }

  // Helper method to get user display names from auth (public-safe, no emails exposed)
  async getUserDisplayNames(userIds) {
    if (!userIds || userIds.length === 0) return {};

    const userDisplayNames = {};

    // Try to get user display names using the public-safe RPC function
    try {
      const { data: usersData, error: usersError } = await this.client.rpc('get_user_display_names', {
        user_ids: userIds
      });

      if (!usersError && usersData && Array.isArray(usersData)) {
        usersData.forEach(user => {
          if (user && user.id) {
            userDisplayNames[user.id] = user.display_name || `User ${user.id.slice(0, 8)}`;
          }
        });
      }
    } catch (rpcError) {
      console.warn('RPC function get_user_display_names not available:', rpcError);

      // Fallback: get current user details only
      try {
        const { data: { user } } = await this.client.auth.getUser();
        if (user && userIds.includes(user.id)) {
          userDisplayNames[user.id] = user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split('@')[0] ||
            `User ${user.id.slice(0, 8)}`;
        }
      } catch (authError) {
        console.warn('Could not get current user details:', authError);
      }
    }

    // Fill in any missing users with fallback names
    userIds.forEach(userId => {
      if (!userDisplayNames[userId]) {
        userDisplayNames[userId] = `User ${userId.slice(0, 8)}`;
      }
    });

    return userDisplayNames;
  }

  async getUserPicksForWeek(pickEmWeekId, userId = null) {
    await this.initialize();

    try {

      // Get current user session
      const { data: { session } } = await this.client.auth.getSession();
      const currentUserId = session?.user?.id;

      // Use current user ID if none provided
      const targetUserId = userId || currentUserId;

      const { data, error } = await this.client.rpc('get_user_picks_for_week', {
        p_pick_em_week_id: pickEmWeekId,
        p_user_id: targetUserId
      });

      if (error) throw error;


      // Transform snake_case to camelCase for frontend
      const transformedData = (data || []).map(pick => ({
        submissionId: pick.submission_id,
        gameId: pick.game_id,
        weekNumber: pick.week_number,
        team1Name: pick.team1_name,
        team2Name: pick.team2_name,
        predictedWinnerTeamId: pick.predicted_winner_team_id,
        predictedWinnerName: pick.predicted_winner_name,
        confidenceLevel: pick.confidence_level,
        isCorrect: pick.is_correct,
        pointsEarned: pick.points_earned,
        actualWinnerTeamId: pick.actual_winner_team_id,
        actualWinnerName: pick.actual_winner_name,
        submittedAt: pick.submitted_at
      }));


      return transformedData;
    } catch (error) {
      handleSupabaseError(error, 'Get user picks for week');
      return [];
    }
  }

  async getAllPicksForWeek(pickEmWeekId) {
    await this.initialize();

    try {
      // Get all submissions with game and team data
      const { data, error } = await this.client
        .from('pick_em_submissions')
        .select(`
          *,
          pick_em_weeks!inner(is_completed),
          games(
            week,
            is_completed,
            winner_team_id,
            team1_score,
            team2_score,
            team1:teams!games_team1_id_fkey(id, name, owner),
            team2:teams!games_team2_id_fkey(id, name, owner)
          ),
          predicted_team:teams!pick_em_submissions_predicted_winner_team_id_fkey(name)
        `)
        .eq('pick_em_week_id', pickEmWeekId);

      if (error) throw error;

      // Get unique user IDs
      const userIds = [...new Set((data || []).map(s => s.user_id))];
      const displayNames = await this.getUserDisplayNames(userIds);

      // Calculate results on the fly by comparing picks to actual game results
      const submissions = (data || []).map(submission => {
        const game = submission.games;
        const isCorrect = game?.is_completed && game.winner_team_id === submission.predicted_winner_team_id;
        const pointsEarned = isCorrect ? 1 : 0; // Simple scoring: 1 point per correct pick
        const formattedSubmission = formatFromDatabase(submission);

        return {
          ...formattedSubmission,
          displayName: displayNames[submission.user_id] || `User ${submission.user_id?.slice(0, 8)}`,
          isCorrect,
          pointsEarned,
          pickedTeamId: submission.predicted_winner_team_id,
          pickedTeamName: formattedSubmission.predictedTeam?.name,
          predictedWinnerName: formattedSubmission.predictedTeam?.name,
          actualWinnerTeamId: game?.winner_team_id,
          actualWinnerName: game?.winner_team_id === game?.team1?.id ? game?.team1?.name :
            game?.winner_team_id === game?.team2?.id ? game?.team2?.name : null,
          team1Id: game?.team1?.id,
          team2Id: game?.team2?.id,
          team1Name: game?.team1?.name,
          team2Name: game?.team2?.name,
          team1Score: game?.team1_score,
          team2Score: game?.team2_score,
          gameCompleted: game?.is_completed
        };
      });

      return submissions;
    } catch (error) {
      handleSupabaseError(error, 'Get all picks for week');
    }
  }

  async getAdminSubmissionsForWeek(pickEmWeekId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('pick_em_submissions')
        .select(`
          *,
          games(
            week,
            team1:teams!games_team1_id_fkey(id, name, owner),
            team2:teams!games_team2_id_fkey(id, name, owner)
          ),
          predicted_team:teams!pick_em_submissions_predicted_winner_team_id_fkey(name)
        `)
        .eq('pick_em_week_id', pickEmWeekId)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      const submissions = (data || []).map(formatFromDatabase);

      // Get user details for each unique user ID
      const userIds = [...new Set(submissions.map(s => s.userId))];
      const userDetails = {};

      // Try to get user details using the RPC function first
      try {
        const { data: usersData, error: usersError } = await this.client.rpc('get_users_for_admin', {
          user_ids: userIds
        });

        if (!usersError && usersData && Array.isArray(usersData)) {
          usersData.forEach(user => {
            if (user && user.id) {
              userDetails[user.id] = {
                email: user.email || `user-${user.id.slice(0, 8)}@unknown.com`,
                displayName: user.display_name || user.email || `User ${user.id.slice(0, 8)}`
              };
            }
          });
        } else {
          console.warn('RPC function get_users_for_admin failed or returned no data:', usersError);
        }
      } catch (rpcError) {
        console.warn('RPC function get_users_for_admin not available. Please run the database migration in /database/admin_user_details_migration.sql');
        console.warn('Error details:', rpcError);
      }

      // Fallback: get current user details for comparison
      try {
        const { data: currentUserData } = await this.client.auth.getUser();
        if (currentUserData?.user?.id) {
          userDetails[currentUserData.user.id] = {
            email: currentUserData.user.email,
            displayName: currentUserData.user.user_metadata?.name || currentUserData.user.email
          };
        }
      } catch (authError) {
        console.warn('Could not get current user details:', authError);
      }

      // Apply user details to submissions with fallbacks
      return submissions.map(submission => ({
        ...submission,
        userDetails: userDetails[submission.userId] || {
          email: `user-${submission.userId?.slice(0, 8) || 'unknown'}@needs-migration.com`,
          displayName: `User ${submission.userId?.slice(0, 8) || 'Unknown'} (Run DB Migration)`
        }
      }));
    } catch (error) {
      handleSupabaseError(error, 'Get admin submissions for week');
      return [];
    }
  }

  // Pick'em results and scoring
  async calculatePickEmResults(pickEmWeekId) {
    await this.initialize();

    try {
      // Since we calculate results on the fly, we just need to mark the week as completed
      // and ensure all games for the week are completed

      // First, verify all games are completed
      const { data: pickEmWeek, error: weekError } = await this.client
        .from('pick_em_weeks')
        .select('week_number, season_id')
        .eq('id', pickEmWeekId)
        .single();

      if (weekError) throw weekError;

      const { data: games, error: gamesError } = await this.client
        .from('games')
        .select('is_completed')
        .eq('season_id', pickEmWeek.season_id)
        .eq('week', pickEmWeek.week_number);

      if (gamesError) throw gamesError;

      const allGamesCompleted = games && games.length > 0 && games.every(g => g.is_completed);

      if (!allGamesCompleted) {
        throw new Error('Cannot calculate results: Not all games for this week are completed');
      }

      // Mark the week as completed
      const { error: updateError } = await this.client
        .from('pick_em_weeks')
        .update({
          is_completed: true,
          is_closed: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', pickEmWeekId);

      if (updateError) throw updateError;

      // Return success - results are calculated on the fly when requested
      return { success: true, message: 'Results calculated successfully' };
    } catch (error) {
      handleSupabaseError(error, 'Calculate pick em results');
    }
  }

  async getWeeklyPickEmScores(pickEmWeekId) {
    await this.initialize();

    try {
      // Get all picks for the week with calculated results
      const allPicks = await this.getAllPicksForWeek(pickEmWeekId);

      if (!allPicks || allPicks.length === 0) {
        return [];
      }

      // Group picks by user
      const userScores = {};
      allPicks.forEach(pick => {
        const userId = pick.userId;
        if (!userScores[userId]) {
          userScores[userId] = {
            userId,
            totalPicks: 0,
            correctPicks: 0,
            totalPoints: 0,
            pickEmWeekId
          };
        }

        userScores[userId].totalPicks++;
        if (pick.isCorrect) {
          userScores[userId].correctPicks++;
          userScores[userId].totalPoints += pick.pointsEarned || 1;
        }
      });

      // Get display names for all users
      const userIds = Object.keys(userScores);
      const displayNames = await this.getUserDisplayNames(userIds);

      // Convert to array and calculate accuracy and rank
      const scoresArray = Object.values(userScores).map(score => ({
        ...score,
        displayName: displayNames[score.userId] || `User ${score.userId.slice(0, 8)}`,
        accuracyPercentage: score.totalPicks > 0 ? (score.correctPicks / score.totalPicks) * 100 : 0
      }));

      // Sort by total points (desc), then by correct picks (desc), then by accuracy (desc)
      scoresArray.sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        if (b.correctPicks !== a.correctPicks) return b.correctPicks - a.correctPicks;
        return b.accuracyPercentage - a.accuracyPercentage;
      });

      // Assign ranks
      return scoresArray.map((score, index) => ({
        ...score,
        weeklyRank: index + 1
      }));
    } catch (error) {
      handleSupabaseError(error, 'Get weekly pick em scores');
      return [];
    }
  }

  async getSeasonPickEmStandings(seasonId) {
    await this.initialize();

    try {
      // Get all pick'em weeks for the season
      const { data: pickEmWeeks, error: weeksError } = await this.client
        .from('pick_em_weeks')
        .select('id, week_number')
        .eq('season_id', seasonId)
        .order('week_number');

      if (weeksError) throw weeksError;

      if (!pickEmWeeks || pickEmWeeks.length === 0) {
        return [];
      }

      // Get all picks for all weeks
      const userStats = {};

      for (const week of pickEmWeeks) {
        const allPicks = await this.getAllPicksForWeek(week.id);

        allPicks.forEach(pick => {
          const userId = pick.userId;
          if (!userStats[userId]) {
            userStats[userId] = {
              userId,
              totalPicks: 0,
              totalCorrectPicks: 0,
              totalPoints: 0,
              totalWeeksParticipated: new Set(),
              perfectWeeks: 0,
              weeklyResults: []
            };
          }

          userStats[userId].totalPicks++;
          if (pick.isCorrect) {
            userStats[userId].totalCorrectPicks++;
            userStats[userId].totalPoints += pick.pointsEarned || 1;
          }
          userStats[userId].totalWeeksParticipated.add(week.week_number);
        });

        // Check for perfect weeks
        const weekScores = await this.getWeeklyPickEmScores(week.id);
        weekScores.forEach(score => {
          if (score.accuracyPercentage === 100 && userStats[score.userId]) {
            userStats[score.userId].perfectWeeks++;
          }
        });
      }

      // Get display names for all users
      const userIds = Object.keys(userStats);
      const displayNames = await this.getUserDisplayNames(userIds);

      // Convert to array and calculate overall stats
      const standingsArray = Object.values(userStats).map(stats => ({
        userId: stats.userId,
        displayName: displayNames[stats.userId] || `User ${stats.userId.slice(0, 8)}`,
        totalPicks: stats.totalPicks,
        totalCorrectPicks: stats.totalCorrectPicks,
        totalPoints: stats.totalPoints,
        totalWeeksParticipated: stats.totalWeeksParticipated.size,
        perfectWeeks: stats.perfectWeeks,
        overallAccuracyPercentage: stats.totalPicks > 0 ? (stats.totalCorrectPicks / stats.totalPicks) * 100 : 0
      }));

      // Sort by total points, then by accuracy
      standingsArray.sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        return b.overallAccuracyPercentage - a.overallAccuracyPercentage;
      });

      // Assign season ranks
      return standingsArray.map((standing, index) => ({
        ...standing,
        seasonRank: index + 1
      }));
    } catch (error) {
      handleSupabaseError(error, 'Get season pick em standings');
      return [];
    }
  }

  // Get all picks from all weeks in a season
  async getAllSeasonPicks(seasonId) {
    await this.initialize();

    try {
      // Get all pick'em weeks for the season
      const { data: pickEmWeeks, error: weeksError } = await this.client
        .from('pick_em_weeks')
        .select('id, week_number')
        .eq('season_id', seasonId)
        .order('week_number');

      if (weeksError) throw weeksError;

      if (!pickEmWeeks || pickEmWeeks.length === 0) {
        return [];
      }

      // Get all picks for all weeks
      const allSeasonPicks = [];

      for (const week of pickEmWeeks) {
        const weekPicks = await this.getAllPicksForWeek(week.id);
        allSeasonPicks.push(...weekPicks);
      }

      return allSeasonPicks;
    } catch (error) {
      handleSupabaseError(error, 'Get all season picks');
      return [];
    }
  }

  // Pick'em analytics
  async getPickEmWeeklyBreakdown(seasonId) {
    await this.initialize();

    try {
      // Get all pick'em weeks for the season
      const { data: pickEmWeeks, error } = await this.client
        .from('pick_em_weeks')
        .select('id, week_number')
        .eq('season_id', seasonId)
        .order('week_number');

      if (error) throw error;

      // Get scores for each week and group by week number
      const weeklyBreakdown = {};

      for (const week of pickEmWeeks || []) {
        const scores = await this.getWeeklyPickEmScores(week.id);
        weeklyBreakdown[week.week_number] = scores;
      }

      return weeklyBreakdown;
    } catch (error) {
      handleSupabaseError(error, 'Get pick em weekly breakdown');
      return {};
    }
  }

  async getPickEmGameData(seasonId, weekNumber) {
    await this.initialize();

    try {
      // Get games for the week to use for pick'ems
      const { data, error } = await this.client
        .from('games')
        .select(`
          id,
          week,
          team1_id,
          team2_id,
          team1_score,
          team2_score,
          is_completed,
          winner_team_id,
          team1:teams!games_team1_id_fkey(id, name, owner),
          team2:teams!games_team2_id_fkey(id, name, owner)
        `)
        .eq('season_id', seasonId)
        .eq('week', weekNumber)
        .order('id');

      if (error) throw error;

      return (data || []).map(game => ({
        ...formatFromDatabase(game),
        canPredict: !game.is_completed // Can only predict on incomplete games
      }));
    } catch (error) {
      handleSupabaseError(error, 'Get pick em game data');
    }
  }

  // Administrative functions
  async createPickEmWeeksForSeason(seasonId, startWeek = 1, endWeek = null) {
    await this.initialize();

    try {
      const season = await this.getSeason(seasonId);
      if (!season) throw new Error('Season not found');

      const finalWeek = endWeek || season.regularSeasonWeeks;
      const createdWeeks = [];

      for (let week = startWeek; week <= finalWeek; week++) {
        try {
          const pickEmWeekId = await this.createPickEmWeek(seasonId, week);
          createdWeeks.push({ week, pickEmWeekId });
        } catch (error) {
        }
      }

      return createdWeeks;
    } catch (error) {
      handleSupabaseError(error, 'Create pick em weeks for season');
    }
  }

  async updatePickEmWeekStatus(pickEmWeekId, status) {
    await this.initialize();

    const statusUpdates = {};

    switch (status) {
      case PICK_EM_STATUS.OPEN:
        statusUpdates.is_active = true;
        statusUpdates.is_closed = false;
        break;
      case PICK_EM_STATUS.CLOSED:
        statusUpdates.is_active = false;
        statusUpdates.is_closed = true;
        break;
      case PICK_EM_STATUS.COMPLETED:
        statusUpdates.is_active = false;
        statusUpdates.is_closed = true;
        statusUpdates.is_completed = true;
        break;
      default:
        statusUpdates.is_active = false;
        statusUpdates.is_closed = false;
        statusUpdates.is_completed = false;
    }

    try {
      const { data, error } = await this.client
        .from('pick_em_weeks')
        .update(statusUpdates)
        .eq('id', pickEmWeekId)
        .select()
        .single();

      if (error) throw error;

      return formatFromDatabase(data);
    } catch (error) {
      handleSupabaseError(error, 'Update pick em week status');
    }
  }

  // ============================================================================
  // TRANSACTION MANAGEMENT
  // ============================================================================

  /**
   * Get all-time transaction totals for all franchises
   * Combines historical data with current 2025 season data
   */
  async getTransactionLeaderboard() {
    await this.initialize();

    try {
      // Get historical data from materialized view
      let historicalData = [];
      const { data: mvData, error: mvError } = await this.client
        .from('mv_transaction_leaderboards')
        .select('*')
        .order('total_all_transactions', { ascending: false });

      if (mvError) {
        // Fallback to direct query if materialized view doesn't exist
        if (mvError.code === '42P01') {
          historicalData = await this.getTransactionLeaderboardFallback();
        } else {
          throw mvError;
        }
      } else {
        historicalData = mvData || [];
      }

      // Get 2025 transaction data
      const { data: data2025, error: error2025 } = await this.client
        .from('transactions_2025')
        .select('*');

      // If no 2025 data or error, just return historical
      if (error2025) {
        console.warn('Error fetching transactions_2025:', error2025.message);
        return historicalData;
      }

      if (!data2025 || data2025.length === 0) {
        console.warn('No data in transactions_2025 table');
        return historicalData;
      }

      console.log(`Found ${data2025.length} entries in transactions_2025`);
      console.log('2025 owners:', data2025.map(d => d.owner_name).join(', '));

      // Merge historical and 2025 data by owner_name
      const mergedByOwner = {};

      // First, add all historical data
      historicalData.forEach(row => {
        const ownerName = row.owner_name;
        mergedByOwner[ownerName] = {
          franchise_id: row.franchise_id,
          owner_name: ownerName,
          display_name: row.display_name,
          total_free_agent_adds: row.total_free_agent_adds || 0,
          total_waiver_claims: row.total_waiver_claims || 0,
          total_trades: row.total_trades || 0,
          total_drops: row.total_drops || 0,
          total_all_transactions: row.total_all_transactions || 0,
          total_faab_spent: row.total_faab_spent || 0,
          seasons_tracked: row.seasons_tracked || 0
        };
      });

      // Then add 2025 data
      data2025.forEach(row => {
        const ownerName = row.owner_name;
        const transactions2025 = (row.free_agent_adds || 0) + (row.waiver_claims || 0) +
          (row.trades || 0) + (row.drops || 0);

        if (mergedByOwner[ownerName]) {
          // Add to existing franchise
          mergedByOwner[ownerName].total_free_agent_adds += row.free_agent_adds || 0;
          mergedByOwner[ownerName].total_waiver_claims += row.waiver_claims || 0;
          mergedByOwner[ownerName].total_trades += row.trades || 0;
          mergedByOwner[ownerName].total_drops += row.drops || 0;
          mergedByOwner[ownerName].total_all_transactions += transactions2025;
          mergedByOwner[ownerName].total_faab_spent += row.faab_spent || 0;
          mergedByOwner[ownerName].seasons_tracked += 1;
        } else {
          // New owner (only in 2025, like Anish Madala)
          mergedByOwner[ownerName] = {
            franchise_id: null, // No historical franchise
            owner_name: ownerName,
            display_name: ownerName,
            total_free_agent_adds: row.free_agent_adds || 0,
            total_waiver_claims: row.waiver_claims || 0,
            total_trades: row.trades || 0,
            total_drops: row.drops || 0,
            total_all_transactions: transactions2025,
            total_faab_spent: row.faab_spent || 0,
            seasons_tracked: 1
          };
        }
      });

      // Convert to array and sort by total transactions
      const result = Object.values(mergedByOwner).sort((a, b) =>
        b.total_all_transactions - a.total_all_transactions
      );

      console.log('Transaction leaderboard result:', result.length, 'entries');
      console.log('All owners in result:', result.map(r => `${r.owner_name}: ${r.total_all_transactions}`).join(', '));

      return result;
    } catch (error) {
      handleSupabaseError(error, 'Get transaction leaderboard');
      return [];
    }
  }

  /**
   * Fallback method to calculate transaction leaderboard from raw data
   */
  async getTransactionLeaderboardFallback() {
    try {
      const { data, error } = await this.client
        .from('team_transactions')
        .select(`
          franchise_id,
          owner_name,
          free_agent_adds,
          waiver_claims,
          trades,
          drops,
          total_transactions,
          faab_spent
        `);

      if (error) throw error;

      // Aggregate by franchise
      const aggregates = {};
      (data || []).forEach(row => {
        if (!aggregates[row.franchise_id]) {
          aggregates[row.franchise_id] = {
            franchise_id: row.franchise_id,
            owner_name: row.owner_name,
            total_free_agent_adds: 0,
            total_waiver_claims: 0,
            total_trades: 0,
            total_drops: 0,
            total_all_transactions: 0,
            total_faab_spent: 0,
            seasons_tracked: 0
          };
        }
        aggregates[row.franchise_id].total_free_agent_adds += row.free_agent_adds || 0;
        aggregates[row.franchise_id].total_waiver_claims += row.waiver_claims || 0;
        aggregates[row.franchise_id].total_trades += row.trades || 0;
        aggregates[row.franchise_id].total_drops += row.drops || 0;
        aggregates[row.franchise_id].total_all_transactions += row.total_transactions || 0;
        aggregates[row.franchise_id].total_faab_spent += row.faab_spent || 0;
        aggregates[row.franchise_id].seasons_tracked += 1;
      });

      return Object.values(aggregates).sort((a, b) =>
        b.total_all_transactions - a.total_all_transactions
      );
    } catch (error) {
      handleSupabaseError(error, 'Get transaction leaderboard fallback');
      return [];
    }
  }

  /**
   * Get transaction history for a specific franchise (season by season)
   */
  async getFranchiseTransactionHistory(franchiseId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('team_transactions')
        .select(`
          *,
          season:historical_seasons (
            id,
            year,
            name
          )
        `)
        .eq('franchise_id', franchiseId)
        .order('season(year)', { ascending: true });

      if (error) throw error;

      return (data || []).map(row => ({
        ...row,
        year: row.season?.year
      }));
    } catch (error) {
      handleSupabaseError(error, 'Get franchise transaction history');
      return [];
    }
  }

  /**
   * Get transactions for a specific season
   */
  async getSeasonTransactions(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('team_transactions')
        .select(`
          *,
          franchise:league_franchises (
            id,
            owner_name,
            display_name
          )
        `)
        .eq('season_id', seasonId)
        .order('total_transactions', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'Get season transactions');
      return [];
    }
  }

  /**
   * Upsert transaction data for a team
   */
  async upsertTeamTransaction(transactionData) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('team_transactions')
        .upsert(transactionData, {
          onConflict: 'franchise_id,season_id',
          ignoreDuplicates: false
        })
        .select()
        .single();

      if (error) throw error;

      return formatFromDatabase(data);
    } catch (error) {
      handleSupabaseError(error, 'Upsert team transaction');
      return null;
    }
  }

  /**
   * Refresh transaction materialized views
   */
  async refreshTransactionViews() {
    await this.initialize();

    try {
      const { error } = await this.client.rpc('refresh_transaction_views');

      if (error) throw error;

      return true;
    } catch (error) {
      // Non-fatal error - view might not exist yet
      console.warn('Could not refresh transaction views:', error.message);
      return false;
    }
  }

  // ============================================================================
  // CURRENT SEASON (2025) TRANSACTIONS
  // ============================================================================

  /**
   * Get all current season (2025) transactions
   */
  async getCurrentSeasonTransactions() {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('transactions_2025')
        .select(`
          *,
          team:teams (
            id,
            name,
            owner_name
          )
        `)
        .order('free_agent_adds', { ascending: false });

      if (error) {
        // Table might not exist yet
        if (error.code === '42P01') {
          return [];
        }
        throw error;
      }

      return (data || []).map(row => ({
        ...row,
        year: 2025,
        total_transactions: (row.free_agent_adds || 0) + (row.waiver_claims || 0) +
          (row.trades || 0) + (row.drops || 0)
      }));
    } catch (error) {
      handleSupabaseError(error, 'Get current season transactions');
      return [];
    }
  }

  /**
   * Get current season (2025) transactions for a specific owner
   */
  async getCurrentSeasonTransactionsByOwner(ownerName) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('transactions_2025')
        .select('*')
        .eq('owner_name', ownerName)
        .single();

      if (error) {
        // Table might not exist or no data for this owner
        if (error.code === '42P01' || error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      if (!data) return null;

      return {
        ...data,
        year: 2025,
        total_transactions: (data.free_agent_adds || 0) + (data.waiver_claims || 0) +
          (data.trades || 0) + (data.drops || 0)
      };
    } catch (error) {
      handleSupabaseError(error, 'Get current season transactions by owner');
      return null;
    }
  }

  // Awards Management
  async getAwards(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('awards_2025')
        .select('*')
        .eq('season_id', seasonId)
        .order('display_order', { ascending: true });

      if (error) throw error;

      return formatFromDatabase(data || []);
    } catch (error) {
      handleSupabaseError(error, 'Get awards');
    }
  }

  async createAward(seasonId, awardData) {
    await this.initialize();

    try {
      const formattedData = formatForDatabase({
        seasonId,
        ...awardData
      });

      const { data, error } = await this.client
        .from('awards_2025')
        .insert(formattedData)
        .select()
        .single();

      if (error) throw error;

      return formatFromDatabase(data);
    } catch (error) {
      handleSupabaseError(error, 'Create award');
    }
  }

  async updateAward(awardId, updates) {
    await this.initialize();

    try {
      const formattedUpdates = formatForDatabase(updates);

      console.log('Updating award with data:', formattedUpdates);

      // First, do the update without trying to select the result
      const { error: updateError } = await this.client
        .from('awards_2025')
        .update(formattedUpdates)
        .eq('id', awardId);

      if (updateError) {
        console.error('Supabase update error:', updateError);
        throw updateError;
      }

      // Then fetch the updated record separately
      const { data, error: selectError } = await this.client
        .from('awards_2025')
        .select('*')
        .eq('id', awardId)
        .single();

      if (selectError) {
        console.error('Supabase select error:', selectError);
        throw selectError;
      }

      return formatFromDatabase(data);
    } catch (error) {
      handleSupabaseError(error, 'Update award');
    }
  }

  async deleteAward(awardId) {
    await this.initialize();

    try {
      const { error } = await this.client
        .from('awards_2025')
        .delete()
        .eq('id', awardId);

      if (error) throw error;
      return true;
    } catch (error) {
      handleSupabaseError(error, 'Delete award');
    }
  }

  async getUserVotes(seasonId, userId) {
    await this.initialize();

    try {
      // Join with awards to filter by season
      const { data, error } = await this.client
        .from('award_votes')
        .select('*, awards_2025!inner(season_id)')
        .eq('user_id', userId)
        .eq('awards_2025.season_id', seasonId);

      if (error) throw error;

      return formatFromDatabase(data || []);
    } catch (error) {
      handleSupabaseError(error, 'Get user votes');
    }
  }

  async submitAwardVotes(seasonId, votes) {
    await this.initialize();

    try {
      const userId = (await this.client.auth.getUser()).data.user?.id;
      if (!userId) throw new Error('User not authenticated');

      const formattedVotes = votes.map(vote => ({
        award_id: vote.awardId,
        user_id: userId,
        vote_value: vote.voteValue,
        updated_at: new Date().toISOString()
      }));

      const { data, error } = await this.client
        .from('award_votes')
        .upsert(formattedVotes, {
          onConflict: 'award_id,user_id'
        })
        .select();

      if (error) throw error;

      return formatFromDatabase(data);
    } catch (error) {
      handleSupabaseError(error, 'Submit award votes');
    }
  }

  async getAwardsUnlockStatus(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .rpc('check_awards_unlock_status', { season_id_param: seasonId });

      if (error) throw error;

      // Format the result from snake_case to camelCase
      return formatFromDatabase(data);
    } catch (error) {
      handleSupabaseError(error, 'Get awards unlock status');
    }
  }

  async releaseAwardResults(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('awards_metadata')
        .upsert({
          season_id: seasonId,
          results_released: true,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      handleSupabaseError(error, 'Release award results');
    }
  }

  async toggleVotingAccess(seasonId, votingOpenToAll) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('awards_metadata')
        .upsert({
          season_id: seasonId,
          voting_open_to_all: votingOpenToAll,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      handleSupabaseError(error, 'Toggle voting access');
    }
  }

  async getAwardResults(seasonId) {
    await this.initialize();

    try {
      // Get all votes for the season
      const { data, error } = await this.client
        .from('award_votes')
        .select(`
          vote_value,
          award_id,
          awards_2025!inner(season_id)
        `)
        .eq('awards_2025.season_id', seasonId);

      if (error) throw error;

      // Aggregate results in memory (or could do via RPC)
      const results = {};
      data.forEach(vote => {
        if (!results[vote.award_id]) {
          results[vote.award_id] = {};
        }
        if (!results[vote.award_id][vote.vote_value]) {
          results[vote.award_id][vote.vote_value] = 0;
        }
        results[vote.award_id][vote.vote_value]++;
      });

      return results;
    } catch (error) {
      handleSupabaseError(error, 'Get award results');
    }
  }
}