-- The takes log marks admin acts, and only admin acts.
--
-- src/components/takes/__tests__ mocks the log, so it cannot see the one thing
-- that makes "Admin" true: the triggers deciding it from OLD, NEW and the JWT.
-- This asserts both halves against the real policies and triggers -- the admin
-- editing a member's take reads as Admin, and the admin posting, rewording and
-- fading as a member does not.
--
-- Everything is rolled back. The season is a year no real season can hold.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- Scaffolding, as postgres. Three accounts: the admin, a member who posts, and
-- a member who fades. auth.users has no required columns beyond the id.
insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'humzak2001@gmail.com'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'author@example.com'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'fader@example.com');

insert into public.member_approvals (user_id, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'approved'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'approved')
on conflict (user_id) do update set status = excluded.status;

insert into public.seasons (id, year, start_date, timezone)
values ('11111111-1111-4111-8111-111111111111', 1902, date '2026-09-08', 'America/New_York');

-- The member posts a staked take and rewords it inside the window.
set local request.jwt.claims to
  '{"role":"authenticated","sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"author@example.com"}';
set local role authenticated;

insert into public.takes (id, season_id, body, target_type, target_week, wager)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
        'Nobody goes 14-0', 'week', 3, '$20');

update public.takes set body = 'Nobody goes 13-1'
where id = '22222222-2222-4222-8222-222222222222';

reset role;

select is(
  (select acted_as_admin from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'posted'),
  false, 'a member posting is not an admin act');

select is(
  (select acted_as_admin from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'edited'),
  false, 'an author rewording their own take is not an admin act');

-- The admin, acting on the member's take.
set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"humzak2001@gmail.com"}';
set local role authenticated;

-- A fade as themselves on somebody else's staked take: a member could.
insert into public.take_participants (take_id, season_id)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');

-- A fade placed for somebody else: a member could not.
insert into public.take_participants (take_id, season_id, user_id)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc');

-- Every facet in one save.
update public.takes
set body = 'Nobody goes 12-2', wager = '$50', target_type = 'end_of_season', target_week = null,
    user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
where id = '22222222-2222-4222-8222-222222222222';

update public.takes
set status = 'correct', resolved_at = now(), resolved_by = auth.uid()
where id = '22222222-2222-4222-8222-222222222222';

-- Removing somebody else's fade.
delete from public.take_participants
where take_id = '22222222-2222-4222-8222-222222222222'
  and user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

-- The admin's own take, reworded inside its window: an author's act.
insert into public.takes (id, season_id, body, target_type)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
        'Somebody wins it from the 6 seed', 'end_of_season');

update public.takes set body = 'Somebody wins it from the 5 seed'
where id = '33333333-3333-4333-8333-333333333333';

reset role;

select is(
  (select acted_as_admin from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'faded'
      and subject_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  false, 'the admin fading a take as a member is not an admin act');

select is(
  (select acted_as_admin from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'faded'
      and subject_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  true, 'a Hell Nah placed for somebody else is an admin act');

select is(
  (select acted_as_admin from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'edited'
      and actor_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  true, 'the admin editing a member''s take is an admin act');

select ok(
  (select changes ?& array['body', 'wager', 'milestone', 'author'] from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'edited'
      and actor_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'one save that moves every facet is one edited event carrying every field');

select is(
  (select changes -> 'author' from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'edited'
      and actor_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '{"from":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","to":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}'::jsonb,
  'a reassigned take records both authors');

select is(
  (select acted_as_admin from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'graded'),
  true, 'grading is always an admin act');

select is(
  (select acted_as_admin from public.take_events
    where take_id = '22222222-2222-4222-8222-222222222222' and event_type = 'unfaded'),
  true, 'removing somebody else''s Hell Nah is an admin act');

select is(
  (select acted_as_admin from public.take_events
    where take_id = '33333333-3333-4333-8333-333333333333' and event_type = 'posted'),
  false, 'the admin posting their own take is not an admin act');

select is(
  (select acted_as_admin from public.take_events
    where take_id = '33333333-3333-4333-8333-333333333333' and event_type = 'edited'),
  false, 'the admin rewording their own take inside its window is not an admin act');

-- The admin's own take, graded and reopened: no member may do either, whoever
-- wrote it.
set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"humzak2001@gmail.com"}';
set local role authenticated;

update public.takes
set status = 'push', resolved_at = now(), resolved_by = auth.uid()
where id = '33333333-3333-4333-8333-333333333333';

update public.takes
set status = 'pending', resolved_at = null, resolved_by = null
where id = '33333333-3333-4333-8333-333333333333';

reset role;

select is(
  (select acted_as_admin from public.take_events
    where take_id = '33333333-3333-4333-8333-333333333333' and event_type = 'reopened'),
  true, 'reopening is always an admin act, even on the admin''s own take');

-- The flag is the triggers' alone: a member cannot write the log at all.
set local request.jwt.claims to
  '{"role":"authenticated","sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"author@example.com"}';
set local role authenticated;

select throws_ok(
  $$ insert into public.take_events (take_id, season_id, event_type, acted_as_admin)
     values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
             'edited', true) $$,
  '42501', null, 'a member cannot forge an admin event');

reset role;

-- The service role has no person behind it, so its writes are never "Admin".
set local request.jwt.claims to '{"role":"service_role"}';
set local role service_role;

update public.takes set body = 'Somebody wins it from the 4 seed'
where id = '33333333-3333-4333-8333-333333333333';

reset role;

select is(
  (select acted_as_admin from public.take_events
    where take_id = '33333333-3333-4333-8333-333333333333' and event_type = 'edited'
    order by seq desc limit 1),
  false, 'a service-role write is not an admin act');

select * from finish();

rollback;
