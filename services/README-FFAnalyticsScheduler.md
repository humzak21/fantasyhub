# FFAnalytics Scheduler

The FFAnalytics Scheduler provides automated data updates and monitoring for the ffanalytics integration system. It handles scheduled data synchronization, retry logic, error handling, health monitoring, and alerting.

## Features

- **Automated Scheduling**: Daily, weekly, or manual data updates
- **Retry Logic**: Exponential backoff with configurable retry attempts
- **Health Monitoring**: Periodic health checks of services and database
- **Error Handling**: Graceful degradation and comprehensive error logging
- **Alerting System**: Configurable alerts for critical failures
- **Manual Triggers**: API and CLI support for immediate data refresh
- **Performance Monitoring**: Job execution tracking and performance metrics
- **Concurrent Job Management**: Configurable limits on simultaneous operations

## Quick Start

### Basic Usage

```javascript
import { FFAnalyticsScheduler } from './services/ffAnalyticsScheduler.js';

// Create scheduler with default configuration
const scheduler = new FFAnalyticsScheduler();

// Start automatic scheduling
scheduler.start();

// Trigger manual update
const result = await scheduler.triggerManualUpdate();
console.log('Update completed:', result);

// Graceful shutdown
await scheduler.shutdown();
```

### Application Integration

```javascript
import { initializeScheduler, shutdownScheduler } from './services/schedulerIntegration.js';

// Initialize when your app starts
await initializeScheduler('production');

// The scheduler will now run automatically based on configuration

// Shutdown when your app stops
process.on('SIGTERM', async () => {
  await shutdownScheduler();
  process.exit(0);
});
```

## Configuration

### Environment Variables

```bash
# Scheduler Settings
ANALYTICS_SCHEDULER_ENABLED=true
ANALYTICS_UPDATE_FREQUENCY=daily  # daily, weekly, manual
ANALYTICS_UPDATE_TIME=06:00       # UTC time (HH:MM)

# Retry and Error Handling
ANALYTICS_RETRY_ATTEMPTS=3
ANALYTICS_RETRY_DELAY=300000      # 5 minutes in milliseconds
ANALYTICS_MAX_CONCURRENT_JOBS=1

# Monitoring and Alerting
ANALYTICS_HEALTH_CHECK_INTERVAL=3600000  # 1 hour in milliseconds
ANALYTICS_ALERTING_ENABLED=true

# Data Update Settings
ANALYTICS_INCLUDE_WEEKLY=true
ANALYTICS_INCLUDE_SEASONAL=true
ANALYTICS_FORCE_UPDATE=false

# FFAnalytics Service Configuration
R_EXECUTABLE_PATH=Rscript
FFANALYTICS_SCRIPTS_PATH=./scripts/ffanalytics/
R_SCRIPT_TIMEOUT=300000           # 5 minutes
FFANALYTICS_SOURCES=CBS,ESPN,FantasyPros,FantasySharks,FFToday,NumberFire,NFL
FFANALYTICS_POSITIONS=QB,RB,WR,TE,K,DST

# Cache Settings
ANALYTICS_CACHE_TTL=3600          # 1 hour
ANALYTICS_WEEKLY_CACHE_TTL=86400  # 24 hours
ANALYTICS_SEASON_CACHE_TTL=604800 # 1 week

# Power Rankings Integration
ANALYTICS_POWER_RANKINGS_ENABLED=true
ANALYTICS_WEIGHT=0.15             # 15% weight in power rankings
ANALYTICS_TREND_WEIGHT=0.1        # 10% weight for trending players
ANALYTICS_CONSISTENCY_WEIGHT=0.05 # 5% weight for consistency
```

### Programmatic Configuration

```javascript
import { getSchedulerConfig, getEnvironmentConfig } from './config/scheduler-config.js';

// Get default configuration
const defaultConfig = getSchedulerConfig();

// Get environment-specific configuration
const prodConfig = getEnvironmentConfig('production');
const devConfig = getEnvironmentConfig('development');

// Custom configuration
const customConfig = {
  frequency: 'weekly',
  time: '08:00',
  retryAttempts: 5,
  alertingEnabled: true,
  ffAnalyticsConfig: {
    powerRankings: {
      analyticsWeight: 0.25,
      trendWeight: 0.15
    },
    dataSources: {
      weekly: ['ESPN', 'FantasyPros', 'CBS'],
      positions: ['QB', 'RB', 'WR', 'TE']
    }
  }
};

const scheduler = new FFAnalyticsScheduler(customConfig);
```

## CLI Usage

The scheduler includes a comprehensive CLI tool for management and monitoring:

