-- Fix winner_id and winner_info column types to TEXT
-- Run this in Supabase SQL Editor

-- Change winner_id from UUID to TEXT
ALTER TABLE awards_2025
ALTER COLUMN winner_id TYPE TEXT USING winner_id::TEXT;

-- Change winner_info from JSONB to TEXT
ALTER TABLE awards_2025
ALTER COLUMN winner_info TYPE TEXT USING winner_info::TEXT;

-- Verify the changes
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'awards_2025'
AND column_name IN ('winner_id', 'winner_info');
