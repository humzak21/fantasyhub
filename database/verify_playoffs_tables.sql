-- =============================================
-- PLAYOFFS 2025 VERIFICATION
-- =============================================
-- Run this query to check if the tables exist and are properly configured
-- =============================================

-- Check if tables exist
SELECT 
  tablename,
  schemaname
FROM pg_tables 
WHERE tablename IN ('playoffs_2025', 'playoffs_2025_config')
ORDER BY tablename;

-- Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('playoffs_2025', 'playoffs_2025_config')
ORDER BY tablename, policyname;

-- If tables exist, check for any data
SELECT COUNT(*) as config_count FROM playoffs_2025_config;
SELECT COUNT(*) as picks_count FROM playoffs_2025;