```bash
# Show scheduler status
node scripts/schedulerCLI.js status

# Trigger manual update
node scripts/schedulerCLI.js trigger
node scripts/schedulerCLI.js trigger --week 5 --force
node scripts/schedulerCLI.js trigger --no-weekly --no-seasonal

# Start/stop scheduler
node scripts/schedulerCLI.js start
node scripts/schedulerCLI.js stop

# Health check
node scripts/schedulerCLI.js health

# View logs and alerts
node scripts/schedulerCLI.js logs 50
node scripts/schedulerCLI.js alerts
node scripts/schedulerCLI.js alerts false  # unacknowledged only

# Acknowledge alert
node scripts/schedulerCLI.js ack <alert-id> --user "admin"
```

## API Integration

### Express.js Middleware

```javascript
import { 
  createSchedulerStatusMiddleware,
  createSchedulerTriggerMiddleware,
  createSchedulerHealthMiddleware
} from './services/schedulerIntegration.js';

// Add routes to your Express app
app.get('/api/scheduler/status', createSchedulerStatusMiddleware());
app.post('/api/scheduler/trigger', createSchedulerTriggerMiddleware());
app.get('/api/scheduler/health', createSchedulerHealthMiddleware());
```

### API Endpoints

#### GET /api/scheduler/status
Returns current scheduler status and statistics.

