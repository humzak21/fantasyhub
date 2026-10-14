-- Alerts: what `20261014120000_notification_inbox.sql` makes true.
--
--   * a member reads only their own alerts, and anon reads none;
--   * nobody but the service role adds one;
--   * a member marks their own read, by id or all at once, and cannot touch
--     anybody else's or change what an alert says;
--   * a member deletes their own and nobody else's.
--
-- Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'one@example.com'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'two@example.com');

insert into public.notification_inbox (id, user_id, kind, title, body)
values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test', 'OG Jits', 'first'),
       ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'takes_new', 'New take', 'second'),
       ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pickems_open', 'Pick''ems', 'third'),
       ('44444444-4444-4444-8444-444444444444', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'test', 'OG Jits', 'theirs');

-- ---------------------------------------------------------------------------
-- Anon
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select count(*) from public.notification_inbox $$,
  '42501',
  null,
  'anon cannot read alerts'
);

reset role;

-- ---------------------------------------------------------------------------
-- A member
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"one@example.com"}';
set local role authenticated;

select is(
  (select array_agg(body order by body) from public.notification_inbox),
  array['first', 'second', 'third']::text[],
  'a member reads only their own alerts'
);

select throws_ok(
  $$ insert into public.notification_inbox (user_id, kind, title)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test', 'forged') $$,
  '42501',
  null,
  'and cannot add one'
);

select throws_ok(
  $$ update public.notification_inbox set title = 'rewritten'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501',
  null,
  'or change what one says'
);

select is(
  public.mark_notifications_read(array['11111111-1111-4111-8111-111111111111']::uuid[]),
  1,
  'marks one of their own read by id'
);

select is(
  public.mark_notifications_read(array['44444444-4444-4444-8444-444444444444']::uuid[]),
  0,
  'but not somebody else''s'
);

select is(
  public.mark_notifications_read(),
  2,
  'and the rest of their own at once'
);

select is(
  (select count(*)::integer from public.notification_inbox where read_at is null),
  0,
  'leaving none of their own unread'
);

delete from public.notification_inbox where id = '44444444-4444-4444-8444-444444444444';
delete from public.notification_inbox where id = '33333333-3333-4333-8333-333333333333';

reset role;

select is(
  (select read_at from public.notification_inbox where id = '44444444-4444-4444-8444-444444444444'),
  null,
  'the other member''s alert is still unread'
);

select ok(
  exists (select 1 from public.notification_inbox where id = '44444444-4444-4444-8444-444444444444'),
  'and still there after the member tried to delete it'
);

select ok(
  not exists (select 1 from public.notification_inbox where id = '33333333-3333-4333-8333-333333333333'),
  'while the member''s own was deleted'
);

select * from finish();

rollback;
