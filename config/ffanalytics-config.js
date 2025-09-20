/**
 * FFAnalytics Configuration System
 * 
 * Provides centralized configuration management for the ffanalytics integration,
 * including data sources, weights, schedules, and environment variable handling.
 */

const path = require('path');

/**
 * Default configuration values for ffanalytics integration
 */
const DEFAULT_CONFIG = {
  // Enable/disable analytics integration
  enabled: true,
  
  // R Script Configuration
  rScripts: {
    rExecutable: 'Rscript', // Path to Rscript executable
    scriptsPath: './scripts/ffanalytics/',
    timeout: 300000, // 5 minutes timeout for R scripts
    maxRetries: 3,
    logLevel: 'info' // debug, info, warn, error
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
    maxCacheSize: 10000,
    cleanupInterval: 3600000 // 1 hour cleanup interval
  },
  
  // Player Matching Configuration
  matching: {
    confidenceThreshold: 0.8,
    fuzzyMatchThreshold: 0.7,
    autoApproveThreshold: 0.95,
    enableManualReview: true
  },
  
  // Power Rankings Integration
  powerRankings: {
    enabled: true,
    analyticsWeight: 0.15, // 15% weight in team strength calculation
    trendWeight: 0.1, // 10% weight for trending players
    consistencyWeight: 0.05, // 5% weight for consistency
    ceilingFloorWeight: 0.05, // 5% weight for ceiling/floor scores
    minDataPoints: 3 // Minimum weeks of data before applying analytics
  },
  
  // Update Schedule Configuration
  updates: {
    enabled: true,
    frequency: 'daily', // daily, weekly, manual
    time: '06:00', // UTC time for daily updates
    retryAttempts: 3,
    retryDelay: 300000, // 5 minutes
    weeklyUpdateDay: 'tuesday', // Day of week for weekly updates
    enableWeekendUpdates: false
  },
  
  // Error Handling Configuration
  errorHandling: {
    enableGracefulDegradation: true,
    maxConsecutiveFailures: 5,
    failureNotificationThreshold: 3,
    enableRetryBackoff: true,
    backoffMultiplier: 2
  },
  
  // Logging Configuration
  logging: {
    enabled: true,
    level: 'info',
    enableFileLogging: false,
    logFilePath: './logs/ffanalytics.log',
    maxLogFileSize: '10MB',
    maxLogFiles: 5
  }
};

/**
 * Environment variable mappings
 */
const ENV_MAPPINGS = {
  // Core settings
  'FFANALYTICS_ENABLED': 'enabled',
  
  // R Script settings
  'R_EXECUTABLE_PATH': 'rScripts.rExecutable',
  'FFANALYTICS_SCRIPTS_PATH': 'rScripts.scriptsPath',
  'R_SCRIPT_TIMEOUT': 'rScripts.timeout',
  'R_SCRIPT_MAX_RETRIES': 'rScripts.maxRetries',
  'R_SCRIPT_LOG_LEVEL': 'rScripts.logLevel',
  
  // Data sources
  'FFANALYTICS_WEEKLY_SOURCES': 'dataSources.weekly',
  'FFANALYTICS_SEASONAL_SOURCES': 'dataSources.seasonal',
  'FFANALYTICS_POSITIONS': 'dataSources.positions',
  'FFANALYTICS_AVG_TYPES': 'dataSources.avgTypes',
  
  // Cache settings
  'ANALYTICS_CACHE_TTL': 'cache.defaultTTL',
  'ANALYTICS_WEEKLY_TTL': 'cache.weeklyDataTTL',
  'ANALYTICS_SEASONAL_TTL': 'cache.seasonDataTTL',
  'ANALYTICS_MAX_CACHE_SIZE': 'cache.maxCacheSize',
  
  // Matching settings
  'PLAYER_MATCH_CONFIDENCE_THRESHOLD': 'matching.confidenceThreshold',
  'PLAYER_MATCH_FUZZY_THRESHOLD': 'matching.fuzzyMatchThreshold',
  'PLAYER_MATCH_AUTO_APPROVE_THRESHOLD': 'matching.autoApproveThreshold',
  
  // Power rankings weights
  'ANALYTICS_WEIGHT': 'powerRankings.analyticsWeight',
  'ANALYTICS_TREND_WEIGHT': 'powerRankings.trendWeight',
  'ANALYTICS_CONSISTENCY_WEIGHT': 'powerRankings.consistencyWeight',
  'ANALYTICS_CEILING_FLOOR_WEIGHT': 'powerRankings.ceilingFloorWeight',
  'ANALYTICS_MIN_DATA_POINTS': 'powerRankings.minDataPoints',
  
  // Update schedule
  'ANALYTICS_UPDATE_FREQUENCY': 'updates.frequency',
  'ANALYTICS_UPDATE_TIME': 'updates.time',
  'ANALYTICS_RETRY_ATTEMPTS': 'updates.retryAttempts',
  'ANALYTICS_RETRY_DELAY': 'updates.retryDelay',
  
  // Logging
  'ANALYTICS_LOG_LEVEL': 'logging.level',
  'ANALYTICS_LOG_FILE_PATH': 'logging.logFilePath'
};

/**
 * FFAnalytics Configuration Manager
 */
