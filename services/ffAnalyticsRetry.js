/**
 * FFAnalytics Retry Mechanism
 * 
 * Provides retry functionality with exponential backoff for ffanalytics operations.
 * Supports different retry strategies based on error types and operation contexts.
 */

import { defaultLogger } from './ffAnalyticsLogger.js';
import { ERROR_TYPES } from './ffAnalyticsErrors.js';

/**
 * Retry strategy configurations
 */
const RETRY_STRATEGIES = {
  DEFAULT: {
    maxAttempts: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2,
    jitter: true
  },
  R_SCRIPT: {
    maxAttempts: 3,
    baseDelay: 2000, // 2 seconds
    maxDelay: 60000, // 1 minute
    backoffMultiplier: 2,
    jitter: true
  },
  NETWORK: {
    maxAttempts: 5,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 1.5,
    jitter: true
  },
  DATABASE: {
    maxAttempts: 3,
    baseDelay: 500, // 0.5 seconds
    maxDelay: 10000, // 10 seconds
    backoffMultiplier: 2,
    jitter: false
  },
  RATE_LIMIT: {
    maxAttempts: 10,
    baseDelay: 5000, // 5 seconds
    maxDelay: 300000, // 5 minutes
    backoffMultiplier: 1.5,
    jitter: true
  }
};

/**
 * Maps error types to retry strategies
 */
const ERROR_RETRY_STRATEGY_MAP = {
  [ERROR_TYPES.R_SCRIPT_FAILURE]: 'R_SCRIPT',
  [ERROR_TYPES.NETWORK_FAILURE]: 'NETWORK',
  [ERROR_TYPES.DATABASE_FAILURE]: 'DATABASE',
  [ERROR_TYPES.RATE_LIMIT_EXCEEDED]: 'RATE_LIMIT',
  [ERROR_TYPES.TIMEOUT]: 'NETWORK',
  [ERROR_TYPES.CACHE_FAILURE]: 'DATABASE'
};

/**
 * Retry mechanism class
 */
class RetryMechanism {
  constructor(logger = defaultLogger) {
    this.logger = logger;
  }

  /**
   * Execute an operation with retry logic
   */
  async executeWithRetry(operation, options = {}) {
    const {
      operationName = 'unknown',
      strategy = 'DEFAULT',
      context = {},
      shouldRetry = this.defaultShouldRetry.bind(this),
      onRetry = null,
      onFailure = null
    } = options;

    const strategyConfig = RETRY_STRATEGIES[strategy] || RETRY_STRATEGIES.DEFAULT;
    let lastError = null;
    let attempt = 0;

    this.logger.debug(`Starting operation with retry: ${operationName}`, {
      strategy,
      maxAttempts: strategyConfig.maxAttempts,
      ...context
    });

    while (attempt < strategyConfig.maxAttempts) {
      attempt++;
      
      try {
        this.logger.debug(`Executing operation attempt ${attempt}/${strategyConfig.maxAttempts}: ${operationName}`, {
          attempt,
          operationName,
          ...context
        });

        const result = await operation();
        
        if (attempt > 1) {
          this.logger.info(`Operation succeeded after ${attempt} attempts: ${operationName}`, {
            attempt,
            operationName,
            ...context
          });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        this.logger.warn(`Operation attempt ${attempt} failed: ${operationName}`, {
          attempt,
          operationName,
          error: error.message,
          errorType: error.type,
          ...context
        });

        // Check if we should retry this error
        if (!shouldRetry(error, attempt, strategyConfig.maxAttempts)) {
          this.logger.error(`Operation will not be retried: ${operationName}`, error, {
            attempt,
            operationName,
            reason: 'error_not_retryable',
            ...context
          });
          break;
        }

        // Don't delay after the last attempt
        if (attempt < strategyConfig.maxAttempts) {
          const delay = this.calculateDelay(attempt, strategyConfig);
          
          this.logger.info(`Retrying operation in ${delay}ms: ${operationName}`, {
            attempt,
            nextAttempt: attempt + 1,
            delay,
            operationName,
            ...context
          });

          // Call retry callback if provided
          if (onRetry) {
            try {
              await onRetry(error, attempt, delay);
            } catch (callbackError) {
              this.logger.warn('Retry callback failed', callbackError, {
                operationName,
                attempt
              });
            }
          }

          await this.delay(delay);
        }
      }
    }

    // All attempts failed
    this.logger.error(`Operation failed after ${attempt} attempts: ${operationName}`, lastError, {
      totalAttempts: attempt,
      operationName,
      ...context
    });

    // Call failure callback if provided
    if (onFailure) {
      try {
        await onFailure(lastError, attempt);
      } catch (callbackError) {
        this.logger.warn('Failure callback failed', callbackError, {
          operationName,
          totalAttempts: attempt
        });
      }
    }

    throw lastError;
  }

  /**
   * Execute with automatic strategy selection based on error type
   */
  async executeWithAutoRetry(operation, options = {}) {
    const { operationName = 'unknown', context = {} } = options;
    
    // First attempt to determine error type
    try {
      return await operation();
    } catch (error) {
      const strategy = this.selectStrategyForError(error);
      
      this.logger.debug(`Auto-selected retry strategy: ${strategy}`, {
        operationName,
        errorType: error.type,
        strategy
      });

      // Retry with selected strategy
      return await this.executeWithRetry(operation, {
        ...options,
        strategy
      });
    }
  }

  /**
   * Batch retry for multiple operations
   */
  async executeBatchWithRetry(operations, options = {}) {
    const {
      concurrency = 3,
      failFast = false,
      strategy = 'DEFAULT'
    } = options;

    const results = [];
    const errors = [];
    
    // Process operations in batches
    for (let i = 0; i < operations.length; i += concurrency) {
      const batch = operations.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (operation, index) => {
        try {
          const result = await this.executeWithRetry(operation.fn, {
            operationName: operation.name || `batch_operation_${i + index}`,
            strategy,
            context: operation.context || {}
          });
          return { success: true, result, index: i + index };
        } catch (error) {
          const errorResult = { success: false, error, index: i + index };
          
          if (failFast) {
            throw errorResult;
          }
          
          return errorResult;
        }
      });

      try {
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
          if (result.success) {
            results[result.index] = result.result;
          } else {
            errors[result.index] = result.error;
          }
        }
      } catch (error) {
        if (failFast) {
          throw error;
        }
      }
    }

