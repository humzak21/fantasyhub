-- The rules of an autosub, which live in the database because the anon key
-- reaches PostgREST directly (20261103120000_autosubs.sql). Who may set one is
-- `franchise_accounts`, never a display name, and an admin is not an exception.
--
-- Everything is rolled back, and pg_net only sends requests that commit, so
-- nothing here reaches GitHub.

begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

-- The fixture: one active season, two franchises, an owner, an unlinked member,
-- an admin with no team, and a lineup with a game still to come.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'rival@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'admin@example.com');

update public.seasons set is_active = false where is_active;

insert into public.seasons (id, year, name, is_active, espn_season_year)
values ('00000000-0000-0000-0000-0000000000b1', 2099, 'Test', true, 2099);

insert into public.league_franchises (id, owner_name, joined_year) values
  ('00000000-0000-0000-0000-0000000000c1', 'Owner One', 2020),
  ('00000000-0000-0000-0000-0000000000c2', 'Owner Two', 2020);

insert into public.teams (id, season_id, name, owner, franchise_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'Mine', 'Owner One', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', 'Theirs', 'Owner Two', '00000000-0000-0000-0000-0000000000c2');

insert into public.member_approvals (user_id, status) values
  ('00000000-0000-0000-0000-0000000000a1', 'approved'),
  ('00000000-0000-0000-0000-0000000000a2', 'approved')
on conflict (user_id) do update set status = excluded.status;

insert into public.league_admins (user_id) values ('00000000-0000-0000-0000-0000000000a3')
on conflict (user_id) do nothing;

insert into public.franchise_accounts (user_id, franchise_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c2');

insert into public.players (id, name, position, pro_team_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Starter RB', 'RB', 1),
  ('00000000-0000-0000-0000-0000000000e2', 'Bench RB', 'RB', 2),
  ('00000000-0000-0000-0000-0000000000e3', 'Bench WR', 'WR', 3),
  ('00000000-0000-0000-0000-0000000000e4', 'Locked RB', 'RB', 4),
  ('00000000-0000-0000-0000-0000000000e5', 'Bye RB', 'RB', 5),
  ('00000000-0000-0000-0000-0000000000e6', 'Second RB', 'RB', 1),
  ('00000000-0000-0000-0000-0000000000e7', 'Spare RB', 'RB', 2);

insert into public.rosters (user_id, team_id, player_id, roster_slot) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', 'RB'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e2', 'BE'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e3', 'BE'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e4', 'BE'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e5', 'BE'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e6', 'RB'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e7', 'BE');

insert into public.nfl_schedule (season_year, week, pro_team_id, opponent_pro_team_id, is_home, game_time) values
  (2099, 1, 1, 10, true, now() + interval '3 hours'),
  (2099, 1, 2, 11, true, now() + interval '3 hours'),
  (2099, 1, 3, 12, true, now() + interval '3 hours'),
  (2099, 1, 4, 13, true, now() - interval '1 minute');
insert into public.nfl_schedule (season_year, week, pro_team_id) values (2099, 1, 5);

set local request.jwt.claims to
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1"}';
set local role authenticated;

select lives_ok(
  $$ select public.set_autosub('00000000-0000-0000-0000-0000000000d1', 1,
       '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2') $$,
  'an owner can set an autosub on their own team'
);

select is(
  (select count(*)::int from public.autosubs),
  1,
  'and reads it back'
);

select is(
  (select slot from public.autosubs),
  'RB',
  'with the starter''s slot from the stored lineup'
);

select lives_ok(
  $$ select public.set_autosub('00000000-0000-0000-0000-0000000000d1', 1,
       '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2') $$,
  'setting the same starter again points it, rather than failing'
);

-- The weekly limit, set here as an admin's write would be.
reset role;
update public.seasons set autosub_weekly_limit = 1
where id = '00000000-0000-0000-0000-0000000000b1';
set local role authenticated;

select throws_ok(
  $$ select public.set_autosub('00000000-0000-0000-0000-0000000000d1', 1,
       '00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000e7') $$,
  '23514', 'You have reached the limit of 1 this week',
  'a team cannot go past the weekly limit'
);

select lives_ok(
  $$ select public.set_autosub('00000000-0000-0000-0000-0000000000d1', 1,
       '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e7') $$,
  'pointing a set autosub at somebody else does not count against it'
);

reset role;
update public.seasons set autosub_weekly_limit = 2
where id = '00000000-0000-0000-0000-0000000000b1';
set local role authenticated;

select lives_ok(
  $$ select public.set_autosub('00000000-0000-0000-0000-0000000000d1', 1,
       '00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000e2') $$,
  'raising the limit opens the next one'
);

select lives_ok(
  $$ select public.remove_autosub(
       (select id from public.autosubs where starter_player_id = '00000000-0000-0000-0000-0000000000e6')) $$,
  'and removing one frees its place'
);

select throws_ok(
  $$ select public.set_autosub('00000000-0000-0000-0000-0000000000d1', 1,
       '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3') $$,
  '23514', 'A WR cannot play at RB',
  'a receiver cannot play running back'
);

select throws_ok(
  $$ select public.set_autosub('00000000-0000-0000-0000-0000000000d1', 1,
       '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e4') $$,
  '23514', 'Your bench player''s game has already kicked off',
  'a bench player who has kicked off is refused'
);

select throws_ok(
  $$ select public.set_autosub('00000000-0000-0000-0000-0000000000d1', 1,
       '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e5') $$,
  '23514', 'Your bench player has no game this week',
  'a bench player on a bye is refused'
);

select throws_ok(
  $$ select public.set_autosub('00000000-0000-0000-0000-0000000000d1', 1,
       '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e5') $$,
  '23514', 'That player is not in your starting lineup',
  'only a starter can be covered'
);

select throws_ok(
  $$ insert into public.autosubs (season_id, week, team_id, starter_player_id, bench_player_id, slot)
     values ('00000000-0000-0000-0000-0000000000b1', 1, '00000000-0000-0000-0000-0000000000d1',
             '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3', 'RB') $$,
  '42501', NULL,
  'a member cannot write the table directly'
);

select throws_ok(
  $$ update public.autosubs set status = 'swapped', fired_at = now() $$,
  '42501', NULL,
  'a member cannot mark their own autosub fired'
);

-- Kept in a setting, because the row is invisible to the callers below and a
-- subquery would hand remove_autosub() a NULL it refuses for the wrong reason.
do $$ begin
  perform set_config('test.autosub_id', (select id::text from public.autosubs), true);
end $$;

-- Somebody else's team, somebody else's row.
reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a2"}';
set local role authenticated;

select is(
  (select count(*)::int from public.autosubs),
  0,
  'a member cannot read another team''s autosubs'
);

update public.seasons set autosub_weekly_limit = 9
where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select autosub_weekly_limit from public.seasons where id = '00000000-0000-0000-0000-0000000000b1'),
  2,
  'a member cannot change the weekly limit'
);

select throws_ok(
  $$ select public.set_autosub('00000000-0000-0000-0000-0000000000d1', 1,
       '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2') $$,
  '42501', 'You can only set autosubs on your own team',
  'and cannot set one'
);

select is(
  public.remove_autosub(current_setting('test.autosub_id')::uuid),
  false,
  'or remove one'
);

-- An admin holds no power over another manager's lineup.
reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a3"}';
set local role authenticated;

select is(
  (select count(*)::int from public.autosubs),
  0,
  'an admin with no team reads nothing'
);

select throws_ok(
  $$ select public.set_autosub('00000000-0000-0000-0000-0000000000d1', 1,
       '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2') $$,
  '42501', 'You can only set autosubs on your own team',
  'and an admin cannot set one for somebody else'
);

select lives_ok(
  $$ update public.seasons set autosub_weekly_limit = 3
     where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'an admin can set the weekly limit'
);

select is(
  (select autosub_weekly_limit from public.seasons where id = '00000000-0000-0000-0000-0000000000b1'),
  3,
  'and it lands'
);

select throws_ok(
  $$ update public.seasons set autosub_weekly_limit = 10
     where id = '00000000-0000-0000-0000-0000000000b1' $$,
  '23514', NULL,
  'but not above nine'
);

select throws_ok(
  $$ update public.seasons set autosub_weekly_limit = 0
     where id = '00000000-0000-0000-0000-0000000000b1' $$,
  '23514', NULL,
  'or below one'
);

select lives_ok(
  $$ update public.seasons set autosubs_enabled = false
     where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'an admin can turn autosubs off'
);

reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1"}';
set local role authenticated;

select throws_ok(
  $$ select public.set_autosub('00000000-0000-0000-0000-0000000000d1', 1,
       '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2') $$,
  '23514', 'Autosubs are turned off',
  'after which nobody can set one'
);

select is(
  public.remove_autosub(current_setting('test.autosub_id')::uuid),
  true,
  'though an owner can still take theirs down'
);

reset role;

-- The clock. A gate that is wrong fires nothing and fails nothing, so it gets
-- asserted from both sides, through the same queue cron_dispatch reads.
select vault.create_secret('test-token', 'github_actions_dispatch_token');

update public.seasons set autosubs_enabled = true
where id = '00000000-0000-0000-0000-0000000000b1';

insert into public.autosubs (season_id, week, team_id, starter_player_id, bench_player_id, slot)
values ('00000000-0000-0000-0000-0000000000b1', 1, '00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', 'RB');

select private.dispatch_autosub_watch();

select is(
  (select count(*)::int from net.http_request_queue where url like '%autosub-watch.yml%'),
  0,
  'three hours before kickoff the gate spends nothing'
);

update public.nfl_schedule set game_time = now() + interval '1 hour'
where season_year = 2099 and week = 1 and pro_team_id = 1;

select private.dispatch_autosub_watch();

select is(
  (select count(*)::int from net.http_request_queue where url like '%autosub-watch.yml%'),
  1,
  'inside the window it starts the watcher'
);

update public.seasons set autosubs_enabled = false
where id = '00000000-0000-0000-0000-0000000000b1';

select private.dispatch_autosub_watch();

select is(
  (select count(*)::int from net.http_request_queue where url like '%autosub-watch.yml%'),
  1,
  'with the switch off an armed autosub starts nothing'
);

update public.autosubs set status = 'manual', fired_at = now(), reason = 'writes_off';

select private.dispatch_autosub_watch();

select is(
  (select count(*)::int from net.http_request_queue where url like '%autosub-watch.yml%'),
  2,
  'but a fired autosub nobody has heard about still does'
);

select is(
  (select schedule from cron.job where jobname = 'autosub-watch'),
  '*/10 * * * *',
  'the watcher''s gate runs every ten minutes'
);

select ok(
  not has_function_privilege('anon', 'public.set_autosub(uuid, integer, uuid, uuid)', 'execute'),
  'a signed-out caller cannot set an autosub'
);

select ok(
  not has_function_privilege('authenticated', 'private.dispatch_autosub_watch()', 'execute'),
  'a browser cannot start the watcher'
);

select * from finish();

rollback;
