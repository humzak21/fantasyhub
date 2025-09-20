/**
 * FFAnalyticsService - Main orchestration layer for ffanalytics integration
 * 
 * This service coordinates all ffanalytics operations including data synchronization,
 * player matching, team analytics calculation, and configuration management.
 * 
 * Requirements addressed:
 * - 2.1: Extract weekly and seasonal player rankings from ffanalytics
 * - 2.2: Retrieve season-to-date statistics and rankings for each player
 * - 3.1: Incorporate player weekly performance scores into team strength calculations
 * - 5.1: Allow enabling/disabling ffanalytics data in power rankings
 */

import { supabase, supabaseAdmin, handleSupabaseError } from './supabaseClient.server.js';
import AnalyticsCache from './analyticsCache.js';
import PlayerMatchingService from './playerMatchingService.js';
import { RScriptExecutor } from './rScriptExecutor.js';

/**
 * Configuration defaults for FFAnalyticsService
 */
const DEFAULT_CONFIG = {
  // R Script Configuration
  rScripts: {
    rExecutable: process.env.R_EXECUTABLE_PATH || 'Rscript',
    scriptsPath: process.env.FFANALYTICS_SCRIPTS_PATH || './scripts/ffanalytics/',
    timeout: 300000, // 5 minutes timeout for R scripts
    maxRetries: 3
  },
  
  // Data Sources Configuration
  dataSources: {
    weekly: ['CBS', 'ESPN', 'FantasyPros', 'FantasySharks', 'FFToday', 'NumberFire', 'NFL'],
    seasonal: ['CBS', 'ESPN', 'FantasyPros', 'FantasySharks', 'FFToday', 'NumberFire', 'NFL'],
    positions: ['QB', 'RB', 'WR', 'TE', 'K', 'DST'],
    avgTypes: ['average', 'robust', 'weighted']
  },
  
  // Caching Configuration
  cache: {
    defaultTTL: 3600, // 1 hour
    weeklyDataTTL: 86400, // 24 hours
    seasonDataTTL: 604800, // 1 week
    maxCacheSize: 10000
  },
  
  // Player Matching Configuration
  matching: {
    confidenceThreshold: 0.8,
    fuzzyMatchThreshold: 0.7,
    autoApproveThreshold: 0.95
  },
  
  // Power Rankings Integration
  powerRankings: {
    enabled: true,
    analyticsWeight: 0.15, // 15% weight in team strength calculation
    trendWeight: 0.1, // 10% weight for trending players
    consistencyWeight: 0.05 // 5% weight for consistency
  },
  
  // Update Schedule
  updates: {
    enabled: true,
    frequency: 'daily', // daily, weekly, manual
    time: '06:00', // UTC time for daily updates
    retryAttempts: 3,
    retryDelay: 300000 // 5 minutes
  }
};

/**
 * Error types for FFAnalyticsService
 */
export const FFANALYTICS_ERROR_TYPES = {
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  DATA_SYNC_ERROR: 'DATA_SYNC_ERROR',
  PLAYER_MATCHING_ERROR: 'PLAYER_MATCHING_ERROR',
  ANALYTICS_CALCULATION_ERROR: 'ANALYTICS_CALCULATION_ERROR',
  R_SCRIPT_ERROR: 'R_SCRIPT_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR'
};

/**
 * Custom error class for FFAnalyticsService
 */
export class FFAnalyticsError extends Error {
  constructor(message, type, retryable = false, details = {}) {
    super(message);
    this.name = 'FFAnalyticsError';
    this.type = type;
    this.retryable = retryable;
    this.details = details;
  }
}

/**
 * Main FFAnalyticsService class that orchestrates all ffanalytics operations
 */
