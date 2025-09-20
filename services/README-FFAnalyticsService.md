# FFAnalyticsService

The FFAnalyticsService is the main orchestration layer for integrating ffanalytics data into your fantasy football application. It coordinates all ffanalytics operations including data synchronization, player matching, team analytics calculation, and configuration management.

## Features

- **Data Synchronization**: Automated scraping of weekly and seasonal projections from multiple fantasy football sources
- **Player Matching**: Intelligent matching between local players and ffanalytics data using fuzzy algorithms
- **Team Analytics**: Calculation of team-level analytics scores based on individual player performance
- **Caching**: Efficient data storage and retrieval with configurable TTL
- **Configuration Management**: Flexible configuration system with runtime updates
- **Error Handling**: Comprehensive error handling with retry logic and graceful degradation
- **Statistics Tracking**: Built-in monitoring and performance statistics
- **Power Rankings Integration**: Seamless integration with existing power ranking calculations

## Requirements Addressed

- **2.1**: Extract weekly and seasonal player rankings from ffanalytics
- **2.2**: Retrieve season-to-date statistics and rankings for each player
- **3.1**: Incorporate player weekly performance scores into team strength calculations
- **5.1**: Allow enabling/disabling ffanalytics data in power rankings

## Installation and Setup

### Prerequisites

1. **R Environment**: Install R with the ffanalytics package
```bash
# Install R (varies by system)
# Ubuntu/Debian
sudo apt-get install r-base

# macOS with Homebrew
brew install r

# Install ffanalytics package in R
R -e "install.packages('ffanalytics')"
```

2. **Environment Variables**: Set up required environment variables
```bash
# Optional: Custom R executable path
export R_EXECUTABLE_PATH="/usr/bin/Rscript"

# Optional: Custom scripts path
export FFANALYTICS_SCRIPTS_PATH="./scripts/ffanalytics/"
```

3. **Database Schema**: Ensure your database has the required ffanalytics tables and columns (see database migration files)

### Basic Usage

```javascript
import FFAnalyticsService from './services/ffAnalyticsService.js';

// Create service instance
const analyticsService = new FFAnalyticsService();

// Initialize (validates R environment and database)
await analyticsService.initialize();

// Sync weekly data
const syncResult = await analyticsService.updateAllPlayerAnalytics();
console.log(`Updated ${syncResult.playersUpdated} players`);
```

## Configuration

The service accepts a comprehensive configuration object:

```javascript
const config = {
  // R Script Configuration
  rScripts: {
    rExecutable: 'Rscript',           // Path to R executable
    scriptsPath: './scripts/ffanalytics/', // Path to R scripts
    timeout: 300000,                  // 5 minutes timeout
    maxRetries: 3                     // Retry attempts
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
    defaultTTL: 3600,                 // 1 hour
    weeklyDataTTL: 86400,             // 24 hours
    seasonDataTTL: 604800,            // 1 week
    maxCacheSize: 10000
  },
  
  // Player Matching Configuration
  matching: {
    confidenceThreshold: 0.8,         // Minimum confidence for auto-approval
    fuzzyMatchThreshold: 0.7,         // Minimum similarity for matching
    autoApproveThreshold: 0.95        // Threshold for automatic approval
  },
  
  // Power Rankings Integration
  powerRankings: {
    enabled: true,                    // Enable/disable analytics integration
    analyticsWeight: 0.15,            // 15% weight in team strength calculation
    trendWeight: 0.1,                 // 10% weight for trending players
    consistencyWeight: 0.05           // 5% weight for consistency
  },
  
  // Update Schedule
  updates: {
    enabled: true,                    // Enable scheduled updates
    frequency: 'daily',               // daily, weekly, manual
    time: '06:00',                    // UTC time for daily updates
    retryAttempts: 3,                 // Retry attempts for failed updates
    retryDelay: 300000                // 5 minutes retry delay
  }
};

const analyticsService = new FFAnalyticsService(supabaseClient, config);
```

## API Reference

### Core Methods

#### `initialize()`
Initializes the service and validates the environment.

