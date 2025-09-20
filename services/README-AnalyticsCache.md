# AnalyticsCache Service

The AnalyticsCache service provides efficient data management for player and team analytics data in the ffanalytics integration. It implements a caching layer with data retention policies, cleanup mechanisms, and performance optimization to meet the requirements of storing and retrieving analytics data with minimal storage overhead and fast query performance.

## Features

- **Dual Storage Strategy**: Uses enhanced players table for current data and player_analytics_history table for historical data
- **Memory Caching**: In-memory cache with configurable TTL for frequently accessed data
- **Data Retention**: Automatic cleanup of expired data based on configurable retention policies
- **Performance Optimization**: Query performance under 500ms with proper indexing and batching
- **Cache Invalidation**: Selective cache invalidation for players and teams
- **Bulk Operations**: Efficient batch processing for multiple players
- **Error Handling**: Graceful error handling with fallback mechanisms

## Requirements Addressed

- **4.2**: Data retention policies and automatic cleanup mechanisms
- **4.3**: Efficient querying with performance thresholds (< 500ms)
- **4.4**: Minimize storage requirements through proper indexing and compression

## Installation

The AnalyticsCache service is part of the ffanalytics integration and requires the enhanced database schema to be applied.

```javascript
import { supabase } from './supabaseClient.js';
import AnalyticsCache from './analyticsCache.js';

const analyticsCache = new AnalyticsCache(supabase, {
  // Configuration options
});
```

## Configuration Options

```javascript
const config = {
  // Cache TTL settings (in seconds)
  defaultTTL: 3600,        // 1 hour default
  weeklyDataTTL: 86400,    // 24 hours for weekly data
  seasonDataTTL: 604800,   // 1 week for season data
  
  // Data retention settings
  retentionWeeks: 17,      // Keep 17 weeks of historical data
  maxHistoryRecords: 10000, // Maximum history records per cleanup
  
  // Performance settings
  queryTimeout: 500,       // 500ms query timeout
  batchSize: 100,         // Batch size for bulk operations
  
  // Cache invalidation settings
  autoCleanup: true,      // Enable automatic cleanup
  cleanupInterval: 86400  // 24 hours cleanup interval
};
```

## API Reference

### Constructor

```javascript
new AnalyticsCache(client, config)
```

- `client`: Supabase client instance
- `config`: Configuration object (optional)

### Current Player Analytics

#### getPlayerAnalytics(playerId, week, seasonYear)

Retrieves player analytics data. If `week` is null, returns current data from players table. Otherwise, returns historical data from player_analytics_history table.

```javascript
// Get current player analytics
const currentData = await analyticsCache.getPlayerAnalytics('player-uuid');

// Get historical player analytics for specific week
const weekData = await analyticsCache.getPlayerAnalytics('player-uuid', 5, 2024);
```

#### setPlayerAnalytics(playerId, data, week, seasonYear)

Updates player analytics data. If `week` is null, updates current data in players table. Otherwise, upserts historical data in player_analytics_history table.

```javascript
const analyticsData = {
  weeklyRank: 15,
  positionRank: 8,
  trendScore: 5.5,
  consistencyRating: 0.82,
  ceilingScore: 22.5,
  floorScore: 12.0,
  rawData: { /* additional data */ }
};

// Update current analytics
await analyticsCache.setPlayerAnalytics('player-uuid', analyticsData);

// Store historical analytics
await analyticsCache.setPlayerAnalytics('player-uuid', analyticsData, 5, 2024);
```

### Historical Analytics

#### getPlayerAnalyticsHistory(playerId, weeks, seasonYear)

Retrieves multiple weeks of historical analytics data for a player.

```javascript
// Get last 5 weeks of history
const history = await analyticsCache.getPlayerAnalyticsHistory('player-uuid', 5, 2024);

history.forEach(weekData => {
  console.log(`Week ${weekData.week}: Rank ${weekData.weekly_rank}`);
});
```

### Team Analytics

#### getTeamAnalytics(teamId, week, seasonYear)

Retrieves team analytics summary. If `week` is null, returns the latest available data.

```javascript
// Get specific week team analytics
const teamData = await analyticsCache.getTeamAnalytics('team-uuid', 8, 2024);

// Get latest team analytics
const latestData = await analyticsCache.getTeamAnalytics('team-uuid', null, 2024);
```

### Bulk Operations

#### getBulkPlayerAnalytics(playerIds, week, seasonYear)

Efficiently retrieves analytics data for multiple players.

```javascript
const playerIds = ['player-1', 'player-2', 'player-3'];
const bulkResults = await analyticsCache.getBulkPlayerAnalytics(playerIds);

bulkResults.forEach(player => {
  console.log(`${player.name}: Rank ${player.weekly_rank}`);
});
```

### Cache Management

#### invalidatePlayerCache(playerId)

Invalidates all cache entries related to a specific player.

```javascript
await analyticsCache.invalidatePlayerCache('player-uuid');
```

#### invalidateTeamCache(teamId)

Invalidates all cache entries related to a specific team.

```javascript
await analyticsCache.invalidateTeamCache('team-uuid');
```

#### clearMemoryCache()

Clears all in-memory cache entries.

```javascript
analyticsCache.clearMemoryCache();
```

#### getCacheStats()

Returns cache performance statistics.

