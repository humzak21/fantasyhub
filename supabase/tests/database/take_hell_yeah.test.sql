-- Hell Yeah: backing a take, with a stake of your own if you want one.
--
-- What `20260918120000_takes_hell_yeah.sql` makes true, asserted where the
-- anon key cannot get round it:
--
--   * a Hell Yeah lands on any take, staked or not, with or without a stake
--     of its own -- that stake is a show of confidence nobody owes;
--   * a Hell Nah never carries a stake of its own;
--   * one side per member -- a backer cannot also fade;
--   * the three-day window binds Hell Yeahs exactly as it binds Hell Nahs;
--   * a client that sends no side (the build before this one) still writes a
--     Hell Nah;
--   * the log calls it `backed`, with the stake, and `unbacked`.
--
-- Everything is rolled back; the season is a year no real season can hold.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'author@example.com'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'backer@example.com'),
       ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'fader@example.com');

insert into public.member_approvals (user_id, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'approved'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'approved'),
       ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'approved')
on conflict (user_id) do update set status = excluded.status;

insert into public.seasons (id, year, start_date, timezone)
values ('11111111-1111-4111-8111-111111111111', 1904, date '2026-09-08', 'America/New_York');

-- A staked take, an unstaked one, and a staked one past its window.
insert into public.takes (id, season_id, user_id, body, target_type, wager)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Nobody goes 14-0', 'end_of_season', '$20'),
       ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Chalk all the way', 'end_of_season', null),
       ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'A kicker wins it', 'end_of_season', '$5');

update public.takes set created_at = now() - interval '4 days'
where id = '44444444-4444-4444-8444-444444444444';

-- ---------------------------------------------------------------------------
-- 1. The backer
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"backer@example.com"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.take_participants (take_id, season_id, side)
     values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'yeah') $$,
  'a plain Hell Yeah lands on an unstaked take');

delete from public.take_participants
where take_id = '33333333-3333-4333-8333-333333333333';

-- A backer's stake is owed by nobody, so it needs no Hell Nahs to be possible.
select lives_ok(
  $$ insert into public.take_participants (take_id, season_id, side, wager)
     values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'yeah', '$10') $$,
  'a staked Hell Yeah lands on an unstaked take too');

select lives_ok(
  $$ insert into public.take_participants (take_id, season_id, side, wager)
     values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'yeah', '$10') $$,
  'a staked Hell Yeah lands on a staked take');

select throws_ok(
  $$ insert into public.take_participants (take_id, season_id, side)
     values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'nah') $$,
  '23505', null, 'and the backer cannot also say Hell Nah to it');

select throws_ok(
  $$ insert into public.take_participants (take_id, season_id, side)
     values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'yeah') $$,
  '42501', null, 'a take last moved four days ago accepts no Hell Yeah');

reset role;

select is(
  (select changes #>> '{wager,to}' from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'backed'),
  '$10', 'the log records the Hell Yeah as backed, with its stake');

-- ---------------------------------------------------------------------------
-- 2. The fader
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","email":"fader@example.com"}';
set local role authenticated;

select throws_ok(
  $$ insert into public.take_participants (take_id, season_id, side, wager)
     values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'nah', '$10') $$,
  '23514', null, 'a Hell Nah never carries a stake of its own');

-- The build before this one sends no side at all.
select lives_ok(
  $$ insert into public.take_participants (take_id, season_id)
     values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111') $$,
  'a row with no side still lands');

reset role;

select is(
  (select side from public.take_participants
    where take_id = '22222222-2222-4222-8222-222222222222'
      and user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'nah', 'and it is a Hell Nah');

-- ---------------------------------------------------------------------------
-- 3. Taking a Hell Yeah back
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"backer@example.com"}';
set local role authenticated;

delete from public.take_participants
where take_id = '22222222-2222-4222-8222-222222222222'
  and user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

reset role;

select is(
  (select count(*)::int from public.take_participants
    where take_id = '22222222-2222-4222-8222-222222222222'
      and user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  0, 'inside the window a Hell Yeah can be taken back');

select is(
  (select count(*)::int from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'unbacked'),
  1, 'and the log records it as unbacked');

select is(
  (select acted_as_admin from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'backed'),
  false, 'a member backing a take is not an admin act');

select * from finish();

rollback;
