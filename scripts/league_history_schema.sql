-- ============================================================================
-- LEAGUE HISTORY DATABASE SCHEMA
-- ============================================================================
-- Purpose: Store historical fantasy football data (2020-2024) for league
--          history features including career stats, awards, and comparisons
-- Author: Claude Code
-- Created: 2025-11-15
-- ============================================================================

-- ============================================================================
-- 1. LEAGUE FRANCHISES (Owners across multiple seasons)
-- ============================================================================
CREATE TABLE IF NOT EXISTS league_franchises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_name TEXT NOT NULL UNIQUE, -- Stable identifier: "Humza Khalil"
    display_name TEXT, -- Can change over time
    email TEXT,
    joined_year INTEGER NOT NULL, -- First season in league
    left_year INTEGER, -- NULL if still active, set year if left (e.g., 2024 for Sai Ravva)
    is_active BOOLEAN DEFAULT true,

    -- Career aggregate stats (calculated/cached)
    total_seasons INTEGER DEFAULT 0,
    total_championships INTEGER DEFAULT 0,
    total_playoff_appearances INTEGER DEFAULT 0,
    total_regular_season_wins INTEGER DEFAULT 0,
    total_regular_season_losses INTEGER DEFAULT 0,
    total_points_for NUMERIC(10,2) DEFAULT 0,
    total_points_against NUMERIC(10,2) DEFAULT 0,
    career_win_percentage NUMERIC(5,4),

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_franchises_owner_name ON league_franchises(owner_name);
CREATE INDEX idx_franchises_active ON league_franchises(is_active);

-- ============================================================================
-- 2. HISTORICAL SEASONS (Archive of past seasons 2020-2024)
-- ============================================================================
CREATE TABLE IF NOT EXISTS historical_seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year INTEGER NOT NULL UNIQUE, -- 2020, 2021, 2022, 2023, 2024
    name TEXT NOT NULL, -- "2024 Season"
    league_size INTEGER NOT NULL DEFAULT 14,
    regular_season_weeks INTEGER NOT NULL DEFAULT 14,
    playoff_weeks INTEGER NOT NULL DEFAULT 3,

    -- League configuration
    espn_league_id TEXT,
    scoring_type TEXT, -- 'standard', 'ppr', 'half-ppr'

    -- Season-end statistics (jsonb for flexibility)
    stats JSONB DEFAULT '{}'::jsonb, -- {highest_score: 180.5, lowest_score: 45.2, etc.}
    playoff_bracket JSONB, -- Playoff structure and results

    -- Import tracking
    imported_from_espn BOOLEAN DEFAULT false,
    espn_import_date TIMESTAMPTZ,
    data_quality_notes TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_historical_seasons_year ON historical_seasons(year);

-- ============================================================================
-- 3. HISTORICAL TEAMS (Team data for each franchise per season)
-- ============================================================================
CREATE TABLE IF NOT EXISTS historical_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    franchise_id UUID NOT NULL REFERENCES league_franchises(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES historical_seasons(id) ON DELETE CASCADE,

    -- Team identity (changes each year)
    team_name TEXT NOT NULL, -- Can change: "The Juggernaut", "Championship or Bust"
    espn_team_id INTEGER, -- ESPN's team ID for that season
    division_name TEXT, -- Division assignment

    -- Regular season performance
    regular_season_wins INTEGER DEFAULT 0,
    regular_season_losses INTEGER DEFAULT 0,
    regular_season_ties INTEGER DEFAULT 0,
    regular_season_win_percentage NUMERIC(5,4),

    -- Playoff performance
    made_playoffs BOOLEAN DEFAULT false,
    playoff_seed INTEGER,
    playoff_wins INTEGER DEFAULT 0,
    playoff_losses INTEGER DEFAULT 0,
    playoff_finish TEXT, -- 'champion', '2nd', '3rd', '4th', 'semifinals', 'quarterfinals', 'none'

    -- Scoring statistics
    points_for NUMERIC(10,2) DEFAULT 0,
    points_against NUMERIC(10,2) DEFAULT 0,
    point_differential NUMERIC(10,2),
    average_points_per_game NUMERIC(8,2),

    -- Advanced metrics
    strength_of_schedule NUMERIC(5,4),
    power_rating NUMERIC(8,2),
    final_rank INTEGER, -- Final standings position

    -- Season highlights (jsonb)
    season_stats JSONB DEFAULT '{}'::jsonb, -- {highest_weekly_score: 180, blowout_wins: 3, etc.}
    draft_picks JSONB, -- Draft order and picks

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(franchise_id, season_id),
    UNIQUE(season_id, espn_team_id)
);

