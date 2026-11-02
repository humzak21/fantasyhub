-- The deadline follows the calendar. This is the half a unit test cannot see:
-- the rule lives in `create_pick_em_week`, and every form reads what it wrote.
--
-- Everything is rolled back, and pg_net only sends requests that commit, so
-- nothing here reaches GitHub.

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- Week 1 starts Tuesday 2026-09-08, the real 2026 calendar. The season row's
-- own year keys the calendar, so a made-up year keeps it apart from real rows.
insert into public.seasons (id, year, name, is_active, start_date, timezone, espn_season_year)
values ('00000000-0000-0000-0000-00000000de01', 1907, 'Deadline test', true, '2026-09-08', 'America/New_York', 1907);

create function pg_temp.game(p_week integer, p_home integer, p_at timestamptz, p_tbd boolean default false)
returns void language sql as $$
  insert into public.nfl_schedule
    (season_year, week, pro_team_id, opponent_pro_team_id, is_home, game_time, espn_game_id, start_time_tbd)
  values (1907, p_week, p_home, p_home + 1, true, p_at, p_week * 100 + p_home, p_tbd);
$$;

create function pg_temp.closes(p_week integer)
returns timestamptz language sql as $$
  select submission_closes_at
  from public.pick_em_weeks
  where season_id = '00000000-0000-0000-0000-00000000de01' and week_number = p_week;
$$;

-- Week 2: the usual Thursday 8:15 PM ET game.
select pg_temp.game(2, 1, '2026-09-18 00:15:00+00');
select public.create_pick_em_week('00000000-0000-0000-0000-00000000de01', 2);
select is(pg_temp.closes(2), '2026-09-18 00:00:00+00'::timestamptz,
  'a normal Thursday closes at the season''s 8 PM ET');

-- Week 12: Wednesday 8:00 PM ET, four games before the season's deadline.
select pg_temp.game(12, 1, '2026-11-26 01:00:00+00');
select pg_temp.game(12, 3, '2026-11-26 17:30:00+00');
select public.create_pick_em_week('00000000-0000-0000-0000-00000000de01', 12);
select is(pg_temp.closes(12), '2026-11-26 00:45:00+00'::timestamptz,
  'a Wednesday game closes picks 15 minutes before it');

-- Week 13: an afternoon game on Christmas-style Wednesday. Same rule, no special case.
select pg_temp.game(13, 1, '2026-12-02 18:00:00+00');
select public.create_pick_em_week('00000000-0000-0000-0000-00000000de01', 13);
select is(pg_temp.closes(13), '2026-12-02 17:45:00+00'::timestamptz,
  'so does a Wednesday afternoon one');

-- Week 15: Saturday and later only. The season's time still comes first.
select pg_temp.game(15, 1, '2026-12-19 21:30:00+00');
select public.create_pick_em_week('00000000-0000-0000-0000-00000000de01', 15);
select is(pg_temp.closes(15), '2026-12-18 01:00:00+00'::timestamptz,
  'a week that opens later keeps the season''s deadline');

-- Week 16: ESPN's placeholder sits before the real first game.
select pg_temp.game(16, 1, '2026-12-22 08:01:00+00', true);
select pg_temp.game(16, 3, '2026-12-25 01:15:00+00');
select public.create_pick_em_week('00000000-0000-0000-0000-00000000de01', 16);
select is(pg_temp.closes(16), '2026-12-25 01:00:00+00'::timestamptz,
  'a TBD placeholder is not a kickoff');

-- Week 3: nothing on the calendar.
select public.create_pick_em_week('00000000-0000-0000-0000-00000000de01', 3);
select is(pg_temp.closes(3), '2026-09-25 00:00:00+00'::timestamptz,
  'a week with no calendar keeps the season''s deadline');

-- Week 4: a person chose a time.
select pg_temp.game(4, 1, '2026-09-30 23:00:00+00');
select public.create_pick_em_week(
  '00000000-0000-0000-0000-00000000de01', 4, null, '2026-10-01 12:00:00+00'::timestamptz, null
);
select is(pg_temp.closes(4), '2026-10-01 12:00:00+00'::timestamptz,
  'a deadline passed in is left alone');

-- The reminder's clock, asserted from both sides, through the queue
-- cron_dispatch reads. A gate that is wrong fires nothing and fails nothing.
select vault.create_secret('test-token', 'github_actions_dispatch_token');

update public.pick_em_weeks set submission_closes_at = now() + interval '4 hours'
where season_id = '00000000-0000-0000-0000-00000000de01' and week_number = 12;
update public.pick_em_weeks set submission_closes_at = now() - interval '1 day'
where season_id = '00000000-0000-0000-0000-00000000de01' and week_number <> 12;

select private.dispatch_pickems_deadline();
select is(
  (select count(*)::int from net.http_request_queue where url like '%notify-pickems.yml%'),
  0,
  'four hours out the gate spends nothing'
);

update public.pick_em_weeks set submission_closes_at = now() + interval '2 hours 50 minutes'
where season_id = '00000000-0000-0000-0000-00000000de01' and week_number = 12;

select private.dispatch_pickems_deadline();
select is(
  (select count(*)::int from net.http_request_queue where url like '%notify-pickems.yml%'),
  1,
  'three hours out it starts the reminder, on any day of the week'
);

select is(
  (select schedule from cron.job where jobname = 'notify-pickems-deadline'),
  '*/15 * * * *',
  'the gate is asked every 15 minutes'
);

select * from finish();

rollback;