export class FFAnalyticsService {
  constructor(supabaseClient = null, config = {}) {
    // Use provided client or default to admin client for server operations
    this.client = supabaseClient || supabaseAdmin || supabase;
    
    // Merge configuration with defaults
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    
    // Initialize service dependencies
    this.playerMatcher = new PlayerMatchingService(this.client);
    this.rExecutor = new RScriptExecutor(this.config.rScripts);
    this.cache = new AnalyticsCache(this.client, this.config.cache);
    
    // Service state
    this.isInitialized = false;
    this.lastSyncTime = null;
    this.syncInProgress = false;
    
    // Statistics tracking
    this.stats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      lastSyncDuration: 0,
      playersMatched: 0,
      analyticsCalculated: 0
    };
  }

  /**
   * Initialize the service and validate configuration
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      console.log('Initializing FFAnalyticsService...');
      
      // Validate configuration
      await this.validateConfiguration();
      
      // Test R environment
      const rTest = await this.rExecutor.testEnvironment();
      if (!rTest.success) {
        throw new FFAnalyticsError(
          `R environment test failed: ${rTest.error}`,
          FFANALYTICS_ERROR_TYPES.R_SCRIPT_ERROR,
          false,
          rTest
        );
      }
      
      console.log(`R environment validated: ${rTest.rVersion}, ffanalytics available: ${rTest.ffanalyticsAvailable}`);
      
      // Test database connectivity
      await this.testDatabaseConnection();
      
      this.isInitialized = true;
      console.log('FFAnalyticsService initialized successfully');
      
      return true;
    } catch (error) {
      console.error('Failed to initialize FFAnalyticsService:', error);
      throw error;
    }
  }

  /**
   * Get player analytics data for a specific player and week
   * @param {string} playerId - Player UUID
   * @param {number|null} week - Week number (null for current/latest)
   * @param {number|null} seasonYear - Season year (null for current)
   * @returns {Promise<Object|null>} Player analytics data
   */
  async getPlayerAnalytics(playerId, week = null, seasonYear = null) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      return await this.cache.getPlayerAnalytics(playerId, week, seasonYear);
    } catch (error) {
      console.error('Error getting player analytics:', error);
      throw new FFAnalyticsError(
        `Failed to get player analytics: ${error.message}`,
        FFANALYTICS_ERROR_TYPES.DATABASE_ERROR,
        true,
        { playerId, week, seasonYear }
      );
    }
  }

  /**
   * Update analytics data for all players
   * @param {number|null} week - Week number (null for current week)
   * @param {boolean} force - Force update even if recently synced
   * @returns {Promise<Object>} Update results
   */
  async updateAllPlayerAnalytics(week = null, force = false) {
    if (this.syncInProgress && !force) {
      throw new FFAnalyticsError(
        'Sync already in progress',
        FFANALYTICS_ERROR_TYPES.DATA_SYNC_ERROR,
        true
      );
    }

    const startTime = Date.now();
    this.syncInProgress = true;
    this.stats.totalSyncs++;

    try {
      console.log(`Starting analytics update for week ${week || 'current'}...`);
      
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Determine current week if not specified
      const currentWeek = week || await this.getCurrentWeek();
      const currentSeason = 2024; // Use 2024 NFL season

      // Step 1: Scrape weekly projections from ffanalytics
      console.log('Scraping weekly projections...');
      const weeklyData = await this.syncWeeklyProjections(currentWeek);
      
      // Step 2: Get all active players from database
      console.log('Fetching active players...');
      const activePlayers = await this.getActivePlayers();
      
      // Step 3: Match players with ffanalytics data
      console.log('Matching players with ffanalytics data...');
      const matchingResults = await this.matchPlayersWithAnalytics(activePlayers, weeklyData.data);
      
      // Step 4: Process and store analytics data
      console.log('Processing and storing analytics data...');
      const processedResults = await this.processAndStoreAnalytics(
        matchingResults.matches,
        currentWeek,
        currentSeason
      );

      // Step 5: Update team analytics summaries
      console.log('Updating team analytics summaries...');
      const teamResults = await this.updateTeamAnalyticsSummaries(currentWeek, currentSeason);

      const duration = Date.now() - startTime;
      this.stats.successfulSyncs++;
      this.stats.lastSyncDuration = duration;
      this.lastSyncTime = new Date().toISOString();

      const results = {
        success: true,
        week: currentWeek,
        season: currentSeason,
        duration,
        playersProcessed: activePlayers.length,
        playersMatched: matchingResults.matched,
        playersUpdated: processedResults.updated,
        teamsUpdated: teamResults.updated,
        timestamp: this.lastSyncTime
      };

      console.log('Analytics update completed:', results);
      return results;

    } catch (error) {
      this.stats.failedSyncs++;
      console.error('Analytics update failed:', error);
      
      throw new FFAnalyticsError(
        `Analytics update failed: ${error.message}`,
        FFANALYTICS_ERROR_TYPES.DATA_SYNC_ERROR,
        true,
        { week, error: error.message }
      );
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Get team analytics score using individual player data
   * @param {string} teamId - Team UUID
   * @param {number|null} week - Week number (null for current)
   * @param {number|null} seasonYear - Season year (null for current)
   * @returns {Promise<Object>} Team analytics score and breakdown
   */
  async getTeamAnalyticsScore(teamId, week = null, seasonYear = null) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Get cached team analytics summary first
      const cachedSummary = await this.cache.getTeamAnalytics(teamId, week, seasonYear);
      if (cachedSummary) {
        return this.formatTeamAnalyticsResponse(cachedSummary);
      }

      // Calculate team analytics from individual player data
      const teamAnalytics = await this.calculateTeamAnalyticsFromPlayers(teamId, week, seasonYear);
      
      return teamAnalytics;
    } catch (error) {
      console.error('Error getting team analytics score:', error);
      throw new FFAnalyticsError(
        `Failed to get team analytics score: ${error.message}`,
        FFANALYTICS_ERROR_TYPES.ANALYTICS_CALCULATION_ERROR,
        true,
        { teamId, week, seasonYear }
      );
    }
  }

  /**
   * Sync weekly projections from ffanalytics
   * @param {number|null} week - Week number (null for current)
   * @returns {Promise<Object>} Sync results
   */
  async syncWeeklyProjections(week = null) {
    try {
      const currentWeek = week || await this.getCurrentWeek();
      const currentSeason = 2024; // Use 2024 NFL season

      console.log(`Syncing weekly projections for week ${currentWeek}, season ${currentSeason}...`);

      // Execute R script to scrape weekly projections
      const result = await this.rExecutor.scrapeProjections(
        this.config.dataSources.weekly,
        this.config.dataSources.positions,
        currentSeason,
        currentWeek
      );

      if (!result.success || !result.data) {
        throw new Error('Failed to scrape weekly projections');
      }

      console.log(`Successfully scraped ${result.data.length || 0} player projections`);

      return {
        success: true,
        week: currentWeek,
        season: currentSeason,
        data: result.data,
        executionTime: result.executionTime
      };
    } catch (error) {
      console.error('Error syncing weekly projections:', error);
      throw new FFAnalyticsError(
        `Failed to sync weekly projections: ${error.message}`,
        FFANALYTICS_ERROR_TYPES.R_SCRIPT_ERROR,
        true,
        { week }
      );
    }
  }

  /**
   * Sync seasonal projections from ffanalytics
   * @returns {Promise<Object>} Sync results
   */
  async syncSeasonProjections() {
    try {
      const currentSeason = 2024; // Use 2024 NFL season

      console.log(`Syncing season projections for ${currentSeason}...`);

      // Execute R script to scrape season projections (week = 0)
      const result = await this.rExecutor.scrapeProjections(
        this.config.dataSources.seasonal,
        this.config.dataSources.positions,
        currentSeason,
        0 // Week 0 indicates season-long projections
      );

      if (!result.success || !result.data) {
        throw new Error('Failed to scrape season projections');
      }

      console.log(`Successfully scraped ${result.data.length || 0} season projections`);

      return {
        success: true,
        season: currentSeason,
        data: result.data,
        executionTime: result.executionTime
      };
    } catch (error) {
      console.error('Error syncing season projections:', error);
      throw new FFAnalyticsError(
        `Failed to sync season projections: ${error.message}`,
        FFANALYTICS_ERROR_TYPES.R_SCRIPT_ERROR,
        true
      );
    }
  }

  /**
   * Process ffanalytics raw data into structured format
   * @param {Object} rawData - Raw data from R scripts
   * @returns {Promise<Array>} Processed analytics data
   */
  async processFFAnalyticsData(rawData) {
    try {
      if (!rawData || !Array.isArray(rawData)) {
        return [];
      }

      const processedData = rawData.map(player => {
        return {
          playerName: player.player_name || player.player,
          position: player.position || player.pos,
          team: player.team,
          weeklyRank: player.weekly_rank || null,
          positionRank: player.position_rank || null,
          projectedPoints: player.points_avg || player.points || 0,
          projectedPointsRobust: player.points_robust || null,
          projectedPointsWeighted: player.points_weighted || null,
          ecrAvg: player.ecr_avg || player.ecr || null,
          ecrSd: player.ecr_sd || null,
          adpAvg: player.adp_avg || player.adp || null,
          uncertainty: player.uncertainty || 0,
          ceilingScore: player.ceiling || 0,
          floorScore: player.floor || 0,
          tier: player.tier || null,
          vor: player.vor || 0,
          trendScore: this.calculateTrendScore(player),
          consistencyRating: this.calculateConsistencyRating(player),
          rawData: player
        };
      });

      return processedData;
    } catch (error) {
      console.error('Error processing ffanalytics data:', error);
      throw new FFAnalyticsError(
        `Failed to process ffanalytics data: ${error.message}`,
        FFANALYTICS_ERROR_TYPES.DATA_SYNC_ERROR,
        false,
        { rawDataLength: rawData?.length }
      );
    }
  }

  /**
   * Calculate trend score for a player based on analytics data
   * @private
   */
  calculateTrendScore(playerData) {
    // Simple trend calculation based on ECR and uncertainty
    const ecr = playerData.ecr_avg || playerData.ecr || 0;
    const uncertainty = playerData.uncertainty || 0;
    
    if (ecr === 0) return 0;
    
    // Lower ECR (better ranking) and lower uncertainty = higher trend score
    const baseScore = Math.max(0, 100 - ecr) / 100;
    const uncertaintyPenalty = uncertainty / 100;
    
    return Math.max(0, Math.min(1, baseScore - uncertaintyPenalty));
  }

  /**
   * Calculate consistency rating for a player
   * @private
   */
  calculateConsistencyRating(playerData) {
    const uncertainty = playerData.uncertainty || 0;
    
    // Higher consistency = lower uncertainty
    return Math.max(0, Math.min(1, 1 - (uncertainty / 100)));
  }

  /**
   * Get all active players from the database
   * @private
   */
  async getActivePlayers() {
    try {
      const { data, error } = await this.client
        .from('players')
        .select(`
          id,
          name,
          position,
          team_abbreviation,
          espn_player_id,
          ffanalytics_player_id,
          is_active,
          season_projected_points
        `)
        .eq('is_active', true)
        .order('season_projected_points', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'Get active players');
    }
  }

  /**
   * Match players with ffanalytics data
   * @private
   */
  async matchPlayersWithAnalytics(localPlayers, ffanalyticsData) {
    try {
      const processedAnalytics = await this.processFFAnalyticsData(ffanalyticsData);
      
      const results = await this.playerMatcher.bulkMatchPlayers(
        localPlayers,
        processedAnalytics,
        {
          autoApprove: true,
          confidenceThreshold: this.config.matching.confidenceThreshold,
          dryRun: false
        }
      );

      this.stats.playersMatched += results.matched;
      
      return results;
    } catch (error) {
      throw new FFAnalyticsError(
        `Player matching failed: ${error.message}`,
        FFANALYTICS_ERROR_TYPES.PLAYER_MATCHING_ERROR,
        true,
        { localPlayersCount: localPlayers.length, analyticsDataCount: ffanalyticsData?.length }
      );
    }
  }

  /**
   * Process and store analytics data for matched players
   * @private
   */
  async processAndStoreAnalytics(matches, week, seasonYear) {
    try {
      let updated = 0;
      const batchSize = 50;

      // Process matches in batches
      for (let i = 0; i < matches.length; i += batchSize) {
        const batch = matches.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (match) => {
          try {
            const analyticsData = {
              weeklyRank: match.ffanalyticsPlayer.weeklyRank,
              positionRank: match.ffanalyticsPlayer.positionRank,
              projectedPoints: match.ffanalyticsPlayer.projectedPoints,
              trendScore: match.ffanalyticsPlayer.trendScore,
              consistencyRating: match.ffanalyticsPlayer.consistencyRating,
              ceilingScore: match.ffanalyticsPlayer.ceilingScore,
              floorScore: match.ffanalyticsPlayer.floorScore,
              ecrAvg: match.ffanalyticsPlayer.ecrAvg,
              ecrSd: match.ffanalyticsPlayer.ecrSd,
              adpAvg: match.ffanalyticsPlayer.adpAvg,
              uncertainty: match.ffanalyticsPlayer.uncertainty,
              vor: match.ffanalyticsPlayer.vor,
              tier: match.ffanalyticsPlayer.tier,
              rawData: match.ffanalyticsPlayer.rawData
            };

            // Store current analytics in players table
            await this.cache.setPlayerAnalytics(
              match.localPlayer.id,
              analyticsData,
              null, // null for current
              seasonYear
            );

            // Store historical analytics in history table
            await this.cache.setPlayerAnalytics(
              match.localPlayer.id,
              analyticsData,
              week,
              seasonYear
            );

            updated++;
          } catch (error) {
            console.error(`Failed to store analytics for player ${match.localPlayer.id}:`, error);
          }
        }));
      }

      this.stats.analyticsCalculated += updated;

      return { updated };
    } catch (error) {
      throw new FFAnalyticsError(
        `Failed to process and store analytics: ${error.message}`,
        FFANALYTICS_ERROR_TYPES.DATABASE_ERROR,
        true,
        { matchesCount: matches.length, week, seasonYear }
      );
    }
  }

  /**
   * Update team analytics summaries for all teams
   * @private
   */
  async updateTeamAnalyticsSummaries(week, seasonYear) {
    try {
      // Get all teams
      const { data: teams, error } = await this.client
        .from('teams')
        .select('id, name, roster');

      if (error) throw error;

      let updated = 0;

      for (const team of teams || []) {
        try {
          const teamAnalytics = await this.calculateTeamAnalyticsFromPlayers(
            team.id,
            week,
            seasonYear
          );

          // Store team analytics summary
          const { error: upsertError } = await this.client
            .from('team_analytics_summary')
            .upsert({
              team_id: team.id,
              week,
              season_year: seasonYear,
              avg_player_rank: teamAnalytics.avgPlayerRank,
              trending_up_players: teamAnalytics.trendingUpPlayers,
              trending_down_players: teamAnalytics.trendingDownPlayers,
              total_ceiling_score: teamAnalytics.totalCeilingScore,
              total_floor_score: teamAnalytics.totalFloorScore,
              analytics_strength_score: teamAnalytics.analyticsStrengthScore
            }, {
              onConflict: 'team_id,week,season_year',
              ignoreDuplicates: false
            });

          if (upsertError) throw upsertError;

          updated++;
        } catch (error) {
          console.error(`Failed to update team analytics for team ${team.id}:`, error);
        }
      }

      return { updated };
    } catch (error) {
      throw new FFAnalyticsError(
        `Failed to update team analytics summaries: ${error.message}`,
        FFANALYTICS_ERROR_TYPES.DATABASE_ERROR,
        true,
        { week, seasonYear }
      );
    }
  }

  /**
   * Calculate team analytics from individual player data
   * @private
   */
  async calculateTeamAnalyticsFromPlayers(teamId, week = null, seasonYear = null) {
    try {
      // Get team roster
      const { data: team, error } = await this.client
        .from('teams')
        .select('roster')
        .eq('id', teamId)
        .single();

      if (error) throw error;

      if (!team?.roster || !Array.isArray(team.roster)) {
        return this.getDefaultTeamAnalytics();
      }

      // Get analytics for all roster players
      const playerAnalytics = await Promise.all(
        team.roster.map(async (rosterPlayer) => {
          try {
            // Check for playerId field and handle missing values
            const espnPlayerId = rosterPlayer.playerId || rosterPlayer.player_id || rosterPlayer.id;

            if (!espnPlayerId) {
              console.warn(`Skipping roster player without valid ID:`, JSON.stringify(rosterPlayer, null, 2));
              return null;
            }

            // Resolve ESPN player ID to UUID
            const actualPlayerId = await this.resolvePlayerIdToUUID(espnPlayerId);

            if (!actualPlayerId) {
              console.warn(`Could not resolve ESPN player ID ${espnPlayerId} to UUID. Player may not exist in database.`);
              return null;
            }

            const analytics = await this.cache.getPlayerAnalytics(
              actualPlayerId,
              week,
              seasonYear
            );
            return {
              ...analytics,
              isActive: rosterPlayer.isActive
            };
          } catch (error) {
            const espnPlayerId = rosterPlayer.playerId || rosterPlayer.player_id || rosterPlayer.id || 'undefined';
            console.error(`Failed to get analytics for player ${espnPlayerId}:`, error);
            return null;
          }
        })
      );

      // Filter out null results and calculate team metrics
      const validAnalytics = playerAnalytics.filter(p => p !== null);
      const activePlayerAnalytics = validAnalytics.filter(p => p.isActive);

      if (validAnalytics.length === 0) {
        return this.getDefaultTeamAnalytics();
      }

      // Calculate team analytics metrics
      const avgPlayerRank = this.calculateAveragePlayerRank(activePlayerAnalytics);
      const trendingUpPlayers = this.countTrendingPlayers(validAnalytics, 'up');
      const trendingDownPlayers = this.countTrendingPlayers(validAnalytics, 'down');
      const totalCeilingScore = this.sumPlayerMetric(activePlayerAnalytics, 'ceiling_score');
      const totalFloorScore = this.sumPlayerMetric(activePlayerAnalytics, 'floor_score');
      const analyticsStrengthScore = this.calculateAnalyticsStrengthScore(activePlayerAnalytics);

      return {
        teamId,
        week,
        seasonYear,
        avgPlayerRank,
        trendingUpPlayers,
        trendingDownPlayers,
        totalCeilingScore,
        totalFloorScore,
        analyticsStrengthScore,
        playerCount: validAnalytics.length,
        activePlayerCount: activePlayerAnalytics.length
      };
    } catch (error) {
      console.error('Error calculating team analytics from players:', error);
      return this.getDefaultTeamAnalytics();
    }
  }

  /**
   * Calculate average player rank for a team
   * @private
   */
  calculateAveragePlayerRank(playerAnalytics) {
    const rankedPlayers = playerAnalytics.filter(p => p.weekly_rank && p.weekly_rank > 0);
    if (rankedPlayers.length === 0) return null;
    
    const totalRank = rankedPlayers.reduce((sum, p) => sum + p.weekly_rank, 0);
    return totalRank / rankedPlayers.length;
  }

  /**
   * Count trending players (up or down)
   * @private
   */
  countTrendingPlayers(playerAnalytics, direction) {
    const trendThreshold = 0.1; // 10% trend threshold
    
    return playerAnalytics.filter(p => {
      const trendScore = p.trend_score || 0;
      return direction === 'up' ? trendScore > trendThreshold : trendScore < -trendThreshold;
    }).length;
  }

  /**
   * Sum a specific metric across players
   * @private
   */
  sumPlayerMetric(playerAnalytics, metric) {
    return playerAnalytics.reduce((sum, p) => sum + (p[metric] || 0), 0);
  }

  /**
   * Calculate analytics-based strength score for a team
   * @private
   */
  calculateAnalyticsStrengthScore(playerAnalytics) {
    if (playerAnalytics.length === 0) return 0;

    // Weight different factors
    const weights = {
      projectedPoints: 0.4,
      trendScore: 0.3,
      consistencyRating: 0.2,
      positionRank: 0.1
    };

    let totalScore = 0;
    let totalWeight = 0;

    playerAnalytics.forEach(player => {
      let playerScore = 0;
      let playerWeight = 0;

      // Projected points component
      if (player.projected_points) {
        playerScore += player.projected_points * weights.projectedPoints;
        playerWeight += weights.projectedPoints;
      }

      // Trend score component
      if (player.trend_score !== null && player.trend_score !== undefined) {
        playerScore += (player.trend_score * 100) * weights.trendScore;
        playerWeight += weights.trendScore;
      }

      // Consistency rating component
      if (player.consistency_rating !== null && player.consistency_rating !== undefined) {
        playerScore += (player.consistency_rating * 100) * weights.consistencyRating;
        playerWeight += weights.consistencyRating;
      }

      // Position rank component (inverted - lower rank is better)
      if (player.position_rank && player.position_rank > 0) {
        const positionScore = Math.max(0, 100 - player.position_rank);
        playerScore += positionScore * weights.positionRank;
        playerWeight += weights.positionRank;
      }

      if (playerWeight > 0) {
        totalScore += playerScore / playerWeight;
        totalWeight += 1;
      }
    });

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Get default team analytics when no data is available
   * @private
   */
  getDefaultTeamAnalytics() {
    return {
      avgPlayerRank: null,
      trendingUpPlayers: 0,
      trendingDownPlayers: 0,
      totalCeilingScore: 0,
      totalFloorScore: 0,
      analyticsStrengthScore: 0,
      playerCount: 0,
      activePlayerCount: 0
    };
  }

  /**
   * Resolve ESPN player ID to database UUID
   * @param {string|number} espnPlayerId - ESPN player ID
   * @returns {Promise<string|null>} UUID of the player or null if not found
   * @private
   */
  async resolvePlayerIdToUUID(espnPlayerId) {
    try {
      // First check if it's already a UUID (36 characters with hyphens)
      if (typeof espnPlayerId === 'string' && espnPlayerId.length === 36 && espnPlayerId.includes('-')) {
        return espnPlayerId;
      }

      // Look up player by ESPN ID
      const { data, error } = await this.client
        .from('players')
        .select('id')
        .eq('espn_player_id', espnPlayerId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error(`Error looking up player with ESPN ID ${espnPlayerId}:`, error);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      console.error(`Failed to resolve ESPN player ID ${espnPlayerId}:`, error);
      return null;
    }
  }

  /**
   * Format team analytics response
   * @private
   */
  formatTeamAnalyticsResponse(summary) {
    return {
      teamId: summary.team_id,
      week: summary.week,
      seasonYear: summary.season_year,
      avgPlayerRank: summary.avg_player_rank,
      trendingUpPlayers: summary.trending_up_players,
      trendingDownPlayers: summary.trending_down_players,
      totalCeilingScore: summary.total_ceiling_score,
      totalFloorScore: summary.total_floor_score,
      analyticsStrengthScore: summary.analytics_strength_score,
      calculatedAt: summary.calculated_at
    };
  }

  /**
   * Get current NFL week
   * @private
   */
  async getCurrentWeek() {
    // Simple implementation - in production, this would use NFL schedule data
    const now = new Date();
    const seasonStart = new Date(now.getFullYear(), 8, 1); // September 1st
    const weeksSinceStart = Math.floor((now - seasonStart) / (7 * 24 * 60 * 60 * 1000));
    
    return Math.max(1, Math.min(18, weeksSinceStart + 1));
  }

  /**
   * Test database connection
   * @private
   */
  async testDatabaseConnection() {
    try {
      const { error } = await this.client
        .from('players')
        .select('id')
        .limit(1);

      if (error) throw error;
    } catch (error) {
      throw new FFAnalyticsError(
        `Database connection test failed: ${error.message}`,
        FFANALYTICS_ERROR_TYPES.DATABASE_ERROR,
        false
      );
    }
  }

  /**
   * Validate service configuration
   * @private
   */
  async validateConfiguration() {
    const errors = [];

    // Validate R configuration
    if (!this.config.rScripts.rExecutable) {
      errors.push('R executable path not configured');
    }

    if (!this.config.rScripts.scriptsPath) {
      errors.push('R scripts path not configured');
    }

    // Validate data sources
    if (!Array.isArray(this.config.dataSources.weekly) || this.config.dataSources.weekly.length === 0) {
      errors.push('Weekly data sources not configured');
    }

    if (!Array.isArray(this.config.dataSources.positions) || this.config.dataSources.positions.length === 0) {
      errors.push('Positions not configured');
    }

    if (errors.length > 0) {
      throw new FFAnalyticsError(
        `Configuration validation failed: ${errors.join(', ')}`,
        FFANALYTICS_ERROR_TYPES.CONFIGURATION_ERROR,
        false,
        { errors }
      );
    }
  }

  /**
   * Merge configuration objects recursively
   * @private
   */
  mergeConfig(defaultConfig, userConfig) {
    const merged = { ...defaultConfig };
    
    for (const key in userConfig) {
      if (userConfig[key] && typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
        merged[key] = this.mergeConfig(merged[key] || {}, userConfig[key]);
      } else {
        merged[key] = userConfig[key];
      }
    }
    
    return merged;
  }

  /**
   * Get service configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update service configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = this.mergeConfig(this.config, newConfig);
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      ...this.stats,
      isInitialized: this.isInitialized,
      lastSyncTime: this.lastSyncTime,
      syncInProgress: this.syncInProgress,
      successRate: this.stats.totalSyncs > 0 
        ? (this.stats.successfulSyncs / this.stats.totalSyncs) * 100 
        : 0
    };
  }

  /**
   * Reset service statistics
   */
  resetStats() {
    this.stats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      lastSyncDuration: 0,
      playersMatched: 0,
      analyticsCalculated: 0
    };
  }

  /**
   * Check if analytics integration is enabled
   * @returns {boolean} Whether analytics is enabled
   */
  isAnalyticsEnabled() {
    return this.config.powerRankings.enabled;
  }

  /**
   * Enable or disable analytics integration
   * @param {boolean} enabled - Whether to enable analytics
   */
  setAnalyticsEnabled(enabled) {
    this.config.powerRankings.enabled = enabled;
  }

  /**
   * Get analytics weight for power rankings
   * @returns {number} Analytics weight (0-1)
   */
  getAnalyticsWeight() {
    return this.config.powerRankings.analyticsWeight;
  }

  /**
   * Set analytics weight for power rankings
   * @param {number} weight - Analytics weight (0-1)
   */
  setAnalyticsWeight(weight) {
    if (weight < 0 || weight > 1) {
      throw new Error('Analytics weight must be between 0 and 1');
    }
    this.config.powerRankings.analyticsWeight = weight;
  }
}

// Export singleton instance with default configuration
export const ffAnalyticsService = new FFAnalyticsService();

export default FFAnalyticsService;