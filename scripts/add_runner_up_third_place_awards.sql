-- Add runner_up and third_place awards for all historical seasons
-- Based on playoff_finish field in historical_teams

-- Insert runner_up awards
INSERT INTO season_awards (season_id, franchise_id, team_id, award_category, award_type, award_name, value_label)
SELECT
    ht.season_id,
    ht.franchise_id,
    ht.id as team_id,
    'STANDARD',
    'runner_up',
    'Runner-Up',
    ht.regular_season_wins || '-' || ht.regular_season_losses
FROM historical_teams ht
WHERE ht.playoff_finish = '2nd'
  AND NOT EXISTS (
    SELECT 1 FROM season_awards sa
    WHERE sa.season_id = ht.season_id
      AND sa.franchise_id = ht.franchise_id
      AND sa.award_type = 'runner_up'
  );

-- Insert third_place awards
INSERT INTO season_awards (season_id, franchise_id, team_id, award_category, award_type, award_name, value_label)
SELECT
    ht.season_id,
    ht.franchise_id,
    ht.id as team_id,
    'STANDARD',
    'third_place',
    'Third Place',
    ht.regular_season_wins || '-' || ht.regular_season_losses
FROM historical_teams ht
WHERE ht.playoff_finish = '3rd'
  AND NOT EXISTS (
    SELECT 1 FROM season_awards sa
    WHERE sa.season_id = ht.season_id
      AND sa.franchise_id = ht.franchise_id
      AND sa.award_type = 'third_place'
  );

-- Verify the awards were added
SELECT
    hs.year,
    sa.award_type,
    lf.owner_name,
    sa.value_label
FROM season_awards sa
JOIN historical_seasons hs ON sa.season_id = hs.id
JOIN league_franchises lf ON sa.franchise_id = lf.id
WHERE sa.award_type IN ('champion', 'runner_up', 'third_place')
ORDER BY hs.year DESC,
    CASE sa.award_type
        WHEN 'champion' THEN 1
        WHEN 'runner_up' THEN 2
        WHEN 'third_place' THEN 3
    END;
