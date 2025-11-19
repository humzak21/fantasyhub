-- Fix Week 1 2024 Games
-- Updates 7 games with correct scores and calculated fields

-- Matchup 1: Humza Khalil vs Nikhil Sharma (103.76 - 107.28, Nikhil won)
UPDATE historical_games
SET
    team1_id = '88739bbb-16d0-4dab-b4dd-54a1f200ddbb',
    team2_id = '04998c4a-49bb-4097-aa99-c5adfe55a2d3',
    team1_score = 103.76,
    team2_score = 107.28,
    winner_team_id = '04998c4a-49bb-4097-aa99-c5adfe55a2d3',
    loser_team_id = '88739bbb-16d0-4dab-b4dd-54a1f200ddbb',
    point_differential = 3.52,
    is_blowout = false,
    is_close = true,
    is_tie = false,
    is_completed = true
WHERE id = '9e09e5df-b205-48e8-9ad9-a1a4e6870100';

-- Matchup 2: Arya Shah vs Pranesh Anand (91.26 - 138.36, Pranesh won)
UPDATE historical_games
SET
    team1_id = '618fe057-9202-40f4-841a-c99f6aec2894',
    team2_id = '2f408a35-a469-4bf0-8246-21c07d612483',
    team1_score = 91.26,
    team2_score = 138.36,
    winner_team_id = '2f408a35-a469-4bf0-8246-21c07d612483',
    loser_team_id = '618fe057-9202-40f4-841a-c99f6aec2894',
    point_differential = 47.10,
    is_blowout = true,
    is_close = false,
    is_tie = false,
    is_completed = true
WHERE id = '8a115507-c8b0-4db1-bfe4-fa9e51110f49';

-- Matchup 3: Harshil Pareek vs Anand Kanumuru (121.42 - 129.64, Anand won)
UPDATE historical_games
SET
    team1_id = 'cbe63dee-8b27-480a-97b1-533c7d9d4940',
    team2_id = '0b08332d-992f-4391-aad2-ee25a9a56cdf',
    team1_score = 121.42,
    team2_score = 129.64,
    winner_team_id = '0b08332d-992f-4391-aad2-ee25a9a56cdf',
    loser_team_id = 'cbe63dee-8b27-480a-97b1-533c7d9d4940',
    point_differential = 8.22,
    is_blowout = false,
    is_close = false,
    is_tie = false,
    is_completed = true
WHERE id = '25b03b7f-0500-43eb-965a-1dc0cd0654ce';

-- Matchup 4: Sai Ravva vs Aaron Wadhwa (88.18 - 76.82, Sai won)
UPDATE historical_games
SET
    team1_id = 'e0486f67-4d6c-40b1-9db5-6bd5ee28c588',
    team2_id = '2e9cf5e6-6df1-4874-891f-6dea304ff5df',
    team1_score = 88.18,
    team2_score = 76.82,
    winner_team_id = 'e0486f67-4d6c-40b1-9db5-6bd5ee28c588',
    loser_team_id = '2e9cf5e6-6df1-4874-891f-6dea304ff5df',
    point_differential = 11.36,
    is_blowout = false,
    is_close = false,
    is_tie = false,
    is_completed = true
WHERE id = 'e3063377-89d2-4041-93aa-7ada12046847';

-- Matchup 5: Aashish Gatamaneni vs Aditya Penmesta (92.8 - 134.46, Aditya won)
UPDATE historical_games
SET
    team1_id = '6f579865-3ffd-47a8-853e-4788b018bbec',
    team2_id = 'a09c5586-dfe6-4538-b271-90a2d51bb013',
    team1_score = 92.80,
    team2_score = 134.46,
    winner_team_id = 'a09c5586-dfe6-4538-b271-90a2d51bb013',
    loser_team_id = '6f579865-3ffd-47a8-853e-4788b018bbec',
    point_differential = 41.66,
    is_blowout = true,
    is_close = false,
    is_tie = false,
    is_completed = true
WHERE id = 'e114c0c2-d9b4-41ea-8ab7-068146a56af3';

-- Matchup 6: Rohit Ramki vs Pranav Simha (128.34 - 117.48, Rohit won)
UPDATE historical_games
SET
    team1_id = '5923c870-aa07-4a12-a4b5-5b126b3e68a0',
    team2_id = 'b0be8350-4de3-4f75-9868-8adc900971e5',
    team1_score = 128.34,
    team2_score = 117.48,
    winner_team_id = '5923c870-aa07-4a12-a4b5-5b126b3e68a0',
    loser_team_id = 'b0be8350-4de3-4f75-9868-8adc900971e5',
    point_differential = 10.86,
    is_blowout = false,
    is_close = false,
    is_tie = false,
    is_completed = true
WHERE id = '067c3c51-e6e6-4b77-b670-56d6e870e278';

-- Matchup 7: Eshan Kaul vs Rohith Mahesh (84.52 - 118.58, Rohith won)
UPDATE historical_games
SET
    team1_id = '3d7bd34f-a0c2-4c2f-b6e1-8a83a1163f2d',
    team2_id = '1747d3c5-7c4b-409d-b55e-b2d25cc6efe3',
    team1_score = 84.52,
    team2_score = 118.58,
    winner_team_id = '1747d3c5-7c4b-409d-b55e-b2d25cc6efe3',
    loser_team_id = '3d7bd34f-a0c2-4c2f-b6e1-8a83a1163f2d',
    point_differential = 34.06,
    is_blowout = true,
    is_close = false,
    is_tie = false,
    is_completed = true
WHERE id = 'fa5d87c7-503b-402b-9c6f-47abcb9a82f0';

-- Verify the updates
SELECT id, team1_score, team2_score, point_differential, is_blowout, is_close
FROM historical_games
WHERE id IN (
    '9e09e5df-b205-48e8-9ad9-a1a4e6870100',
    '8a115507-c8b0-4db1-bfe4-fa9e51110f49',
    '25b03b7f-0500-43eb-965a-1dc0cd0654ce',
    'e3063377-89d2-4041-93aa-7ada12046847',
    'e114c0c2-d9b4-41ea-8ab7-068146a56af3',
    '067c3c51-e6e6-4b77-b670-56d6e870e278',
    'fa5d87c7-503b-402b-9c6f-47abcb9a82f0'
);
