import {
  createSeason, createTeam, createGame, createWeek, createDivision,
  validateSeason, validateTeam, validateGame, validateDivision,
  createPickEmWeek, createPickEmSubmission, validatePickEmWeek, validatePickEmSubmission,
  calculatePickEmSchedule, getPickEmTimeStatus, PICK_EM_STATUS
} from '../types/index.js';
import { supabase, supabaseAdmin, handleSupabaseError, formatForDatabase, formatFromDatabase } from './supabaseClient.js';
import { PowerRankingCalculator } from './powerRankingCalculator.js';

export class SupabaseDataManager {
  constructor() {
    this.seasonsCache = new Map();
    this.activeSeasonId = null;
    this._initialized = false;
    // Use admin client for Node.js scripts, regular client for browser
    this.client = supabaseAdmin || supabase;
    this.isAdminMode = !!supabaseAdmin;
  }

  async initialize() {
    if (this._initialized) return;
    
    try {
      console.log(`Initializing Supabase data manager... (${this.isAdminMode ? 'Admin Mode' : 'User Mode'})`);
      
      if (!this.isAdminMode) {
        // Check if user is authenticated (browser mode) - but allow read-only access for non-authenticated users
        const { data: { user }, error } = await this.client.auth.getUser();
        console.log('Auth check result:', { user: user?.id, error });
        
        // Store auth state but don't throw error - allow read-only access
        this.isAuthenticated = !!(user && !error);
        console.log('User authentication status:', this.isAuthenticated);
      } else {
        console.log('Using service role authentication for Node.js script');
        this.isAuthenticated = true;
      }
      
      // Test database connection by checking if seasons table exists
      console.log('Testing database connection...');
      const { data: tableTest, error: tableError } = await this.client
        .from('seasons')
        .select('count', { count: 'exact', head: true });
      
      console.log('Database table check:', { data: tableTest, error: tableError });
      
      if (tableError) {
        if (tableError.code === '42P01') {
          throw new Error('Database tables not found. Please run the database migration.');
        }
        throw tableError;
      }
      
      console.log('Supabase data manager initialized successfully');
      this._initialized = true;
    } catch (error) {
      console.error('Initialization failed:', error);
      handleSupabaseError(error, 'Initialization');
    }
  }

