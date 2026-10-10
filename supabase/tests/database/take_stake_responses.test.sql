-- Hell Yeah stakes: each Hell Nah decides for themselves.
--
-- What `20261010120000_take_stake_responses.sql` makes true, asserted where
-- the anon key cannot get round it:
--
--   * a Hell Nah on the take may answer a staked Hell Yeah, once, inside
--     three days of the stake; nobody else may answer it;
--   * one Hell Nah's no does not stop another's yes;
--   * an answer is final -- a member can neither change it nor take it back;
--   * saying Hell Nah after the stake accepts nothing -- the newcomer is
--     asked like everybody else, while the stake is open;
--   * answers are logged as stake_accepted / stake_declined with the backer
--     and the stake, and a withdrawn Hell Yeah takes its answers with it;
--   * one staked Hell Yeah may be announced to the author and to the Hell
--     Nahs once each, and `takes_stakes` is a topic a device may hold.
--
-- Everything is rolled back; the season is a year no real season can hold.

begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'author@example.com'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'backer@example.com'),
       ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'fader@example.com'),
       ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'late@example.com');

insert into public.member_approvals (user_id, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'approved'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'approved'),
       ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'approved'),
       ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'approved')
on conflict (user_id) do update set status = excluded.status;

insert into public.seasons (id, year, start_date, timezone)
values ('11111111-1111-4111-8111-111111111111', 1905, date '2026-09-08', 'America/New_York');

insert into public.takes (id, season_id, user_id, body, target_type, wager)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Nobody goes 14-0', 'end_of_season', '$20');

-- The fader is on the take first; then the backer stakes $10.
insert into public.take_participants (id, take_id, season_id, user_id, side)
values ('aaaaaaa1-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'nah');
insert into public.take_participants (id, take_id, season_id, user_id, side, wager)
values ('aaaaaaa1-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'yeah', '$10');

-- ---------------------------------------------------------------------------
-- 1. Who may answer
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}';
set local role authenticated;

select throws_ok(
  $$ insert into public.take_stake_responses (take_id, season_id, hell_yeah_id, response)
     values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
             'aaaaaaa1-0000-4000-8000-000000000002', 'accepted') $$,
  '42501', null, 'the author is not a Hell Nah, so cannot answer');

reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}';
set local role authenticated;

select throws_ok(
  $$ insert into public.take_stake_responses (take_id, season_id, hell_yeah_id, response)
     values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
             'aaaaaaa1-0000-4000-8000-000000000002', 'accepted') $$,
  '42501', null, 'nor can the backer agree to their own stake');

reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.take_stake_responses (take_id, season_id, hell_yeah_id, response)
     values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
             'aaaaaaa1-0000-4000-8000-000000000002', 'accepted') $$,
  'a Hell Nah on the take accepts the stake');

select throws_ok(
  $$ insert into public.take_stake_responses (take_id, season_id, hell_yeah_id, response)
     values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
             'aaaaaaa1-0000-4000-8000-000000000002', 'declined') $$,
  '23505', null, 'and cannot answer a second time');

-- No member UPDATE or DELETE policy: both match nothing and report success.
update public.take_stake_responses set response = 'declined'
where hell_yeah_id = 'aaaaaaa1-0000-4000-8000-000000000002';
delete from public.take_stake_responses
where hell_yeah_id = 'aaaaaaa1-0000-4000-8000-000000000002';

reset role;

select is(
  (select response from public.take_stake_responses
    where hell_yeah_id = 'aaaaaaa1-0000-4000-8000-000000000002'
      and user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'accepted', 'an answer cannot be changed or taken back');

select is(
  (select changes from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'stake_accepted'),
  jsonb_build_object('backer', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid, 'wager', jsonb_build_object('to', '$10')),
  'the log records the acceptance with the backer and the stake');

select is(
  (select acted_as_admin from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'stake_accepted'),
  false, 'and signs it with the member''s own name');

-- ---------------------------------------------------------------------------
-- 2. Joining later, and answering for yourself
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.take_participants (take_id, season_id, side)
     values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'nah') $$,
  'a member says Hell Nah after the stake was put up');

reset role;

select is(
  (select count(*)::int from public.take_stake_responses
    where hell_yeah_id = 'aaaaaaa1-0000-4000-8000-000000000002'
      and user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  0, 'which accepts nothing by itself');

set local request.jwt.claims to
  '{"role":"authenticated","sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.take_stake_responses (take_id, season_id, hell_yeah_id, response)
     values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
             'aaaaaaa1-0000-4000-8000-000000000002', 'declined') $$,
  'the newcomer answers for themselves, and says no');

reset role;

select is(
  (select array_agg(response order by response) from public.take_stake_responses
    where hell_yeah_id = 'aaaaaaa1-0000-4000-8000-000000000002'),
  array['accepted', 'declined']::text[], 'and the earlier yes stands beside the no');

-- ---------------------------------------------------------------------------
-- 3. The window
-- ---------------------------------------------------------------------------

-- A fresh stake from the backer, four days old, with the Hell Nahs asked again.
delete from public.take_participants where id = 'aaaaaaa1-0000-4000-8000-000000000002';

select is(
  (select count(*)::int from public.take_stake_responses
    where take_id = '22222222-2222-4222-8222-222222222222'),
  0, 'a withdrawn Hell Yeah takes its answers with it');

insert into public.take_participants (id, take_id, season_id, user_id, side, wager, created_at)
values ('aaaaaaa1-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'yeah', '$15',
        now() - interval '4 days');

set local request.jwt.claims to
  '{"role":"authenticated","sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}';
set local role authenticated;

select throws_ok(
  $$ insert into public.take_stake_responses (take_id, season_id, hell_yeah_id, response)
     values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
             'aaaaaaa1-0000-4000-8000-000000000003', 'accepted') $$,
  '42501', null, 'a stake more than three days old can no longer be answered');

reset role;

-- A decline, inside the window, on a stake placed just now.
update public.take_participants set created_at = now()
where id = 'aaaaaaa1-0000-4000-8000-000000000003';

set local request.jwt.claims to
  '{"role":"authenticated","sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.take_stake_responses (take_id, season_id, hell_yeah_id, response)
     values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
             'aaaaaaa1-0000-4000-8000-000000000003', 'declined') $$,
  'a Hell Nah declines a stake');

reset role;

select is(
  (select count(*)::int from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'stake_declined'),
  2, 'and both declines are logged');

-- ---------------------------------------------------------------------------
-- 4. Notifications
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ with backed as (
       select id from public.take_events
       where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'backed'
       order by seq limit 1)
     insert into public.notification_log (kind, season_id, take_event_id, recipients)
     select k, '11111111-1111-4111-8111-111111111111', backed.id, 1
     from backed, unnest(array['takes_reactions', 'takes_stakes']) k $$,
  'one backed event is claimed once for the author and once for the Hell Nahs');

select throws_ok(
  $$ with backed as (
       select id from public.take_events
       where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'backed'
       order by seq limit 1)
     insert into public.notification_log (kind, season_id, take_event_id, recipients)
     select 'takes_stakes', '11111111-1111-4111-8111-111111111111', backed.id, 1 from backed $$,
  '23505', null, 'but never twice to the same audience');

select ok(
  (select pg_get_expr(d.adbin, d.adrelid)
     from pg_attrdef d
     join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.push_subscriptions'::regclass and a.attname = 'topics')
    like '%takes_stakes%',
  'takes_stakes is in the default topics a new device gets');

select * from finish();
rollback;
