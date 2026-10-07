-- Take notifications: what `20261007120000_take_notifications.sql` makes true.
--
--   * the two take topics are accepted, and nothing else is;
--   * a post, a Hell Yeah and a Hell Nah each dispatch notify-takes.yml —
--     once per statement — and an edit or a withdrawal does not;
--   * a dispatch that fails never refuses the take;
--   * notification_log claims a take event once, and every row is keyed;
--   * no member can call the dispatcher.
--
-- private.dispatch_github_workflow is replaced inside the transaction by a
-- recorder, so nothing reaches GitHub. Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

create temp table dispatches (workflow text) on commit drop;

create or replace function private.dispatch_github_workflow(p_workflow text)
returns bigint
language plpgsql
as $$
begin
  insert into pg_temp.dispatches values (p_workflow);
  return 0;
end;
$$;

insert into auth.users (id, email)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'author@example.com'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'backer@example.com');

insert into public.member_approvals (user_id, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'approved'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'approved')
on conflict (user_id) do update set status = excluded.status;

insert into public.seasons (id, year, start_date, timezone)
values ('11111111-1111-4111-8111-111111111111', 1905, date '2026-09-08', 'America/New_York');

-- ---------------------------------------------------------------------------
-- 1. Topics
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"backer@example.com"}';
set local role authenticated;

select is(
  public.save_push_subscription('https://web.push.apple.com/backer', 'key', 'secret', array['takes_new', 'takes_reactions']),
  array['takes_new', 'takes_reactions']::text[],
  'a member can ask for the take topics alone'
);

select throws_ok(
  $$ select public.save_push_subscription('https://web.push.apple.com/backer', 'key', 'secret', array['takes_everything']) $$,
  '23514',
  null,
  'an unknown take topic is refused'
);

reset role;

-- ---------------------------------------------------------------------------
-- 2. The trigger
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"author@example.com"}';
set local role authenticated;

insert into public.takes (id, season_id, body, target_type, wager)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
        'Nobody goes 14-0', 'end_of_season', '$20');

reset role;

select is(
  (select array_agg(workflow) from pg_temp.dispatches),
  array['notify-takes.yml'],
  'posting a take dispatches notify-takes.yml once'
);

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"backer@example.com"}';
set local role authenticated;

insert into public.take_participants (take_id, season_id, side)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'yeah');

reset role;

select is((select count(*)::int from pg_temp.dispatches), 2, 'a Hell Yeah dispatches it');

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"backer@example.com"}';
set local role authenticated;

delete from public.take_participants where take_id = '22222222-2222-4222-8222-222222222222';

reset role;

select is((select count(*)::int from pg_temp.dispatches), 2, 'withdrawing it does not');

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"backer@example.com"}';
set local role authenticated;

insert into public.take_participants (take_id, season_id, side)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'nah');

reset role;

select is((select count(*)::int from pg_temp.dispatches), 3, 'a Hell Nah dispatches it');

set local request.jwt.claims to
  '{"role":"authenticated","sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"author@example.com"}';
set local role authenticated;

update public.takes set body = 'Nobody goes 13-1 either'
where id = '22222222-2222-4222-8222-222222222222';

reset role;

select is((select count(*)::int from pg_temp.dispatches), 3, 'rewording a take does not');

-- A missing token, a pg_net outage: the take must still post.
create or replace function private.dispatch_github_workflow(p_workflow text)
returns bigint
language plpgsql
as $$
begin
  raise exception 'Vault secret github_actions_dispatch_token is missing; % was not dispatched', p_workflow;
end;
$$;

set local request.jwt.claims to
  '{"role":"authenticated","sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"author@example.com"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.takes (id, season_id, body, target_type)
     values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
             'Chalk all the way', 'end_of_season') $$,
  'a take posts even when the dispatch fails'
);

reset role;

select is(
  (select count(*)::int from public.take_events
   where take_id = '33333333-3333-4333-8333-333333333333' and event_type = 'posted'),
  1,
  'and its event is logged, for a manual run to pick up'
);

-- ---------------------------------------------------------------------------
-- 3. notification_log
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.notification_log (kind, season_id, take_event_id)
     select 'takes_new', season_id, id from public.take_events
     where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'posted' $$,
  'a take event is claimed by its id, with no week'
);

select throws_ok(
  $$ insert into public.notification_log (kind, season_id, take_event_id)
     select 'takes_new', season_id, id from public.take_events
     where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'posted' $$,
  '23505',
  null,
  'and only once'
);

select throws_ok(
  $$ insert into public.notification_log (kind, season_id)
     values ('takes_new', '11111111-1111-4111-8111-111111111111') $$,
  '23514',
  null,
  'a row keyed by neither a week nor an event is refused'
);

-- ---------------------------------------------------------------------------
-- 4. Nobody calls the dispatcher
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated', 'private.dispatch_take_notifications()', 'execute')
  and not has_function_privilege('anon', 'private.dispatch_take_notifications()', 'execute'),
  'members and visitors cannot execute the trigger function'
);

select * from finish();

rollback;
