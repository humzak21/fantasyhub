-- count_approved_members() is "of N" on the home page's pick'ems counters.
--
-- 20261023120000_count_approved_members.sql. Asserted: it counts approved
-- member_approvals rows and admins, an admin with an approved row only once,
-- and nothing pending or rejected; it moves when an approval is decided; and
-- anon cannot call it at all.
--
-- The database may already hold accounts (locally, the real league), so every
-- assertion is a difference from the count taken at the start, never an
-- absolute number. Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_function('public', 'count_approved_members', array[]::text[],
  'count_approved_members() exists');

create temporary table baseline as select public.count_approved_members() as n;
grant select on baseline to authenticated, anon;

insert into auth.users (id, email)
values ('11111111-1111-4111-8111-111111111111', 'approved@example.com'),
       ('22222222-2222-4222-8222-222222222222', 'pending@example.com'),
       ('33333333-3333-4333-8333-333333333333', 'rejected@example.com'),
       ('44444444-4444-4444-8444-444444444444', 'admin-no-row@example.com'),
       ('55555555-5555-4555-8555-555555555555', 'admin-and-approved@example.com');

insert into public.member_approvals (user_id, status)
values ('11111111-1111-4111-8111-111111111111', 'approved'),
       ('22222222-2222-4222-8222-222222222222', 'pending'),
       ('33333333-3333-4333-8333-333333333333', 'rejected'),
       ('55555555-5555-4555-8555-555555555555', 'approved')
on conflict (user_id) do update set status = excluded.status;

insert into public.league_admins (user_id)
values ('44444444-4444-4444-8444-444444444444'),
       ('55555555-5555-4555-8555-555555555555')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 1. The fold
-- ---------------------------------------------------------------------------

-- approved (1) + admin with no row (1) + admin who is also approved (1, once).
select is(public.count_approved_members() - (select n from baseline), 3,
  'counts approved members and admins, an approved admin once, nothing pending or rejected');

-- ---------------------------------------------------------------------------
-- 2. It moves with a decision
-- ---------------------------------------------------------------------------

update public.member_approvals set status = 'approved'
where user_id = '22222222-2222-4222-8222-222222222222';

select is(public.count_approved_members() - (select n from baseline), 4,
  'approving a pending account adds one');

update public.member_approvals set status = 'rejected'
where user_id = '11111111-1111-4111-8111-111111111111';

select is(public.count_approved_members() - (select n from baseline), 3,
  'rejecting an approved account takes one away');

-- ---------------------------------------------------------------------------
-- 3. Who may ask
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.count_approved_members()', 'execute'),
  'anon has no execute on it');

select ok(
  has_function_privilege('authenticated', 'public.count_approved_members()', 'execute'),
  'authenticated may execute it');

set local request.jwt.claims to '{"role":"anon"}';
set local role anon;

select throws_ok(
  $$ select public.count_approved_members() $$,
  '42501', null, 'a visitor is refused');

reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"22222222-2222-4222-8222-222222222222"}';
set local role authenticated;

-- A member who cannot read member_approvals still gets the number: the
-- function is SECURITY DEFINER.
select is(public.count_approved_members() - (select n from baseline), 3,
  'a signed-in member reads the same count');

reset role;

select * from finish();

rollback;
