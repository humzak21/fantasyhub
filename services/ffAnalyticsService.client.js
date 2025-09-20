/**
 * FFAnalyticsService - Client-side version for browser compatibility
 * 
 * This is a browser-compatible version of the FFAnalyticsService that doesn't
 * include server-side functionality like R script execution.
 * 
 * For the full server-side version, use ffAnalyticsService.js
 */

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
 * Client-side FFAnalyticsService class
 * 
 * This version provides analytics data access without server-side R script execution.
 * It can fetch cached analytics data and provide client-side analytics calculations.
 */
export class FFAnalyticsService {
  constructor(supabaseClient = null, config = {}) {
    this.client = supabaseClient;
    this.config = {
      // Client-side configuration
      cache: {
        defaultTTL: 3600, // 1 hour
        weeklyDataTTL: 86400, // 24 hours
        seasonDataTTL: 604800, // 1 week
      },
      powerRankings: {
        enabled: true,
        analyticsWeight: 0.15,
        trendWeight: 0.1,
        consistencyWeight: 0.05
      },
      ...config
    };
    
    this.isInitialized = false;
    this.lastSyncTime = null;
    
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
   * Initialize the client-side service
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      console.log('Initializing FFAnalyticsService (client-side)...');
      
      // Test database connectivity if client is available
      if (this.client) {
        await this.testDatabaseConnection();
      }
      
      this.isInitialized = true;
      console.log('FFAnalyticsService (client-side) initialized successfully');
      
      return true;
    } catch (error) {
      console.error('Failed to initialize FFAnalyticsService:', error);
      // Don't throw error in client-side version, just log it
      this.isInitialized = false;
      return false;
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
      
      // Try API endpoint first (if available)
      if (typeof window !== 'undefined') {
        try {
          const params = new URLSearchParams();
          if (week) params.append('week', week.toString());
          if (seasonYear) params.append('season', seasonYear.toString());
          
          const response = await fetch(`/api/analytics/player/${playerId}?${params}`);
          
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
              return result.data;
            }
          }
        } catch (apiError) {
          console.warn('API endpoint not available, falling back to direct database access');
        }
      }

      // Fallback to direct database access
      if (!this.client) {
        console.warn('No database client available for analytics data');
        return null;
      }

      // Try to get cached analytics data from database
      const { data, error } = await this.client
        .from('player_analytics_history')
        .select('*')
        .eq('player_id', playerId)
        .eq('week', week || 'current')
        .eq('season_year', seasonYear || new Date().getFullYear())
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error getting player analytics:', error);
      return null;
    }
  }

  /**
   * Get team analytics score using API endpoint or cached data
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

      // Try API endpoint first (if available)
      if (typeof window !== 'undefined') {
        try {
          const params = new URLSearchParams();
          if (week) params.append('week', week.toString());
          if (seasonYear) params.append('season', seasonYear.toString());
          
          const response = await fetch(`/api/analytics/team/${teamId}?${params}`);
          
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
              return result.data;
            }
          }
        } catch (apiError) {
          console.warn('API endpoint not available, falling back to direct database access');
        }
      }

      // Fallback to direct database access
      if (!this.client) {
        console.warn('No database client available for team analytics');
        return this.getDefaultTeamAnalytics();
      }

      // Try to get cached team analytics summary
      const { data, error } = await this.client
        .from('team_analytics_summary')
        .select('*')
        .eq('team_id', teamId)
        .eq('week', week || 'current')
        .eq('season_year', seasonYear || new Date().getFullYear())
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        return this.formatTeamAnalyticsResponse(data);
      }

      // If no cached data, return default
      return this.getDefaultTeamAnalytics();
    } catch (error) {
      console.error('Error getting team analytics score:', error);
      return this.getDefaultTeamAnalytics();
    }
  }

  /**
   * Client-side method to trigger server-side analytics update
   * This would typically call an API endpoint that runs the server-side service
   * @param {number|null} week - Week number (null for current week)
   * @param {boolean} force - Force update even if recently synced
   * @returns {Promise<Object>} Update results
   */
  async updateAllPlayerAnalytics(week = null, force = false) {
    try {
      console.log('Client-side analytics update requested...');
      
      // In a real implementation, this would call an API endpoint
      // that runs the server-side FFAnalyticsService
      
      // For now, return a mock response indicating the request was received
      return {
        success: true,
        message: 'Analytics update requested. Server-side processing required.',
        week: week || this.getCurrentWeek(),
        timestamp: new Date().toISOString(),
        clientSide: true
      };
    } catch (error) {
      console.error('Analytics update request failed:', error);
      throw new FFAnalyticsError(
        `Analytics update request failed: ${error.message}`,
        FFANALYTICS_ERROR_TYPES.DATA_SYNC_ERROR,
        true,
        { week, error: error.message }
      );
    }
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
  getCurrentWeek() {
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
   * Get service configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
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
      clientSide: true
    };
  }
}

export default FFAnalyticsService;