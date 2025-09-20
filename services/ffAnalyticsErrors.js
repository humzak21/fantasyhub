/**
 * FFAnalytics Error Handling System
 * 
 * Provides comprehensive error types and handling for the ffanalytics integration.
 * Supports graceful degradation, retry mechanisms, and detailed error classification.
 */

/**
 * Base error class for all ffanalytics-related errors
 */
class FFAnalyticsError extends Error {
  constructor(message, type, retryable = false, context = {}) {
    super(message);
    this.name = 'FFAnalyticsError';
    this.type = type;
    this.retryable = retryable;
    this.context = context;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FFAnalyticsError);
    }
  }

  /**
   * Convert error to JSON for logging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      retryable: this.retryable,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * R Script execution errors
 */
class RScriptError extends FFAnalyticsError {
  constructor(message, scriptPath, exitCode = null, stderr = null, context = {}) {
    super(message, ERROR_TYPES.R_SCRIPT_FAILURE, true, {
      scriptPath,
      exitCode,
      stderr,
      ...context
    });
    this.name = 'RScriptError';
    this.scriptPath = scriptPath;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/**
 * Player matching errors
 */
class PlayerMatchingError extends FFAnalyticsError {
  constructor(message, playerId = null, playerName = null, context = {}) {
    super(message, ERROR_TYPES.PLAYER_MATCHING_FAILURE, false, {
      playerId,
      playerName,
      ...context
    });
    this.name = 'PlayerMatchingError';
    this.playerId = playerId;
    this.playerName = playerName;
  }
}

/**
 * Data validation errors
 */
class DataValidationError extends FFAnalyticsError {
  constructor(message, data = null, validationRules = null, context = {}) {
    super(message, ERROR_TYPES.DATA_VALIDATION_FAILURE, false, {
      data,
      validationRules,
      ...context
    });
    this.name = 'DataValidationError';
    this.data = data;
    this.validationRules = validationRules;
  }
}

/**
 * API and network-related errors
 */
class NetworkError extends FFAnalyticsError {
  constructor(message, url = null, statusCode = null, context = {}) {
    super(message, ERROR_TYPES.NETWORK_FAILURE, true, {
      url,
      statusCode,
      ...context
    });
    this.name = 'NetworkError';
    this.url = url;
    this.statusCode = statusCode;
  }
}

/**
 * Database operation errors
 */
class DatabaseError extends FFAnalyticsError {
  constructor(message, operation = null, table = null, context = {}) {
    super(message, ERROR_TYPES.DATABASE_FAILURE, true, {
      operation,
      table,
      ...context
    });
    this.name = 'DatabaseError';
    this.operation = operation;
    this.table = table;
  }
}

/**
 * Configuration errors
 */
class ConfigurationError extends FFAnalyticsError {
  constructor(message, configKey = null, configValue = null, context = {}) {
    super(message, ERROR_TYPES.CONFIGURATION_ERROR, false, {
      configKey,
      configValue,
      ...context
    });
    this.name = 'ConfigurationError';
    this.configKey = configKey;
    this.configValue = configValue;
  }
}

/**
 * Rate limiting errors
 */
class RateLimitError extends FFAnalyticsError {
  constructor(message, retryAfter = null, context = {}) {
    super(message, ERROR_TYPES.RATE_LIMIT_EXCEEDED, true, {
      retryAfter,
      ...context
    });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Error type constants
 */
const ERROR_TYPES = {
  R_SCRIPT_FAILURE: 'R_SCRIPT_FAILURE',
  PLAYER_MATCHING_FAILURE: 'PLAYER_MATCHING_FAILURE',
  DATA_VALIDATION_FAILURE: 'DATA_VALIDATION_FAILURE',
  NETWORK_FAILURE: 'NETWORK_FAILURE',
  DATABASE_FAILURE: 'DATABASE_FAILURE',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  CACHE_FAILURE: 'CACHE_FAILURE',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Error severity levels
 */
const ERROR_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

/**
 * Maps error types to severity levels
 */
const ERROR_SEVERITY_MAP = {
  [ERROR_TYPES.R_SCRIPT_FAILURE]: ERROR_SEVERITY.HIGH,
  [ERROR_TYPES.PLAYER_MATCHING_FAILURE]: ERROR_SEVERITY.MEDIUM,
  [ERROR_TYPES.DATA_VALIDATION_FAILURE]: ERROR_SEVERITY.MEDIUM,
  [ERROR_TYPES.NETWORK_FAILURE]: ERROR_SEVERITY.MEDIUM,
  [ERROR_TYPES.DATABASE_FAILURE]: ERROR_SEVERITY.HIGH,
  [ERROR_TYPES.CONFIGURATION_ERROR]: ERROR_SEVERITY.CRITICAL,
  [ERROR_TYPES.RATE_LIMIT_EXCEEDED]: ERROR_SEVERITY.LOW,
  [ERROR_TYPES.CACHE_FAILURE]: ERROR_SEVERITY.LOW,
  [ERROR_TYPES.TIMEOUT]: ERROR_SEVERITY.MEDIUM,
  [ERROR_TYPES.UNKNOWN]: ERROR_SEVERITY.MEDIUM
};

/**
 * Utility function to get error severity
 */
function getErrorSeverity(errorType) {
  return ERROR_SEVERITY_MAP[errorType] || ERROR_SEVERITY.MEDIUM;
}

/**
 * Utility function to determine if error should trigger alerts
 */
function shouldAlert(error) {
  const severity = getErrorSeverity(error.type);
  return severity === ERROR_SEVERITY.HIGH || severity === ERROR_SEVERITY.CRITICAL;
}

export {
  FFAnalyticsError,
  RScriptError,
  PlayerMatchingError,
  DataValidationError,
  NetworkError,
  DatabaseError,
  ConfigurationError,
  RateLimitError,
  ERROR_TYPES,
  ERROR_SEVERITY,
  ERROR_SEVERITY_MAP,
  getErrorSeverity,
  shouldAlert
};