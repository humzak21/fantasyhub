-- A player's page reads two views, and each has a rule worth holding.
--
-- 20261107120000_player_profile_views.sql. Ranks are competition ranking among
-- the week's appeared rows only (a settled 0 with no stat line takes no slot and
-- gets no rank); the game join gives each line its team's score, the opponent
-- and the result, and NULL where there is no game; careers count points over
-- appeared weeks only, NULL when there are none. And a signed-out caller reads
-- both, since every table under them is public-read.
--
-- Everything is rolled back. Season 1909 week 1: Alpha (team A, franchise 1)
-- beat Bravo (team B, franchise 2) 110.50 to 98.25. Week 2 has no game row.
-- Season 1908 holds one earlier week for the WR.
--
--   week 1  RB One   A  started  20.00  breakdown        appeared
--           RB Two   B  started  20.00  breakdown        appeared  (tie)
--           WR Three A  bench    12.00  no breakdown     appeared  (non-zero)
--           QB Four  B  started   0.00  no breakdown     did not appear
--           K Five   A  bench     0.00  no breakdown     did not appear
--   week 2  RB One   B  started   8.00  breakdown        appeared  (moved team)
--           RB Two   B  started   NULL  projection only  did not appear
--           QB Four  B  started   0.00  breakdown {}     appeared  (a real 0)

begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

insert into public.seasons (id, year, name) values
  ('00000000-0000-0000-0000-00000000a909', 1909, 'Player views test'),
  ('00000000-0000-0000-0000-00000000a908', 1908, 'Player views test, earlier');

insert into public.league_franchises (id, owner_name, joined_year) values
  ('00000000-0000-0000-0000-00000000f001', 'Owner One', 1908),
  ('00000000-0000-0000-0000-00000000f002', 'Owner Two', 1908);

insert into public.teams (id, season_id, name, owner, franchise_id) values
  ('00000000-0000-0000-0000-00000000b0a1', '00000000-0000-0000-0000-00000000a909', 'Alpha', 'Owner One', '00000000-0000-0000-0000-00000000f001'),
  ('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-00000000a909', 'Bravo', 'Owner Two', '00000000-0000-0000-0000-00000000f002'),
  ('00000000-0000-0000-0000-00000000b0c1', '00000000-0000-0000-0000-00000000a908', 'Alpha Old', 'Owner One', '00000000-0000-0000-0000-00000000f001');

insert into public.players (id, espn_player_id, name, position) values
  ('00000000-0000-0000-0000-00000000e001', 90001, 'RB One', 'RB'),
  ('00000000-0000-0000-0000-00000000e002', 90002, 'RB Two', 'RB'),
  ('00000000-0000-0000-0000-00000000e003', 90003, 'WR Three', 'WR'),
  ('00000000-0000-0000-0000-00000000e004', 90004, 'QB Four', 'QB'),
  ('00000000-0000-0000-0000-00000000e005', 90005, 'K Five', 'K');

insert into public.games (season_id, week, team1_id, team2_id, team1_score, team2_score, type) values
  ('00000000-0000-0000-0000-00000000a909', 1,
   '00000000-0000-0000-0000-00000000b0a1', '00000000-0000-0000-0000-00000000b0b1',
   110.50, 98.25, 'regular');

insert into public.player_week_stats
  (id, season_id, week, team_id, player_id, espn_player_id, roster_slot, started, position,
   actual_points, projected_points, stat_breakdown)
