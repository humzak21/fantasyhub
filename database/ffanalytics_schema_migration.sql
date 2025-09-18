-- FFAnalytics Integration Database Schema Migration
-- This script enhances the existing players table and creates new analytics tables
-- for ffanalytics integration as specified in the design document

-- ============================================================================
-- 1. Add ffanalytics-specific columns to existing players table
-- ============================================================================

-- Add ffanalytics integration columns to existing players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS ffanalytics_player_id VARCHAR(100);
ALTER TABLE players ADD COLUMN IF NOT EXISTS ffanalytics_last_sync TIMESTAMP WITH TIME ZONE;
ALTER TABLE players ADD COLUMN IF NOT EXISTS weekly_rank INTEGER;
ALTER TABLE players ADD COLUMN IF NOT EXISTS position_rank INTEGER;
ALTER TABLE players ADD COLUMN IF NOT EXISTS trend_score NUMERIC(5,2) DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS consistency_rating NUMERIC(3,2) DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS ceiling_score NUMERIC(6,2) DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS floor_score NUMERIC(6,2) DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS ffanalytics_data JSONB DEFAULT '{}'::jsonb;

-- Add indexes for ffanalytics queries on players table
CREATE INDEX IF NOT EXISTS idx_players_ffanalytics_id ON players(ffanalytics_player_id);
CREATE INDEX IF NOT EXISTS idx_players_weekly_rank ON players(weekly_rank);
CREATE INDEX IF NOT EXISTS idx_players_position_rank ON players(position, position_rank);
CREATE INDEX IF NOT EXISTS idx_players_trend_score ON players(trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_players_ffanalytics_sync ON players(ffanalytics_last_sync);
CREATE INDEX IF NOT EXISTS idx_players_consistency_rating ON players(consistency_rating DESC);
CREATE INDEX IF NOT EXISTS idx_players_ceiling_score ON players(ceiling_score DESC);
CREATE INDEX IF NOT EXISTS idx_players_floor_score ON players(floor_score DESC);

-- ============================================================================
-- 2. Create player_analytics_history table for historical data storage
-- ============================================================================

CREATE TABLE IF NOT EXISTS player_analytics_history (
  id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  season_year INTEGER NOT NULL,
  weekly_rank INTEGER,
  position_rank INTEGER,
  projected_points NUMERIC(6,2),
  actual_points NUMERIC(6,2),
  trend_score NUMERIC(5,2),
  consistency_rating NUMERIC(3,2),
  ceiling_score NUMERIC(6,2),
  floor_score NUMERIC(6,2),
  ecr_avg NUMERIC(6,2),
  ecr_sd NUMERIC(6,2),
  adp_avg NUMERIC(6,2),
  uncertainty NUMERIC(6,2),
  vor NUMERIC(6,2),
  tier INTEGER,
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(player_id, week, season_year)
);

-- Add indexes for player_analytics_history table
CREATE INDEX IF NOT EXISTS idx_analytics_history_player_week ON player_analytics_history(player_id, week);
CREATE INDEX IF NOT EXISTS idx_analytics_history_season ON player_analytics_history(season_year, week);
CREATE INDEX IF NOT EXISTS idx_analytics_history_player_season ON player_analytics_history(player_id, season_year);
CREATE INDEX IF NOT EXISTS idx_analytics_history_weekly_rank ON player_analytics_history(weekly_rank);
CREATE INDEX IF NOT EXISTS idx_analytics_history_position_rank ON player_analytics_history(position_rank);
CREATE INDEX IF NOT EXISTS idx_analytics_history_trend_score ON player_analytics_history(trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_history_created_at ON player_analytics_history(created_at);

-- ============================================================================
-- 3. Create team_analytics_summary table for aggregated team metrics
-- ============================================================================

-- First, check if teams table exists and get its structure
-- Note: This assumes teams table exists based on the design document references
CREATE TABLE IF NOT EXISTS team_analytics_summary (
  id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  team_id UUID NOT NULL, -- References teams(id) but using NOT NULL instead of FK for flexibility
  week INTEGER NOT NULL,
  season_year INTEGER NOT NULL,
  avg_player_rank NUMERIC(5,2),
  trending_up_players INTEGER DEFAULT 0,
  trending_down_players INTEGER DEFAULT 0,
  total_ceiling_score NUMERIC(8,2) DEFAULT 0,
  total_floor_score NUMERIC(8,2) DEFAULT 0,
  analytics_strength_score NUMERIC(6,2) DEFAULT 0,
  avg_consistency_rating NUMERIC(3,2) DEFAULT 0,
  total_projected_points NUMERIC(8,2) DEFAULT 0,
  avg_uncertainty NUMERIC(6,2) DEFAULT 0,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, week, season_year)
);

-- Add indexes for team_analytics_summary table
CREATE INDEX IF NOT EXISTS idx_team_analytics_team_week ON team_analytics_summary(team_id, week);
CREATE INDEX IF NOT EXISTS idx_team_analytics_season ON team_analytics_summary(season_year, week);
CREATE INDEX IF NOT EXISTS idx_team_analytics_team_season ON team_analytics_summary(team_id, season_year);
CREATE INDEX IF NOT EXISTS idx_team_analytics_strength_score ON team_analytics_summary(analytics_strength_score DESC);
CREATE INDEX IF NOT EXISTS idx_team_analytics_calculated_at ON team_analytics_summary(calculated_at);
CREATE INDEX IF NOT EXISTS idx_team_analytics_trending_up ON team_analytics_summary(trending_up_players DESC);
CREATE INDEX IF NOT EXISTS idx_team_analytics_trending_down ON team_analytics_summary(trending_down_players);

-- ============================================================================
-- 4. Add triggers for automatic timestamp updates
-- ============================================================================

-- Create trigger function for updating updated_at timestamp if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for automatic timestamp updates
CREATE TRIGGER update_player_analytics_history_updated_at 
    BEFORE UPDATE ON player_analytics_history 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_analytics_summary_updated_at 
    BEFORE UPDATE ON team_analytics_summary 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. Add constraints and validation
-- ============================================================================

-- Add check constraints for data validation
DO $$
BEGIN
    -- Add constraints for players table
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'players_trend_score_range') THEN
        ALTER TABLE players ADD CONSTRAINT players_trend_score_range 
            CHECK (trend_score >= -100 AND trend_score <= 100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'players_consistency_rating_range') THEN
        ALTER TABLE players ADD CONSTRAINT players_consistency_rating_range 
            CHECK (consistency_rating >= 0 AND consistency_rating <= 1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'players_weekly_rank_positive') THEN
        ALTER TABLE players ADD CONSTRAINT players_weekly_rank_positive 
            CHECK (weekly_rank > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'players_position_rank_positive') THEN
        ALTER TABLE players ADD CONSTRAINT players_position_rank_positive 
            CHECK (position_rank > 0);
    END IF;

    -- Add constraints for player_analytics_history table
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_history_week_range') THEN
        ALTER TABLE player_analytics_history ADD CONSTRAINT analytics_history_week_range 
            CHECK (week >= 1 AND week <= 18);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_history_season_range') THEN
        ALTER TABLE player_analytics_history ADD CONSTRAINT analytics_history_season_range 
            CHECK (season_year >= 2020 AND season_year <= 2030);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_history_trend_score_range') THEN
        ALTER TABLE player_analytics_history ADD CONSTRAINT analytics_history_trend_score_range 
            CHECK (trend_score >= -100 AND trend_score <= 100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_history_consistency_range') THEN
        ALTER TABLE player_analytics_history ADD CONSTRAINT analytics_history_consistency_range 
            CHECK (consistency_rating >= 0 AND consistency_rating <= 1);
    END IF;

    -- Add constraints for team_analytics_summary table
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_analytics_week_range') THEN
        ALTER TABLE team_analytics_summary ADD CONSTRAINT team_analytics_week_range 
            CHECK (week >= 1 AND week <= 18);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_analytics_season_range') THEN
        ALTER TABLE team_analytics_summary ADD CONSTRAINT team_analytics_season_range 
            CHECK (season_year >= 2020 AND season_year <= 2030);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_analytics_trending_players_positive') THEN
        ALTER TABLE team_analytics_summary ADD CONSTRAINT team_analytics_trending_players_positive 
            CHECK (trending_up_players >= 0 AND trending_down_players >= 0);
    END IF;
END $$;

-- ============================================================================
-- 6. Create views for common queries (optional but helpful)
-- ============================================================================

-- View for current week player analytics with player info
CREATE OR REPLACE VIEW current_player_analytics AS
SELECT 
    p.id,
    p.name,
    p.position,
    p.team_abbreviation,
    p.weekly_rank,
    p.position_rank,
    p.trend_score,
    p.consistency_rating,
    p.ceiling_score,
    p.floor_score,
    p.ffanalytics_player_id,
    p.ffanalytics_last_sync,
    p.season_actual_points,
    p.season_projected_points
FROM players p
WHERE p.is_active = true
    AND p.ffanalytics_player_id IS NOT NULL;

-- View for team analytics summary with latest data
CREATE OR REPLACE VIEW latest_team_analytics AS
SELECT 
    tas.*
FROM team_analytics_summary tas
INNER JOIN (
    SELECT team_id, MAX(week) as max_week, season_year
    FROM team_analytics_summary
    WHERE season_year = EXTRACT(YEAR FROM NOW())
    GROUP BY team_id, season_year
) latest ON tas.team_id = latest.team_id 
    AND tas.week = latest.max_week 
    AND tas.season_year = latest.season_year;

-- ============================================================================
-- 7. Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN players.ffanalytics_player_id IS 'Unique identifier from ffanalytics package for player matching';
COMMENT ON COLUMN players.ffanalytics_last_sync IS 'Timestamp of last successful sync with ffanalytics data';
COMMENT ON COLUMN players.weekly_rank IS 'Current week overall fantasy ranking from ffanalytics';
COMMENT ON COLUMN players.position_rank IS 'Current week position-specific ranking from ffanalytics';
COMMENT ON COLUMN players.trend_score IS 'Player performance trend score (-100 to 100, higher is better)';
COMMENT ON COLUMN players.consistency_rating IS 'Player consistency rating (0 to 1, higher is more consistent)';
COMMENT ON COLUMN players.ceiling_score IS 'Player projected ceiling score from ffanalytics';
COMMENT ON COLUMN players.floor_score IS 'Player projected floor score from ffanalytics';
COMMENT ON COLUMN players.ffanalytics_data IS 'Raw ffanalytics data in JSON format for additional metrics';

COMMENT ON TABLE player_analytics_history IS 'Historical storage of player analytics data by week and season';
COMMENT ON TABLE team_analytics_summary IS 'Aggregated team-level analytics metrics calculated from individual player data';

COMMENT ON VIEW current_player_analytics IS 'Current active players with their latest ffanalytics data';
COMMENT ON VIEW latest_team_analytics IS 'Latest team analytics summary for the current season';

-- ============================================================================
-- Migration complete
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'FFAnalytics schema migration completed successfully at %', NOW();
END $$;