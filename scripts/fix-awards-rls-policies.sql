-- Fix RLS policies for awards tables
-- Uses email-based admin check matching pick_em_weeks pattern
-- Admin: humzak2001@gmail.com

-- Drop ALL existing policies for awards_2025
DROP POLICY IF EXISTS "Awards are viewable by everyone" ON awards_2025;
DROP POLICY IF EXISTS "Admins can manage awards" ON awards_2025;
DROP POLICY IF EXISTS "Admin write access" ON awards_2025;
DROP POLICY IF EXISTS "Allow admin write access to awards_2025" ON awards_2025;

-- Drop ALL existing policies for award_votes
DROP POLICY IF EXISTS "Users can view their own votes" ON award_votes;
DROP POLICY IF EXISTS "Users can vote" ON award_votes;
DROP POLICY IF EXISTS "Users can insert votes" ON award_votes;
DROP POLICY IF EXISTS "Users can update their own votes" ON award_votes;
DROP POLICY IF EXISTS "Users can update own votes" ON award_votes;
DROP POLICY IF EXISTS "Admins can view all votes" ON award_votes;
DROP POLICY IF EXISTS "Admin vote write access" ON award_votes;
DROP POLICY IF EXISTS "Votes are viewable by everyone" ON award_votes;
DROP POLICY IF EXISTS "Allow admin write access to award_votes" ON award_votes;

-- Drop ALL existing policies for awards_metadata
DROP POLICY IF EXISTS "Everyone can view awards metadata" ON awards_metadata;
DROP POLICY IF EXISTS "Admins can manage awards metadata" ON awards_metadata;
DROP POLICY IF EXISTS "Admin metadata write access" ON awards_metadata;
DROP POLICY IF EXISTS "Metadata is viewable by everyone" ON awards_metadata;
DROP POLICY IF EXISTS "Allow admin write access to awards_metadata" ON awards_metadata;

-- ============================================================================
-- AWARDS_2025 POLICIES
-- ============================================================================

-- Everyone can view awards
CREATE POLICY "Awards are viewable by everyone"
ON awards_2025 FOR SELECT
TO public
USING (true);

-- Admin write access (matches pick_em_weeks pattern)
CREATE POLICY "Allow admin write access to awards_2025"
ON awards_2025 FOR ALL
TO public
USING (
  ((auth.jwt() ->> 'email'::text) = 'humzak2001@gmail.com'::text)
);

-- ============================================================================
-- AWARD_VOTES POLICIES
-- ============================================================================

-- Everyone can view votes (for viewing results)
CREATE POLICY "Votes are viewable by everyone"
ON award_votes FOR SELECT
TO public
USING (true);

-- Users can insert their own votes
CREATE POLICY "Users can insert votes"
ON award_votes FOR INSERT
TO public
WITH CHECK (auth.uid() = user_id);

-- Users can update their own votes
CREATE POLICY "Users can update own votes"
ON award_votes FOR UPDATE
TO public
USING (auth.uid() = user_id);

-- Admin write access for votes
CREATE POLICY "Allow admin write access to award_votes"
ON award_votes FOR ALL
TO public
USING (
  ((auth.jwt() ->> 'email'::text) = 'humzak2001@gmail.com'::text)
);

-- ============================================================================
-- AWARDS_METADATA POLICIES
-- ============================================================================

-- Everyone can view metadata
CREATE POLICY "Metadata is viewable by everyone"
ON awards_metadata FOR SELECT
TO public
USING (true);

-- Admin write access for metadata
CREATE POLICY "Allow admin write access to awards_metadata"
ON awards_metadata FOR ALL
TO public
USING (
  ((auth.jwt() ->> 'email'::text) = 'humzak2001@gmail.com'::text)
);
