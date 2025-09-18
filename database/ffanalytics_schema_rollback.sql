-- FFAnalytics Integration Database Schema Rollback
-- This script removes all ffanalytics-related schema changes
-- Use with caution - this will permanently delete analytics data

-- ============================================================================
-- 1. Drop views
-- ============================================================================

DROP VIEW IF EXISTS current_player_analytics;
DROP VIEW IF EXISTS latest_team_analytics;

-- ============================================================================
-- 2. Drop tables (in reverse dependency order)
-- ============================================================================

DROP TABLE IF EXISTS team_analytics_summary;
DROP TABLE IF EXISTS player_analytics_history;

-- ============================================================================
-- 3. Remove ffanalytics columns from players table
-- ============================================================================

-- Drop indexes first
DROP INDEX IF EXISTS idx_players_ffanalytics_id;
DROP INDEX IF EXISTS idx_players_weekly_rank;
DROP INDEX IF EXISTS idx_players_position_rank;
DROP INDEX IF EXISTS idx_players_trend_score;
DROP INDEX IF EXISTS idx_players_ffanalytics_sync;
DROP INDEX IF EXISTS idx_players_consistency_rating;
DROP INDEX IF EXISTS idx_players_ceiling_score;
DROP INDEX IF EXISTS idx_players_floor_score;

-- Drop constraints
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_trend_score_range;
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_consistency_rating_range;
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_weekly_rank_positive;
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_position_rank_positive;

-- Drop columns
ALTER TABLE players DROP COLUMN IF EXISTS ffanalytics_player_id;
ALTER TABLE players DROP COLUMN IF EXISTS ffanalytics_last_sync;
ALTER TABLE players DROP COLUMN IF EXISTS weekly_rank;
ALTER TABLE players DROP COLUMN IF EXISTS position_rank;
ALTER TABLE players DROP COLUMN IF EXISTS trend_score;
ALTER TABLE players DROP COLUMN IF EXISTS consistency_rating;
ALTER TABLE players DROP COLUMN IF EXISTS ceiling_score;
ALTER TABLE players DROP COLUMN IF EXISTS floor_score;
ALTER TABLE players DROP COLUMN IF EXISTS ffanalytics_data;

-- ============================================================================
-- Rollback complete
-- ============================================================================

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'FFAnalytics schema rollback completed at %', NOW();
    RAISE WARNING 'All ffanalytics data has been permanently deleted';
END $$;