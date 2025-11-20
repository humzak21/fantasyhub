-- ============================================================================
-- TEAM TRANSACTIONS DATABASE SCHEMA
-- ============================================================================
-- Purpose: Store historical transaction data (waivers, trades, FA pickups, drops)
--          for each team per season from ESPN Fantasy Football API
-- Author: Claude Code
-- Created: 2025-11-19
-- ============================================================================

-- ============================================================================
-- 1. TEAM TRANSACTIONS (Aggregate transaction counts per team per season)
-- ============================================================================
CREATE TABLE IF NOT EXISTS team_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    franchise_id UUID NOT NULL REFERENCES league_franchises(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES historical_seasons(id) ON DELETE CASCADE,

    -- Team identity
    owner_name TEXT NOT NULL, -- Stable identifier for lookups
    espn_team_id INTEGER,

    -- Transaction counts by type
    free_agent_adds INTEGER DEFAULT 0, -- FREEAGENT type
    waiver_claims INTEGER DEFAULT 0, -- WAIVER type
    trades INTEGER DEFAULT 0, -- TRADE_ACCEPT type
    drops INTEGER DEFAULT 0, -- DROP type

    -- Aggregate totals
    total_transactions INTEGER DEFAULT 0, -- Sum of all transaction types

    -- FAAB (Free Agent Acquisition Budget) if applicable
    faab_spent NUMERIC(10,2) DEFAULT 0, -- Total FAAB spent on waivers

    -- Metadata
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(franchise_id, season_id)
);

-- Indexes for common queries
CREATE INDEX idx_team_transactions_franchise ON team_transactions(franchise_id);
CREATE INDEX idx_team_transactions_season ON team_transactions(season_id);
CREATE INDEX idx_team_transactions_owner ON team_transactions(owner_name);
CREATE INDEX idx_team_transactions_total ON team_transactions(total_transactions DESC);

-- ============================================================================
-- 2. HELPER FUNCTION: Get all-time transaction totals per franchise
-- ============================================================================
CREATE OR REPLACE FUNCTION get_franchise_transaction_totals()
RETURNS TABLE (
    franchise_id UUID,
    owner_name TEXT,
    total_free_agent_adds INTEGER,
    total_waiver_claims INTEGER,
    total_trades INTEGER,
    total_drops INTEGER,
    total_all_transactions INTEGER,
    total_faab_spent NUMERIC,
    seasons_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        tt.franchise_id,
        tt.owner_name,
        SUM(tt.free_agent_adds)::INTEGER,
        SUM(tt.waiver_claims)::INTEGER,
        SUM(tt.trades)::INTEGER,
        SUM(tt.drops)::INTEGER,
        SUM(tt.total_transactions)::INTEGER,
        SUM(tt.faab_spent),
        COUNT(*)::INTEGER
    FROM team_transactions tt
    GROUP BY tt.franchise_id, tt.owner_name
    ORDER BY SUM(tt.total_transactions) DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. HELPER FUNCTION: Get transaction history for a specific franchise
-- ============================================================================
CREATE OR REPLACE FUNCTION get_franchise_transaction_history(p_franchise_id UUID)
RETURNS TABLE (
    year INTEGER,
    free_agent_adds INTEGER,
    waiver_claims INTEGER,
    trades INTEGER,
    drops INTEGER,
    total_transactions INTEGER,
    faab_spent NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        hs.year,
        tt.free_agent_adds,
        tt.waiver_claims,
        tt.trades,
        tt.drops,
        tt.total_transactions,
        tt.faab_spent
    FROM team_transactions tt
    JOIN historical_seasons hs ON tt.season_id = hs.id
    WHERE tt.franchise_id = p_franchise_id
    ORDER BY hs.year ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. MATERIALIZED VIEW: Transaction leaderboards
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_transaction_leaderboards AS
SELECT
    tt.franchise_id,
    lf.owner_name,
    lf.display_name,

    -- All-time totals
    SUM(tt.free_agent_adds) AS total_free_agent_adds,
    SUM(tt.waiver_claims) AS total_waiver_claims,
    SUM(tt.trades) AS total_trades,
    SUM(tt.drops) AS total_drops,
    SUM(tt.total_transactions) AS total_all_transactions,
    SUM(tt.faab_spent) AS total_faab_spent,

    -- Averages per season
    ROUND(AVG(tt.total_transactions), 1) AS avg_transactions_per_season,
    ROUND(AVG(tt.waiver_claims), 1) AS avg_waivers_per_season,

    -- Activity metrics
    COUNT(tt.season_id) AS seasons_tracked,
    MAX(tt.total_transactions) AS most_active_season_transactions,
    MIN(tt.total_transactions) AS least_active_season_transactions,

    NOW() AS calculated_at
FROM team_transactions tt
JOIN league_franchises lf ON tt.franchise_id = lf.id
GROUP BY tt.franchise_id, lf.owner_name, lf.display_name;

CREATE UNIQUE INDEX idx_mv_transaction_leaderboards_id ON mv_transaction_leaderboards(franchise_id);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on table
ALTER TABLE team_transactions ENABLE ROW LEVEL SECURITY;

-- Public read access (transaction history is public)
CREATE POLICY "Public read access" ON team_transactions FOR SELECT USING (true);

-- Admin write access (only authenticated admin user can modify)
CREATE POLICY "Admin write access" ON team_transactions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id
            AND raw_user_meta_data->>'is_admin' = 'true'
        )
    );