```javascript
const success = await analyticsService.initialize();
```

**Returns**: `Promise<boolean>` - Success status

**Throws**: `FFAnalyticsError` if initialization fails

#### `updateAllPlayerAnalytics(week?, force?)`
Updates analytics data for all players.

```javascript
const result = await analyticsService.updateAllPlayerAnalytics(5, false);
```

**Parameters**:
- `week` (number, optional): Week number (null for current week)
- `force` (boolean, optional): Force update even if sync is in progress

**Returns**: `Promise<Object>` - Update results with statistics

#### `getPlayerAnalytics(playerId, week?, seasonYear?)`
Gets analytics data for a specific player.

```javascript
const analytics = await analyticsService.getPlayerAnalytics('player-id', 5, 2024);
```

**Parameters**:
- `playerId` (string): Player UUID
- `week` (number, optional): Week number (null for current)
- `seasonYear` (number, optional): Season year (null for current)

**Returns**: `Promise<Object|null>` - Player analytics data

#### `getTeamAnalyticsScore(teamId, week?, seasonYear?)`
Gets team analytics score using individual player data.

```javascript
const teamScore = await analyticsService.getTeamAnalyticsScore('team-id', 5, 2024);
```

**Parameters**:
- `teamId` (string): Team UUID
- `week` (number, optional): Week number (null for current)
- `seasonYear` (number, optional): Season year (null for current)

**Returns**: `Promise<Object>` - Team analytics score and breakdown

### Data Synchronization Methods

#### `syncWeeklyProjections(week?)`
Syncs weekly projections from ffanalytics.

```javascript
const result = await analyticsService.syncWeeklyProjections(5);
```

#### `syncSeasonProjections()`
Syncs seasonal projections from ffanalytics.

```javascript
const result = await analyticsService.syncSeasonProjections();
```

### Configuration Methods

#### `getConfig()`
Gets current service configuration.

```javascript
const config = analyticsService.getConfig();
```

#### `updateConfig(newConfig)`
Updates service configuration.

```javascript
analyticsService.updateConfig({
  powerRankings: { analyticsWeight: 0.25 }
});
```

#### `isAnalyticsEnabled()` / `setAnalyticsEnabled(enabled)`
Checks or sets analytics integration status.

```javascript
const enabled = analyticsService.isAnalyticsEnabled();
analyticsService.setAnalyticsEnabled(false);
```

#### `getAnalyticsWeight()` / `setAnalyticsWeight(weight)`
Gets or sets analytics weight for power rankings.

```javascript
const weight = analyticsService.getAnalyticsWeight();
analyticsService.setAnalyticsWeight(0.25);
```

### Monitoring Methods

#### `getStats()`
Gets service statistics and performance metrics.

```javascript
const stats = analyticsService.getStats();
console.log(`Success rate: ${stats.successRate}%`);
```

#### `resetStats()`
Resets service statistics.

```javascript
analyticsService.resetStats();
```

## Data Models

### Player Analytics Object
```javascript
{
  id: 'player-uuid',
  name: 'Player Name',
  position: 'RB',
  team_abbreviation: 'NYG',
  weekly_rank: 15,
  position_rank: 8,
  trend_score: 0.75,
  consistency_rating: 0.82,
  ceiling_score: 22.5,
  floor_score: 12.3,
  ffanalytics_player_id: 'ff-player-id',
  ffanalytics_last_sync: '2024-10-15T10:30:00Z',
  ffanalytics_data: {
    ecr_avg: 18.5,
    ecr_sd: 3.2,
    adp_avg: 45.2,
    uncertainty: 12.5,
    vor: 8.7,
    tier: 3
  }
}
```

### Team Analytics Object
```javascript
{
  teamId: 'team-uuid',
  week: 5,
  seasonYear: 2024,
  avgPlayerRank: 25.3,
  trendingUpPlayers: 3,
  trendingDownPlayers: 1,
  totalCeilingScore: 145.7,
  totalFloorScore: 98.2,
  analyticsStrengthScore: 78.5,
  playerCount: 16,
  activePlayerCount: 9
}
```

