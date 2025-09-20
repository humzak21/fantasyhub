# FFAnalytics Configuration System

The FFAnalytics Configuration System provides comprehensive configuration management for the ffanalytics integration, including data sources, weights, schedules, and environment variable handling.

## Overview

The configuration system consists of three main components:

1. **FFAnalyticsConfig** - Core configuration management with defaults, environment variables, and validation
2. **FFAnalyticsEnvironment** - Environment validation, setup, and production readiness checks
3. **FFAnalyticsConfigCLI** - Command-line interface for configuration management

## Quick Start

### Basic Usage

```javascript
const { FFAnalyticsConfig } = require('./config/ffanalytics-config');

// Create configuration with defaults
const config = new FFAnalyticsConfig();

// Check if analytics is enabled
console.log('Analytics enabled:', config.isEnabled());

// Get power rankings weights
const weights = config.getPowerRankingsWeights();
console.log('Analytics weight:', weights.analytics);
```

### Environment Variables

Create a `.env` file with your configuration:

```bash
# Generate template
npm run ffanalytics-config template

# Copy and customize
cp .env.ffanalytics.template .env
```

### CLI Management

```bash
# Validate environment
npm run ffanalytics-config validate

# Setup environment
npm run ffanalytics-config setup

# View configuration
npm run ffanalytics-config config

# Manage weights
npm run ffanalytics-config weights set analytics 0.2
```

## Configuration Structure

### Core Settings

```javascript
{
  enabled: true,                    // Enable/disable analytics integration
  
  rScripts: {
    rExecutable: 'Rscript',         // Path to R executable
    scriptsPath: './scripts/ffanalytics/',
    timeout: 300000,                // 5 minutes
    maxRetries: 3
  },
  
  dataSources: {
    weekly: ['CBS', 'ESPN', 'FantasyPros', ...],
    seasonal: ['CBS', 'ESPN', 'FantasyPros', ...],
    positions: ['QB', 'RB', 'WR', 'TE', 'K', 'DST'],
    avgTypes: ['average', 'robust', 'weighted']
  },
  
  powerRankings: {
    enabled: true,
    analyticsWeight: 0.15,          // 15% influence on rankings
    trendWeight: 0.1,               // 10% for trending players
    consistencyWeight: 0.05,        // 5% for consistency
    ceilingFloorWeight: 0.05        // 5% for ceiling/floor scores
  },
  
  updates: {
    enabled: true,
    frequency: 'daily',             // daily, weekly, manual
    time: '06:00',                  // UTC time
    retryAttempts: 3
  }
}
```

## Environment Variables

All configuration options can be set via environment variables:

### Core Settings
- `FFANALYTICS_ENABLED` - Enable/disable analytics (true/false)

### R Configuration
- `R_EXECUTABLE_PATH` - Path to Rscript executable
- `FFANALYTICS_SCRIPTS_PATH` - Path to R scripts directory
- `R_SCRIPT_TIMEOUT` - Timeout in milliseconds
- `R_SCRIPT_MAX_RETRIES` - Maximum retry attempts

### Data Sources (comma-separated)
- `FFANALYTICS_WEEKLY_SOURCES` - Weekly data sources
- `FFANALYTICS_SEASONAL_SOURCES` - Seasonal data sources
- `FFANALYTICS_POSITIONS` - Player positions to include
- `FFANALYTICS_AVG_TYPES` - Averaging methods

### Power Rankings Weights (0.0 to 1.0)
- `ANALYTICS_WEIGHT` - Overall analytics influence
- `ANALYTICS_TREND_WEIGHT` - Trending player influence
- `ANALYTICS_CONSISTENCY_WEIGHT` - Consistency influence
- `ANALYTICS_CEILING_FLOOR_WEIGHT` - Ceiling/floor influence

### Cache Settings (in seconds)
- `ANALYTICS_CACHE_TTL` - Default cache TTL
- `ANALYTICS_WEEKLY_TTL` - Weekly data cache TTL
- `ANALYTICS_SEASONAL_TTL` - Seasonal data cache TTL

### Update Schedule
- `ANALYTICS_UPDATE_FREQUENCY` - Update frequency (daily/weekly/manual)
- `ANALYTICS_UPDATE_TIME` - Update time (HH:MM format)
- `ANALYTICS_RETRY_ATTEMPTS` - Retry attempts for failed updates