CREATE INDEX idx_historical_teams_franchise ON historical_teams(franchise_id);
CREATE INDEX idx_historical_teams_season ON historical_teams(season_id);
CREATE INDEX idx_historical_teams_playoffs ON historical_teams(made_playoffs);
CREATE INDEX idx_historical_teams_finish ON historical_teams(playoff_finish);

-- ============================================================================
-- 4. HISTORICAL GAMES (Matchup history for all seasons)
-- ============================================================================
CREATE TABLE IF NOT EXISTS historical_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES historical_seasons(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,

    -- Teams (using historical_teams IDs)
    team1_id UUID NOT NULL REFERENCES historical_teams(id) ON DELETE CASCADE,
    team2_id UUID NOT NULL REFERENCES historical_teams(id) ON DELETE CASCADE,

    -- Scores
    team1_score NUMERIC(10,2),
    team2_score NUMERIC(10,2),

    -- Game metadata
    type TEXT DEFAULT 'regular', -- 'regular', 'playoff', 'championship'
    is_completed BOOLEAN DEFAULT false,

    -- Results (calculated)
    winner_team_id UUID REFERENCES historical_teams(id),
    loser_team_id UUID REFERENCES historical_teams(id),
    is_tie BOOLEAN DEFAULT false,
    point_differential NUMERIC(10,2),

    -- Game characteristics
    is_blowout BOOLEAN DEFAULT false, -- Margin >= 25 points
    is_close BOOLEAN DEFAULT false, -- Margin <= 7 points
    is_upset BOOLEAN DEFAULT false, -- Lower seed beats higher seed

    -- ESPN data
    espn_matchup_id INTEGER,
    espn_scoring_period_id INTEGER,

    -- Metadata
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(season_id, week, team1_id, team2_id),
    CHECK (team1_id != team2_id)
);

CREATE INDEX idx_historical_games_season ON historical_games(season_id);
CREATE INDEX idx_historical_games_week ON historical_games(week);
CREATE INDEX idx_historical_games_team1 ON historical_games(team1_id);
CREATE INDEX idx_historical_games_team2 ON historical_games(team2_id);
CREATE INDEX idx_historical_games_type ON historical_games(type);
CREATE INDEX idx_historical_games_playoff ON historical_games(type) WHERE type IN ('playoff', 'championship');

