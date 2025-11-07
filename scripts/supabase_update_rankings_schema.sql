-- Update power_rankings_history to make user_id nullable
-- This allows automated processes to create rankings without auth context

ALTER TABLE power_rankings_history
ALTER COLUMN user_id DROP NOT NULL;

-- Update the default to handle NULL case
ALTER TABLE power_rankings_history
ALTER COLUMN user_id SET DEFAULT NULL;

-- Drop the trigger that sets user_id automatically (optional - only if it's causing issues)
-- DROP TRIGGER IF EXISTS set_power_rankings_user_id ON power_rankings_history;