## API Reference

### FFAnalyticsConfig

#### Constructor
```javascript
new FFAnalyticsConfig(customConfig = {})
```

#### Methods

**Configuration Access**
- `get(path)` - Get configuration value by dot notation path
- `set(path, value)` - Set configuration value (validates)
- `export()` - Export full configuration as JSON

**Status Checks**
- `isEnabled()` - Check if analytics is enabled
- `isPowerRankingsEnabled()` - Check if power rankings integration is enabled

**Specialized Getters**
- `getRScriptConfig()` - Get R script configuration
- `getDataSourcesConfig()` - Get data sources configuration
- `getPowerRankingsWeights()` - Get power rankings weights
- `getCacheConfig()` - Get cache configuration
- `getMatchingConfig()` - Get player matching configuration
- `getUpdateConfig()` - Get update schedule configuration
- `getErrorHandlingConfig()` - Get error handling configuration

**Static Methods**
- `FFAnalyticsConfig.fromEnvironment()` - Create from environment variables only
- `FFAnalyticsConfig.create(customConfig)` - Create with custom configuration

### FFAnalyticsEnvironment

#### Constructor
```javascript
new FFAnalyticsEnvironment(config)
```

#### Methods

**Validation**
- `validateEnvironment()` - Validate complete environment setup
- `validateRInstallation()` - Validate R and ffanalytics package
- `validateRScripts()` - Validate R scripts exist and are readable
- `validateFilePermissions()` - Validate file permissions
- `validateConfigurationEnvironment()` - Validate configuration values

**Setup**
- `setupEnvironment()` - Setup environment for first-time use
- `generateEnvTemplate()` - Generate environment variable template

**Production Readiness**
- `isProductionReady()` - Check if environment is production ready
- `getProductionRecommendations()` - Get production recommendations

## CLI Commands

### Validation
```bash
# Validate environment setup
npm run ffanalytics-config validate
```

### Setup
```bash
# Setup environment for first-time use
npm run ffanalytics-config setup
```

### Configuration Management
```bash
# Show full configuration summary
npm run ffanalytics-config config

# Show specific configuration section
npm run ffanalytics-config config powerRankings
npm run ffanalytics-config config dataSources
```

### Weight Management
```bash
# Show current weights
npm run ffanalytics-config weights get

# Set specific weight
npm run ffanalytics-config weights set analytics 0.2
npm run ffanalytics-config weights set trend 0.15
npm run ffanalytics-config weights set consistency 0.08
npm run ffanalytics-config weights set ceiling-floor 0.06
```

### Data Source Management
```bash
# Show current data sources
npm run ffanalytics-config sources get

# Add data source
npm run ffanalytics-config sources add weekly Yahoo
npm run ffanalytics-config sources add seasonal FantasySharks

# Remove data source
npm run ffanalytics-config sources remove weekly FFToday
```

### Testing
```bash
# Test configuration with R environment
npm run ffanalytics-config test
```

### Template Generation
```bash
# Generate environment variable template
npm run ffanalytics-config template
npm run ffanalytics-config template .env.custom
```

## Configuration Examples

### Development Configuration
```javascript
const config = new FFAnalyticsConfig({
  powerRankings: {
    analyticsWeight: 0.1,  // Lower influence for testing
    enabled: true
  },
  dataSources: {
    weekly: ['ESPN', 'FantasyPros'],  // Fewer sources for faster updates
    positions: ['QB', 'RB', 'WR', 'TE']  // Exclude K and DST
  },
  updates: {
    frequency: 'manual',  // Manual updates during development
    enabled: false
  },
  cache: {
    defaultTTL: 1800  // Shorter cache for development
  }
});
```

### Production Configuration
```javascript
const config = new FFAnalyticsConfig({
  powerRankings: {
    analyticsWeight: 0.2,   // Higher influence in production
    trendWeight: 0.12,
    consistencyWeight: 0.08
  },
  dataSources: {
    weekly: ['CBS', 'ESPN', 'FantasyPros', 'FantasySharks', 'NumberFire'],
    seasonal: ['CBS', 'ESPN', 'FantasyPros', 'FantasySharks', 'NumberFire']
  },
  updates: {
    frequency: 'daily',
    time: '05:00',  // Early morning updates
    retryAttempts: 5
  },
  cache: {
    weeklyDataTTL: 43200,  // 12 hours
    seasonDataTTL: 86400   // 24 hours
  },
  logging: {
    enableFileLogging: true,
    level: 'info'
  }
});
```

