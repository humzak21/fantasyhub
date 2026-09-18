-- The takes read mark: own row only, and it never moves backwards.
--
-- Two rules the vitest suite's fake client cannot see. `greatest()` is the one
-- that matters: this row exists so a member's badge follows them between a
-- phone and a laptop, and those do not take turns — a laptop left open on a
-- stale board must not un-see what the phone has just read. The client mirrors
-- the rule before it sends, but only the RPC holds under a race.
--
-- The other is privacy. `takes` and `take_participants` are public reads;
-- *who has looked at them* is not, and not for the admin either — an admin who
-- could see who had not read a take would be a surveillance feature nobody
-- asked for. That is asserted here rather than left to the policy text.
--
-- Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'humzak2001@gmail.com'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'member@example.com'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'visitor@example.com');

-- bbbb is approved; cccc has signed up and is still waiting.
insert into public.member_approvals (user_id, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'approved'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'pending')
on conflict (user_id) do update set status = excluded.status;

-- ---------------------------------------------------------------------------
-- 1. The mark moves forward, and only forward
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"member@example.com"}';
set local role authenticated;

select is(
  public.mark_takes_seen(timestamptz '2026-09-10 12:00:00+00'),
  timestamptz '2026-09-10 12:00:00+00',
  'the first mark is stored as sent, and returned');

select is(
  public.mark_takes_seen(timestamptz '2026-09-12 12:00:00+00'),
  timestamptz '2026-09-12 12:00:00+00',
  'a newer mark moves it forward');

-- The race this table exists to survive: a second device holding a board it
-- loaded two days ago, writing after the first.
select is(
  public.mark_takes_seen(timestamptz '2026-09-11 12:00:00+00'),
  timestamptz '2026-09-12 12:00:00+00',
  'a staler mark is refused and the stored one comes back instead');

select is(
  (select count(*)::int from public.take_views),
  1, 'and all of that is one row');

-- ---------------------------------------------------------------------------
-- 2. Nobody reads anybody else's
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"visitor@example.com"}';
set local role authenticated;

select is(
  (select count(*)::int from public.take_views),
  0, 'another member sees no row at all');

-- An unapproved account reads zero takes, so a mark of theirs would describe
-- nothing. The guard is close to moot and is asserted anyway, because that is
-- how one gets left off the path where it was not.
select throws_ok(
  $$ select public.mark_takes_seen(timestamptz '2026-09-12 12:00:00+00') $$,
  '42501', null, 'an unapproved account cannot record a mark');

reset role;

-- The admin is not an exception. `take_views` has no admin policy, unlike
-- every other table on this board.
set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"humzak2001@gmail.com"}';
set local role authenticated;

select is(
  (select count(*)::int from public.take_views),
  0, 'not even the admin reads somebody else''s mark');

reset role;

-- ---------------------------------------------------------------------------
-- 3. The row belongs to the member
-- ---------------------------------------------------------------------------
-- Deleting the account takes the receipt with it: CASCADE, not SET NULL —
-- unlike a grade or a take, this row is of no interest once the person it
-- describes is gone.

delete from auth.users where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

select is(
  (select count(*)::int from public.take_views),
  0, 'and a deleted account takes its mark with it');

select * from finish();

rollback;