-- ============================================================================
-- 5. HISTORICAL ROSTERS (Track waiver acquisitions, roster moves)
-- ============================================================================
CREATE TABLE IF NOT EXISTS historical_rosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES historical_teams(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES historical_seasons(id) ON DELETE CASCADE,

    -- Player info
    player_name TEXT NOT NULL,
    espn_player_id INTEGER,
    position TEXT, -- 'QB', 'RB', 'WR', 'TE', 'K', 'D/ST'
    pro_team TEXT, -- NFL team abbreviation

    -- Acquisition details
    acquisition_type TEXT, -- 'draft', 'waiver', 'trade', 'free_agent'
    acquisition_week INTEGER,
    acquisition_cost NUMERIC(10,2), -- FAAB cost if applicable
    draft_round INTEGER,
    draft_pick INTEGER,

    -- Transaction tracking
    added_date TIMESTAMPTZ,
    dropped_date TIMESTAMPTZ,
    is_keeper BOOLEAN DEFAULT false,

    -- Player performance for that season
    total_points NUMERIC(10,2),
    games_started INTEGER,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_historical_rosters_team ON historical_rosters(team_id);
CREATE INDEX idx_historical_rosters_season ON historical_rosters(season_id);
CREATE INDEX idx_historical_rosters_player ON historical_rosters(espn_player_id);
CREATE INDEX idx_historical_rosters_acquisition ON historical_rosters(acquisition_type);

-- ============================================================================
-- 6. HEAD-TO-HEAD RECORDS (All-time matchup records between franchises)
-- ============================================================================
CREATE TABLE IF NOT EXISTS head_to_head_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    franchise1_id UUID NOT NULL REFERENCES league_franchises(id) ON DELETE CASCADE,
    franchise2_id UUID NOT NULL REFERENCES league_franchises(id) ON DELETE CASCADE,

    -- All-time record (across all seasons)
    total_matchups INTEGER DEFAULT 0,
    franchise1_wins INTEGER DEFAULT 0,
    franchise2_wins INTEGER DEFAULT 0,
    ties INTEGER DEFAULT 0,

    -- Regular season vs playoff splits
    regular_season_matchups INTEGER DEFAULT 0,
    regular_season_franchise1_wins INTEGER DEFAULT 0,
    regular_season_franchise2_wins INTEGER DEFAULT 0,

    playoff_matchups INTEGER DEFAULT 0,
    playoff_franchise1_wins INTEGER DEFAULT 0,
    playoff_franchise2_wins INTEGER DEFAULT 0,

    -- Scoring statistics
    franchise1_total_points NUMERIC(12,2) DEFAULT 0,
    franchise2_total_points NUMERIC(12,2) DEFAULT 0,
    franchise1_avg_points NUMERIC(8,2),
    franchise2_avg_points NUMERIC(8,2),

    -- Notable games
    highest_scoring_game_id UUID REFERENCES historical_games(id),
    largest_margin_game_id UUID REFERENCES historical_games(id),

    -- Streaks
    current_streak_franchise_id UUID REFERENCES league_franchises(id),
    current_streak_length INTEGER DEFAULT 0,
    longest_streak_franchise_id UUID REFERENCES league_franchises(id),
    longest_streak_length INTEGER DEFAULT 0,

    -- Last updated
    last_calculated TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(franchise1_id, franchise2_id),
    CHECK (franchise1_id < franchise2_id) -- Prevent duplicates with swapped IDs
);

CREATE INDEX idx_h2h_franchise1 ON head_to_head_records(franchise1_id);
CREATE INDEX idx_h2h_franchise2 ON head_to_head_records(franchise2_id);

-- ============================================================================
-- 7. SEASON AWARDS (Track championships, achievements, honors)
-- ============================================================================
CREATE TABLE IF NOT EXISTS season_awards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES historical_seasons(id) ON DELETE CASCADE,
    franchise_id UUID NOT NULL REFERENCES league_franchises(id) ON DELETE CASCADE,
    team_id UUID REFERENCES historical_teams(id) ON DELETE SET NULL,

    -- Award details
    award_category TEXT NOT NULL, -- 'standard', 'regular_season', 'dubious', 'advanced'
    award_type TEXT NOT NULL, -- See award types below
    award_name TEXT NOT NULL, -- Display name

    -- Value for stat-based awards
    value NUMERIC(12,2),
    value_label TEXT, -- Human-readable value: "12-2 record", "1,847 points"

    -- Context
    description TEXT,
    notes TEXT,

    -- Metadata
    awarded_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Award types reference:
-- STANDARD: 'champion', 'runner_up', 'third_place', 'fourth_place'
-- REGULAR_SEASON: 'best_record', 'highest_points', 'most_blowouts', 'biggest_comeback',
--                 'best_draft', 'most_consistent', 'highest_weekly_score'
-- DUBIOUS: 'worst_record', 'lowest_points', 'most_points_against', 'biggest_blowout_loss',
--          'worst_draft', 'most_inconsistent', 'lowest_weekly_score', 'sacko'
-- ADVANCED: 'most_waiver_pickups', 'best_trade', 'highest_efficiency', 'best_playoff_run',
--           'most_bench_points', 'unluckiest_team'

CREATE INDEX idx_awards_season ON season_awards(season_id);
CREATE INDEX idx_awards_franchise ON season_awards(franchise_id);
CREATE INDEX idx_awards_category ON season_awards(award_category);
CREATE INDEX idx_awards_type ON season_awards(award_type);

