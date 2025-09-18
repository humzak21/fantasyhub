# FFAnalytics Database Schema Integration

This directory contains the database schema enhancements for integrating ffanalytics data into the fantasy football application.

## Files Overview

- `ffanalytics_schema_migration.sql` - Main migration script to add ffanalytics support
- `ffanalytics_schema_rollback.sql` - Rollback script to remove all ffanalytics changes
- `test_ffanalytics_schema.sql` - Test script to validate schema changes
- `players_schema.sql` - Original players table schema (reference)

## Schema Changes

### 1. Enhanced Players Table

The existing `players` table has been enhanced with the following ffanalytics-specific columns:

| Column | Type | Description |
|--------|------|-------------|
| `ffanalytics_player_id` | VARCHAR(100) | Unique identifier from ffanalytics for player matching |
| `ffanalytics_last_sync` | TIMESTAMP WITH TIME ZONE | Last successful sync timestamp |
| `weekly_rank` | INTEGER | Current week overall fantasy ranking |
| `position_rank` | INTEGER | Current week position-specific ranking |
| `trend_score` | NUMERIC(5,2) | Performance trend score (-100 to 100) |
| `consistency_rating` | NUMERIC(3,2) | Consistency rating (0 to 1) |
| `ceiling_score` | NUMERIC(6,2) | Projected ceiling score |
| `floor_score` | NUMERIC(6,2) | Projected floor score |
| `ffanalytics_data` | JSONB | Raw ffanalytics data for additional metrics |

### 2. New Tables

#### player_analytics_history
Stores historical analytics data for each player by week and season.

Key columns:
- `player_id` - References players table
- `week` - NFL week (1-18)
- `season_year` - Season year
- `weekly_rank`, `position_rank` - Rankings for that week
- `projected_points`, `actual_points` - Point projections and actuals
- `trend_score`, `consistency_rating` - Performance metrics
- `ecr_avg`, `adp_avg`, `uncertainty` - Expert consensus and uncertainty metrics
- `raw_data` - Complete ffanalytics data in JSON format

#### team_analytics_summary
Aggregated team-level analytics calculated from individual player data.

Key columns:
- `team_id` - Team identifier
- `week`, `season_year` - Time period
- `avg_player_rank` - Average ranking of team's players
- `trending_up_players`, `trending_down_players` - Count of trending players
- `total_ceiling_score`, `total_floor_score` - Aggregated ceiling/floor scores
- `analytics_strength_score` - Overall team analytics strength score

### 3. Views

#### current_player_analytics
Shows active players with their current ffanalytics data.

#### latest_team_analytics
Shows the most recent team analytics summary for each team.

### 4. Indexes

Comprehensive indexing has been added for efficient querying:
- Player matching indexes (ffanalytics_player_id)
- Ranking indexes (weekly_rank, position_rank)
- Performance indexes (trend_score, consistency_rating)
- Time-based indexes (week, season_year combinations)
- Composite indexes for common query patterns

## Usage Instructions

### 1. Apply Migration

To apply the schema changes to your database:

```sql
-- Run the migration script
\i database/ffanalytics_schema_migration.sql
```

### 2. Test Migration

To validate the migration was successful:

```sql
-- Run the test script
\i database/test_ffanalytics_schema.sql
```

### 3. Rollback (if needed)

To remove all ffanalytics changes:

```sql
-- WARNING: This will permanently delete all ffanalytics data
\i database/ffanalytics_schema_rollback.sql
```

## Data Constraints

The schema includes several data validation constraints:

### Players Table Constraints
- `trend_score`: Must be between -100 and 100
- `consistency_rating`: Must be between 0 and 1
- `weekly_rank`, `position_rank`: Must be positive integers

### Analytics History Constraints
- `week`: Must be between 1 and 18
- `season_year`: Must be between 2020 and 2030
- `trend_score`: Must be between -100 and 100
- `consistency_rating`: Must be between 0 and 1

### Team Analytics Constraints
- `week`: Must be between 1 and 18
- `season_year`: Must be between 2020 and 2030
- `trending_up_players`, `trending_down_players`: Must be non-negative

## Performance Considerations

1. **Indexing**: All frequently queried columns have appropriate indexes
2. **Data Retention**: Consider implementing data cleanup for old analytics history
3. **JSONB Usage**: The `ffanalytics_data` and `raw_data` columns use JSONB for efficient JSON operations
4. **Unique Constraints**: Prevent duplicate analytics data for the same player/week/season

## Integration Points

This schema is designed to integrate with:

1. **Existing ESPN Data Pipeline**: Uses existing player sync mechanism
2. **Power Rankings Calculator**: Provides analytics data for enhanced calculations
3. **FFAnalytics R Package**: Stores data retrieved from R script execution
4. **Caching Layer**: Supports efficient data retrieval and caching strategies

## Monitoring and Maintenance

### Recommended Monitoring
- Track `ffanalytics_last_sync` timestamps to ensure data freshness
- Monitor table sizes, especially `player_analytics_history`
- Check for unmatched players (NULL `ffanalytics_player_id`)

### Maintenance Tasks
- Regular cleanup of old analytics history data
- Reindex tables periodically for optimal performance
- Monitor and optimize slow queries using the provided indexes

## Security Considerations

- All new tables inherit existing security policies
- JSONB columns should be validated before insertion
- Consider row-level security if needed for multi-tenant scenarios

## Troubleshooting

### Common Issues

1. **Migration Fails**: Check if all required extensions are installed (uuid-ossp)
2. **Constraint Violations**: Validate data ranges before insertion
3. **Performance Issues**: Ensure indexes are being used in query plans
4. **Foreign Key Issues**: Verify team_id references if teams table structure changes

### Debugging Queries

```sql
-- Check for unmatched players
SELECT name, position, team_abbreviation 
FROM players 
WHERE is_active = true AND ffanalytics_player_id IS NULL;

-- Check analytics data freshness
SELECT 
    COUNT(*) as total_players,
    COUNT(ffanalytics_player_id) as matched_players,
    AVG(EXTRACT(EPOCH FROM (NOW() - ffanalytics_last_sync))/3600) as avg_hours_since_sync
FROM players 
WHERE is_active = true;

-- Check analytics history data volume
SELECT 
    season_year,
    week,
    COUNT(*) as player_count
FROM player_analytics_history 
GROUP BY season_year, week 
ORDER BY season_year DESC, week DESC;
```