## Error Handling

The service uses a comprehensive error handling system with specific error types:

```javascript
import { FFAnalyticsError, FFANALYTICS_ERROR_TYPES } from './services/ffAnalyticsService.js';

try {
  await analyticsService.updateAllPlayerAnalytics();
} catch (error) {
  if (error instanceof FFAnalyticsError) {
    console.log(`Error type: ${error.type}`);
    console.log(`Retryable: ${error.retryable}`);
    console.log(`Details:`, error.details);
    
    if (error.retryable) {
      // Implement retry logic
    }
  }
}
```

### Error Types
- `CONFIGURATION_ERROR`: Invalid configuration
- `DATA_SYNC_ERROR`: Data synchronization failures
- `PLAYER_MATCHING_ERROR`: Player matching failures
- `ANALYTICS_CALCULATION_ERROR`: Analytics calculation failures
- `R_SCRIPT_ERROR`: R script execution failures
- `DATABASE_ERROR`: Database operation failures

## Integration with Power Rankings

The service is designed to integrate seamlessly with existing power ranking calculations:

```javascript
// In your PowerRankingCalculator
async calculateAnalyticsEnhancedTeamStrength(teamId) {
  const baseStrength = this.calculateTeamStrength(teamId);
  
  if (this.ffAnalyticsService.isAnalyticsEnabled()) {
    const teamAnalytics = await this.ffAnalyticsService.getTeamAnalyticsScore(teamId);
    const analyticsWeight = this.ffAnalyticsService.getAnalyticsWeight();
    const analyticsBonus = teamAnalytics.analyticsStrengthScore * analyticsWeight;
    
    return baseStrength + analyticsBonus;
  }
  
  return baseStrength;
}
```

## Performance Considerations

1. **Caching**: The service implements multi-level caching (memory + database) to minimize API calls
2. **Batch Processing**: Player updates are processed in batches to avoid overwhelming the database
3. **Timeout Handling**: R script execution has configurable timeouts with retry logic
4. **Graceful Degradation**: The service continues to work even when ffanalytics data is unavailable

## Monitoring and Debugging

Enable detailed logging by setting the environment variable:
```bash
export FFANALYTICS_DEBUG=true
```

Monitor service performance:
```javascript
const stats = analyticsService.getStats();
console.log(`Average sync duration: ${stats.lastSyncDuration}ms`);
console.log(`Cache hit rate: ${stats.cacheHitRate}%`);
```

## Troubleshooting

### Common Issues

1. **R Environment Not Found**
   - Ensure R is installed and accessible in PATH
   - Set `R_EXECUTABLE_PATH` environment variable if needed

2. **ffanalytics Package Missing**
   - Install the package: `R -e "install.packages('ffanalytics')"`

3. **Database Connection Errors**
   - Verify Supabase credentials and connection
   - Check database schema migrations are applied

4. **Slow Sync Performance**
   - Reduce number of data sources in configuration
   - Increase R script timeout values
   - Monitor network connectivity to data sources

5. **Player Matching Issues**
   - Review matching confidence thresholds
   - Check player name formatting consistency
   - Use manual matching for problematic players

## Examples

See `examples/ffAnalyticsService-example.js` for comprehensive usage examples including:
- Basic setup and initialization
- Custom configuration
- Data synchronization
- Player and team analytics retrieval
- Error handling
- Power rankings integration

## Testing

Run the test suite:
```bash
npm test services/__tests__/ffAnalyticsService.test.js
```

The test suite covers:
- Service initialization and configuration
- Data synchronization workflows
- Player and team analytics calculations
- Error handling scenarios
- Configuration management
- Statistics tracking

## Dependencies

- **AnalyticsCache**: Efficient data storage and retrieval
- **PlayerMatchingService**: Player matching algorithms
- **RScriptExecutor**: R script execution with error handling
- **Supabase**: Database operations
- **ffanalytics R package**: Fantasy football data scraping

## License

This service is part of the fantasy football application and follows the same license terms.