-- ============================================================================
-- 8. FRANCHISE RECORDS (Record book for career/single-season achievements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS franchise_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    franchise_id UUID NOT NULL REFERENCES league_franchises(id) ON DELETE CASCADE,

    -- Record details
    record_type TEXT NOT NULL, -- See record types below
    record_category TEXT NOT NULL, -- 'single_game', 'single_season', 'career', 'streak'
    record_name TEXT NOT NULL, -- Display name

    -- Value
    value NUMERIC(12,2) NOT NULL,
    value_label TEXT, -- "180.5 points", "12 wins", "5 games"

    -- Context (when/where the record was set)
    season_id UUID REFERENCES historical_seasons(id),
    week INTEGER,
    game_id UUID REFERENCES historical_games(id),

    -- Record tracking
    set_date TIMESTAMPTZ NOT NULL,
    previous_record_value NUMERIC(12,2),
    previous_record_holder_id UUID REFERENCES league_franchises(id),
    is_current_record BOOLEAN DEFAULT true, -- False if beaten by another franchise

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Record types reference:
-- SINGLE_GAME: 'highest_score', 'lowest_score', 'largest_margin_win', 'largest_margin_loss'
-- SINGLE_SEASON: 'most_wins', 'most_losses', 'highest_points_for', 'lowest_points_for',
--                'most_points_against', 'best_draft_pick', 'most_waiver_pickups'
-- CAREER: 'most_total_wins', 'most_championships', 'most_playoff_appearances',
--         'highest_career_points', 'best_win_percentage', 'longest_tenure'
-- STREAK: 'longest_win_streak', 'longest_loss_streak', 'most_consecutive_playoffs'

CREATE INDEX idx_records_franchise ON franchise_records(franchise_id);
CREATE INDEX idx_records_type ON franchise_records(record_type);
CREATE INDEX idx_records_category ON franchise_records(record_category);
CREATE INDEX idx_records_current ON franchise_records(is_current_record);
CREATE INDEX idx_records_season ON franchise_records(season_id);

-- ============================================================================
-- 9. MATERIALIZED VIEWS (Pre-calculated aggregates for performance)
-- ============================================================================

-- View: Franchise Career Statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_franchise_career_stats AS
SELECT
    f.id AS franchise_id,
    f.owner_name,
    f.display_name,
    COUNT(DISTINCT ht.season_id) AS seasons_played,

    -- Regular season totals
    SUM(ht.regular_season_wins) AS total_wins,
    SUM(ht.regular_season_losses) AS total_losses,
    SUM(ht.regular_season_ties) AS total_ties,
    ROUND(AVG(ht.regular_season_win_percentage), 4) AS avg_win_percentage,

    -- Playoff stats
    COUNT(*) FILTER (WHERE ht.made_playoffs = true) AS playoff_appearances,
    COUNT(*) FILTER (WHERE ht.playoff_finish = 'champion') AS championships,
    COUNT(*) FILTER (WHERE ht.playoff_finish = '2nd') AS runner_ups,

    -- Scoring
    SUM(ht.points_for) AS career_points_for,
    SUM(ht.points_against) AS career_points_against,
    SUM(ht.point_differential) AS career_point_differential,
    ROUND(AVG(ht.average_points_per_game), 2) AS avg_points_per_game,

    -- Rankings
    ROUND(AVG(ht.final_rank), 2) AS avg_final_rank,
    MIN(ht.final_rank) AS best_finish,
    MAX(ht.final_rank) AS worst_finish,

    -- Last updated
    NOW() AS calculated_at
FROM league_franchises f
LEFT JOIN historical_teams ht ON f.id = ht.franchise_id
GROUP BY f.id, f.owner_name, f.display_name;

CREATE UNIQUE INDEX idx_mv_franchise_career_stats_id ON mv_franchise_career_stats(franchise_id);

-- View: Season Leaderboards
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_season_leaderboards AS
SELECT
    hs.id AS season_id,
    hs.year,

    -- Best regular season record
    (SELECT jsonb_build_object(
        'franchise_id', ht.franchise_id,
        'team_name', ht.team_name,
        'wins', ht.regular_season_wins,
        'losses', ht.regular_season_losses
    )
    FROM historical_teams ht
    WHERE ht.season_id = hs.id
    ORDER BY ht.regular_season_wins DESC, ht.points_for DESC
    LIMIT 1) AS best_record,

    -- Highest scoring team
    (SELECT jsonb_build_object(
        'franchise_id', ht.franchise_id,
        'team_name', ht.team_name,
        'points', ht.points_for
    )
    FROM historical_teams ht
    WHERE ht.season_id = hs.id
    ORDER BY ht.points_for DESC
    LIMIT 1) AS highest_scorer,

    -- Champion
    (SELECT jsonb_build_object(
        'franchise_id', ht.franchise_id,
        'team_name', ht.team_name,
        'seed', ht.playoff_seed
    )
    FROM historical_teams ht
    WHERE ht.season_id = hs.id AND ht.playoff_finish = 'champion'
    LIMIT 1) AS champion,

    NOW() AS calculated_at
FROM historical_seasons hs;

CREATE UNIQUE INDEX idx_mv_season_leaderboards_id ON mv_season_leaderboards(season_id);

-- ============================================================================
-- 10. HELPER FUNCTIONS (SQL functions for unified queries)
-- ============================================================================

-- Function: Get franchise career stats
CREATE OR REPLACE FUNCTION get_franchise_career_stats(p_franchise_id UUID)
RETURNS TABLE (
    total_seasons INTEGER,
    total_wins INTEGER,
    total_losses INTEGER,
    win_percentage NUMERIC,
    championships INTEGER,
    playoff_appearances INTEGER,
    total_points NUMERIC,
    avg_points_per_game NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT season_id)::INTEGER,
        SUM(regular_season_wins)::INTEGER,
        SUM(regular_season_losses)::INTEGER,
        ROUND(AVG(regular_season_win_percentage), 4),
        COUNT(*) FILTER (WHERE playoff_finish = 'champion')::INTEGER,
        COUNT(*) FILTER (WHERE made_playoffs = true)::INTEGER,
        SUM(points_for),
        ROUND(AVG(average_points_per_game), 2)
    FROM historical_teams
    WHERE franchise_id = p_franchise_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Get head-to-head record between two franchises
CREATE OR REPLACE FUNCTION get_h2h_record(p_franchise1_id UUID, p_franchise2_id UUID)
RETURNS TABLE (
    total_matchups INTEGER,
    franchise1_wins INTEGER,
    franchise2_wins INTEGER,
    ties INTEGER,
    franchise1_avg_points NUMERIC,
    franchise2_avg_points NUMERIC
) AS $$
DECLARE
    v_min_id UUID;
    v_max_id UUID;
BEGIN
    -- Ensure consistent ordering (franchise1_id < franchise2_id)
    IF p_franchise1_id < p_franchise2_id THEN
        v_min_id := p_franchise1_id;
        v_max_id := p_franchise2_id;
    ELSE
        v_min_id := p_franchise2_id;
        v_max_id := p_franchise1_id;
    END IF;

    RETURN QUERY
    SELECT
        h.total_matchups,
        CASE WHEN p_franchise1_id = v_min_id THEN h.franchise1_wins ELSE h.franchise2_wins END,
        CASE WHEN p_franchise1_id = v_min_id THEN h.franchise2_wins ELSE h.franchise1_wins END,
        h.ties,
        CASE WHEN p_franchise1_id = v_min_id THEN h.franchise1_avg_points ELSE h.franchise2_avg_points END,
        CASE WHEN p_franchise1_id = v_min_id THEN h.franchise2_avg_points ELSE h.franchise1_avg_points END
    FROM head_to_head_records h
    WHERE h.franchise1_id = v_min_id AND h.franchise2_id = v_max_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Get all awards for a franchise
CREATE OR REPLACE FUNCTION get_franchise_awards(p_franchise_id UUID)
RETURNS TABLE (
    year INTEGER,
    award_category TEXT,
    award_name TEXT,
    value_label TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        hs.year,
        sa.award_category,
        sa.award_name,
        sa.value_label
    FROM season_awards sa
    JOIN historical_seasons hs ON sa.season_id = hs.id
    WHERE sa.franchise_id = p_franchise_id
    ORDER BY hs.year DESC, sa.award_category, sa.award_name;
END;
$$ LANGUAGE plpgsql;

-- Function: Refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_league_history_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_franchise_career_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_season_leaderboards;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE league_franchises ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE head_to_head_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE franchise_records ENABLE ROW LEVEL SECURITY;

-- Public read access for all tables (league history is public)
CREATE POLICY "Public read access" ON league_franchises FOR SELECT USING (true);
CREATE POLICY "Public read access" ON historical_seasons FOR SELECT USING (true);
CREATE POLICY "Public read access" ON historical_teams FOR SELECT USING (true);
CREATE POLICY "Public read access" ON historical_games FOR SELECT USING (true);
CREATE POLICY "Public read access" ON historical_rosters FOR SELECT USING (true);
CREATE POLICY "Public read access" ON head_to_head_records FOR SELECT USING (true);
CREATE POLICY "Public read access" ON season_awards FOR SELECT USING (true);
CREATE POLICY "Public read access" ON franchise_records FOR SELECT USING (true);

-- Admin write access (only authenticated admin user can modify)
-- Note: Assumes you have a way to identify admin users (e.g., users.is_admin flag)
-- Adjust the policy based on your auth setup

CREATE POLICY "Admin write access" ON league_franchises
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'is_admin' = 'true'
        )
    );

