# FFAnalytics Error Handling System

A comprehensive error handling system for the ffanalytics integration that provides robust error management, retry mechanisms, graceful degradation, and detailed logging.

## Overview

The error handling system consists of several interconnected components:

- **Error Types**: Specific error classes for different failure scenarios
- **Logging System**: Structured logging with performance tracking
- **Retry Mechanism**: Exponential backoff and circuit breaker patterns
- **Graceful Degradation**: Automatic feature disabling under stress
- **Error Handler**: Central orchestration of all error handling features

## Components

### 1. Error Types (`ffAnalyticsErrors.js`)

Provides specific error classes for different failure scenarios:

```javascript
import { 
  FFAnalyticsError, 
  RScriptError, 
  NetworkError, 
  ERROR_TYPES 
} from './ffAnalyticsErrors.js';

// Create specific error types
const rError = new RScriptError('Script failed', '/path/script.R', 1, 'stderr output');
const networkError = new NetworkError('Connection failed', 'https://api.com', 500);
```

**Available Error Types:**
- `RScriptError`: R script execution failures
- `PlayerMatchingError`: Player matching issues
- `DataValidationError`: Data validation failures
- `NetworkError`: Network and API failures
- `DatabaseError`: Database operation failures
- `ConfigurationError`: Configuration issues
- `RateLimitError`: Rate limiting errors

### 2. Logging System (`ffAnalyticsLogger.js`)

Comprehensive logging with structured output and performance tracking:

```javascript
import { FFAnalyticsLogger } from './ffAnalyticsLogger.js';

const logger = new FFAnalyticsLogger({
  component: 'MyComponent',
  level: LOG_LEVELS.INFO,
  enableConsole: true,
  enableStructured: false
});

// Basic logging
logger.info('Operation started', { operation: 'data_sync' });
logger.error('Operation failed', error, { context: 'additional info' });

// Performance timing
const timer = logger.startTimer('data_processing');
// ... do work ...
timer.end({ recordsProcessed: 100 });

// Specialized logging
logger.logRScriptExecution('/path/script.R', ['arg1', 'arg2']);
logger.logPlayerMatching({ total: 100, matched: 95, unmatched: 5 });
```

**Features:**
- Multiple log levels (ERROR, WARN, INFO, DEBUG, TRACE)
- Structured and formatted output options
- Performance timing utilities
- Error statistics tracking
- Specialized logging methods for ffanalytics operations

### 3. Retry Mechanism (`ffAnalyticsRetry.js`)

Exponential backoff retry with different strategies:

```javascript
import { RetryMechanism, RETRY_STRATEGIES } from './ffAnalyticsRetry.js';

const retryMechanism = new RetryMechanism();

// Execute with retry
const result = await retryMechanism.executeWithRetry(operation, {
  operationName: 'api_call',
  strategy: 'NETWORK',
  onRetry: (error, attempt, delay) => {
    console.log(`Retry ${attempt} in ${delay}ms`);
  }
});

// Auto-select strategy based on error type
const result = await retryMechanism.executeWithAutoRetry(operation);

// Create retryable function
const retryableFunction = retryMechanism.retryable(originalFunction, {
  strategy: 'R_SCRIPT'
});
```

**Retry Strategies:**
- `DEFAULT`: General purpose (3 attempts, 1s base delay)
- `R_SCRIPT`: R script failures (3 attempts, 2s base delay)
- `NETWORK`: Network failures (5 attempts, 1s base delay)
- `DATABASE`: Database failures (3 attempts, 0.5s base delay)
- `RATE_LIMIT`: Rate limiting (10 attempts, 5s base delay)

### 4. Graceful Degradation (`ffAnalyticsGracefulDegradation.js`)

Automatic feature disabling under stress:

