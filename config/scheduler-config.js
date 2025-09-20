/**
 * FFAnalytics Scheduler Configuration
 * 
 * Centralized configuration management for the scheduler system
 */

// Default configuration values
export const DEFAULT_SCHEDULER_CONFIG = {
  // Scheduler settings
  enabled: process.env.ANALYTICS_SCHEDULER_ENABLED === 'true' || true,
  frequency: process.env.ANALYTICS_UPDATE_FREQUENCY || 'daily', // daily, weekly, manual
  time: process.env.ANALYTICS_UPDATE_TIME || '06:00', // UTC time
  
  // Retry and error handling
  retryAttempts: parseInt(process.env.ANALYTICS_RETRY_ATTEMPTS) || 3,
  retryDelay: parseInt(process.env.ANALYTICS_RETRY_DELAY) || 300000, // 5 minutes
  maxConcurrentJobs: parseInt(process.env.ANALYTICS_MAX_CONCURRENT_JOBS) || 1,
  
  // Health monitoring
  healthCheckInterval: parseInt(process.env.ANALYTICS_HEALTH_CHECK_INTERVAL) || 3600000, // 1 hour
  alertingEnabled: process.env.ANALYTICS_ALERTING_ENABLED === 'true' || true,
  
  // Data update settings
  includeWeeklyByDefault: process.env.ANALYTICS_INCLUDE_WEEKLY !== 'false',
  includeSeasonalByDefault: process.env.ANALYTICS_INCLUDE_SEASONAL !== 'false',
  forceUpdateByDefault: process.env.ANALYTICS_FORCE_UPDATE === 'true' || false,
  
  // FFAnalytics service configuration
  ffAnalyticsConfig: {
    // R Script Configuration
    rScripts: {
      rExecutable: process.env.R_EXECUTABLE_PATH || 'Rscript',
      scriptsPath: process.env.FFANALYTICS_SCRIPTS_PATH || './scripts/ffanalytics/',
      timeout: parseInt(process.env.R_SCRIPT_TIMEOUT) || 300000, // 5 minutes
      maxRetries: parseInt(process.env.R_SCRIPT_MAX_RETRIES) || 3
    },
    
    // Data Sources Configuration
    dataSources: {
      weekly: (process.env.FFANALYTICS_WEEKLY_SOURCES || 'CBS,ESPN,FantasyPros,FantasySharks,FFToday,NumberFire,NFL').split(','),
      seasonal: (process.env.FFANALYTICS_SEASONAL_SOURCES || 'CBS,ESPN,FantasyPros,FantasySharks,FFToday,NumberFire,NFL').split(','),
      positions: (process.env.FFANALYTICS_POSITIONS || 'QB,RB,WR,TE,K,DST').split(','),
      avgTypes: (process.env.FFANALYTICS_AVG_TYPES || 'average,robust,weighted').split(',')
    },
    
    // Caching Configuration
    cache: {
      defaultTTL: parseInt(process.env.ANALYTICS_CACHE_TTL) || 3600, // 1 hour
      weeklyDataTTL: parseInt(process.env.ANALYTICS_WEEKLY_CACHE_TTL) || 86400, // 24 hours
      seasonDataTTL: parseInt(process.env.ANALYTICS_SEASON_CACHE_TTL) || 604800, // 1 week
      maxCacheSize: parseInt(process.env.ANALYTICS_MAX_CACHE_SIZE) || 10000
    },
    
    // Player Matching Configuration
    matching: {
      confidenceThreshold: parseFloat(process.env.ANALYTICS_CONFIDENCE_THRESHOLD) || 0.8,
      fuzzyMatchThreshold: parseFloat(process.env.ANALYTICS_FUZZY_THRESHOLD) || 0.7,
      autoApproveThreshold: parseFloat(process.env.ANALYTICS_AUTO_APPROVE_THRESHOLD) || 0.95
    },
    
    // Power Rankings Integration
    powerRankings: {
      enabled: process.env.ANALYTICS_POWER_RANKINGS_ENABLED !== 'false',
      analyticsWeight: parseFloat(process.env.ANALYTICS_WEIGHT) || 0.15, // 15% weight
      trendWeight: parseFloat(process.env.ANALYTICS_TREND_WEIGHT) || 0.1, // 10% weight
      consistencyWeight: parseFloat(process.env.ANALYTICS_CONSISTENCY_WEIGHT) || 0.05 // 5% weight
    }
  }
};

/**
 * Get scheduler configuration with environment variable overrides
 */
export function getSchedulerConfig(overrides = {}) {
  return {
    ...DEFAULT_SCHEDULER_CONFIG,
    ...overrides,
    ffAnalyticsConfig: {
      ...DEFAULT_SCHEDULER_CONFIG.ffAnalyticsConfig,
      ...overrides.ffAnalyticsConfig
    }
  };
}

/**
 * Validate scheduler configuration
 */
