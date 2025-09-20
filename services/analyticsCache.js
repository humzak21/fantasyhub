/**
 * AnalyticsCache Service
 * 
 * Manages efficient storage and retrieval of analytics data using the enhanced 
 * players table and player_analytics_history table. Provides caching layer with
 * data retention policies, cleanup mechanisms, and cache invalidation capabilities.
 * 
 * Requirements addressed:
 * - 4.2: Implement data retention policies and automatic cleanup
 * - 4.3: Efficient querying with performance thresholds (< 500ms)
 * - 4.4: Minimize storage requirements through proper indexing and compression
 */

import { supabase, supabaseAdmin, handleSupabaseError } from './supabaseClient.server.js';

class AnalyticsCache {
  constructor(client = null, config = {}) {
    // Use provided client or default to supabase client
    this.client = client || supabase;
    
    // Default configuration
    this.config = {
      // Cache TTL settings (in seconds)
      defaultTTL: 3600, // 1 hour
      weeklyDataTTL: 86400, // 24 hours
      seasonDataTTL: 604800, // 1 week
      
      // Data retention settings
      retentionWeeks: 17, // Keep 17 weeks of historical data (full season)
      maxHistoryRecords: 10000, // Maximum history records per cleanup
      
      // Performance settings
      queryTimeout: 500, // 500ms query timeout
      batchSize: 100, // Batch size for bulk operations
      
      // Cache invalidation settings
      autoCleanup: true,
      cleanupInterval: 86400, // 24 hours
      
      ...config
    };
    
    // In-memory cache for frequently accessed data
    this.memoryCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
    
    // Setup automatic cleanup if enabled
    if (this.config.autoCleanup) {
      this.setupAutoCleanup();
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
      // Validate playerId
      if (!playerId || playerId === 'undefined' || playerId === undefined) {
        throw new Error(`Invalid playerId: ${playerId}. Cannot fetch analytics for undefined player ID.`);
      }

      const cacheKey = this.generateCacheKey('player', playerId, week, seasonYear);
      
      // Check memory cache first
      const cached = this.getFromMemoryCache(cacheKey);
      if (cached) {
        this.cacheStats.hits++;
        return cached;
      }
      
      this.cacheStats.misses++;
      
      let data;
      
      if (week === null) {
        // Get current analytics from players table
        data = await this.getCurrentPlayerAnalytics(playerId);
      } else {
        // Get historical analytics from history table
        data = await this.getHistoricalPlayerAnalytics(playerId, week, seasonYear);
      }
      
      // Cache the result
      if (data) {
        this.setInMemoryCache(cacheKey, data, this.config.weeklyDataTTL);
        this.cacheStats.sets++;
      }
      
      return data;
    } catch (error) {
      console.error('Error getting player analytics:', error);
      handleSupabaseError(error, 'Get player analytics');
    }
  }

  /**
   * Set player analytics data
   * @param {string} playerId - Player UUID
   * @param {Object} data - Analytics data
   * @param {number|null} week - Week number (null for current)
   * @param {number|null} seasonYear - Season year (null for current)
   * @returns {Promise<Object>} Updated analytics data
   */
  async setPlayerAnalytics(playerId, data, week = null, seasonYear = null) {
    try {
      let result;
      
      if (week === null) {
        // Update current analytics in players table
        result = await this.updateCurrentPlayerAnalytics(playerId, data);
      } else {
        // Insert/update historical analytics in history table
        result = await this.upsertHistoricalPlayerAnalytics(playerId, data, week, seasonYear);
      }
      
      // Invalidate related cache entries
      await this.invalidatePlayerCache(playerId);
      
      this.cacheStats.sets++;
      return result;
    } catch (error) {
      console.error('Error setting player analytics:', error);
      handleSupabaseError(error, 'Set player analytics');
    }
  }

