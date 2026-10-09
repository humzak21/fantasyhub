-- Push subscriptions: own rows only, approved members only, and a device that
-- changes hands moves rather than duplicates. Plus the two pg_cron slots.
--
-- Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'one@example.com'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'two@example.com'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'visitor@example.com');

insert into public.member_approvals (user_id, status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'approved'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'approved'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'pending')
on conflict (user_id) do update set status = excluded.status;

-- ---------------------------------------------------------------------------
-- 1. Saving
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"one@example.com"}';
set local role authenticated;

select is(
  public.save_push_subscription('https://web.push.apple.com/device-1', 'key', 'secret'),
  array['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions', 'matchup_facts']::text[],
  'a member saves a device and gets every topic by default'
);

select is(
  public.save_push_subscription('https://web.push.apple.com/device-1', 'key', 'secret', array['pickems_closing']),
  array['pickems_closing']::text[],
  'saving again updates the topics in place'
);

select is(
  (select count(*)::int from public.push_subscriptions),
  1,
  'and reads back their own one row'
);

select throws_ok(
  $$ select public.save_push_subscription('https://web.push.apple.com/device-2', 'key', 'secret', array['everything']) $$,
  '23514',
  null,
  'an unknown topic is refused by the check constraint'
);

select throws_ok(
  $$ select public.save_push_subscription('http://evil.example/device', 'key', 'secret') $$,
  '23514',
  null,
  'a non-https endpoint is refused'
);

-- The same phone, signed in as somebody else.
set local request.jwt.claims to
  '{"role":"authenticated","sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"two@example.com"}';

select lives_ok(
  $$ select public.save_push_subscription('https://web.push.apple.com/device-1', 'key2', 'secret2') $$,
  'a device that signs in as another member is moved to them'
);

reset role;

select is(
  (select user_id from public.push_subscriptions where endpoint = 'https://web.push.apple.com/device-1'),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
  'one row, now the new member''s'
);

-- ---------------------------------------------------------------------------
-- 2. Privacy and the approval guard
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"one@example.com"}';
set local role authenticated;

select is(
  (select count(*)::int from public.push_subscriptions),
  0,
  'the previous owner no longer sees it'
);

delete from public.push_subscriptions;
reset role;

select is(
  (select count(*)::int from public.push_subscriptions),
  1,
  'and cannot delete somebody else''s device'
);

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"visitor@example.com"}';
set local role authenticated;

select throws_ok(
  $$ select public.save_push_subscription('https://web.push.apple.com/device-3', 'key', 'secret') $$,
  '42501',
  'Your account has not been approved yet',
  'an account awaiting approval cannot subscribe'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3. The clock
-- ---------------------------------------------------------------------------

select is(
  (select schedule from cron.job where jobname = 'notify-pickems-open'),
  '0 14 * * 2',
  'the "pick''ems are open" slot is Tuesdays at 14:00 UTC'
);

select is(
  (select schedule from cron.job where jobname = 'notify-pickems-closing'),
  '30 21 * * 4',
  'the "pick''ems close soon" slot is Thursdays at 21:30 UTC'
);

select * from finish();

rollback;