```javascript
import { GracefulDegradationManager, DEGRADATION_LEVELS } from './ffAnalyticsGracefulDegradation.js';

const degradationManager = new GracefulDegradationManager();

// Check feature availability
if (degradationManager.isFeatureEnabled('analyticsIntegration')) {
  // Use analytics features
} else {
  // Use fallback logic
}

// Execute with degradation awareness
const result = await degradationManager.executeWithDegradation(operation, {
  operationName: 'analytics_sync',
  requiredFeatures: ['analyticsIntegration'],
  fallbackOperation: () => 'cached data'
});
```

**Degradation Levels:**
- `FULL`: All features available
- `PARTIAL`: Some analytics features disabled
- `MINIMAL`: Only basic functionality
- `EMERGENCY`: Critical systems only

### 5. Error Handler (`ffAnalyticsErrorHandler.js`)

Central orchestration of all error handling features:

```javascript
import { FFAnalyticsErrorHandler } from './ffAnalyticsErrorHandler.js';

const errorHandler = new FFAnalyticsErrorHandler();

// Execute with comprehensive error handling
const result = await errorHandler.executeWithErrorHandling(operation, {
  operationName: 'complex_operation',
  retryOptions: { strategy: 'NETWORK' },
  requiredFeatures: ['analyticsIntegration']
});

// Auto-handling with fallback
const result = await errorHandler.executeWithAutoHandling(operation, {
  operationName: 'data_sync',
  fallbackOperation: () => 'fallback result'
});

// Create safe wrapper
const safeFunction = errorHandler.createSafeWrapper(riskyFunction, {
  suppressErrors: true,
  fallbackValue: 'default'
});
```

## Usage Examples

### Basic Error Handling

```javascript
import { FFAnalyticsErrorHandler } from './services/ffAnalyticsErrorHandler.js';

const errorHandler = new FFAnalyticsErrorHandler();

const riskyOperation = async () => {
  // Operation that might fail
  throw new Error('Something went wrong');
};

try {
  const result = await errorHandler.executeWithErrorHandling(riskyOperation, {
    operationName: 'risky_operation',
    retryOptions: { strategy: 'DEFAULT' }
  });
} catch (error) {
  console.log('Operation failed:', error.message);
}
```

### Retry with Exponential Backoff

```javascript
import { RetryMechanism } from './services/ffAnalyticsRetry.js';

const retryMechanism = new RetryMechanism();

const result = await retryMechanism.executeWithRetry(operation, {
  operationName: 'api_call',
  strategy: 'NETWORK',
  onRetry: (error, attempt, delay) => {
    console.log(`Retrying in ${delay}ms (attempt ${attempt})`);
  }
});
```

### Graceful Degradation

```javascript
import { GracefulDegradationManager } from './services/ffAnalyticsGracefulDegradation.js';

const degradationManager = new GracefulDegradationManager();

// Record operation results for health monitoring
degradationManager.recordOperation(false, 'analytics_sync', error);

// Execute with fallback
const result = await degradationManager.executeWithDegradation(operation, {
  operationName: 'analytics_processing',
  requiredFeatures: ['analyticsIntegration'],
  fallbackOperation: () => degradationManager.createFallbackData('playerAnalytics')
});
```

### Comprehensive Logging

```javascript
import { FFAnalyticsLogger } from './services/ffAnalyticsLogger.js';

const logger = new FFAnalyticsLogger({
  component: 'DataProcessor',
  enableConsole: true,
  enableStructured: false
});

// Performance timing
const timer = logger.startTimer('data_processing');
try {
  // Process data
  const result = await processData();
  timer.end({ recordsProcessed: result.count });
} catch (error) {
  logger.error('Data processing failed', error, { 
    operation: 'data_processing',
    inputSize: data.length 
  });
}

// Specialized logging
logger.logRScriptCompletion('/path/script.R', 0, 'success', '', 1500);
logger.logPlayerMatching({ total: 100, matched: 95, unmatched: 5 });
```

## Configuration

### Logger Configuration

```javascript
const logger = new FFAnalyticsLogger({
  level: LOG_LEVELS.INFO,           // Log level
  component: 'ComponentName',       // Component identifier
  enableConsole: true,              // Console output
  enableFile: false,                // File output
  filePath: './logs/app.log',       // Log file path
  enableStructured: false,          // JSON vs formatted output
  maxLastErrors: 100                // Max stored recent errors
});
```