values
  ('00000000-0000-0000-0000-0000000c0101', '00000000-0000-0000-0000-00000000a909', 1,
   '00000000-0000-0000-0000-00000000b0a1', '00000000-0000-0000-0000-00000000e001', 90001,
   'RB', true, 'RB', 20.00, 14.00, '{"24": 120, "25": 1}'),
  ('00000000-0000-0000-0000-0000000c0102', '00000000-0000-0000-0000-00000000a909', 1,
   '00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-00000000e002', 90002,
   'RB', true, 'RB', 20.00, 12.00, '{"24": 80, "25": 2}'),
  ('00000000-0000-0000-0000-0000000c0103', '00000000-0000-0000-0000-00000000a909', 1,
   '00000000-0000-0000-0000-00000000b0a1', '00000000-0000-0000-0000-00000000e003', 90003,
   'BE', false, 'WR', 12.00, 10.00, null),
  ('00000000-0000-0000-0000-0000000c0104', '00000000-0000-0000-0000-00000000a909', 1,
   '00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-00000000e004', 90004,
   'QB', true, 'QB', 0.00, 18.00, null),
  ('00000000-0000-0000-0000-0000000c0105', '00000000-0000-0000-0000-00000000a909', 1,
   '00000000-0000-0000-0000-00000000b0a1', '00000000-0000-0000-0000-00000000e005', 90005,
   'BE', false, 'K', 0.00, 8.00, null),
  ('00000000-0000-0000-0000-0000000c0201', '00000000-0000-0000-0000-00000000a909', 2,
   '00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-00000000e001', 90001,
   'RB', true, 'RB', 8.00, 13.00, '{"24": 40}'),
  ('00000000-0000-0000-0000-0000000c0202', '00000000-0000-0000-0000-00000000a909', 2,
   '00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-00000000e002', 90002,
   'RB', true, 'RB', null, 15.00, null),
  ('00000000-0000-0000-0000-0000000c0204', '00000000-0000-0000-0000-00000000a909', 2,
   '00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-00000000e004', 90004,
   'QB', true, 'QB', 0.00, 17.00, '{}'),
  ('00000000-0000-0000-0000-0000000c0803', '00000000-0000-0000-0000-00000000a908', 1,
   '00000000-0000-0000-0000-00000000b0c1', '00000000-0000-0000-0000-00000000e003', 90003,
   'WR', true, 'WR', 9.00, 9.00, '{"42": 50}');

select has_view('public', 'v_player_week_lines', 'v_player_week_lines exists');
select has_view('public', 'v_player_careers', 'v_player_careers exists');

-- ---------------------------------------------------------------------------
-- 1. appeared, and the ranks among appeared rows only
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(appeared order by id) from public.v_player_week_lines
    where season_id = '00000000-0000-0000-0000-00000000a909'),
  array[true, true, true, false, false, true, false, true],
  'appeared: a result, non-zero or with a stat line');

select is(
  (select array_agg(overall_rank order by id) from public.v_player_week_lines
    where season_id = '00000000-0000-0000-0000-00000000a909' and week = 1),
  array[1, 1, 3, null, null]::integer[],
  'a tie on points is competition ranking (1, 1, 3), and a row that did not appear has no rank');

select is(
  (select array_agg(distinct overall_of) from public.v_player_week_lines
    where season_id = '00000000-0000-0000-0000-00000000a909' and week = 1 and appeared),
  array[3], 'the week''s pool is the three appeared rows, not all five');