class FFAnalyticsConfig {
  constructor(customConfig = {}) {
    this.config = this.loadConfiguration(customConfig);
    this.validateConfiguration();
  }

  /**
   * Load configuration from defaults, environment variables, and custom config
   */
  loadConfiguration(customConfig = {}) {
    // Start with default configuration
    let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    
    // Apply environment variables
    config = this.applyEnvironmentVariables(config);
    
    // Apply custom configuration (highest priority)
    config = this.mergeDeep(config, customConfig);
    
    return config;
  }

  /**
   * Apply environment variables to configuration
   */
  applyEnvironmentVariables(config) {
    for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        this.setNestedValue(config, configPath, this.parseEnvironmentValue(envValue));
      }
    }
    
    return config;
  }

  /**
   * Parse environment variable values to appropriate types
   */
  parseEnvironmentValue(value) {
    // Handle boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Handle numeric values
    if (!isNaN(value) && !isNaN(parseFloat(value))) {
      return parseFloat(value);
    }
    
    // Handle array values (comma-separated)
    if (value.includes(',')) {
      return value.split(',').map(item => item.trim());
    }
    
    // Return as string
    return value;
  }

  /**
   * Set nested configuration value using dot notation
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  /**
   * Deep merge two objects
   */
  mergeDeep(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeDeep(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Validate configuration values
   */
  validateConfiguration() {
    const errors = [];
    
    // Validate R script configuration
    if (!this.config.rScripts.rExecutable) {
      errors.push('R executable path is required');
    }
    
    if (!this.config.rScripts.scriptsPath) {
      errors.push('R scripts path is required');
    }
    
    // Validate weights (should be between 0 and 1)
    const weights = [
      'powerRankings.analyticsWeight',
      'powerRankings.trendWeight',
      'powerRankings.consistencyWeight',
      'powerRankings.ceilingFloorWeight'
    ];
    
    for (const weightPath of weights) {
      const weight = this.getNestedValue(this.config, weightPath);
      if (weight < 0 || weight > 1) {
        errors.push(`${weightPath} must be between 0 and 1`);
      }
    }
    
    // Validate thresholds
    const thresholds = [
      'matching.confidenceThreshold',
      'matching.fuzzyMatchThreshold',
      'matching.autoApproveThreshold'
    ];
    
    for (const thresholdPath of thresholds) {
      const threshold = this.getNestedValue(this.config, thresholdPath);
      if (threshold < 0 || threshold > 1) {
        errors.push(`${thresholdPath} must be between 0 and 1`);
      }
    }
    
    // Validate data sources
    if (!Array.isArray(this.config.dataSources.weekly) || this.config.dataSources.weekly.length === 0) {
      errors.push('At least one weekly data source must be configured');
    }
    
    if (!Array.isArray(this.config.dataSources.positions) || this.config.dataSources.positions.length === 0) {
      errors.push('At least one position must be configured');
    }
    
    // Validate update frequency
    const validFrequencies = ['daily', 'weekly', 'manual'];
    if (!validFrequencies.includes(this.config.updates.frequency)) {
      errors.push(`Update frequency must be one of: ${validFrequencies.join(', ')}`);
    }
    
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Get nested configuration value using dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  /**
   * Get configuration value
   */
  get(path) {
    if (!path) return this.config;
    return this.getNestedValue(this.config, path);
  }

  /**
   * Set configuration value
   */
  set(path, value) {
    this.setNestedValue(this.config, path, value);
    this.validateConfiguration();
  }

  /**
   * Check if analytics integration is enabled
   */
  isEnabled() {
    return this.config.enabled;
  }

  /**
   * Check if power rankings integration is enabled
   */
  isPowerRankingsEnabled() {
    return this.config.enabled && this.config.powerRankings.enabled;
  }

  /**
   * Get R script configuration
   */
  getRScriptConfig() {
    return {
      ...this.config.rScripts,
      scriptsPath: path.resolve(this.config.rScripts.scriptsPath)
    };
  }

  /**
   * Get data sources configuration
   */
  getDataSourcesConfig() {
    return this.config.dataSources;
  }

  /**
   * Get power rankings weights
   */
  getPowerRankingsWeights() {
    return {
      analytics: this.config.powerRankings.analyticsWeight,
      trend: this.config.powerRankings.trendWeight,
      consistency: this.config.powerRankings.consistencyWeight,
      ceilingFloor: this.config.powerRankings.ceilingFloorWeight
    };
  }

  /**
   * Get cache configuration
   */
  getCacheConfig() {
    return this.config.cache;
  }

  /**
   * Get matching configuration
   */
  getMatchingConfig() {
    return this.config.matching;
  }

  /**
   * Get update schedule configuration
   */
  getUpdateConfig() {
    return this.config.updates;
  }

  /**
   * Get error handling configuration
   */
  getErrorHandlingConfig() {
    return this.config.errorHandling;
  }

  /**
   * Export current configuration
   */
  export() {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Create configuration from environment variables only
   */
  static fromEnvironment() {
    return new FFAnalyticsConfig();
  }

  /**
   * Create configuration with custom overrides
   */
  static create(customConfig = {}) {
    return new FFAnalyticsConfig(customConfig);
  }
}

module.exports = {
  FFAnalyticsConfig,
  DEFAULT_CONFIG,
  ENV_MAPPINGS
};