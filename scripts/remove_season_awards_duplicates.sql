-- ============================================================================
-- REMOVE DUPLICATE SEASON AWARDS
-- ============================================================================
-- Purpose: Remove duplicate entries from season_awards table where both
--          season_id and award_type are identical
-- Author: Claude Code
-- Created: 2025-11-15
-- ============================================================================

-- This script safely removes duplicates while keeping one record for each
-- unique combination of (season_id, award_type).
-- The record with the earliest created_at timestamp will be kept.

-- Step 1: Preview duplicates before deletion (OPTIONAL - comment out if not needed)
-- Uncomment the following query to see which duplicates will be removed:
/*
WITH duplicate_awards AS (
    SELECT
        id,
        season_id,
        award_type,
        award_name,
        franchise_id,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY season_id, award_type
            ORDER BY created_at ASC, id ASC
        ) AS row_num
    FROM season_awards
)
SELECT
    season_id,
    award_type,
    award_name,
    COUNT(*) as duplicate_count
FROM duplicate_awards
WHERE row_num > 1
GROUP BY season_id, award_type, award_name
ORDER BY duplicate_count DESC;
*/

-- Step 2: Delete duplicates (keeps the oldest record for each season_id + award_type)
WITH duplicate_awards AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY season_id, award_type
            ORDER BY created_at ASC, id ASC
        ) AS row_num
    FROM season_awards
)
DELETE FROM season_awards
WHERE id IN (
    SELECT id
    FROM duplicate_awards
    WHERE row_num > 1
);

-- Step 3: Verify no duplicates remain
SELECT
    season_id,
    award_type,
    COUNT(*) as count
FROM season_awards
GROUP BY season_id, award_type
HAVING COUNT(*) > 1;

-- If the above query returns no rows, all duplicates have been successfully removed

-- Step 4: Add unique constraint to prevent future duplicates (OPTIONAL)
-- Uncomment the following line to add a unique constraint:
-- ALTER TABLE season_awards ADD CONSTRAINT unique_season_award UNIQUE (season_id, award_type);

-- ============================================================================
-- USAGE INSTRUCTIONS
-- ============================================================================
-- 1. Run this script in Supabase SQL Editor
-- 2. Review the results - the DELETE will show how many rows were removed
-- 3. Run the verification query (Step 3) to confirm no duplicates remain
-- 4. (Optional) Add the unique constraint to prevent future duplicates
-- ============================================================================
