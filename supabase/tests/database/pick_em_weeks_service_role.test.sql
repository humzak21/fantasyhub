-- The weekly sync opens each week's pick'ems as the service role, and the admin
-- button opens one as the admin. Both call create_pick_em_week; only the admin
-- has an auth.uid(). services/db/__tests__/pickEmWeek.test.js mocks the RPC, so
-- it cannot see what failed on 2026-09-15: the service-role insert tripped a
-- NOT NULL on pick_em_weeks.user_id and week 2 never opened. This asserts both
-- callers against the real schema, constraints and triggers.
--
-- Everything is rolled back. The seasons are years no real season can hold.

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into public.seasons (id, year, start_date, timezone)
values ('11111111-1111-4111-8111-111111111111', 1901, date '2026-09-08', 'America/New_York');

-- The cron: the service-role key carries a role claim and no subject.
set local request.jwt.claims to '{"role":"service_role"}';
set local role service_role;

select is(auth.uid(), null::uuid, 'the service role has no auth.uid()');

select lives_ok(
  $$ select public.create_pick_em_week('11111111-1111-4111-8111-111111111111'::uuid, 2) $$,
  'the service role can open a pick''em week'
);

select is(
  (select user_id from public.pick_em_weeks
    where season_id = '11111111-1111-4111-8111-111111111111' and week_number = 2),
  null::uuid,
  'a week the sync opened has no creator'
);

-- The admin button: a signed-in admin, whose subject the trigger records.
reset role;
set local request.jwt.claims to
  '{"role":"authenticated","sub":"33333333-3333-4333-8333-333333333333","email":"humzak2001@gmail.com"}';
set local role authenticated;

select lives_ok(
  $$ select public.create_pick_em_week('11111111-1111-4111-8111-111111111111'::uuid, 3) $$,
  'the admin can open a pick''em week'
);

select is(
  (select user_id from public.pick_em_weeks
    where season_id = '11111111-1111-4111-8111-111111111111' and week_number = 3),
  '33333333-3333-4333-8333-333333333333'::uuid,
  'a week the admin opened still records the admin'
);

select * from finish();

rollback;