```javascript
const stats = analyticsCache.getCacheStats();
console.log('Cache hit rate:', stats.memory.hitRate);
console.log('Cache size:', stats.memory.size);
```

### Data Cleanup

#### cleanupExpiredData(retentionWeeks)

Removes expired analytics data based on retention policy.

```javascript
// Use default retention (from config)
const result = await analyticsCache.cleanupExpiredData();

// Use custom retention (4 weeks)
const customResult = await analyticsCache.cleanupExpiredData(4);

console.log('Records deleted:', result.historyRecordsDeleted);
```

## Data Models

### PlayerAnalytics (Current)

Stored in the enhanced `players` table:

```javascript
{
  id: 'uuid',
  name: 'Player Name',
  position: 'RB',
  team_abbreviation: 'NYG',
  weekly_rank: 15,
  position_rank: 8,
  trend_score: 5.5,
  consistency_rating: 0.82,
  ceiling_score: 22.5,
  floor_score: 12.0,
  ffanalytics_player_id: 'ff-123',
  ffanalytics_last_sync: '2024-01-15T10:00:00Z',
  ffanalytics_data: { /* raw data */ }
}
```

### PlayerAnalyticsHistory

Stored in the `player_analytics_history` table:

```javascript
{
  id: 'uuid',
  player_id: 'uuid',
  week: 5,
  season_year: 2024,
  weekly_rank: 15,
  position_rank: 8,
  projected_points: 16.5,
  actual_points: 18.2,
  trend_score: 5.0,
  consistency_rating: 0.78,
  ceiling_score: 24.0,
  floor_score: 10.5,
  ecr_avg: 19.5,
  ecr_sd: 3.2,
  adp_avg: 55.8,
  uncertainty: 4.1,
  vor: 12.3,
  tier: 3,
  raw_data: { /* additional metrics */ },
  created_at: '2024-01-15T10:00:00Z'
}
```

### TeamAnalyticsSummary

Stored in the `team_analytics_summary` table:

```javascript
{
  id: 'uuid',
  team_id: 'uuid',
  week: 8,
  season_year: 2024,
  avg_player_rank: 18.5,
  trending_up_players: 6,
  trending_down_players: 2,
  total_ceiling_score: 125.8,
  total_floor_score: 78.2,
  analytics_strength_score: 85.3,
  avg_consistency_rating: 0.78,
  total_projected_points: 145.6,
  avg_uncertainty: 3.1,
  calculated_at: '2024-01-15T10:00:00Z'
}
```

## Performance Characteristics

- **Query Performance**: All queries optimized to complete under 500ms
- **Memory Usage**: Configurable in-memory cache with automatic expiration
- **Batch Processing**: Bulk operations process players in configurable batch sizes
- **Database Indexing**: Proper indexes on frequently queried columns
- **Cache Hit Rate**: Typically 70-90% for frequently accessed data

## Error Handling

The service includes comprehensive error handling:

```javascript
try {
  const data = await analyticsCache.getPlayerAnalytics('player-uuid');
} catch (error) {
  if (error.message === 'No data found') {
    // Handle missing data
  } else if (error.message.includes('Authentication')) {
    // Handle auth errors
  } else {
    // Handle other errors
  }
}
```

## Integration with Other Services

The AnalyticsCache is designed to work with:

- **FFAnalyticsService**: Primary consumer for storing analytics data
- **PlayerMatchingService**: Provides player ID mappings
- **PowerRankingCalculator**: Consumes analytics data for enhanced rankings
- **RScriptExecutor**: Provides raw analytics data for processing

## Testing

Run the test suite:

```bash
# Unit tests
npm test services/__tests__/analyticsCache.test.js

# Integration tests (requires Supabase connection)
npm test services/__tests__/analyticsCache.integration.test.js
```

## Examples

See `examples/analyticsCache-example.js` for comprehensive usage examples including:

- Current and historical player analytics
- Team analytics operations
- Bulk operations
- Cache management
- Data cleanup
- Error handling
- Performance monitoring

## Best Practices

1. **Use Bulk Operations**: For multiple players, use `getBulkPlayerAnalytics()` instead of individual calls
2. **Cache Invalidation**: Invalidate cache when updating player data to ensure consistency
3. **Regular Cleanup**: Run `cleanupExpiredData()` regularly to maintain performance
4. **Monitor Performance**: Use `getCacheStats()` to monitor cache effectiveness
5. **Error Handling**: Always wrap calls in try-catch blocks for production use
6. **Batch Size**: Adjust batch size based on your system's performance characteristics

## Troubleshooting

### Common Issues

1. **Slow Queries**: Check database indexes and consider reducing batch sizes
2. **Memory Usage**: Reduce cache TTL or clear cache more frequently
3. **Missing Data**: Verify player IDs and ensure data has been synced
4. **Cache Misses**: Check cache configuration and invalidation patterns

### Debug Mode

Enable debug logging by setting the log level:

```javascript
const analyticsCache = new AnalyticsCache(supabase, {
  debug: true,
  logLevel: 'debug'
});
```

## Contributing

When contributing to the AnalyticsCache service:

1. Maintain backward compatibility
2. Add comprehensive tests for new features
3. Update documentation and examples
4. Follow the existing error handling patterns
5. Ensure performance requirements are met