-- =============================================
-- transactions_2025 Table Schema
-- For tracking current season transaction counts
-- =============================================

-- Create the transactions_2025 table
-- Links to current season's teams table instead of league_franchises
CREATE TABLE IF NOT EXISTS transactions_2025 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    owner_name TEXT NOT NULL,
    espn_team_id INTEGER,
    free_agent_adds INTEGER DEFAULT 0,
    waiver_claims INTEGER DEFAULT 0,
    trades INTEGER DEFAULT 0,
    drops INTEGER DEFAULT 0,
    faab_spent NUMERIC(10,2) DEFAULT 0,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_2025_team_id ON transactions_2025(team_id);
CREATE INDEX IF NOT EXISTS idx_transactions_2025_owner_name ON transactions_2025(owner_name);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_transactions_2025_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_transactions_2025_updated_at ON transactions_2025;
CREATE TRIGGER trigger_transactions_2025_updated_at
    BEFORE UPDATE ON transactions_2025
    FOR EACH ROW
    EXECUTE FUNCTION update_transactions_2025_updated_at();

-- RLS Policies
ALTER TABLE transactions_2025 ENABLE ROW LEVEL SECURITY;

-- Allow public read access (anyone can view transaction stats)
DROP POLICY IF EXISTS "Allow public read access to transactions_2025" ON transactions_2025;
CREATE POLICY "Allow public read access to transactions_2025"
    ON transactions_2025
    FOR SELECT
    TO public
    USING (true);

-- Allow authenticated users to insert/update (scripts use service role key)
DROP POLICY IF EXISTS "Allow authenticated write to transactions_2025" ON transactions_2025;
CREATE POLICY "Allow authenticated write to transactions_2025"
    ON transactions_2025
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON transactions_2025 TO anon;
GRANT SELECT ON transactions_2025 TO authenticated;

-- Comment on table
COMMENT ON TABLE transactions_2025 IS 'Transaction counts for the 2025 current season, updated weekly via weeklyUpdate.js';
