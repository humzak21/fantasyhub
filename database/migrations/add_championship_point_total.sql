-- =============================================
-- MIGRATION: Add championship_point_total column
-- =============================================
-- This migration adds support for championship combined point total predictions
-- Run this after the initial playoffs_2025_schema.sql has been applied

-- Add championship_point_total column to existing table
ALTER TABLE public.playoffs_2025
ADD COLUMN IF NOT EXISTS championship_point_total float8 null;

COMMENT ON COLUMN public.playoffs_2025.championship_point_total IS 'Championship combined point total prediction (3 bonus points for closest prediction)';

-- Drop old function versions to avoid conflicts
DROP FUNCTION IF EXISTS submit_playoff_picks(uuid, jsonb);
DROP FUNCTION IF EXISTS submit_playoff_picks(uuid, jsonb, integer);

-- Update the submit_playoff_picks function to handle championship point total
CREATE OR REPLACE FUNCTION submit_playoff_picks(
  p_season_id uuid,
  p_picks jsonb, -- Array of {matchup_id, predicted_winner_team_id, game_id?, championship_point_total?}
  p_championship_point_total float8 default null
)
RETURNS jsonb AS $$
DECLARE
  pick_record jsonb;
  deadline timestamptz;
  result_count int := 0;
BEGIN
  -- Check deadline
  SELECT submission_deadline INTO deadline
  FROM playoffs_2025_config
  WHERE season_id = p_season_id;

  IF deadline IS NULL THEN
    deadline := '2025-12-12 20:15:00-05'::timestamptz;
  END IF;

  IF now() > deadline THEN
    RAISE EXCEPTION 'Submission deadline has passed';
  END IF;

  -- Upsert each pick
  FOR pick_record IN SELECT * FROM jsonb_array_elements(p_picks)
  LOOP
    INSERT INTO playoffs_2025 (
      user_id,
      season_id,
      matchup_id,
      game_id,
      predicted_winner_team_id,
      championship_point_total
    )
    VALUES (
      auth.uid(),
      p_season_id,
      pick_record->>'matchup_id',
      (pick_record->>'game_id')::uuid,
      (pick_record->>'predicted_winner_team_id')::uuid,
      -- Only store championship_point_total for the championship matchup
      CASE
        WHEN pick_record->>'matchup_id' = 'championship'
        THEN COALESCE((pick_record->>'championship_point_total')::float8, p_championship_point_total)
        ELSE null
      END
    )
    ON CONFLICT (user_id, matchup_id)
    DO UPDATE SET
      predicted_winner_team_id = EXCLUDED.predicted_winner_team_id,
      game_id = EXCLUDED.game_id,
      championship_point_total = EXCLUDED.championship_point_total,
      updated_at = now();

    result_count := result_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'picks_submitted', result_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions (if needed)
-- GRANT EXECUTE ON FUNCTION submit_playoff_picks TO authenticated;