CREATE POLICY "Admin write access" ON historical_seasons
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'is_admin' = 'true'
        )
    );

CREATE POLICY "Admin write access" ON historical_teams
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'is_admin' = 'true'
        )
    );

CREATE POLICY "Admin write access" ON historical_games
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'is_admin' = 'true'
        )
    );

CREATE POLICY "Admin write access" ON historical_rosters
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'is_admin' = 'true'
        )
    );

CREATE POLICY "Admin write access" ON head_to_head_records
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'is_admin' = 'true'
        )
    );

CREATE POLICY "Admin write access" ON season_awards
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'is_admin' = 'true'
        )
    );

CREATE POLICY "Admin write access" ON franchise_records
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'is_admin' = 'true'
        )
    );

-- ============================================================================
-- 12. TRIGGERS (Auto-update timestamps)
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to relevant tables
CREATE TRIGGER update_league_franchises_updated_at
    BEFORE UPDATE ON league_franchises
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_historical_seasons_updated_at
    BEFORE UPDATE ON historical_seasons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_historical_teams_updated_at
    BEFORE UPDATE ON historical_teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS (Documentation for future reference)
-- ============================================================================

COMMENT ON TABLE league_franchises IS 'Tracks fantasy football owners/franchises across multiple seasons. Owner names are the stable identifier.';
COMMENT ON TABLE historical_seasons IS 'Archive of past fantasy seasons (2020-2024) separate from current live season.';
COMMENT ON TABLE historical_teams IS 'Team data for each franchise per season. Links franchises to their season-specific performance.';
COMMENT ON TABLE historical_games IS 'Complete matchup history for all archived seasons.';
COMMENT ON TABLE historical_rosters IS 'Tracks roster moves, waiver acquisitions, draft picks across all seasons.';
COMMENT ON TABLE head_to_head_records IS 'All-time head-to-head records between franchises across all seasons.';
COMMENT ON TABLE season_awards IS 'Championships, achievements, and honors awarded each season (standard, regular season, dubious, advanced).';
COMMENT ON TABLE franchise_records IS 'Record book tracking single-game, single-season, career, and streak records for franchises.';

COMMENT ON MATERIALIZED VIEW mv_franchise_career_stats IS 'Pre-calculated career statistics for each franchise. Refresh with refresh_league_history_views().';
COMMENT ON MATERIALIZED VIEW mv_season_leaderboards IS 'Pre-calculated leaderboards for each historical season. Refresh with refresh_league_history_views().';

COMMENT ON FUNCTION get_franchise_career_stats IS 'Returns career statistics for a specific franchise across all seasons.';
COMMENT ON FUNCTION get_h2h_record IS 'Returns head-to-head record between two franchises across all seasons.';
COMMENT ON FUNCTION get_franchise_awards IS 'Returns all awards won by a franchise, ordered by year.';
COMMENT ON FUNCTION refresh_league_history_views IS 'Refreshes all materialized views. Run after importing historical data or updating stats.';

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

-- To run this schema in Supabase:
-- 1. Copy this entire file
-- 2. Go to Supabase Dashboard > SQL Editor
-- 3. Create a new query and paste the contents
-- 4. Execute the query
-- 5. Verify all tables were created successfully

-- To verify installation:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name LIKE '%franchise%' OR table_name LIKE '%historical%';
