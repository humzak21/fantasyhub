/**
 * FFAnalytics Graceful Degradation System
 * 
 * Provides fallback mechanisms when ffanalytics data is unavailable.
 * Ensures the system continues to function with reduced capabilities.
 */

import { defaultLogger } from './ffAnalyticsLogger.js';
import { ERROR_TYPES } from './ffAnalyticsErrors.js';

/**
 * Degradation levels
 */
const DEGRADATION_LEVELS = {
  FULL: 'FULL',           // All features available
  PARTIAL: 'PARTIAL',     // Some analytics features disabled
  MINIMAL: 'MINIMAL',     // Only basic functionality
  EMERGENCY: 'EMERGENCY'  // Critical systems only
};

/**
 * Feature flags for different degradation levels
 */
const FEATURE_FLAGS = {
  [DEGRADATION_LEVELS.FULL]: {
    analyticsIntegration: true,
    playerMatching: true,
    weeklyUpdates: true,
    seasonalUpdates: true,
    trendAnalysis: true,
    performanceMetrics: true,
    caching: true,
    rScriptExecution: true
  },
  [DEGRADATION_LEVELS.PARTIAL]: {
    analyticsIntegration: true,
    playerMatching: false,
    weeklyUpdates: true,
    seasonalUpdates: false,
    trendAnalysis: false,
    performanceMetrics: true,
    caching: true,
    rScriptExecution: true
  },
  [DEGRADATION_LEVELS.MINIMAL]: {
    analyticsIntegration: false,
    playerMatching: false,
    weeklyUpdates: false,
    seasonalUpdates: false,
    trendAnalysis: false,
    performanceMetrics: false,
    caching: true,
    rScriptExecution: false
  },
  [DEGRADATION_LEVELS.EMERGENCY]: {
    analyticsIntegration: false,
    playerMatching: false,
    weeklyUpdates: false,
    seasonalUpdates: false,
    trendAnalysis: false,
    performanceMetrics: false,
    caching: false,
    rScriptExecution: false
  }
};

/**
 * Graceful degradation manager
 */