```json
{
  "status": "ok",
  "scheduler": {
    "enabled": true,
    "frequency": "daily",
    "time": "06:00",
    "runningJobs": [],
    "scheduledJobs": ["dataUpdate", "healthCheck"],
    "recentJobs": [...],
    "recentFailures": 0
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### POST /api/scheduler/trigger
Triggers a manual data update.

Request body:
```json
{
  "week": 5,
  "force": true,
  "includeWeekly": true,
  "includeSeasonal": false
}
```

Response:
```json
{
  "status": "success",
  "message": "Update triggered successfully",
  "result": {
    "playersUpdated": 150,
    "teamsUpdated": 12,
    "errors": []
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### GET /api/scheduler/health
Returns detailed health check results.

```json
{
  "overall": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "scheduler": {
    "enabled": true,
    "runningJobs": 0,
    "scheduledJobs": 2,
    "recentFailures": 0
  },
  "services": {
    "ffAnalytics": {
      "status": "healthy",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    },
    "database": {
      "status": "healthy",
      "connected": true,
      "lastCheck": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

## Database Schema

The scheduler uses three main tables for logging and monitoring:

### analytics_job_log
Tracks all job executions with results and performance metrics.

```sql
CREATE TABLE analytics_job_log (
  id UUID PRIMARY KEY,
  job_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL,  -- success, failed, running, cancelled
  trigger VARCHAR(20) NOT NULL, -- automatic, manual, retry
  details JSONB DEFAULT '{}',   -- duration, errors, players updated, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### analytics_health_log
Stores periodic health check results.

```sql
CREATE TABLE analytics_health_log (
  id UUID PRIMARY KEY,
  status VARCHAR(20) NOT NULL,  -- healthy, degraded, unhealthy
  details JSONB DEFAULT '{}',   -- full health check results
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### analytics_alerts
Manages alerts and notifications.

```sql
CREATE TABLE analytics_alerts (
  id UUID PRIMARY KEY,
  type VARCHAR(50) NOT NULL,           -- update_failed, health_check_failed, etc.
  severity VARCHAR(10) NOT NULL,       -- low, medium, high, critical
  data JSONB DEFAULT '{}',             -- alert-specific data
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Monitoring and Alerting

### Built-in Alert Types

- **update_failed**: Data update job failed after all retries
- **health_check_failed**: System health check detected issues
- **health_check_error**: Health check itself failed to execute
- **service_unavailable**: Critical service is unavailable
- **database_error**: Database connectivity or query issues

### Alert Severity Levels

- **low**: Informational alerts, no immediate action required
- **medium**: Warning conditions that should be investigated
- **high**: Error conditions requiring prompt attention
- **critical**: System-critical issues requiring immediate action

### Custom Alert Handlers

```javascript
const scheduler = new FFAnalyticsScheduler();

// Override sendAlert method for custom handling
scheduler.sendAlert = async (type, data) => {
  console.log(`ALERT: ${type}`, data);
  
  // Custom integrations
  switch (data.severity) {
    case 'critical':
      await sendPagerDutyAlert(type, data);
      break;
    case 'high':
      await sendSlackAlert(type, data);
      break;
    case 'medium':
      await sendEmailAlert(type, data);
      break;
  }
  
  // Still log to database
  await originalSendAlert(type, data);
};
```

## Error Handling

### Retry Logic

The scheduler implements exponential backoff with jitter for failed operations:

```javascript
// Retry configuration
const config = {
  retryAttempts: 3,
  retryDelay: 5000,  // Base delay: 5 seconds
  // Actual delays: ~5s, ~10s, ~20s (with jitter)
};
```

### Graceful Degradation

- **Service Failures**: Continue with available data, log errors
- **Database Issues**: Cache results in memory, retry later
- **R Script Failures**: Skip analytics updates, maintain core functionality
- **Network Problems**: Use cached data, schedule retry

### Error Recovery

```javascript
// Automatic recovery strategies
scheduler.on('error', async (error, context) => {
  switch (error.type) {
    case 'RATE_LIMIT':
      // Wait and retry with longer delay
      await scheduler.scheduleRetry(context, error.retryAfter);
      break;
      
    case 'SERVICE_UNAVAILABLE':
      // Switch to backup data source
      await scheduler.switchToBackupSource();
      break;
      
    case 'DATABASE_ERROR':
      // Use in-memory cache temporarily
      scheduler.enableMemoryCache();
      break;
  }
});
```

## Performance Optimization

### Concurrent Job Management

```javascript
const config = {
  maxConcurrentJobs: 1,  // Prevent resource contention
  jobTimeout: 300000,    // 5 minute timeout
  memoryLimit: '512MB'   // Memory usage limit
};
```

### Caching Strategy

- **Short-term Cache**: 1 hour for frequently accessed data
- **Weekly Data**: 24 hour cache for weekly projections
- **Seasonal Data**: 1 week cache for season-long projections
- **Cache Invalidation**: Automatic cleanup of expired data

### Resource Monitoring

```javascript
// Built-in performance tracking
scheduler.on('jobComplete', (jobId, metrics) => {
  console.log('Job Performance:', {
    duration: metrics.duration,
    memoryUsed: metrics.memoryUsage.heapUsed,
    cpuTime: metrics.cpuUsage.user + metrics.cpuUsage.system,
    playersProcessed: metrics.playersUpdated,
    throughput: metrics.playersUpdated / (metrics.duration / 1000)
  });
});
```

## Testing

### Unit Tests

```bash
# Run unit tests
npm test services/__tests__/ffAnalyticsScheduler.test.js
```

### Integration Tests

```bash
# Run integration tests (requires database)
TEST_TYPE=integration npm test services/__tests__/ffAnalyticsScheduler.integration.test.js
```

### Test Configuration

```javascript
// Test-specific configuration
const testConfig = {
  enabled: false,           // Don't auto-start in tests
  frequency: 'manual',      // Manual triggering only
  retryAttempts: 0,        // Fail fast in tests
  alertingEnabled: false,   // No alerts in tests
  cache: {
    defaultTTL: 1,         // Very short cache for tests
    weeklyDataTTL: 1,
    seasonDataTTL: 1
  }
};
```

## Deployment

### Database Setup

```bash
# Run database migrations
psql -d your_database -f database/scheduler_schema_migration.sql
```

### Environment Setup

```bash
# Install R and dependencies
sudo apt-get install r-base
R -e "install.packages('ffanalytics')"

# Install Node.js dependencies
npm install node-cron commander
```

### Production Deployment

```javascript
// In your main application file
import { initializeScheduler, setupProcessHandlers } from './services/schedulerIntegration.js';

async function startApp() {
  // Initialize scheduler
  await initializeScheduler('production');
  
  // Setup graceful shutdown handlers
  setupProcessHandlers();
  
  // Start your application
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('FFAnalytics Scheduler is running');
  });
}

startApp().catch(console.error);
```

### Health Checks

```bash
# Add to your deployment health checks
curl -f http://localhost:3000/api/scheduler/health || exit 1
```

## Troubleshooting

### Common Issues

1. **Scheduler Not Starting**
   - Check `ANALYTICS_SCHEDULER_ENABLED` environment variable
   - Verify database connectivity
   - Check R environment setup

2. **Jobs Failing**
   - Review job logs: `node scripts/schedulerCLI.js logs`
   - Check R script execution permissions
   - Verify ffanalytics package installation

3. **High Memory Usage**
   - Reduce cache TTL values
   - Lower `maxConcurrentJobs` setting
   - Monitor job execution times

4. **Database Connection Issues**
   - Check Supabase credentials
   - Verify network connectivity
   - Review database table permissions

### Debug Mode

```bash
# Enable debug logging
DEBUG=scheduler:* node your-app.js

# Or set environment variable
export DEBUG=scheduler:*
```

### Log Analysis

```bash
# View recent failures
node scripts/schedulerCLI.js logs 100 | grep failed

# Check health trends
node scripts/schedulerCLI.js health

# Monitor alerts
node scripts/schedulerCLI.js alerts false
```

## Contributing

When contributing to the scheduler system:

1. **Add Tests**: Include both unit and integration tests
2. **Update Documentation**: Keep this README current
3. **Follow Patterns**: Use existing error handling and logging patterns
4. **Performance**: Consider impact on system resources
5. **Backwards Compatibility**: Maintain API compatibility when possible

## License

This scheduler system is part of the FFAnalytics integration and follows the same license as the main project.