-- Add slot column to games table for consolation bracket matchup ordering
-- Slot is used for week 15 consolation quarterfinals (0-3, where 0 = highest seeds)
-- This determines the ladder positioning for subsequent rounds

-- Add the slot column
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS slot integer NULL;

-- Add a check constraint to ensure slot is 0-3 for consolation games
ALTER TABLE public.games
ADD CONSTRAINT games_slot_range_check 
CHECK (
  slot IS NULL 
  OR (slot >= 0 AND slot <= 3)
);

-- Add a unique constraint to prevent duplicate slots for same week/season
-- Only applies to playoff_consolation_quarterfinals in week 15
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_season_week_slot_unique
ON public.games (season_id, week, slot)
WHERE type = 'playoff_consolation_quarterfinals' AND week = 15 AND slot IS NOT NULL;

-- Add an index for efficient slot lookups
CREATE INDEX IF NOT EXISTS idx_games_slot
ON public.games (slot)
WHERE slot IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.games.slot IS 
'Slot position (0-3) for consolation bracket matchups in week 15. 
Slot 0 = highest seeds, Slot 3 = lowest seeds. 
Used to determine ladder positioning in subsequent rounds.';