class GracefulDegradationManager {
  constructor(logger = defaultLogger) {
    this.logger = logger;
    this.currentLevel = DEGRADATION_LEVELS.FULL;
    this.errorCounts = new Map();
    this.lastDegradationTime = null;
    this.degradationHistory = [];
    
    // Thresholds for automatic degradation
    this.thresholds = {
      errorRate: 0.5, // 50% error rate triggers degradation
      consecutiveFailures: 5,
      timeWindow: 300000, // 5 minutes
      recoveryTime: 600000 // 10 minutes before attempting recovery
    };
    
    // Track system health
    this.healthMetrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      lastSuccessTime: null,
      lastFailureTime: null
    };
  }

  /**
   * Get current degradation level
   */
  getCurrentLevel() {
    return this.currentLevel;
  }

  /**
   * Check if a feature is enabled at current degradation level
   */
  isFeatureEnabled(feature) {
    const flags = FEATURE_FLAGS[this.currentLevel];
    return flags[feature] || false;
  }

  /**
   * Get all enabled features for current level
   */
  getEnabledFeatures() {
    return FEATURE_FLAGS[this.currentLevel];
  }

  /**
   * Manually set degradation level
   */
  setDegradationLevel(level, reason = 'manual') {
    if (!DEGRADATION_LEVELS[level]) {
      throw new Error(`Invalid degradation level: ${level}`);
    }

    const previousLevel = this.currentLevel;
    this.currentLevel = level;
    this.lastDegradationTime = Date.now();

    this.degradationHistory.push({
      timestamp: new Date().toISOString(),
      previousLevel,
      newLevel: level,
      reason,
      automatic: false
    });

    this.logger.warn(`Degradation level changed: ${previousLevel} -> ${level}`, {
      previousLevel,
      newLevel: level,
      reason,
      enabledFeatures: this.getEnabledFeatures()
    });

    return this.currentLevel;
  }

  /**
   * Record operation result for health monitoring
   */
  recordOperation(success, operationType = 'general', error = null) {
    this.healthMetrics.totalOperations++;
    
    if (success) {
      this.healthMetrics.successfulOperations++;
      this.healthMetrics.lastSuccessTime = Date.now();
    } else {
      this.healthMetrics.failedOperations++;
      this.healthMetrics.lastFailureTime = Date.now();
      
      // Track error types
      const errorType = error?.type || 'UNKNOWN';
      const currentCount = this.errorCounts.get(errorType) || 0;
      this.errorCounts.set(errorType, currentCount + 1);
    }

    // Check if automatic degradation is needed
    this.checkAutomaticDegradation();
  }

  /**
   * Check if automatic degradation should be triggered
   */
  checkAutomaticDegradation() {
    const now = Date.now();
    const recentOperations = this.getRecentOperationStats();
    
    // Don't degrade too frequently
    if (this.lastDegradationTime && (now - this.lastDegradationTime) < this.thresholds.recoveryTime) {
      return;
    }

    // Check error rate
    if (recentOperations.total > 10 && recentOperations.errorRate > this.thresholds.errorRate) {
      this.triggerAutomaticDegradation('high_error_rate', {
        errorRate: recentOperations.errorRate,
        totalOperations: recentOperations.total
      });
      return;
    }

    // Check consecutive failures
    if (this.getConsecutiveFailures() >= this.thresholds.consecutiveFailures) {
      this.triggerAutomaticDegradation('consecutive_failures', {
        consecutiveFailures: this.getConsecutiveFailures()
      });
      return;
    }

    // Check for recovery opportunity
    if (this.currentLevel !== DEGRADATION_LEVELS.FULL && this.canRecover()) {
      this.attemptRecovery();
    }
  }

  /**
   * Trigger automatic degradation
   */
  triggerAutomaticDegradation(reason, context = {}) {
    let newLevel;
    
    switch (this.currentLevel) {
      case DEGRADATION_LEVELS.FULL:
        newLevel = DEGRADATION_LEVELS.PARTIAL;
        break;
      case DEGRADATION_LEVELS.PARTIAL:
        newLevel = DEGRADATION_LEVELS.MINIMAL;
        break;
      case DEGRADATION_LEVELS.MINIMAL:
        newLevel = DEGRADATION_LEVELS.EMERGENCY;
        break;
      default:
        return; // Already at emergency level
    }

    const previousLevel = this.currentLevel;
    this.currentLevel = newLevel;
    this.lastDegradationTime = Date.now();

    this.degradationHistory.push({
      timestamp: new Date().toISOString(),
      previousLevel,
      newLevel,
      reason,
      automatic: true,
      context
    });

    this.logger.error(`Automatic degradation triggered: ${previousLevel} -> ${newLevel}`, {
      previousLevel,
      newLevel,
      reason,
      context,
      enabledFeatures: this.getEnabledFeatures()
    });
  }

  /**
   * Attempt to recover to higher degradation level
   */
  attemptRecovery() {
    let newLevel;
    
    switch (this.currentLevel) {
      case DEGRADATION_LEVELS.EMERGENCY:
        newLevel = DEGRADATION_LEVELS.MINIMAL;
        break;
      case DEGRADATION_LEVELS.MINIMAL:
        newLevel = DEGRADATION_LEVELS.PARTIAL;
        break;
      case DEGRADATION_LEVELS.PARTIAL:
        newLevel = DEGRADATION_LEVELS.FULL;
        break;
      default:
        return; // Already at full level
    }

    const previousLevel = this.currentLevel;
    this.currentLevel = newLevel;
    this.lastDegradationTime = Date.now();

    this.degradationHistory.push({
      timestamp: new Date().toISOString(),
      previousLevel,
      newLevel,
      reason: 'automatic_recovery',
      automatic: true
    });

    this.logger.info(`Automatic recovery: ${previousLevel} -> ${newLevel}`, {
      previousLevel,
      newLevel,
      enabledFeatures: this.getEnabledFeatures()
    });
  }

  /**
   * Check if system can recover to higher level
   */
  canRecover() {
    const now = Date.now();
    const recentStats = this.getRecentOperationStats();
    
    // Need sufficient time since last degradation
    if (!this.lastDegradationTime || (now - this.lastDegradationTime) < this.thresholds.recoveryTime) {
      return false;
    }

    // Need recent successful operations
    if (!this.healthMetrics.lastSuccessTime || (now - this.healthMetrics.lastSuccessTime) > this.thresholds.timeWindow) {
      return false;
    }

    // Need low error rate
    if (recentStats.total > 5 && recentStats.errorRate > 0.1) { // 10% error rate threshold for recovery
      return false;
    }

    return true;
  }

  /**
   * Get recent operation statistics
   */
  getRecentOperationStats() {
    // This is a simplified implementation
    // In a real system, you'd track operations over time
    const total = this.healthMetrics.totalOperations;
    const failed = this.healthMetrics.failedOperations;
    const successful = this.healthMetrics.successfulOperations;
    
    return {
      total,
      failed,
      successful,
      errorRate: total > 0 ? failed / total : 0,
      successRate: total > 0 ? successful / total : 0
    };
  }

  /**
   * Get consecutive failure count
   */
  getConsecutiveFailures() {
    // Simplified implementation - in reality, you'd track this over time
    const now = Date.now();
    const timeSinceLastSuccess = this.healthMetrics.lastSuccessTime ? 
      now - this.healthMetrics.lastSuccessTime : Infinity;
    const timeSinceLastFailure = this.healthMetrics.lastFailureTime ? 
      now - this.healthMetrics.lastFailureTime : Infinity;
    
    // If last failure is more recent than last success, count as consecutive failure
    if (timeSinceLastFailure < timeSinceLastSuccess && timeSinceLastFailure < this.thresholds.timeWindow) {
      return Math.min(this.healthMetrics.failedOperations, this.thresholds.consecutiveFailures);
    }
    
    return 0;
  }

  /**
   * Execute operation with degradation awareness
   */
  async executeWithDegradation(operation, options = {}) {
    const {
      operationName = 'unknown',
      requiredFeatures = [],
      fallbackOperation = null,
      context = {}
    } = options;

    // Check if required features are enabled
    const missingFeatures = requiredFeatures.filter(feature => !this.isFeatureEnabled(feature));
    
    if (missingFeatures.length > 0) {
      this.logger.warn(`Operation requires disabled features: ${operationName}`, {
        operationName,
        requiredFeatures,
        missingFeatures,
        currentLevel: this.currentLevel,
        ...context
      });

      if (fallbackOperation) {
        this.logger.info(`Executing fallback operation: ${operationName}`, {
          operationName,
          currentLevel: this.currentLevel,
          ...context
        });
        
        try {
          const result = await fallbackOperation();
          this.recordOperation(true, operationName);
          return result;
        } catch (error) {
          this.recordOperation(false, operationName, error);
          throw error;
        }
      } else {
        const error = new Error(`Operation not available at current degradation level: ${this.currentLevel}`);
        error.type = ERROR_TYPES.FEATURE_DISABLED;
        this.recordOperation(false, operationName, error);
        throw error;
      }
    }

    // Execute normal operation
    try {
      const result = await operation();
      this.recordOperation(true, operationName);
      return result;
    } catch (error) {
      this.recordOperation(false, operationName, error);
      throw error;
    }
  }

  /**
   * Get system health status
   */
  getHealthStatus() {
    const recentStats = this.getRecentOperationStats();
    
    return {
      degradationLevel: this.currentLevel,
      enabledFeatures: this.getEnabledFeatures(),
      healthMetrics: this.healthMetrics,
      recentStats,
      errorCounts: Object.fromEntries(this.errorCounts),
      lastDegradationTime: this.lastDegradationTime,
      degradationHistory: this.degradationHistory.slice(-10), // Last 10 changes
      canRecover: this.canRecover(),
      consecutiveFailures: this.getConsecutiveFailures()
    };
  }

  /**
   * Reset health metrics
   */
  resetHealthMetrics() {
    this.healthMetrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      lastSuccessTime: null,
      lastFailureTime: null
    };
    this.errorCounts.clear();
    
    this.logger.info('Health metrics reset', {
      degradationLevel: this.currentLevel
    });
  }

  /**
   * Create fallback data for when analytics is unavailable
   */
  createFallbackData(dataType, context = {}) {
    switch (dataType) {
      case 'playerAnalytics':
        return {
          playerId: context.playerId,
          weeklyRank: null,
          positionRank: null,
          trendScore: 0,
          consistencyRating: 0.5,
          ceilingScore: 0,
          floorScore: 0,
          fallback: true,
          reason: 'analytics_unavailable'
        };
        
      case 'teamAnalytics':
        return {
          teamId: context.teamId,
          avgPlayerRank: null,
          trendingUpPlayers: 0,
          trendingDownPlayers: 0,
          totalCeilingScore: 0,
          totalFloorScore: 0,
          analyticsStrengthScore: 0,
          fallback: true,
          reason: 'analytics_unavailable'
        };
        
      case 'powerRankingModifier':
        return {
          modifier: 0, // No analytics influence
          confidence: 0,
          fallback: true,
          reason: 'analytics_unavailable'
        };
        
      default:
        return {
          fallback: true,
          reason: 'unknown_data_type',
          dataType
        };
    }
  }
}

/**
 * Create a default graceful degradation manager
 */
const defaultDegradationManager = new GracefulDegradationManager();

export {
  GracefulDegradationManager,
  DEGRADATION_LEVELS,
  FEATURE_FLAGS,
  defaultDegradationManager
};