### High-Performance Configuration
```javascript
const config = new FFAnalyticsConfig({
  dataSources: {
    weekly: ['ESPN', 'FantasyPros'],  // Fastest sources only
    avgTypes: ['average']  // Single averaging method
  },
  cache: {
    defaultTTL: 7200,      // Longer cache
    maxCacheSize: 20000    // Larger cache
  },
  rScripts: {
    timeout: 180000,       // 3 minutes timeout
    maxRetries: 2          // Fewer retries
  },
  powerRankings: {
    minDataPoints: 2       // Require less historical data
  }
});
```

## Validation and Error Handling

The configuration system includes comprehensive validation:

### Automatic Validation
- Weight values must be between 0.0 and 1.0
- Threshold values must be between 0.0 and 1.0
- At least one data source must be configured
- At least one position must be configured
- Update frequency must be valid (daily/weekly/manual)
- Required paths must be provided

### Environment Validation
- R installation and version check
- ffanalytics package availability
- R script file existence and permissions
- Directory permissions for logs and cache
- Configuration value validation

### Error Types
```javascript
// Configuration validation errors
throw new Error('powerRankings.analyticsWeight must be between 0 and 1');

// Environment validation errors
{
  valid: false,
  errors: ['R installation validation failed: Command not found'],
  warnings: ['R dependency \'dplyr\' is not installed'],
  info: ['R installation found: R version 4.3.0']
}
```

## Integration with Services

### FFAnalyticsService Integration
```javascript
const { FFAnalyticsService } = require('../services/ffAnalyticsService');
const { FFAnalyticsConfig } = require('../config/ffanalytics-config');

const config = new FFAnalyticsConfig();
const service = new FFAnalyticsService(supabaseClient, config.export());

// Service automatically uses configuration for:
// - R script execution settings
// - Data source selection
// - Cache configuration
// - Error handling settings
```

### PowerRankingCalculator Integration
```javascript
const { PowerRankingCalculator } = require('../services/powerRankingCalculator');
const { FFAnalyticsConfig } = require('../config/ffanalytics-config');

const config = new FFAnalyticsConfig();
const calculator = new PowerRankingCalculator(supabaseClient);

// Apply analytics weights to power rankings
if (config.isPowerRankingsEnabled()) {
  const weights = config.getPowerRankingsWeights();
  calculator.setAnalyticsWeights(weights);
}
```

## Best Practices

### Development
1. Use manual updates during development
2. Enable debug logging
3. Use fewer data sources for faster testing
4. Set shorter cache TTL for immediate feedback

### Production
1. Enable file logging
2. Use multiple data sources for reliability
3. Set appropriate retry attempts and timeouts
4. Monitor configuration validation results
5. Use longer cache TTL for performance

### Security
1. Store sensitive configuration in environment variables
2. Validate all configuration inputs
3. Use read-only file permissions for R scripts
4. Monitor for configuration changes

### Performance
1. Balance data source count with update speed
2. Tune cache TTL based on usage patterns
3. Monitor R script execution times
4. Use appropriate timeout values

## Troubleshooting

### Common Issues

**R Installation Not Found**
```bash
# Check R installation
which Rscript
R --version

# Set custom path
export R_EXECUTABLE_PATH=/usr/local/bin/Rscript
```

**ffanalytics Package Missing**
```r
# Install in R console
install.packages("ffanalytics")

# Or install from GitHub
devtools::install_github("FantasyFootballAnalytics/ffanalytics")
```

**Permission Errors**
```bash
# Fix script permissions
chmod +x scripts/ffanalytics/*.R

# Fix log directory permissions
mkdir -p logs
chmod 755 logs
```

**Configuration Validation Errors**
```bash
# Validate configuration
npm run ffanalytics-config validate

# Check specific section
npm run ffanalytics-config config powerRankings
```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
export R_SCRIPT_LOG_LEVEL=debug
export ANALYTICS_LOG_LEVEL=debug
```

Or in configuration:
```javascript
const config = new FFAnalyticsConfig({
  rScripts: { logLevel: 'debug' },
  logging: { level: 'debug' }
});
```