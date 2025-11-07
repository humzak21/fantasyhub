-- Add RLS policy to allow anyone to read power rankings history
-- This matches your requirement that "anyone visiting the page" can view the data

-- Enable RLS if not already enabled
ALTER TABLE power_rankings_history ENABLE ROW LEVEL SECURITY;

-- Drop existing select policy if it exists
DROP POLICY IF EXISTS "Allow public read access to power rankings history" ON power_rankings_history;

-- Create a policy that allows anyone to read power rankings history
CREATE POLICY "Allow public read access to power rankings history"
ON power_rankings_history
FOR SELECT
TO public
USING (true);

-- Also ensure authenticated users can read
DROP POLICY IF EXISTS "Allow authenticated read access to power rankings history" ON power_rankings_history;

CREATE POLICY "Allow authenticated read access to power rankings history"
ON power_rankings_history
FOR SELECT
TO authenticated
USING (true);
