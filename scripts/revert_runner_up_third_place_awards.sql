-- Revert: Delete runner_up and third_place awards from season_awards
DELETE FROM season_awards
WHERE award_type IN ('runner_up', 'third_place');

-- Verify deletion
SELECT award_type, COUNT(*)
FROM season_awards
GROUP BY award_type
ORDER BY award_type;