  // Season management
  async createSeason(year, name = '', leagueSize = 14, regularSeasonWeeks = 14, playoffWeeks = 3) {
    console.log('createSeason called:', { year, name, leagueSize, regularSeasonWeeks, playoffWeeks });
    
    await this.initialize();
    
    const season = createSeason(year, name, leagueSize, regularSeasonWeeks, playoffWeeks);
    console.log('Created season object:', season);
    
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

      console.log('Inserting season data:', seasonData);
      
      const { data: insertedSeason, error: seasonError } = await this.client
        .from('seasons')
        .insert(seasonData)
        .select()
        .single();

      console.log('Insert result:', { data: insertedSeason, error: seasonError });
      
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
      console.error('Create season error:', error);
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
    console.log('getAllSeasons called');
    await this.initialize();
    
    try {
      console.log('Querying seasons table with teams...');
      const { data, error } = await supabase
        .from('seasons')
        .select(`
          *,
          teams (*)
        `)
        .order('year', { ascending: false });

      console.log('getAllSeasons query result:', { data, error });
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
      await supabase
        .from('seasons')
        .update({ is_active: false })
        .neq('id', seasonId);

      // Activate the specified season
      const { data, error } = await supabase
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
      const { error } = await supabase
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
      const { data, error } = await supabase
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
        console.log(`Updating team ${teamId} with:`, JSON.stringify(teamUpdates, null, 2));
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
        console.log(`Syncing roster for team ${teamId} with ${roster.length} players`);
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
      
      console.log(`Team ${teamId} user_id:`, teamData.user_id);
      
      // Since the database function doesn't handle user_id properly with service role,
      // let's do a manual sync instead
      await this.manualSyncTeamRoster(teamId, teamData.user_id, rosterData, currentWeek);
      
      console.log(`✓ Synced ${rosterData.length} players for team ${teamId}`);
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
      
      console.log(`Inserting ${rosterInserts.length} roster entries...`);
      
      // Try disabling trigger temporarily for service role
      console.log('Attempting to disable trigger temporarily...');
      
      const { error: disableError } = await this.client.rpc('disable_roster_trigger');
      
      if (disableError) {
        console.log('❌ Could not disable trigger, trying insert with trigger...');
        
        const { data, error } = await this.client
          .from('rosters')
          .insert(rosterInserts)
          .select();
          
        if (error) {
          console.log('❌ Bulk insert failed, trying individual inserts...');
          return await this.insertRosterOneByOne(rosterInserts);
        }
        
        console.log(`✅ Successfully inserted ${data?.length || rosterInserts.length} roster entries`);
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
          console.log('❌ Bulk insert failed even with trigger disabled');
          return await this.insertRosterOneByOne(rosterInserts);
        }
        
        console.log(`✅ Successfully inserted ${data?.length || rosterInserts.length} roster entries (trigger disabled)`);
        return data || rosterInserts;
      }

      return rosterInserts;
    } catch (error) {
      handleSupabaseError(error, 'Manual sync team roster');
    }
  }

  async fallbackRosterInsert(rosterEntries) {
    console.log('Using fallback bulk insert...');
    
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
        console.log('❌ Fallback also failed:', error.message);
        // Last resort: Insert one by one with minimal error handling
        return await this.insertRosterOneByOne(rosterEntries);
      }
      
      console.log(`✅ Fallback insert succeeded: ${data?.length || 0} entries`);
      return data || rosterEntries;
    } catch (error) {
      console.log('❌ Fallback exception:', error.message);
      return await this.insertRosterOneByOne(rosterEntries);
    }
  }
  
  async insertRosterOneByOne(rosterEntries) {
    console.log('Last resort: inserting entries one by one...');
    const inserted = [];
    
    for (let i = 0; i < rosterEntries.length; i++) {
      const entry = rosterEntries[i];
      console.log(`\n--- Attempting insert ${i + 1}/${rosterEntries.length} ---`);
      console.log('Entry:', JSON.stringify(entry, null, 2));
      
      try {
        const { data, error } = await this.client
          .from('rosters')
          .insert(entry)
          .select()
          .single();
          
        if (error) {
          console.log('❌ Insert error:', JSON.stringify(error, null, 2));
        } else if (data) {
          console.log('✅ Insert succeeded');
          inserted.push(data);
        } else {
          console.log('⚠️ No error but no data returned');
        }
      } catch (exception) {
        console.log('💥 Insert exception:', exception.message);
      }
    }
    
    console.log(`\n📊 One-by-one results: ${inserted.length}/${rosterEntries.length} succeeded`);
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
      const { error } = await supabase
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

      const { data, error } = await supabase
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
        const { data: updatedGame, error: updateError } = await supabase
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
      const { data, error } = await supabase
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
      const { data, error } = await supabase
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

      // Save power rankings snapshot
      await this.client.rpc('save_power_rankings_snapshot', {
        season_id: seasonId,
        week_number: weekNumber
      });

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
      const { data, error } = await supabase
        .from('weeks')
        .select('week_number, is_completed')
        .eq('season_id', seasonId)
        .order('week_number');

      if (error) throw error;

      const completedWeeks = data.filter(week => week.is_completed);
      const season = await this.getSeason(seasonId);
      
      return Math.min(completedWeeks.length + 1, season?.totalWeeks || 1);
    } catch (error) {
      handleSupabaseError(error, 'Get current week');
    }
  }

  async getGamesForWeek(seasonId, weekNumber) {
    await this.initialize();
    
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('season_id', seasonId)
        .eq('week', weekNumber)
        .order('id');

      if (error) throw error;

      return data.map(formatFromDatabase);
    } catch (error) {
      console.error('Get games for week error:', error);
      // For games queries, just return empty array instead of throwing
      return [];
    }
  }

  async getCompletedGames(seasonId, upToWeek = null) {
    await this.initialize();
    
    try {
      let query = supabase
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
      console.error('Get completed games error:', error);
      // For games queries, just return empty array instead of throwing
      return [];
    }
  }

  // Power rankings with enhanced historical support
  async calculatePowerRankings(seasonId, weekNumber = null) {
    await this.initialize();
    
    try {
      // If weekNumber is specified, try to get historical data first
      if (weekNumber !== null) {
        const historicalData = await this.getPowerRankingsForWeek(seasonId, weekNumber);
        if (historicalData && historicalData.length > 0) {
          return historicalData;
        }
      }

      // Use JavaScript PowerRankingCalculator for live calculation
      return await this.calculateLivePowerRankings(seasonId, weekNumber);
    } catch (error) {
      handleSupabaseError(error, 'Calculate power rankings');
    }
  }

  // New method to calculate live power rankings using JavaScript PowerRankingCalculator
  async calculateLivePowerRankings(seasonId, weekNumber = null) {
    await this.initialize();
    
    try {
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
      
      // Attach roster data to teams
      const teamsWithRosters = teams.map(team => ({
        ...team,
        roster: rostersByTeam[team.id]?.roster || []
      }));
      
      // Create PowerRankingCalculator instance
      const calculator = new PowerRankingCalculator(teamsWithRosters, formattedGames, currentWeek, players);
      
      // Calculate all team stats with power rankings
      const teamStats = calculator.calculateAllTeamStats();
      
      // Sort by power rating (highest first) and assign ranks
      const sortedTeams = teamStats.sort((a, b) => (b.powerRating || 0) - (a.powerRating || 0));
      
      // Format results to match expected structure
      return sortedTeams.map((team, index) => ({
        teamId: team.id,
        id: team.id,
        name: team.name,
        owner: team.owner,
        rank: index + 1,
        powerRating: team.powerRating || 0,
        rankChange: 0, // Will be calculated when comparing to previous week
        previousRank: index + 1,
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
        closeLosses: team.closeLosses || 0
      })).sort((a, b) => b.powerRating - a.powerRating);
      
    } catch (error) {
      console.error('Error calculating live power rankings:', error);
      handleSupabaseError(error, 'Calculate live power rankings');
      return [];
    }
  }

  async getPowerRankingsForWeek(seasonId, weekNumber) {
    await this.initialize();
    
    try {
      // First try to get historical snapshot data
      const { data: historicalData, error: historyError } = await this.client
        .from('power_rankings_history')
        .select(`
          *,
          teams!inner(name, owner)
        `)
        .eq('season_id', seasonId)
        .eq('week_number', weekNumber)
        .order('rank', { ascending: true });

      // If we have historical data, return it
      if (!historyError && historicalData && historicalData.length > 0) {
        return historicalData.map(row => ({
          teamId: row.team_id,
          id: row.team_id,
          name: row.teams.name,
          owner: row.teams.owner,
          rank: row.rank,
          powerRating: parseFloat(row.power_rating || 0),
          rankChange: row.rank_change || 0,
          previousRank: row.previous_rank || row.rank,
          powerRatingComponents: {
            performanceScore: parseFloat(row.performance_score || 0),
            teamStrength: parseFloat(row.team_strength || 0),
            strengthOfSchedule: parseFloat(row.strength_of_schedule || 0),
            momentumScore: parseFloat(row.momentum_score || 0),
            consistencyScore: parseFloat(row.consistency_score || 0),
            injuryScore: parseFloat(row.injury_score || 0),
            clutchScore: parseFloat(row.clutch_score || 0),
            allPlayWinPct: parseFloat(row.all_play_win_pct || 0)
          },
          wins: row.wins || 0,
          losses: row.losses || 0,
          ties: row.ties || 0,
          pointsFor: parseFloat(row.points_for || 0),
          pointsAgainst: parseFloat(row.points_against || 0),
          winPercentage: parseFloat(row.win_percentage || 0),
          pointDifferential: parseFloat(row.point_differential || 0),
          gamesPlayed: row.games_played || 0,
          averagePointsFor: row.games_played > 0 ? parseFloat(row.points_for || 0) / row.games_played : 0,
          averagePointsAgainst: row.games_played > 0 ? parseFloat(row.points_against || 0) / row.games_played : 0
        }));
      }

      // If no historical data, calculate live using JavaScript PowerRankingCalculator
      return await this.calculateLivePowerRankings(seasonId, weekNumber);
    } catch (error) {
      console.error('Error getting power rankings for week:', error);
      handleSupabaseError(error, 'Get power rankings for week');
      return [];
    }
  }

  async getPowerRankingsHistory(seasonId, weekNumber = null) {
    await this.initialize();
    
    try {
      let query = supabase
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
        console.warn(`No power rankings calculated for season ${seasonId}, week ${weekNumber}`);
        return 0;
      }

      // Delete existing rankings for this week
      const { error: deleteError } = await this.client
        .from('power_rankings_history')
        .delete()
        .eq('season_id', seasonId)
        .eq('week_number', weekNumber);

      if (deleteError) {
        console.warn('Error deleting existing rankings:', deleteError);
      }

      // Get previous week rankings for rank change calculation
      const previousWeekRankings = weekNumber > 1 
        ? await this.getPowerRankingsForWeek(seasonId, weekNumber - 1)
        : [];

      // Prepare snapshot data
      const snapshotData = powerRankings.map((team, index) => {
        const previousRank = previousWeekRankings.find(prev => prev.teamId === team.teamId)?.rank || team.rank;
        const rankChange = previousRank - team.rank;
        
        return {
          season_id: seasonId,
          week_number: weekNumber,
          team_id: team.teamId,
          rank: team.rank,
          power_rating: team.powerRating,
          rank_change: rankChange,
          previous_rank: previousRank,
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
          games_played: team.gamesPlayed,
          snapshot_type: snapshotType
        };
      });

      // Insert new snapshot data
      const { data, error } = await this.client
        .from('power_rankings_history')
        .insert(snapshotData)
        .select();

      if (error) throw error;

      console.log(`Saved power rankings snapshot for season ${seasonId}, week ${weekNumber}: ${data.length} teams`);
      return data.length;
    } catch (error) {
      console.error('Error saving power rankings snapshot:', error);
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

      console.log('Weekly snapshot execution result:', data);
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
      console.warn('Could not get current NFL week, defaulting to 1:', error.message);
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
      await supabase
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

      const { data, error } = await supabase
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
    console.log('🔍 getPendingScheduleImports called');
    await this.initialize();
    console.log('✅ Supabase client initialized');
    
    try {
      // Check all ESPN tables to see if any data exists
      console.log('🔍 Checking espn_schedule_imports table...');
      const importsCheck = await this.client
        .from('espn_schedule_imports')
        .select('*')
        .limit(5);
      console.log('📋 espn_schedule_imports:', importsCheck);
      
      console.log('🔍 Checking espn_teams table...');
      const teamsCheck = await this.client
        .from('espn_teams')
        .select('*')
        .limit(5);
      console.log('📋 espn_teams:', teamsCheck);
      
      console.log('🔍 Checking espn_matchups table...');
      const matchupsCheck = await this.client
        .from('espn_matchups')
        .select('*')
        .limit(5);
      console.log('📋 espn_matchups:', matchupsCheck);
      
      // Skip RLS by using direct query without user_id filtering
      console.log('📡 Querying espn_schedule_imports directly (ignoring user_id)...');
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
      
      console.log('📊 Direct query result:', { data, error });
      
      if (error) {
        console.error('❌ Direct query failed:', error);
        throw error;
      }
      
      // Format the data to match expected interface (id -> import_id)
      const formattedData = (data || []).map(item => ({
        ...item,
        import_id: item.id
      }));
      
      console.log('✅ Returning formatted data:', formattedData);
      return formattedData;
    } catch (error) {
      console.error('❌ getPendingScheduleImports error:', error);
      handleSupabaseError(error, 'Get pending schedule imports');
      return []; // Return empty array on error
    }
  }

  async assignScheduleToSeason(importId, seasonId, notes = null) {
    await this.initialize();
    
    try {
      const { data, error } = await this.client.rpc('assign_schedule_to_season', {
        p_import_id: importId,
        p_season_id: seasonId,
        p_notes: notes
      });
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      handleSupabaseError(error, 'Assign schedule to season');
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
      const { data, error } = await supabase
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
      const { data, error } = await this.client.rpc('get_pick_em_status', {
        p_season_id: seasonId
      });

      if (error) throw error;

      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'Get pick em status');
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

  async getUserPicksForWeek(pickEmWeekId, userId = null) {
    await this.initialize();

    try {
      console.log('🔑 getUserPicksForWeek called with:', { pickEmWeekId, userId });

      // Get current user session
      const { data: { session } } = await this.client.auth.getSession();
      const currentUserId = session?.user?.id;
      console.log('👤 Current session:', currentUserId);

      // Use current user ID if none provided
      const targetUserId = userId || currentUserId;
      console.log('🎯 Using userId:', targetUserId);

      const { data, error } = await this.client.rpc('get_user_picks_for_week', {
        p_pick_em_week_id: pickEmWeekId,
        p_user_id: targetUserId
      });

      if (error) throw error;

      console.log('🔍 getUserPicksForWeek raw data:', data);

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

      console.log('🔄 getUserPicksForWeek transformed data:', transformedData);

      return transformedData;
    } catch (error) {
      console.error('❌ Error in getUserPicksForWeek:', error);
      handleSupabaseError(error, 'Get user picks for week');
      return [];
    }
  }

  async getAllPicksForWeek(pickEmWeekId) {
    await this.initialize();

    try {
      // This should only work if results have been revealed
      const { data, error } = await this.client
        .from('pick_em_submissions')
        .select(`
          *,
          pick_em_weeks!inner(is_completed),
          games(
            week,
            team1:teams!games_team1_id_fkey(id, name, owner),
            team2:teams!games_team2_id_fkey(id, name, owner)
          ),
          predicted_team:teams!pick_em_submissions_predicted_winner_team_id_fkey(name),
          pick_em_results(
            is_correct,
            points_earned,
            actual_winner_team_id,
            actual_team:teams!pick_em_results_actual_winner_team_id_fkey(name)
          )
        `)
        .eq('pick_em_week_id', pickEmWeekId);

      if (error) throw error;

      return (data || []).map(formatFromDatabase);
    } catch (error) {
      handleSupabaseError(error, 'Get all picks for week');
    }
  }

  // Pick'em results and scoring
  async calculatePickEmResults(pickEmWeekId) {
    await this.initialize();

    try {
      const { data, error } = await this.client.rpc('calculate_pick_em_results', {
        p_pick_em_week_id: pickEmWeekId
      });

      if (error) throw error;

      return data;
    } catch (error) {
      handleSupabaseError(error, 'Calculate pick em results');
    }
  }

  async getWeeklyPickEmScores(pickEmWeekId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('pick_em_weekly_scores')
        .select('*')
        .eq('pick_em_week_id', pickEmWeekId)
        .order('weekly_rank');

      if (error) throw error;

      return (data || []).map(formatFromDatabase);
    } catch (error) {
      handleSupabaseError(error, 'Get weekly pick em scores');
    }
  }

  async getSeasonPickEmStandings(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('pick_em_season_standings')
        .select('*')
        .eq('season_id', seasonId)
        .order('season_rank');

      if (error) throw error;

      return (data || []).map(formatFromDatabase);
    } catch (error) {
      handleSupabaseError(error, 'Get season pick em standings');
    }
  }

  // Pick'em analytics
  async getPickEmWeeklyBreakdown(seasonId) {
    await this.initialize();

    try {
      const { data, error } = await this.client
        .from('pick_em_weekly_scores')
        .select(`
          *,
          pick_em_weeks!inner(week_number, season_id)
        `)
        .eq('pick_em_weeks.season_id', seasonId)
        .order('pick_em_weeks.week_number')
        .order('weekly_rank');

      if (error) throw error;

      // Group by week
      const weeklyBreakdown = {};
      (data || []).forEach(score => {
        const weekNumber = score.pick_em_weeks.week_number;
        if (!weeklyBreakdown[weekNumber]) {
          weeklyBreakdown[weekNumber] = [];
        }
        weeklyBreakdown[weekNumber].push(formatFromDatabase(score));
      });

      return weeklyBreakdown;
    } catch (error) {
      handleSupabaseError(error, 'Get pick em weekly breakdown');
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
          console.warn(`Failed to create pick'em week ${week}:`, error.message);
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
}