  /**
   * Get player analytics history for multiple weeks
   * @param {string} playerId - Player UUID
   * @param {number} weeks - Number of weeks to retrieve (default: 5)
   * @param {number|null} seasonYear - Season year (null for current)
   * @returns {Promise<Array>} Array of historical analytics data
   */
  async getPlayerAnalyticsHistory(playerId, weeks = 5, seasonYear = null) {
    try {
      const cacheKey = this.generateCacheKey('history', playerId, weeks, seasonYear);
      
      // Check memory cache first
      const cached = this.getFromMemoryCache(cacheKey);
      if (cached) {
        this.cacheStats.hits++;
        return cached;
      }
      
      this.cacheStats.misses++;
      
      const currentYear = seasonYear || new Date().getFullYear();
      
      const { data, error } = await this.client
        .from('player_analytics_history')
        .select(`
          *,
          players!inner(name, position, team_abbreviation)
        `)
        .eq('player_id', playerId)
        .eq('season_year', currentYear)
        .order('week', { ascending: false })
        .limit(weeks);
      
      if (error) throw error;
      
      // Cache the result
      if (data) {
        this.setInMemoryCache(cacheKey, data, this.config.weeklyDataTTL);
        this.cacheStats.sets++;
      }
      
      return data || [];
    } catch (error) {
      console.error('Error getting player analytics history:', error);
      handleSupabaseError(error, 'Get player analytics history');
    }
  }

