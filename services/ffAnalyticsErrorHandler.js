/**
 * FFAnalytics Error Handler
 * 
 * Central error handling system that integrates error types, logging, retry mechanisms,
 * and graceful degradation for the ffanalytics integration.
 */

import { 
  FFAnalyticsError, 
  RScriptError, 
  PlayerMatchingError, 
  DataValidationError,
  NetworkError,
  DatabaseError,
  ConfigurationError,
  RateLimitError,
  ERROR_TYPES,
  getErrorSeverity,
  shouldAlert
} from './ffAnalyticsErrors.js';

import { defaultLogger } from './ffAnalyticsLogger.js';
import { defaultRetryMechanism } from './ffAnalyticsRetry.js';
import { defaultDegradationManager } from './ffAnalyticsGracefulDegradation.js';

/**
 * Comprehensive error handler for ffanalytics operations
 */
class FFAnalyticsErrorHandler {
  constructor(options = {}) {
    this.logger = options.logger || defaultLogger;
    this.retryMechanism = options.retryMechanism || defaultRetryMechanism;
    this.degradationManager = options.degradationManager || defaultDegradationManager;
    
    // Error handling configuration
    this.config = {
      enableRetry: options.enableRetry !== false,
      enableDegradation: options.enableDegradation !== false,
      enableAlerting: options.enableAlerting !== false,
      maxErrorsBeforeDegradation: options.maxErrorsBeforeDegradation || 10,
      ...options.config
    };
    
    // Error statistics
    this.errorStats = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsByOperation: new Map(),
      lastError: null,
      lastErrorTime: null
    };
  }

  /**
   * Handle an error with comprehensive error processing
   */
  async handleError(error, context = {}) {
    const {
      operation = 'unknown',
      retryable = null,
      fallbackData = null,
      suppressLogging = false
    } = context;

    // Normalize error to FFAnalyticsError if needed
    const normalizedError = this.normalizeError(error, context);
    
    // Update error statistics
    this.updateErrorStats(normalizedError, operation);
    
    // Log error if not suppressed
    if (!suppressLogging) {
      this.logger.error(`Error in operation: ${operation}`, normalizedError, {
        operation,
        errorType: normalizedError.type,
        severity: getErrorSeverity(normalizedError.type),
        ...context
      });
    }
    
    // Record operation failure for degradation manager
    if (this.config.enableDegradation) {
      this.degradationManager.recordOperation(false, operation, normalizedError);
    }
    
    // Send alert if needed
    if (this.config.enableAlerting && shouldAlert(normalizedError)) {
      await this.sendAlert(normalizedError, operation, context);
    }
    
    // Return fallback data if provided
    if (fallbackData !== null) {
      this.logger.info(`Using fallback data for operation: ${operation}`, {
        operation,
        errorType: normalizedError.type,
        fallbackDataType: typeof fallbackData
      });
      return fallbackData;
    }
    
    // Re-throw the normalized error
    throw normalizedError;
  }

  /**
   * Execute operation with comprehensive error handling
   */
  async executeWithErrorHandling(operation, options = {}) {
    const {
      operationName = 'unknown',
      retryOptions = {},
      fallbackOperation = null,
      requiredFeatures = [],
      context = {}
    } = options;

    try {
      // Check degradation level if features are required
      if (requiredFeatures.length > 0 && this.config.enableDegradation) {
        return await this.degradationManager.executeWithDegradation(operation, {
          operationName,
          requiredFeatures,
          fallbackOperation,
          context
        });
      }

      // Execute with retry if enabled
      if (this.config.enableRetry && retryOptions.strategy) {
        return await this.retryMechanism.executeWithRetry(operation, {
          operationName,
          context,
          ...retryOptions
        });
      }

      // Execute operation directly
      const result = await operation();
      
      // Record success for degradation manager
      if (this.config.enableDegradation) {
        this.degradationManager.recordOperation(true, operationName);
      }
      
      return result;
    } catch (error) {
      // Handle the error comprehensively
      return await this.handleError(error, {
        operation: operationName,
        ...context
      });
    }
  }

  /**
   * Execute operation with automatic retry and fallback
   */
  async executeWithAutoHandling(operation, options = {}) {
    const {
      operationName = 'unknown',
      fallbackOperation = null,
      requiredFeatures = [],
      context = {}
    } = options;

    try {
      // Use auto-retry mechanism
      return await this.retryMechanism.executeWithAutoRetry(operation, {
        operationName,
        context,
        onFailure: async (error, attempts) => {
          this.logger.warn(`Operation failed after ${attempts} attempts: ${operationName}`, {
            operationName,
            attempts,
            error: error.message,
            errorType: error.type
          });
        }
      });
    } catch (error) {
      // Try fallback operation if available
      if (fallbackOperation) {
        this.logger.info(`Attempting fallback operation: ${operationName}`, {
          operationName,
          originalError: error.message
        });
        
        try {
          return await fallbackOperation();
        } catch (fallbackError) {
          this.logger.error(`Fallback operation also failed: ${operationName}`, fallbackError);
          // Handle the original error, not the fallback error
        }
      }
      
      // Handle error with potential degradation
      return await this.handleError(error, {
        operation: operationName,
        ...context
      });
    }
  }

  /**
   * Create error-safe wrapper for functions
   */
  createSafeWrapper(fn, options = {}) {
    const {
      operationName = fn.name || 'anonymous',
      fallbackValue = null,
      suppressErrors = false,
      retryOptions = {}
    } = options;

    return async (...args) => {
      try {
        return await this.executeWithErrorHandling(
          () => fn(...args),
          {
            operationName,
            retryOptions,
            context: { args }
          }
        );
      } catch (error) {
        if (suppressErrors) {
          this.logger.warn(`Suppressed error in safe wrapper: ${operationName}`, {
            operationName,
            error: error.message,
            fallbackValue
          });
          return fallbackValue;
        }
        throw error;
      }
    };
  }

  /**
   * Normalize error to FFAnalyticsError
   */
  normalizeError(error, context = {}) {
    // Already an FFAnalyticsError
    if (error instanceof FFAnalyticsError) {
      return error;
    }

    // Determine error type based on error characteristics
    let errorType = ERROR_TYPES.UNKNOWN;
    let ErrorClass = FFAnalyticsError;

    // Check error message and properties for classification
    if (error.message && error.message.includes('R script')) {
      errorType = ERROR_TYPES.R_SCRIPT_FAILURE;
      ErrorClass = RScriptError;
    } else if (error.message && error.message.includes('player matching')) {
      errorType = ERROR_TYPES.PLAYER_MATCHING_FAILURE;
      ErrorClass = PlayerMatchingError;
    } else if (error.message && error.message.includes('validation')) {
      errorType = ERROR_TYPES.DATA_VALIDATION_FAILURE;
      ErrorClass = DataValidationError;
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      errorType = ERROR_TYPES.NETWORK_FAILURE;
      ErrorClass = NetworkError;
    } else if (error.code && error.code.startsWith('23')) { // PostgreSQL error codes
      errorType = ERROR_TYPES.DATABASE_FAILURE;
      ErrorClass = DatabaseError;
    } else if (error.message && error.message.includes('configuration')) {
      errorType = ERROR_TYPES.CONFIGURATION_ERROR;
      ErrorClass = ConfigurationError;
    } else if (error.status === 429 || error.message.includes('rate limit')) {
      errorType = ERROR_TYPES.RATE_LIMIT_EXCEEDED;
      ErrorClass = RateLimitError;
    }

    // Create normalized error
    const normalizedError = new ErrorClass(
      error.message || 'Unknown error',
      errorType,
      this.isRetryable(error, errorType),
      {
        originalError: error,
        stack: error.stack,
        ...context
      }
    );

    // Copy relevant properties
    if (error.code) normalizedError.code = error.code;
    if (error.status) normalizedError.status = error.status;
    if (error.statusCode) normalizedError.statusCode = error.statusCode;

    return normalizedError;
  }

  /**
   * Determine if error is retryable
   */
  isRetryable(error, errorType) {
    // Configuration errors are not retryable
    if (errorType === ERROR_TYPES.CONFIGURATION_ERROR) {
      return false;
    }
    
    // Data validation errors are not retryable
    if (errorType === ERROR_TYPES.DATA_VALIDATION_FAILURE) {
      return false;
    }
    
    // Player matching errors need manual intervention
    if (errorType === ERROR_TYPES.PLAYER_MATCHING_FAILURE) {
      return false;
    }
    
    // Network and database errors are usually retryable
    if (errorType === ERROR_TYPES.NETWORK_FAILURE || errorType === ERROR_TYPES.DATABASE_FAILURE) {
      return true;
    }
    
    // R script errors might be retryable
    if (errorType === ERROR_TYPES.R_SCRIPT_FAILURE) {
      return true;
    }
    
    // Rate limit errors are retryable
    if (errorType === ERROR_TYPES.RATE_LIMIT_EXCEEDED) {
      return true;
    }
    
    // Default to retryable for unknown errors
    return true;
  }

  /**
   * Update error statistics
   */
  updateErrorStats(error, operation) {
    this.errorStats.totalErrors++;
    this.errorStats.lastError = error;
    this.errorStats.lastErrorTime = new Date();
    
    // Count by error type
    const typeCount = this.errorStats.errorsByType.get(error.type) || 0;
    this.errorStats.errorsByType.set(error.type, typeCount + 1);
    
    // Count by operation
    const opCount = this.errorStats.errorsByOperation.get(operation) || 0;
    this.errorStats.errorsByOperation.set(operation, opCount + 1);
  }

  /**
   * Send alert for critical errors
   */
  async sendAlert(error, operation, context = {}) {
    try {
      // This is a placeholder implementation
      // In production, integrate with alerting services like PagerDuty, Slack, etc.
      
      const alertData = {
        timestamp: new Date().toISOString(),
        severity: getErrorSeverity(error.type),
        operation,
        errorType: error.type,
        message: error.message,
        context,
        systemHealth: this.degradationManager.getHealthStatus()
      };
      
      this.logger.error('🚨 CRITICAL ALERT', error, alertData);
      
      // TODO: Implement actual alerting mechanism
      // await this.alertingService.sendAlert(alertData);
      
    } catch (alertError) {
      this.logger.error('Failed to send alert', alertError, {
        originalError: error.message,
        operation
      });
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    return {
      ...this.errorStats,
      errorsByType: Object.fromEntries(this.errorStats.errorsByType),
      errorsByOperation: Object.fromEntries(this.errorStats.errorsByOperation),
      degradationStatus: this.degradationManager.getHealthStatus()
    };
  }

  /**
   * Clear error statistics
   */
  clearErrorStats() {
    this.errorStats = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsByOperation: new Map(),
      lastError: null,
      lastErrorTime: null
    };
    
    this.degradationManager.resetHealthMetrics();
    
    this.logger.info('Error statistics cleared');
  }

  /**
   * Create fallback data based on error context
   */
  createFallbackData(dataType, context = {}) {
    return this.degradationManager.createFallbackData(dataType, context);
  }

  /**
   * Check system health
   */
  getSystemHealth() {
    const errorStats = this.getErrorStats();
    const degradationStatus = this.degradationManager.getHealthStatus();
    
    return {
      status: degradationStatus.degradationLevel === 'FULL' ? 'healthy' : 'degraded',
      degradationLevel: degradationStatus.degradationLevel,
      enabledFeatures: degradationStatus.enabledFeatures,
      errorStats,
      canRecover: degradationStatus.canRecover,
      lastErrorTime: this.errorStats.lastErrorTime,
      totalErrors: this.errorStats.totalErrors
    };
  }
}

/**
 * Create a default error handler instance
 */
const defaultErrorHandler = new FFAnalyticsErrorHandler();

export {
  FFAnalyticsErrorHandler,
  defaultErrorHandler
};