    return {
      results,
      errors,
      successCount: results.filter(r => r !== undefined).length,
      errorCount: errors.filter(e => e !== undefined).length
    };
  }

  /**
   * Default retry condition
   */
  defaultShouldRetry(error, attempt, maxAttempts) {
    // Don't retry if we've reached max attempts
    if (attempt >= maxAttempts) {
      return false;
    }

    // Don't retry non-retryable errors
    if (error.retryable === false) {
      return false;
    }

    // Don't retry configuration errors
    if (error.type === ERROR_TYPES.CONFIGURATION_ERROR) {
      return false;
    }

    // Don't retry data validation errors
    if (error.type === ERROR_TYPES.DATA_VALIDATION_FAILURE) {
      return false;
    }

    // Don't retry player matching errors (they need manual intervention)
    if (error.type === ERROR_TYPES.PLAYER_MATCHING_FAILURE) {
      return false;
    }

    // Retry all other errors
    return true;
  }

  /**
   * Select retry strategy based on error type
   */
  selectStrategyForError(error) {
    if (error.type && ERROR_RETRY_STRATEGY_MAP[error.type]) {
      return ERROR_RETRY_STRATEGY_MAP[error.type];
    }
    
    // Special handling for rate limit errors with retry-after header
    if (error.type === ERROR_TYPES.RATE_LIMIT_EXCEEDED && error.retryAfter) {
      return 'RATE_LIMIT';
    }
    
    return 'DEFAULT';
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  calculateDelay(attempt, strategy) {
    const { baseDelay, maxDelay, backoffMultiplier, jitter } = strategy;
    
    // Calculate exponential backoff
    let delay = baseDelay * Math.pow(backoffMultiplier, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, maxDelay);
    
    // Add jitter to prevent thundering herd
    if (jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      delay += (Math.random() - 0.5) * 2 * jitterAmount;
    }
    
    return Math.round(delay);
  }

  /**
   * Delay utility function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retryable version of a function
   */
  retryable(fn, options = {}) {
    return async (...args) => {
      return await this.executeWithRetry(
        () => fn(...args),
        options
      );
    };
  }

  /**
   * Create circuit breaker pattern for repeated failures
   */
  createCircuitBreaker(operation, options = {}) {
    const {
      failureThreshold = 5,
      resetTimeout = 60000, // 1 minute
      operationName = 'circuit_breaker_operation'
    } = options;

    let failureCount = 0;
    let lastFailureTime = null;
    let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN

    return async (...args) => {
      const now = Date.now();

      // Check if circuit should reset
      if (state === 'OPEN' && now - lastFailureTime > resetTimeout) {
        state = 'HALF_OPEN';
        this.logger.info(`Circuit breaker transitioning to HALF_OPEN: ${operationName}`);
      }

      // Reject if circuit is open
      if (state === 'OPEN') {
        const error = new Error(`Circuit breaker is OPEN for operation: ${operationName}`);
        error.type = ERROR_TYPES.CIRCUIT_BREAKER_OPEN;
        throw error;
      }

      try {
        const result = await operation(...args);
        
        // Reset on success
        if (state === 'HALF_OPEN') {
          state = 'CLOSED';
          failureCount = 0;
          this.logger.info(`Circuit breaker reset to CLOSED: ${operationName}`);
        }
        
        return result;
      } catch (error) {
        failureCount++;
        lastFailureTime = now;

        this.logger.warn(`Circuit breaker failure ${failureCount}/${failureThreshold}: ${operationName}`, {
          failureCount,
          failureThreshold,
          state,
          error: error.message
        });

        // Open circuit if threshold reached
        if (failureCount >= failureThreshold) {
          state = 'OPEN';
          this.logger.error(`Circuit breaker opened: ${operationName}`, {
            failureCount,
            failureThreshold
          });
        }

        throw error;
      }
    };
  }
}

/**
 * Create a default retry mechanism instance
 */
const defaultRetryMechanism = new RetryMechanism();

export {
  RetryMechanism,
  RETRY_STRATEGIES,
  ERROR_RETRY_STRATEGY_MAP,
  defaultRetryMechanism
};