-- ============================================================================
-- 6. TRIGGERS (Auto-update timestamps and totals)
-- ============================================================================

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_team_transactions_updated_at
    BEFORE UPDATE ON team_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to auto-calculate total_transactions
CREATE OR REPLACE FUNCTION calculate_total_transactions()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_transactions := NEW.free_agent_adds + NEW.waiver_claims + NEW.trades + NEW.drops;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate totals
CREATE TRIGGER calculate_team_transaction_totals
    BEFORE INSERT OR UPDATE ON team_transactions
    FOR EACH ROW EXECUTE FUNCTION calculate_total_transactions();

-- ============================================================================
-- 7. FUNCTION: Refresh transaction materialized view
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_transaction_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_transaction_leaderboards;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE team_transactions IS 'Tracks aggregate transaction counts (waivers, trades, FA pickups, drops) per team per season from ESPN API.';
COMMENT ON COLUMN team_transactions.free_agent_adds IS 'Number of free agent acquisitions (FREEAGENT type from ESPN)';
COMMENT ON COLUMN team_transactions.waiver_claims IS 'Number of waiver claims (WAIVER type from ESPN)';
COMMENT ON COLUMN team_transactions.trades IS 'Number of completed trades (TRADE_ACCEPT type from ESPN)';
COMMENT ON COLUMN team_transactions.drops IS 'Number of player drops (DROP type from ESPN)';
COMMENT ON COLUMN team_transactions.faab_spent IS 'Total Free Agent Acquisition Budget spent on waiver claims';

COMMENT ON MATERIALIZED VIEW mv_transaction_leaderboards IS 'Pre-calculated all-time transaction statistics per franchise. Refresh with refresh_transaction_views().';

COMMENT ON FUNCTION get_franchise_transaction_totals IS 'Returns all-time transaction totals for all franchises, sorted by most active.';
COMMENT ON FUNCTION get_franchise_transaction_history IS 'Returns season-by-season transaction breakdown for a specific franchise.';

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

-- To run this schema in Supabase:
-- 1. Copy this entire file
-- 2. Go to Supabase Dashboard > SQL Editor
-- 3. Create a new query and paste the contents
-- 4. Execute the query
-- 5. Verify table was created: SELECT * FROM team_transactions LIMIT 1;

-- To refresh the materialized view after importing data:
-- SELECT refresh_transaction_views();
