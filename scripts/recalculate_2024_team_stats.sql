-- Recalculate 2024 team stats from historical_games
-- This updates historical_teams with correct wins/losses/points based on game results

WITH season AS (
    SELECT id FROM historical_seasons WHERE year = 2024
),
team_stats AS (
    SELECT
        team_id,
        SUM(wins) as total_wins,
        SUM(losses) as total_losses,
        SUM(points_for) as total_points_for,
        SUM(points_against) as total_points_against
    FROM (
        -- Games as team1
        SELECT
            team1_id as team_id,
            CASE WHEN winner_team_id = team1_id THEN 1 ELSE 0 END as wins,
            CASE WHEN loser_team_id = team1_id THEN 1 ELSE 0 END as losses,
            team1_score as points_for,
            team2_score as points_against
        FROM historical_games
        WHERE season_id = (SELECT id FROM season)
          AND type = 'regular'
          AND is_completed = true

        UNION ALL

        -- Games as team2
        SELECT
            team2_id as team_id,
            CASE WHEN winner_team_id = team2_id THEN 1 ELSE 0 END as wins,
            CASE WHEN loser_team_id = team2_id THEN 1 ELSE 0 END as losses,
            team2_score as points_for,
            team1_score as points_against
        FROM historical_games
        WHERE season_id = (SELECT id FROM season)
          AND type = 'regular'
          AND is_completed = true
    ) game_results
    GROUP BY team_id
)

UPDATE historical_teams ht
SET
    regular_season_wins = ts.total_wins,
    regular_season_losses = ts.total_losses,
    points_for = ts.total_points_for,
    points_against = ts.total_points_against,
    point_differential = ts.total_points_for - ts.total_points_against,
    regular_season_win_percentage = CASE
        WHEN (ts.total_wins + ts.total_losses) > 0
        THEN ts.total_wins::numeric / (ts.total_wins + ts.total_losses)
        ELSE 0
    END,
    average_points_per_game = CASE
        WHEN (ts.total_wins + ts.total_losses) > 0
        THEN ts.total_points_for / (ts.total_wins + ts.total_losses)
        ELSE 0
    END
FROM team_stats ts
WHERE ht.id = ts.team_id
  AND ht.season_id = (SELECT id FROM season);

-- Verify the update
SELECT
    lf.owner_name,
    ht.regular_season_wins,
    ht.regular_season_losses,
    ht.points_for
FROM historical_teams ht
JOIN league_franchises lf ON ht.franchise_id = lf.id
WHERE ht.season_id = (SELECT id FROM historical_seasons WHERE year = 2024)
ORDER BY ht.regular_season_wins DESC;

-- After running this, refresh the materialized view:
-- SELECT refresh_league_history_views();
