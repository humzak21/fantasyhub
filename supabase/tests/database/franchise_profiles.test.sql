-- A profile belongs to a franchise, and only its linked accounts and an admin
-- write it.
--
-- 20261102120000_franchise_profiles.sql. This asserts the rule from each side:
-- the link is the admin's alone, a member writes their own franchise's row and
-- no other, a display name decides nothing, an unapproved or signed-out caller
-- reads nothing, and the avatar path rule that the storage policies call.
--
-- Everything is rolled back. Accounts: aaaa is an admin, bbbb an approved
-- member linked to franchise 1, cccc an approved member linked to franchise 2,
-- dddd signed in but not approved, and linked to franchise 1 anyway.

begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin@example.com', '{}'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'one@example.com', '{"full_name":"Owner One"}'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'two@example.com', '{"full_name":"Owner One"}'),
       ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'pending@example.com', '{}');

insert into public.league_admins (user_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
on conflict (user_id) do nothing;

insert into public.member_approvals (user_id, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'approved'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'approved'),
       ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'pending')
on conflict (user_id) do update set status = excluded.status;

insert into public.league_franchises (id, owner_name, joined_year)
values ('11111111-1111-4111-8111-111111111111', 'Owner One', 2020),
       ('22222222-2222-4222-8222-222222222222', 'Owner Two', 2020);

insert into public.franchise_accounts (user_id, franchise_id)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222'),
       ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111');

select has_table('public', 'franchise_profiles', 'franchise_profiles exists');
select has_table('public', 'franchise_accounts', 'franchise_accounts exists');
select has_column('public', 'teams', 'espn_logo_url', 'teams carries the ESPN logo');

-- ---------------------------------------------------------------------------
-- 1. A member writes their own franchise, and no other
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"role":"authenticated","sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}';
set local role authenticated;

select lives_ok(
  $$insert into public.franchise_profiles (franchise_id, bio)
    values ('11111111-1111-4111-8111-111111111111', 'First')$$,
  'a member creates their own franchise''s profile');

select lives_ok(
  $$update public.franchise_profiles set bio = 'Second'
    where franchise_id = '11111111-1111-4111-8111-111111111111'$$,
  'a member edits it');

select is(
  (select bio from public.franchise_profiles
   where franchise_id = '11111111-1111-4111-8111-111111111111'),
  'Second', 'the edit landed');

select is(
  (select updated_by from public.franchise_profiles
   where franchise_id = '11111111-1111-4111-8111-111111111111'),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, 'the database stamps who edited');

select throws_ok(
  $$insert into public.franchise_profiles (franchise_id, bio)
    values ('22222222-2222-4222-8222-222222222222', 'Not mine')$$,
  '42501', null, 'a member cannot create another franchise''s profile');

select is((select count(*)::int from public.franchise_accounts), 1,
  'a member reads only their own link');

select throws_ok(
  $$select public.set_franchise_account(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '22222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'a member cannot move their own link');

select throws_ok(
  $$insert into public.franchise_accounts (user_id, franchise_id)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'a member has no write on the link table');

-- ---------------------------------------------------------------------------
-- 2. A display name decides nothing
-- ---------------------------------------------------------------------------
-- cccc's display name is "Owner One", the owner of franchise 1, and it is
-- linked to franchise 2. An account can retype its name, so the name must not
-- be what lets it in.

reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}';
set local role authenticated;

select is(public.can_edit_franchise_profile('11111111-1111-4111-8111-111111111111'), false,
  'matching an owner''s name grants nothing');

update public.franchise_profiles set bio = 'Stolen'
where franchise_id = '11111111-1111-4111-8111-111111111111';

select is(
  (select bio from public.franchise_profiles
   where franchise_id = '11111111-1111-4111-8111-111111111111'),
  'Second', 'and an UPDATE of that franchise changes nothing');

-- ---------------------------------------------------------------------------
-- 3. Approval is still required
-- ---------------------------------------------------------------------------

reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}';
set local role authenticated;

select is((select count(*)::int from public.franchise_profiles), 0,
  'an unapproved account reads no profiles');
select is(public.can_edit_franchise_profile('11111111-1111-4111-8111-111111111111'), false,
  'a link does not stand in for approval');

reset role;
set local request.jwt.claims to '{"role":"anon"}';
set local role anon;

select throws_ok($$select * from public.franchise_profiles$$, '42501', null,
  'a signed-out caller cannot read profiles at all');

-- ---------------------------------------------------------------------------
-- 4. An admin edits anything, including a franchise with no account
-- ---------------------------------------------------------------------------

reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';
set local role authenticated;

select lives_ok(
  $$insert into public.franchise_profiles (franchise_id, bio)
    values ('22222222-2222-4222-8222-222222222222', 'From the admin')$$,
  'an admin writes any franchise''s profile');

select lives_ok(
  $$select public.set_franchise_account(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '22222222-2222-4222-8222-222222222222')$$,
  'an admin moves a link');

select is(
  (select franchise_id from public.franchise_accounts
   where user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  '22222222-2222-4222-8222-222222222222'::uuid, 'and the link moved');

select lives_ok(
  $$select public.set_franchise_account('dddddddd-dddd-4ddd-8ddd-dddddddddddd', null)$$,
  'a null franchise unlinks');

select is(
  (select count(*)::int from public.franchise_accounts
   where user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  0, 'and the link is gone');

-- ---------------------------------------------------------------------------
-- 5. The columns hold their shape
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.franchise_profiles
    set avatar_source = 'upload', avatar_path = '22222222-2222-4222-8222-222222222222/a.webp'
    where franchise_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'an upload cannot point into another franchise''s folder');

select throws_ok(
  $$update public.franchise_profiles set accent_hue = 400
    where franchise_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'an accent is a hue on the wheel');

select throws_ok(
  $$update public.franchise_profiles set bio = repeat('x', 501)
    where franchise_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'a bio has a length limit');

-- ---------------------------------------------------------------------------
-- 6. The storage rule
-- ---------------------------------------------------------------------------
-- CI has no storage schema, so the policies are not here to exercise. The
-- function they call is.

reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}';
set local role authenticated;

select is(public.can_edit_avatar_path('11111111-1111-4111-8111-111111111111/a.webp'), true,
  'a member may write in their own folder');
select is(public.can_edit_avatar_path('22222222-2222-4222-8222-222222222222/a.webp'), false,
  'and not in another franchise''s');

reset role;

select * from finish();

rollback;
