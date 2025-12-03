-- Create awards_2025 table
CREATE TABLE IF NOT EXISTS awards_2025 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_id UUID REFERENCES seasons(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    icon TEXT, -- Lucide icon name
    category TEXT CHECK (category IN ('voted', 'non-voted')),
    winner_id TEXT, -- Can be a team_id (UUID), owner name, or any identifier
    winner_info TEXT, -- Store additional winner information as text
    voting_options JSONB, -- Array of options {teamIds: [...], customNominees: [...]}
    display_order INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create award_votes table
CREATE TABLE IF NOT EXISTS award_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    award_id UUID REFERENCES awards_2025(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    vote_value TEXT NOT NULL, -- The ID of the option voted for
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(award_id, user_id) -- One vote per award per user
);

-- Enable RLS
ALTER TABLE awards_2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE award_votes ENABLE ROW LEVEL SECURITY;

-- Create helper function to check if current user is admin
-- SECURITY DEFINER allows the function to access auth.users table
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_user_meta_data->>'isAdmin' = 'true'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing policies before recreating them
DROP POLICY IF EXISTS "Awards are viewable by everyone" ON awards_2025;
DROP POLICY IF EXISTS "Admins can manage awards" ON awards_2025;
DROP POLICY IF EXISTS "Users can view their own votes" ON award_votes;
DROP POLICY IF EXISTS "Users can vote" ON award_votes;
DROP POLICY IF EXISTS "Users can update their own votes" ON award_votes;
DROP POLICY IF EXISTS "Admins can view all votes" ON award_votes;

-- Policies for awards_2025
-- Everyone can view awards
CREATE POLICY "Awards are viewable by everyone"
ON awards_2025 FOR SELECT
USING (true);

-- Only admins can insert/update/delete awards
CREATE POLICY "Admins can manage awards"
ON awards_2025 FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Policies for award_votes
-- Users can view their own votes
CREATE POLICY "Users can view their own votes"
ON award_votes FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert/update their own votes
CREATE POLICY "Users can vote"
ON award_votes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own votes"
ON award_votes FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all votes (for results)
CREATE POLICY "Admins can view all votes"
ON award_votes FOR SELECT
USING (is_admin());

-- Create awards_metadata table to store release status and deadline
CREATE TABLE IF NOT EXISTS awards_metadata (
    season_id UUID PRIMARY KEY REFERENCES seasons(id) ON DELETE CASCADE,
    results_released BOOLEAN DEFAULT FALSE,
    deadline TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for metadata
ALTER TABLE awards_metadata ENABLE ROW LEVEL SECURITY;

-- Drop existing metadata policies before recreating them
DROP POLICY IF EXISTS "Everyone can view awards metadata" ON awards_metadata;
DROP POLICY IF EXISTS "Admins can manage awards metadata" ON awards_metadata;

-- Policies for awards_metadata
CREATE POLICY "Everyone can view awards metadata"
ON awards_metadata FOR SELECT
USING (true);

CREATE POLICY "Admins can manage awards metadata"
ON awards_metadata FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Function to check if results should be unlocked
CREATE OR REPLACE FUNCTION check_awards_unlock_status(season_id_param UUID)
RETURNS JSONB AS $$
DECLARE
    unique_voters INTEGER;
    metadata_record RECORD;
    is_released BOOLEAN := FALSE;
BEGIN
    -- Get unique voters count
    SELECT COUNT(DISTINCT user_id) INTO unique_voters
    FROM award_votes av
    JOIN awards_2025 a ON av.award_id = a.id
    WHERE a.season_id = season_id_param;

    -- Get metadata
    SELECT * INTO metadata_record FROM awards_metadata WHERE season_id = season_id_param;
    
    IF metadata_record.results_released THEN
        is_released := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'unique_voters', unique_voters,
        'required_voters', 14,
        'results_released', is_released,
        'deadline', metadata_record.deadline
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
