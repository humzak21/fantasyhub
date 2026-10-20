-- Taunts: what `20261020120000_matchup_taunts.sql` makes true.
--
--   * a member reads only their own taunt offers, and cannot write one;
--   * send_taunt() sends an offer once, only its own member's, inside two
--     days, and only for an approved member;
--   * sending dispatches notify-taunts.yml, and a failing dispatch never
--     refuses the press;
--   * the taunts topic is accepted and is in the default.
--
-- private.dispatch_github_workflow is replaced inside the transaction by a
-- recorder, so nothing reaches GitHub. Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

create temp table dispatches (workflow text) on commit drop;
grant insert on dispatches to authenticated;

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
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'taunter@example.com'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'other@example.com'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'visitor@example.com');

insert into public.member_approvals (user_id, status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'approved'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'approved'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'pending')
on conflict (user_id) do update set status = excluded.status;

insert into public.seasons (id, year, start_date, timezone)
values ('11111111-1111-4111-8111-111111111111', 1904, date '2026-09-08', 'America/New_York');

insert into public.teams (id, season_id, name, owner)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Comeback season', 'Arya Shah');

insert into public.matchup_taunts (id, from_user_id, season_id, week, day, to_team_id, sender_name, opponent_name, fact, taunt, created_at)
values
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 7, 'tue',
   '22222222-2222-4222-8222-222222222222', 'Harshil', 'Arya', 'You''re 8-2 all-time against Arya.', 'Harshil is 8-2 all-time against you.', now()),
  ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 7, 'sun',
   '22222222-2222-4222-8222-222222222222', 'Harshil', 'Arya', 'old fact', 'old taunt', now() - interval '3 days'),
  ('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 7, 'tue',
   '22222222-2222-4222-8222-222222222222', 'Ben', 'Arya', 'theirs', 'their taunt', now());

-- ---------------------------------------------------------------------------
-- 1. A member and their offers
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"taunter@example.com"}';
set local role authenticated;

select is(
  (select array_agg(fact order by fact) from public.matchup_taunts),
  array['You''re 8-2 all-time against Arya.', 'old fact']::text[],
  'a member reads only their own taunt offers'
);

select throws_ok(
  $$ update public.matchup_taunts set sent_at = now() where id = '33333333-3333-4333-8333-333333333333' $$,
  '42501',
  null,
  'and cannot mark one sent except through send_taunt()'
);

select is(
  public.send_taunt('33333333-3333-4333-8333-333333333333'),
  'sent',
  'taunting sends the offer'
);

select is(
  public.send_taunt('33333333-3333-4333-8333-333333333333'),
  'already_sent',
  'but only once'
);

select is(
  public.send_taunt('44444444-4444-4444-8444-444444444444'),
  'expired',
  'not after two days'
);

select is(
  public.send_taunt('55555555-5555-4555-8555-555555555555'),
  'not_found',
  'and never somebody else''s'
);

reset role;

select is(
  (select array_agg(workflow) from dispatches),
  array['notify-taunts.yml']::text[],
  'the one taunt sent dispatched notify-taunts.yml once'
);

select ok(
  (select sent_at is null from public.matchup_taunts where id = '55555555-5555-4555-8555-555555555555'),
  'the other member''s offer is untouched'
);

-- ---------------------------------------------------------------------------
-- 2. Who may taunt
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"visitor@example.com"}';
set local role authenticated;

select throws_ok(
  $$ select public.send_taunt('55555555-5555-4555-8555-555555555555') $$,
  '42501',
  null,
  'an unapproved account cannot taunt'
);

reset role;
set local role anon;

select throws_ok(
  $$ select public.send_taunt('55555555-5555-4555-8555-555555555555') $$,
  '42501',
  null,
  'nor can anybody signed out'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3. A dispatch that fails never refuses the press
-- ---------------------------------------------------------------------------

create or replace function private.dispatch_github_workflow(p_workflow text)
returns bigint
language plpgsql
as $$
begin
  raise exception 'Vault secret github_actions_dispatch_token is missing';
end;
$$;

set local request.jwt.claims to
  '{"role":"authenticated","sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"other@example.com"}';
set local role authenticated;

select is(
  public.send_taunt('55555555-5555-4555-8555-555555555555'),
  'sent',
  'a taunt is sent even when the dispatch fails'
);

-- ---------------------------------------------------------------------------
-- 4. The topic
-- ---------------------------------------------------------------------------

select is(
  public.save_push_subscription('https://web.push.apple.com/taunts', 'key', 'secret', array['taunts']),
  array['taunts']::text[],
  'a member can ask for taunts alone'
);

select ok(
  'taunts' = any (public.save_push_subscription('https://web.push.apple.com/taunts-2', 'key', 'secret')),
  'a device saved with the default topics gets taunts'
);

reset role;

select throws_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, topics)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'https://x', 'k', 'a', array['jeers']) $$,
  '23514',
  null,
  'an unknown topic is still refused'
);

select * from finish();

rollback;
