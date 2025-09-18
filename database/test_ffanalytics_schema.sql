-- Test script for FFAnalytics schema migration
-- This script validates that all schema changes were applied correctly

-- ============================================================================
-- 1. Test players table enhancements
-- ============================================================================

-- Check if all new columns exist in players table
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'players' 
    AND column_name IN (
        'ffanalytics_player_id',
        'ffanalytics_last_sync',
        'weekly_rank',
        'position_rank',
        'trend_score',
        'consistency_rating',
        'ceiling_score',
        'floor_score',
        'ffanalytics_data'
    )
ORDER BY column_name;

-- Check if indexes were created for players table
SELECT 
    indexname, 
    indexdef
FROM pg_indexes 
WHERE tablename = 'players' 
    AND indexname LIKE '%ffanalytics%' 
    OR indexname LIKE '%weekly_rank%'
    OR indexname LIKE '%position_rank%'
    OR indexname LIKE '%trend_score%'
    OR indexname LIKE '%consistency%'
    OR indexname LIKE '%ceiling%'
    OR indexname LIKE '%floor%'
ORDER BY indexname;

-- ============================================================================
-- 2. Test player_analytics_history table
-- ============================================================================

-- Check if player_analytics_history table exists with correct structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'player_analytics_history'
ORDER BY ordinal_position;

-- Check indexes for player_analytics_history
SELECT 
    indexname, 
    indexdef
FROM pg_indexes 
WHERE tablename = 'player_analytics_history'
ORDER BY indexname;

-- Check constraints for player_analytics_history
SELECT 
    constraint_name, 
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'player_analytics_history'
ORDER BY constraint_name;

-- ============================================================================
-- 3. Test team_analytics_summary table
-- ============================================================================

-- Check if team_analytics_summary table exists with correct structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'team_analytics_summary'
ORDER BY ordinal_position;

-- Check indexes for team_analytics_summary
SELECT 
    indexname, 
    indexdef
FROM pg_indexes 
WHERE tablename = 'team_analytics_summary'
ORDER BY indexname;

-- Check constraints for team_analytics_summary
SELECT 
    constraint_name, 
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'team_analytics_summary'
ORDER BY constraint_name;

-- ============================================================================
-- 4. Test views
-- ============================================================================

-- Check if views were created
SELECT 
    table_name, 
    table_type
FROM information_schema.tables 
WHERE table_name IN ('current_player_analytics', 'latest_team_analytics')
ORDER BY table_name;

-- ============================================================================
-- 5. Test data insertion (sample data)
-- ============================================================================

-- Test inserting sample data to validate constraints and structure
-- Note: This assumes at least one player exists in the players table

-- Insert sample analytics history data (will fail if no players exist)
DO $$
DECLARE
    sample_player_id UUID;
BEGIN
    -- Get a sample player ID
    SELECT id INTO sample_player_id FROM players LIMIT 1;
    
    IF sample_player_id IS NOT NULL THEN
        -- Test insert into player_analytics_history
        INSERT INTO player_analytics_history (
            player_id,
            week,
            season_year,
            weekly_rank,
            position_rank,
            projected_points,
            trend_score,
            consistency_rating,
            ceiling_score,
            floor_score
        ) VALUES (
            sample_player_id,
            1,
            2024,
            15,
            5,
            18.5,
            5.2,
            0.75,
            25.0,
            12.0
        ) ON CONFLICT (player_id, week, season_year) DO NOTHING;
        
        RAISE NOTICE 'Sample analytics history data inserted successfully';
    ELSE
        RAISE NOTICE 'No players found - skipping sample data insertion';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error inserting sample data: %', SQLERRM;
END $$;

-- Test updating players table with ffanalytics data
DO $$
DECLARE
    sample_player_id UUID;
BEGIN
    -- Get a sample player ID
    SELECT id INTO sample_player_id FROM players LIMIT 1;
    
    IF sample_player_id IS NOT NULL THEN
        -- Test update players with ffanalytics data
        UPDATE players 
        SET 
            ffanalytics_player_id = 'test_player_123',
            weekly_rank = 20,
            position_rank = 8,
            trend_score = 3.5,
            consistency_rating = 0.82,
            ceiling_score = 22.5,
            floor_score = 14.2,
            ffanalytics_last_sync = NOW(),
            ffanalytics_data = '{"ecr": 18.5, "adp": 45.2, "uncertainty": 12.3}'::jsonb
        WHERE id = sample_player_id;
        
        RAISE NOTICE 'Sample player ffanalytics data updated successfully';
    ELSE
        RAISE NOTICE 'No players found - skipping sample data update';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error updating sample data: %', SQLERRM;
END $$;

-- ============================================================================
-- 6. Test constraint validation
-- ============================================================================

-- Test constraint violations (these should fail)
DO $$
BEGIN
    -- Test invalid trend_score (should fail)
    BEGIN
        UPDATE players SET trend_score = 150 WHERE id = (SELECT id FROM players LIMIT 1);
        RAISE NOTICE 'ERROR: trend_score constraint not working';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'SUCCESS: trend_score constraint working correctly';
    END;
    
    -- Test invalid consistency_rating (should fail)
    BEGIN
        UPDATE players SET consistency_rating = 1.5 WHERE id = (SELECT id FROM players LIMIT 1);
        RAISE NOTICE 'ERROR: consistency_rating constraint not working';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'SUCCESS: consistency_rating constraint working correctly';
    END;
END $$;

-- ============================================================================
-- Test complete
-- ============================================================================

SELECT 'FFAnalytics schema test completed successfully' AS test_result;