### Retry Configuration

```javascript
const retryMechanism = new RetryMechanism(logger);

// Custom retry strategy
const customStrategy = {
  maxAttempts: 5,
  baseDelay: 2000,
  maxDelay: 30000,
  backoffMultiplier: 1.5,
  jitter: true
};
```

### Degradation Configuration

```javascript
const degradationManager = new GracefulDegradationManager(logger);

// Configure thresholds
degradationManager.thresholds = {
  errorRate: 0.4,              // 40% error rate triggers degradation
  consecutiveFailures: 3,       // 3 consecutive failures
  timeWindow: 300000,          // 5 minute window
  recoveryTime: 600000         // 10 minute recovery time
};
```

## Error Handling Best Practices

### 1. Use Specific Error Types

```javascript
// Good: Specific error type
throw new RScriptError('Script failed', scriptPath, exitCode, stderr);

// Avoid: Generic error
throw new Error('Something failed');
```

### 2. Provide Context

```javascript
// Good: Rich context
logger.error('Player matching failed', error, {
  playerId: player.id,
  playerName: player.name,
  matchAttempts: attempts,
  availablePlayers: candidates.length
});
```

### 3. Use Appropriate Retry Strategies

```javascript
// R script operations
await retryMechanism.executeWithRetry(rScriptOperation, {
  strategy: 'R_SCRIPT'
});

// Network operations
await retryMechanism.executeWithRetry(apiCall, {
  strategy: 'NETWORK'
});
```

### 4. Implement Fallbacks

```javascript
const result = await errorHandler.executeWithAutoHandling(primaryOperation, {
  operationName: 'data_sync',
  fallbackOperation: () => getCachedData()
});
```

### 5. Monitor System Health

```javascript
// Regular health checks
const health = errorHandler.getSystemHealth();
if (health.status === 'degraded') {
  // Take corrective action
  await performMaintenance();
}
```

## Integration with FFAnalytics Services

The error handling system integrates seamlessly with other ffanalytics services:

```javascript
// In FFAnalyticsService
import { defaultErrorHandler } from './ffAnalyticsErrorHandler.js';

class FFAnalyticsService {
  async updatePlayerAnalytics() {
    return await defaultErrorHandler.executeWithAutoHandling(
      () => this.performUpdate(),
      {
        operationName: 'player_analytics_update',
        requiredFeatures: ['analyticsIntegration', 'rScriptExecution'],
        fallbackOperation: () => this.getCachedAnalytics()
      }
    );
  }
}
```

## Testing

The error handling system includes comprehensive tests:

```bash
# Run error handling tests
npm test -- --run services/__tests__/ffAnalyticsErrors.test.js
npm test -- --run services/__tests__/ffAnalyticsLogger.test.js
npm test -- --run services/__tests__/ffAnalyticsRetry.test.js
npm test -- --run services/__tests__/ffAnalyticsGracefulDegradation.test.js
npm test -- --run services/__tests__/ffAnalyticsErrorHandler.test.js
```

## Examples

See `examples/ffAnalyticsErrorHandling-example.js` for comprehensive usage examples:

```bash
node examples/ffAnalyticsErrorHandling-example.js
```

## Monitoring and Alerting

The system provides hooks for monitoring and alerting:

```javascript
// Error statistics
const stats = errorHandler.getErrorStats();
console.log('Error rate:', stats.errorsByType);

// System health
const health = errorHandler.getSystemHealth();
if (health.status === 'degraded') {
  // Send alert
}

// Custom alerting
const errorHandler = new FFAnalyticsErrorHandler({
  config: {
    enableAlerting: true,
    alertCallback: async (error, context) => {
      await sendSlackAlert(error, context);
    }
  }
});
```

This comprehensive error handling system ensures that the ffanalytics integration remains robust and reliable even under adverse conditions, providing graceful degradation and detailed observability for debugging and monitoring.