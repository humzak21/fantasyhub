-- A Hell Nah closes three days after the take last moved -- both ways.
--
-- `src/components/takes/milestones.js` mirrors this window so the button is
-- simply absent once it has run out, but the mirror is a courtesy: the anon key
-- reaches PostgREST directly, so what makes the deadline real is the pair of
-- policies asserted here. This is also the only place the *an edit resets the
-- clock* rule can be checked, since `set_take_edited_at()` stamps the column
-- the policies read.
--
-- Ages are made by back-dating `created_at` as postgres, which is the one thing
-- a member cannot do (`takes_guard_author_update` forbids it) and the only way
-- to test a 72-hour window without waiting three days.
--
-- Every refused *withdrawal* is asserted by counting the row afterwards rather
-- than by expecting an error: a DELETE that RLS refuses matches no rows and
-- reports success, which is the same silent-success shape the base migration's
-- note about a missing DELETE policy warns about. Only the INSERT raises.
--
-- Everything is rolled back; the season is a year no real season can hold.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'humzak2001@gmail.com'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'author@example.com'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'fader@example.com');

insert into public.member_approvals (user_id, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'approved'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'approved')
on conflict (user_id) do update set status = excluded.status;

insert into public.seasons (id, year, start_date, timezone)
values ('11111111-1111-4111-8111-111111111111', 1903, date '2026-09-08', 'America/New_York');

-- Two staked takes by the same author: one posted just now, one four days ago.
insert into public.takes (id, season_id, user_id, body, target_type, wager)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Nobody goes 14-0', 'end_of_season', '$20'),
       ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Somebody wins it from the 6 seed',
        'end_of_season', '$20');

update public.takes set created_at = now() - interval '4 days'
where id = '33333333-3333-4333-8333-333333333333';

-- ---------------------------------------------------------------------------
-- 1. A fresh take takes fades, and gives them back
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"fader@example.com"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.take_participants (take_id, season_id)
     values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111') $$,
  'a take posted today accepts a Hell Nah');

delete from public.take_participants
where take_id = '22222222-2222-4222-8222-222222222222';

reset role;

select is(
  (select count(*)::int from public.take_participants
    where take_id = '22222222-2222-4222-8222-222222222222'),
  0, 'and inside the window it can be taken back');

-- ---------------------------------------------------------------------------
-- 2. A take older than the window takes neither
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"fader@example.com"}';
set local role authenticated;

select throws_ok(
  $$ insert into public.take_participants (take_id, season_id)
     values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'a take last moved four days ago accepts no new Hell Nah');

reset role;

-- Placed while it was still open: back-dating the take is what puts the row
-- outside the window it was written inside.
insert into public.take_participants (take_id, season_id, user_id)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc');

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"fader@example.com"}';
set local role authenticated;

delete from public.take_participants
where take_id = '33333333-3333-4333-8333-333333333333';

reset role;

select is(
  (select count(*)::int from public.take_participants
    where take_id = '33333333-3333-4333-8333-333333333333'),
  1, 'and a Hell Nah already on it cannot be withdrawn');

-- ---------------------------------------------------------------------------
-- 3. An edit hands the window back
-- ---------------------------------------------------------------------------
-- The author's own edit window has closed on a four-day-old take, so this is
-- the admin's edit -- the realistic case anyway, and it exercises the part that
-- matters: `set_take_edited_at()` stamps `edited_at`, and both policies read
-- that in preference to `created_at`.

set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"humzak2001@gmail.com"}';
set local role authenticated;

update public.takes set body = 'Somebody wins it from the 5 seed'
where id = '33333333-3333-4333-8333-333333333333';

reset role;

select isnt(
  (select edited_at from public.takes where id = '33333333-3333-4333-8333-333333333333'),
  null, 'rewording the take stamps edited_at');

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"fader@example.com"}';
set local role authenticated;

-- The people already on the other side of it are now fading a different
-- sentence, so they get their three days back too.
delete from public.take_participants
where take_id = '33333333-3333-4333-8333-333333333333';

reset role;

select is(
  (select count(*)::int from public.take_participants
    where take_id = '33333333-3333-4333-8333-333333333333'),
  0, 'the reworded take releases the Hell Nah already on it');

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"fader@example.com"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.take_participants (take_id, season_id)
     values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111') $$,
  'and accepts a fresh Hell Nah for three days from the edit');

reset role;

select is(
  (select count(*)::int from public.take_participants
    where take_id = '33333333-3333-4333-8333-333333333333'),
  1, 'which actually landed');

-- ---------------------------------------------------------------------------
-- 4. The admin is not bound by the window
-- ---------------------------------------------------------------------------
-- `take_participants admin write` is a separate permissive FOR ALL policy, and
-- permissive policies OR together -- which is what keeps a genuine mistake
-- fixable on a take of any age without a migration.

update public.takes set created_at = now() - interval '9 days', edited_at = null
where id = '33333333-3333-4333-8333-333333333333';

set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"humzak2001@gmail.com"}';
set local role authenticated;

-- As themselves: the fader already holds the only other row on this take, and
-- the author cannot fade their own under any policy.
select lives_ok(
  $$ insert into public.take_participants (take_id, season_id)
     values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111') $$,
  'the admin can still place a Hell Nah on a take long past its window');

reset role;

select * from finish();

rollback;
