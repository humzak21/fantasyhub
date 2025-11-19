-- Find missing game in 2024 season
-- Check game count per week to identify which week is short

-- Get 2024 season ID
WITH season AS (
    SELECT id FROM historical_seasons WHERE year = 2024
)

-- Count games per week
SELECT
    week,
    COUNT(*) as game_count
FROM historical_games
WHERE season_id = (SELECT id FROM season)
GROUP BY week
ORDER BY week;

-- Expected: 7 games per week for 14 teams
-- If a week shows 6 games, that's where the missing game is

-- Also show total count
SELECT COUNT(*) as total_games
FROM historical_games
WHERE season_id = (SELECT id FROM historical_seasons WHERE year = 2024);
