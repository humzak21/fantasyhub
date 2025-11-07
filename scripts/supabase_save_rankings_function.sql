-- Function to save power rankings snapshot for a given week
-- This calculates rankings and stores them in power_rankings_history table
DROP FUNCTION IF EXISTS save_weekly_power_rankings_snapshot;
CREATE OR REPLACE FUNCTION save_weekly_power_rankings_snapshot(
  p_season_id UUID,
  p_week_number INTEGER,
  p_snapshot_type TEXT DEFAULT 'manual'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_count INTEGER := 0;
BEGIN
  -- Delete existing snapshot for this week (if any)
  DELETE FROM power_rankings_history
  WHERE season_id = p_season_id
    AND week_number = p_week_number;

  -- Insert new rankings snapshot
  -- This is a simplified version - you may need to adjust based on your actual ranking calculation logic
  WITH team_stats AS (
    SELECT
      t.id as team_id,
      t.season_id,
      COUNT(CASE WHEN (g.team1_id = t.id AND g.team1_score > g.team2_score)
                   OR (g.team2_id = t.id AND g.team2_score > g.team1_score) THEN 1 END) as wins,
      COUNT(CASE WHEN (g.team1_id = t.id AND g.team1_score < g.team2_score)
                   OR (g.team2_id = t.id AND g.team2_score < g.team1_score) THEN 1 END) as losses,
      COUNT(CASE WHEN (g.team1_id = t.id OR g.team2_id = t.id)
                  AND g.team1_score = g.team2_score
                  AND g.team1_score IS NOT NULL THEN 1 END) as ties,
      COUNT(CASE WHEN (g.team1_id = t.id OR g.team2_id = t.id)
                  AND g.team1_score IS NOT NULL THEN 1 END) as games_played,
      COALESCE(SUM(CASE WHEN g.team1_id = t.id THEN g.team1_score ELSE g.team2_score END), 0) as points_for,
      COALESCE(SUM(CASE WHEN g.team1_id = t.id THEN g.team2_score ELSE g.team1_score END), 0) as points_against
    FROM teams t
    LEFT JOIN games g ON (g.team1_id = t.id OR g.team2_id = t.id)
      AND g.season_id = t.season_id
      AND g.week < p_week_number
      AND g.team1_score IS NOT NULL
      AND g.team2_score IS NOT NULL
    WHERE t.season_id = p_season_id
    GROUP BY t.id, t.season_id
  ),
  ranked_teams AS (
    SELECT
      team_id,
      wins,
      losses,
      ties,
      games_played,
      points_for,
      points_against,
      points_for - points_against as point_differential,
      CASE WHEN games_played > 0
           THEN CAST(wins AS DECIMAL) / games_played
           ELSE 0 END as win_percentage,
      -- Simple power rating based on win percentage and point differential
      (CASE WHEN games_played > 0
            THEN CAST(wins AS DECIMAL) / games_played
            ELSE 0 END * 60) +
      ((points_for - points_against) / NULLIF(games_played, 0) * 0.5) + 40 as power_rating,
      ROW_NUMBER() OVER (ORDER BY
        CASE WHEN games_played > 0
             THEN CAST(wins AS DECIMAL) / games_played
             ELSE 0 END DESC,
        (points_for - points_against) DESC,
        points_for DESC
      ) as rank
    FROM team_stats
  ),
  with_rank_change AS (
    SELECT
      rt.*,
      COALESCE(prev.rank, rt.rank) as previous_rank,
      COALESCE(prev.rank, rt.rank) - rt.rank as rank_change
    FROM ranked_teams rt
    LEFT JOIN power_rankings_history prev ON prev.team_id = rt.team_id
      AND prev.season_id = p_season_id
      AND prev.week_number = p_week_number - 1
  )
  INSERT INTO power_rankings_history (
    season_id,
    week_number,
    team_id,
    rank,
    power_rating,
    rank_change,
    previous_rank,
    wins,
    losses,
    ties,
    points_for,
    points_against,
    point_differential,
    win_percentage,
    snapshot_type,
    performance_score,
    team_strength,
    strength_of_schedule,
    momentum_score,
    consistency_score,
    injury_score,
    clutch_score,
    all_play_win_pct
  )
  SELECT
    p_season_id,
    p_week_number,
    team_id,
    rank,
    power_rating,
    rank_change,
    previous_rank,
    wins,
    losses,
    ties,
    points_for,
    points_against,
    point_differential,
    win_percentage,
    p_snapshot_type,
    0, -- performance_score (placeholder)
    0, -- team_strength (placeholder)
    0, -- strength_of_schedule (placeholder)
    0, -- momentum_score (placeholder)
    0, -- consistency_score (placeholder)
    0, -- injury_score (placeholder)
    0, -- clutch_score (placeholder)
    0  -- all_play_win_pct (placeholder)
  FROM with_rank_change;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_inserted_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION save_weekly_power_rankings_snapshot(UUID, INTEGER, TEXT) TO authenticated;
