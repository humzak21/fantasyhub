-- The admin is a league_admins row, and the table defends itself.
--
-- 20261008120000_league_admins.sql replaced the email compare inside
-- is_admin() with a table of user ids. This asserts the rule from every side
-- that matters: who is_admin() answers true for, that only an admin can read
-- or change the list, that nobody can remove themselves or the last admin --
-- through the RPC, through a direct DELETE as a privileged role, or through
-- the cascade from auth.users -- and that the functions which fold the admin
-- in (is_approved_member, delete_member_account) still do.
--
-- Everything is rolled back. Three accounts: aaaa starts as an admin, bbbb is
-- an approved member who is granted admin and then revoked, cccc is a
-- signed-in account with no rows anywhere.

begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'first-admin@example.com'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'second-admin@example.com'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'stranger@example.com');

insert into public.member_approvals (user_id, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'approved')
on conflict (user_id) do update set status = excluded.status;

insert into public.league_admins (user_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 1. The replay
-- ---------------------------------------------------------------------------

select has_table('public', 'league_admins', 'league_admins exists');

-- The seed inserts only accounts that exist. Wherever either seeded account
-- exists, it is an admin; in CI neither exists and the seed was a no-op rather
-- than an FK violation.
select ok(
  not exists (
    select 1 from auth.users u
    where u.id in ('351ac315-81a2-4867-b584-172cc84e3ced', '00fc835f-50ed-49d6-a460-862982f2b27a')
      and not exists (select 1 from public.league_admins a where a.user_id = u.id)),
  'every seeded account that exists is an admin');

-- ---------------------------------------------------------------------------
-- 2. Who is an admin
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"role":"anon"}';
set local role anon;

select is(public.is_admin(), false, 'anon is not an admin');

reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}';
set local role authenticated;

select is(public.is_admin(), false, 'a signed-in account with no row is not an admin');

select is((select count(*)::int from public.list_league_admins()), 0,
  'a non-admin lists no admins');

select is((select count(*)::int from public.league_admins), 0,
  'a non-admin reads nothing from the table');

select throws_ok(
  $$ select public.set_league_admin('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid, true) $$,
  '42501', 'Only an admin can change who is an admin',
  'a non-admin cannot grant admin, not even to themselves');

select throws_ok(
  $$ insert into public.league_admins (user_id) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc') $$,
  '42501', null, 'a non-admin cannot insert into the table directly');

reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';
set local role authenticated;

select is(public.is_admin(), true, 'an account with a row is an admin');

select is(public.is_approved_member(), true,
  'an admin with no member_approvals row is still an approved member');

-- ---------------------------------------------------------------------------
-- 3. Granting
-- ---------------------------------------------------------------------------

select is(public.set_league_admin('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, true), true,
  'an admin can grant another account');

select is(public.set_league_admin('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, true), false,
  'granting an existing admin changes nothing');

select is(
  (select granted_by from public.league_admins where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'the grant records who made it');

select throws_ok(
  $$ select public.set_league_admin('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid, true) $$,
  '22023', null, 'granting an account that does not exist is refused');

select ok(
  (select count(*) from public.list_league_admins()
    where user_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')) = 2
  and (select count(*) from public.list_league_admins()) = (select count(*) from public.league_admins),
  'an admin lists every admin, both new rows included');

-- ---------------------------------------------------------------------------
-- 4. Revoking
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.set_league_admin('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, false) $$,
  '22023', 'You cannot remove your own admin access',
  'an admin cannot revoke themselves through the RPC');

select throws_ok(
  $$ select public.delete_member_account('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid) $$,
  '22023', 'Revoke admin access before deleting this account',
  'an admin''s account cannot be deleted while they hold admin');

select is(public.set_league_admin('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, false), true,
  'an admin can revoke a different admin');

select is(public.set_league_admin('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, false), false,
  'revoking a non-admin changes nothing');

reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}';
set local role authenticated;

select is(public.is_admin(), false, 'a revoked admin is not an admin');

select is(public.is_approved_member(), true, 'a revoked admin is still an approved member');

-- ---------------------------------------------------------------------------
-- 5. The trigger holds for privileged roles too
-- ---------------------------------------------------------------------------

-- postgres bypasses RLS and holds DELETE, but carries aaaa's claims here: the
-- trigger still refuses removing your own row.
reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';

select throws_ok(
  $$ delete from public.league_admins where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '22023', 'You cannot remove your own admin access',
  'a direct delete of your own row is refused by the trigger');

-- The service role has no auth.uid(), so only the last-admin rule applies.
-- Deleting every row stops at the last one, however many there are.
set local request.jwt.claims to '{"role":"service_role"}';
set local role service_role;

select throws_ok(
  $$ delete from public.league_admins $$,
  '22023', 'The league must keep at least one admin',
  'the service role cannot delete the last admin');

select throws_ok(
  $$ select public.set_league_admin('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid, true) $$,
  '42501', null, 'the service role is nobody, and cannot use the RPC');

reset role;
set local request.jwt.claims to '';

-- The cascade from auth.users fires the same trigger.
select throws_ok(
  $$ delete from auth.users where id in (select user_id from public.league_admins) $$,
  '22023', 'The league must keep at least one admin',
  'deleting every admin''s account is refused at the last one');

set local request.jwt.claims to '{"role":"anon"}';
set local role anon;

select throws_ok(
  $$ select public.set_league_admin('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid, true) $$,
  '42501', null, 'anon cannot execute the RPC at all');

reset role;

select * from finish();

rollback;
