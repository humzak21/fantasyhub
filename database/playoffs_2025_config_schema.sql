-- Playoffs 2025 Config Table
-- Stores configuration for the playoff bracket challenge
CREATE TABLE IF NOT EXISTS public.playoffs_2025_config (
  id SERIAL PRIMARY KEY,
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  
  -- Submission deadline
  submission_deadline TIMESTAMP WITH TIME ZONE,
  
  -- Results release status
  results_released BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint: one config per season
  CONSTRAINT playoffs_2025_config_season_id_key UNIQUE (season_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_playoffs_2025_config_season_id 
  ON public.playoffs_2025_config(season_id);

-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_playoffs_2025_config_updated_at ON playoffs_2025_config;
CREATE TRIGGER update_playoffs_2025_config_updated_at
  BEFORE UPDATE ON playoffs_2025_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.playoffs_2025_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can view the config
CREATE POLICY "Anyone can view playoff config"
  ON public.playoffs_2025_config
  FOR SELECT
  USING (true);

-- Only admin can insert/update config (using auth.jwt() pattern)
CREATE POLICY "Admin can insert playoff config"
  ON public.playoffs_2025_config
  FOR INSERT
  WITH CHECK (
    (auth.jwt()->>'email') = 'humzak2001@gmail.com'
  );

CREATE POLICY "Admin can update playoff config"
  ON public.playoffs_2025_config
  FOR UPDATE
  USING (
    (auth.jwt()->>'email') = 'humzak2001@gmail.com'
  );
