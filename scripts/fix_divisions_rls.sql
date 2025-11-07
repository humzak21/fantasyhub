-- Fix RLS policies for divisions table
-- Run this in Supabase SQL Editor if divisions aren't loading

-- Enable RLS on divisions table
ALTER TABLE divisions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow public read access to divisions" ON divisions;
DROP POLICY IF EXISTS "Allow authenticated users to read divisions" ON divisions;
DROP POLICY IF EXISTS "Allow service role full access to divisions" ON divisions;

-- Create policy to allow everyone to read divisions
CREATE POLICY "Allow public read access to divisions"
  ON divisions
  FOR SELECT
  TO public
  USING (true);

-- Create policy to allow authenticated users to manage divisions
CREATE POLICY "Allow authenticated users to manage divisions"
  ON divisions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policy for service role (full access)
CREATE POLICY "Allow service role full access to divisions"
  ON divisions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Verify policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'divisions'
ORDER BY policyname;

-- Check if divisions exist for active season
SELECT 
  s.name as season_name,
  s.year,
  s.is_active,
  d.id as division_id,
  d.name as division_name,
  d.display_order,
  COUNT(t.id) as team_count
FROM seasons s
LEFT JOIN divisions d ON d.season_id = s.id
LEFT JOIN teams t ON t.division_id = d.id
WHERE s.is_active = true
GROUP BY s.id, s.name, s.year, s.is_active, d.id, d.name, d.display_order
ORDER BY d.display_order;