export function validateSchedulerConfig(config) {
  const errors = [];

  // Validate frequency
  if (!['daily', 'weekly', 'manual'].includes(config.frequency)) {
    errors.push(`Invalid frequency: ${config.frequency}. Must be 'daily', 'weekly', or 'manual'`);
  }

  // Validate time format
  if (config.frequency !== 'manual') {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(config.time)) {
      errors.push(`Invalid time format: ${config.time}. Must be HH:MM format`);
    }
  }

  // Validate numeric values
  if (config.retryAttempts < 0 || config.retryAttempts > 10) {
    errors.push(`Invalid retryAttempts: ${config.retryAttempts}. Must be between 0 and 10`);
  }

  if (config.retryDelay < 1000 || config.retryDelay > 3600000) {
    errors.push(`Invalid retryDelay: ${config.retryDelay}. Must be between 1000ms and 3600000ms`);
  }

  if (config.maxConcurrentJobs < 1 || config.maxConcurrentJobs > 5) {
    errors.push(`Invalid maxConcurrentJobs: ${config.maxConcurrentJobs}. Must be between 1 and 5`);
  }

  // Validate FFAnalytics configuration
  if (config.ffAnalyticsConfig) {
    const ffConfig = config.ffAnalyticsConfig;

    // Validate data sources
    if (ffConfig.dataSources) {
      const validSources = ['CBS', 'ESPN', 'FantasyPros', 'FantasySharks', 'FFToday', 'NumberFire', 'NFL'];
      const invalidWeeklySources = ffConfig.dataSources.weekly?.filter(s => !validSources.includes(s));
      const invalidSeasonalSources = ffConfig.dataSources.seasonal?.filter(s => !validSources.includes(s));

      if (invalidWeeklySources?.length > 0) {
        errors.push(`Invalid weekly sources: ${invalidWeeklySources.join(', ')}`);
      }

      if (invalidSeasonalSources?.length > 0) {
        errors.push(`Invalid seasonal sources: ${invalidSeasonalSources.join(', ')}`);
      }

      const validPositions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
      const invalidPositions = ffConfig.dataSources.positions?.filter(p => !validPositions.includes(p));
      if (invalidPositions?.length > 0) {
        errors.push(`Invalid positions: ${invalidPositions.join(', ')}`);
      }
    }

    // Validate weights
    if (ffConfig.powerRankings) {
      const pr = ffConfig.powerRankings;
      if (pr.analyticsWeight < 0 || pr.analyticsWeight > 1) {
        errors.push(`Invalid analyticsWeight: ${pr.analyticsWeight}. Must be between 0 and 1`);
      }
      if (pr.trendWeight < 0 || pr.trendWeight > 1) {
        errors.push(`Invalid trendWeight: ${pr.trendWeight}. Must be between 0 and 1`);
      }
      if (pr.consistencyWeight < 0 || pr.consistencyWeight > 1) {
        errors.push(`Invalid consistencyWeight: ${pr.consistencyWeight}. Must be between 0 and 1`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return true;
}

/**
 * Get configuration for different environments
 */
export function getEnvironmentConfig(environment = 'production') {
  const baseConfig = getSchedulerConfig();

  switch (environment) {
    case 'development':
      return {
        ...baseConfig,
        frequency: 'manual', // Don't auto-schedule in development
        alertingEnabled: false,
        retryAttempts: 1, // Fail fast in development
        ffAnalyticsConfig: {
          ...baseConfig.ffAnalyticsConfig,
          cache: {
            ...baseConfig.ffAnalyticsConfig.cache,
            defaultTTL: 300, // 5 minutes for faster development
            weeklyDataTTL: 1800, // 30 minutes
            seasonDataTTL: 3600 // 1 hour
          }
        }
      };

    case 'test':
      return {
        ...baseConfig,
        enabled: false, // Disabled by default in tests
        frequency: 'manual',
        alertingEnabled: false,
        retryAttempts: 0, // No retries in tests
        ffAnalyticsConfig: {
          ...baseConfig.ffAnalyticsConfig,
          cache: {
            ...baseConfig.ffAnalyticsConfig.cache,
            defaultTTL: 1, // Very short TTL for tests
            weeklyDataTTL: 1,
            seasonDataTTL: 1
          }
        }
      };

    case 'staging':
      return {
        ...baseConfig,
        frequency: 'daily',
        time: '07:00', // Different time than production
        retryAttempts: 2,
        alertingEnabled: true
      };

    case 'production':
    default:
      return baseConfig;
  }
}

/**
 * Create configuration from command line arguments or API parameters
 */
export function createConfigFromOptions(options = {}) {
  const config = getSchedulerConfig();

  // Override with provided options
  if (options.enabled !== undefined) config.enabled = options.enabled;
  if (options.frequency) config.frequency = options.frequency;
  if (options.time) config.time = options.time;
  if (options.retryAttempts !== undefined) config.retryAttempts = options.retryAttempts;
  if (options.retryDelay !== undefined) config.retryDelay = options.retryDelay;
  if (options.alertingEnabled !== undefined) config.alertingEnabled = options.alertingEnabled;

  // Validate the resulting configuration
  validateSchedulerConfig(config);

  return config;
}