  /**
   * Get team analytics summary
   * @param {string} teamId - Team UUID
   * @param {number|null} week - Week number (null for latest)
   * @param {number|null} seasonYear - Season year (null for current)
   * @returns {Promise<Object|null>} Team analytics summary
   */
  async getTeamAnalytics(teamId, week = null, seasonYear = null) {
    try {
      const cacheKey = this.generateCacheKey('team', teamId, week, seasonYear);
      
      // Check memory cache first
      const cached = this.getFromMemoryCache(cacheKey);
      if (cached) {
        this.cacheStats.hits++;
        return cached;
      }
      
      this.cacheStats.misses++;
      
      const currentYear = seasonYear || new Date().getFullYear();
      let query = this.client
        .from('team_analytics_summary')
        .select('*')
        .eq('team_id', teamId)
        .eq('season_year', currentYear);
      
      if (week !== null) {
        query = query.eq('week', week);
      } else {
        // Get latest week for the team
        query = query.order('week', { ascending: false }).limit(1);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      const result = Array.isArray(data) ? data[0] : data;
      
      // Cache the result
      if (result) {
        this.setInMemoryCache(cacheKey, result, this.config.weeklyDataTTL);
        this.cacheStats.sets++;
      }
      
      return result || null;
    } catch (error) {
      console.error('Error getting team analytics:', error);
      handleSupabaseError(error, 'Get team analytics');
    }
  }

  /**
   * Update current player analytics in players table
   * @param {string} playerId - Player UUID
   * @param {Object} data - Analytics data
   * @returns {Promise<Object>} Updated player data
   */
  async updateCurrentPlayerAnalytics(playerId, data) {
    try {
      const updateData = {
        weekly_rank: data.weeklyRank,
        position_rank: data.positionRank,
        trend_score: data.trendScore,
        consistency_rating: data.consistencyRating,
        ceiling_score: data.ceilingScore,
        floor_score: data.floorScore,
        ffanalytics_data: data.rawData || {},
        ffanalytics_last_sync: new Date().toISOString()
      };
      
      const { data: result, error } = await this.client
        .from('players')
        .update(updateData)
        .eq('id', playerId)
        .select()
        .single();
      
      if (error) throw error;
      
      return result;
    } catch (error) {
      console.error('Error updating current player analytics:', error);
      handleSupabaseError(error, 'Update current player analytics');
    }
  }

  /**
   * Get current player analytics from players table
   * @param {string} playerId - Player UUID
   * @returns {Promise<Object|null>} Current player analytics
   */
  async getCurrentPlayerAnalytics(playerId) {
    try {
      const { data, error } = await this.client
        .from('players')
        .select(`
          id,
          name,
          position,
          team_abbreviation,
          weekly_rank,
          position_rank,
          trend_score,
          consistency_rating,
          ceiling_score,
          floor_score,
          ffanalytics_player_id,
          ffanalytics_last_sync,
          ffanalytics_data
        `)
        .eq('id', playerId)
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Error getting current player analytics:', error);
      handleSupabaseError(error, 'Get current player analytics');
    }
  }

  /**
   * Get historical player analytics from history table
   * @param {string} playerId - Player UUID
   * @param {number} week - Week number
   * @param {number|null} seasonYear - Season year
   * @returns {Promise<Object|null>} Historical player analytics
   */
  async getHistoricalPlayerAnalytics(playerId, week, seasonYear = null) {
    try {
      const currentYear = seasonYear || new Date().getFullYear();
      
      const { data, error } = await this.client
        .from('player_analytics_history')
        .select(`
          *,
          players!inner(name, position, team_abbreviation)
        `)
        .eq('player_id', playerId)
        .eq('week', week)
        .eq('season_year', currentYear)
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Error getting historical player analytics:', error);
      handleSupabaseError(error, 'Get historical player analytics');
    }
  }

  /**
   * Upsert historical player analytics in history table
   * @param {string} playerId - Player UUID
   * @param {Object} data - Analytics data
   * @param {number} week - Week number
   * @param {number|null} seasonYear - Season year
   * @returns {Promise<Object>} Upserted analytics data
   */
  async upsertHistoricalPlayerAnalytics(playerId, data, week, seasonYear = null) {
    try {
      const currentYear = seasonYear || new Date().getFullYear();
      
      const upsertData = {
        player_id: playerId,
        week: week,
        season_year: currentYear,
        weekly_rank: data.weeklyRank,
        position_rank: data.positionRank,
        projected_points: data.projectedPoints,
        actual_points: data.actualPoints,
        trend_score: data.trendScore,
        consistency_rating: data.consistencyRating,
        ceiling_score: data.ceilingScore,
        floor_score: data.floorScore,
        ecr_avg: data.ecrAvg,
        ecr_sd: data.ecrSd,
        adp_avg: data.adpAvg,
        uncertainty: data.uncertainty,
        vor: data.vor,
        tier: data.tier,
        raw_data: data.rawData || {}
      };
      
      const { data: result, error } = await this.client
        .from('player_analytics_history')
        .upsert(upsertData, { 
          onConflict: 'player_id,week,season_year',
          ignoreDuplicates: false 
        })
        .select()
        .single();
      
      if (error) throw error;
      
      return result;
    } catch (error) {
      console.error('Error upserting historical player analytics:', error);
      handleSupabaseError(error, 'Upsert historical player analytics');
    }
  }

  /**
   * Clean up expired analytics data based on retention policies
   * @param {number|null} retentionWeeks - Number of weeks to retain (null for config default)
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupExpiredData(retentionWeeks = null) {
    try {
      const retention = retentionWeeks || this.config.retentionWeeks;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - (retention * 7));
      
      console.log(`Starting cleanup of analytics data older than ${retention} weeks (${cutoffDate.toISOString()})`);
      
      // Clean up player_analytics_history
      const { data: historyDeleted, error: historyError } = await this.client
        .from('player_analytics_history')
        .delete()
        .lt('created_at', cutoffDate.toISOString())
        .select('id');
      
      if (historyError) throw historyError;
      
      // Clean up team_analytics_summary
      const { data: teamDeleted, error: teamError } = await this.client
        .from('team_analytics_summary')
        .delete()
        .lt('created_at', cutoffDate.toISOString())
        .select('id');
      
      if (teamError) throw teamError;
      
      // Clear memory cache
      this.clearMemoryCache();
      
      const results = {
        historyRecordsDeleted: historyDeleted?.length || 0,
        teamRecordsDeleted: teamDeleted?.length || 0,
        cutoffDate: cutoffDate.toISOString(),
        retentionWeeks: retention
      };
      
      console.log('Cleanup completed:', results);
      return results;
    } catch (error) {
      console.error('Error cleaning up expired data:', error);
      handleSupabaseError(error, 'Cleanup expired data');
    }
  }

  /**
   * Invalidate cache entries for a specific player
   * @param {string} playerId - Player UUID
   * @returns {Promise<void>}
   */
  async invalidatePlayerCache(playerId) {
    try {
      // Remove all cache entries related to this player
      const keysToDelete = [];
      
      for (const key of this.memoryCache.keys()) {
        if (key.includes(playerId)) {
          keysToDelete.push(key);
        }
      }
      
      keysToDelete.forEach(key => {
        this.memoryCache.delete(key);
        this.cacheStats.deletes++;
      });
      
      console.log(`Invalidated ${keysToDelete.length} cache entries for player ${playerId}`);
    } catch (error) {
      console.error('Error invalidating player cache:', error);
    }
  }

  /**
   * Invalidate cache entries for a specific team
   * @param {string} teamId - Team UUID
   * @returns {Promise<void>}
   */
  async invalidateTeamCache(teamId) {
    try {
      // Remove all cache entries related to this team
      const keysToDelete = [];
      
      for (const key of this.memoryCache.keys()) {
        if (key.includes(`team:${teamId}`)) {
          keysToDelete.push(key);
        }
      }
      
      keysToDelete.forEach(key => {
        this.memoryCache.delete(key);
        this.cacheStats.deletes++;
      });
      
      console.log(`Invalidated ${keysToDelete.length} cache entries for team ${teamId}`);
    } catch (error) {
      console.error('Error invalidating team cache:', error);
    }
  }

  /**
   * Get bulk player analytics for multiple players
   * @param {Array<string>} playerIds - Array of player UUIDs
   * @param {number|null} week - Week number (null for current)
   * @param {number|null} seasonYear - Season year (null for current)
   * @returns {Promise<Array>} Array of player analytics
   */
  async getBulkPlayerAnalytics(playerIds, week = null, seasonYear = null) {
    try {
      if (!Array.isArray(playerIds) || playerIds.length === 0) {
        return [];
      }
      
      // Process in batches to avoid query limits
      const results = [];
      const batchSize = this.config.batchSize;
      
      for (let i = 0; i < playerIds.length; i += batchSize) {
        const batch = playerIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(playerId => this.getPlayerAnalytics(playerId, week, seasonYear))
        );
        results.push(...batchResults.filter(result => result !== null));
      }
      
      return results;
    } catch (error) {
      console.error('Error getting bulk player analytics:', error);
      handleSupabaseError(error, 'Get bulk player analytics');
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const memoryStats = {
      size: this.memoryCache.size,
      hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0
    };
    
    return {
      ...this.cacheStats,
      memory: memoryStats
    };
  }

  /**
   * Clear all memory cache
   */
  clearMemoryCache() {
    this.memoryCache.clear();
    console.log('Memory cache cleared');
  }

  /**
   * Generate cache key for consistent caching
   * @private
   */
  generateCacheKey(type, id, param1 = null, param2 = null) {
    const parts = [type, id];
    if (param1 !== null) parts.push(param1);
    if (param2 !== null) parts.push(param2);
    return parts.join(':');
  }

  /**
   * Get data from memory cache
   * @private
   */
  getFromMemoryCache(key) {
    const cached = this.memoryCache.get(key);
    if (!cached) return null;
    
    // Check if expired
    if (Date.now() > cached.expires) {
      this.memoryCache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Set data in memory cache
   * @private
   */
  setInMemoryCache(key, data, ttl) {
    const expires = Date.now() + (ttl * 1000);
    this.memoryCache.set(key, { data, expires });
  }

  /**
   * Setup automatic cleanup interval
   * @private
   */
  setupAutoCleanup() {
    setInterval(async () => {
      try {
        await this.cleanupExpiredData();
      } catch (error) {
        console.error('Auto cleanup failed:', error);
      }
    }, this.config.cleanupInterval * 1000);
    
    console.log(`Auto cleanup scheduled every ${this.config.cleanupInterval} seconds`);
  }
}

export default AnalyticsCache;