select is(
  (select overall_of from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0104'),
  null::integer, 'a row that did not appear has no pool size either');

select is(
  (select array_agg(position_rank || '/' || position_of order by id) from public.v_player_week_lines
    where season_id = '00000000-0000-0000-0000-00000000a909' and week = 1 and appeared),
  array['1/2', '1/2', '1/1'], 'position ranks partition by position');

select is(
  (select position_rank from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0105'),
  null::integer, 'the settled 0 with no stat line has no position rank');

select is(
  (select overall_rank || '/' || overall_of from public.v_player_week_lines
    where id = '00000000-0000-0000-0000-0000000c0204'),
  '2/2', 'a 0 with a stat line is a real 0, ranked below the 8');

select is(
  (select overall_rank || '/' || overall_of from public.v_player_week_lines
    where id = '00000000-0000-0000-0000-0000000c0803'),
  '1/1', 'ranks are per season and week: the 1908 week is its own pool');

-- ---------------------------------------------------------------------------
-- 2. The rest of the line: year, franchise, the game
-- ---------------------------------------------------------------------------

select is(
  (select year from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0803'),
  1908, 'year comes from the season');

select is(
  (select franchise_id from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0102'),
  '00000000-0000-0000-0000-00000000f002'::uuid, 'franchise comes from the team that held him');

select isnt(
  (select game_id from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0101'),
  null::uuid, 'a week with a game row has its game');

select is(
  (select game_type from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0101'),
  'regular', 'and its type');

select is(
  (select team_score from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0101'),
  110.50::numeric, 'team1''s player gets team1''s score');

select is(
  (select opponent_score from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0101'),
  98.25::numeric, 'and the opponent''s');

select is(
  (select opponent_team_id from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0101'),
  '00000000-0000-0000-0000-00000000b0b1'::uuid, 'the opponent is the other side');

select is(
  (select opponent_franchise_id from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0101'),
  '00000000-0000-0000-0000-00000000f002'::uuid, 'the opponent''s franchise');

select is(
  (select result from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0101'),
  'W', 'the winning side reads W');

select is(
  (select is_bye from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0101'),
  false, 'a played game is not a bye');

select is(
  (select team_score || ' ' || opponent_score || ' ' || result
     from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0102'),
  '98.25 110.50 L', 'team2''s player gets team2''s side of the same game');

select is(
  (select opponent_franchise_id from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0102'),
  '00000000-0000-0000-0000-00000000f001'::uuid, 'and Alpha''s franchise as the opponent');

select is(
  (select result from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0103'),
  'W', 'a bench player''s line carries his team''s result too');

select ok(
  (select game_id is null and team_score is null and opponent_score is null
          and opponent_team_id is null and result is null and is_bye is null
     from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0201'),
  'no game row is unknown: every game column NULL, is_bye included');

-- ---------------------------------------------------------------------------
-- 3. Careers
-- ---------------------------------------------------------------------------

select is(
  (select weeks_rostered || ' ' || weeks_started || ' ' || games_played || ' ' || started_games
     from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e001'),
  '2 2 2 2', 'RB One: rostered, started, played and started-and-played');

select is(
  (select points_per_game from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e001'),
  14::numeric, 'points per game over appeared weeks');

select is(
  (select total_points || ' ' || best_points || ' ' || worst_points
     from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e001'),
  '28.00 20.00 8.00', 'total, best and worst');

select is(
  (select points_stddev from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e001'),
  6::numeric, 'population standard deviation');

select is(
  (select franchises from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e001'),
  2, 'two franchises held him');

select is(
  (select last_team_id from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e001'),
  '00000000-0000-0000-0000-00000000b0b1'::uuid, 'his last team is his newest line''s');

select is(
  (select games_played || ' ' || weeks_rostered || ' ' || weeks_started
     from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e002'),
  '1 2 2', 'a projection-only week is rostered and started, but not a game');

select is(
  (select points_per_game from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e002'),
  20::numeric, 'and does not drag the average');

select ok(
  (select games_played = 1 and points_per_game = 0 and best_points = 0
     from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e004'),
  'QB Four: the settled 0 is no game, the 0 with a stat line is one');

select is(
  (select seasons_played || ' ' || first_year || ' ' || last_year
     from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e003'),
  '2 1908 1909', 'WR Three: two seasons, first and last year');

select is(
  (select last_team_id from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e003'),
  '00000000-0000-0000-0000-00000000b0a1'::uuid, 'last team is from the newest year, not the newest insert');

select is(
  (select started_points || ' ' || bench_points
     from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e003'),
  '9.00 12.00', 'started and bench points split over appeared weeks');

select ok(
  (select games_played = 0 and points_per_game is null and total_points is null
          and best_points is null and started_points is null and bench_points is null
     from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e005'),
  'K Five never appeared: his points are unknown, not 0');

select is(
  (select count(*)::integer from public.v_player_careers
    where player_id::text like '00000000-0000-0000-0000-00000000e00%'),
  5, 'one career row per player ever rostered');

-- ---------------------------------------------------------------------------
-- 4. A signed-out caller reads both
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"role":"anon"}';
set local role anon;

select is(
  (select count(*)::integer from public.v_player_week_lines
    where season_id in ('00000000-0000-0000-0000-00000000a909', '00000000-0000-0000-0000-00000000a908')),
  9, 'anon reads every week line');

select is(
  (select overall_rank from public.v_player_week_lines where id = '00000000-0000-0000-0000-0000000c0103'),
  3, 'with its ranks');

select is(
  (select points_per_game from public.v_player_careers where player_id = '00000000-0000-0000-0000-00000000e001'),
  14::numeric, 'and the careers');

reset role;

select * from finish();

rollback;
