-- The live feed's table and its claim. The half a unit test cannot see: that a
-- browser can read the snapshot and write nothing, and that only one caller at
-- a time wins the right to spend an ESPN call.

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into public.seasons (id, year, name)
values ('00000000-0000-0000-0000-00000000f001', 2099, 'Live feed test season');

select ok(
  has_table_privilege('anon', 'public.live_week_snapshot', 'select'),
  'a signed-out viewer can read the snapshot'
);

select ok(
  not has_function_privilege('anon', 'public.claim_live_week_refresh(uuid, integer, integer, integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_live_week_refresh(uuid, integer, integer, integer)', 'execute'),
  'the browser roles cannot claim a refresh'
);

select ok(
  has_function_privilege('service_role', 'public.claim_live_week_refresh(uuid, integer, integer, integer)', 'execute'),
  'the service role can'
);

select is(
  public.claim_live_week_refresh('00000000-0000-0000-0000-00000000f001', 8, 900, 300),
  true,
  'the first caller claims a week with no row, which creates it'
);

select is(
  public.claim_live_week_refresh('00000000-0000-0000-0000-00000000f001', 8, 900, 300),
  false,
  'a second caller is refused while the claim stands'
);

select is(
  public.claim_live_week_refresh('00000000-0000-0000-0000-00000000f001', 9, 900, 300),
  true,
  'a claim on one week does not hold another'
);

-- A refresh that finished releases the claim and stamps the clock.
update public.live_week_snapshot
   set refreshing_at = null, refreshed_at = now() - interval '1 minute'
 where week = 8;

select is(
  public.claim_live_week_refresh('00000000-0000-0000-0000-00000000f001', 8, 900, 300),
  false,
  'a fresh snapshot cannot be claimed, so a viewer who read the old row spends nothing'
);

update public.live_week_snapshot
   set refreshed_at = now() - interval '20 minutes'
 where week = 8;

select is(
  public.claim_live_week_refresh('00000000-0000-0000-0000-00000000f001', 8, 900, 300),
  true,
  'a snapshot past its TTL can'
);

-- A refresh that died, or failed, leaves its claim behind.
update public.live_week_snapshot
   set refreshing_at = now() - interval '6 minutes'
 where week = 8;

select is(
  public.claim_live_week_refresh('00000000-0000-0000-0000-00000000f001', 8, 900, 300),
  true,
  'a leftover claim expires, so a failure is retried and not stuck'
);

set local role anon;

update public.live_week_snapshot set live = true;

select throws_ok(
  $$ insert into public.live_week_snapshot (season_id, week)
     values ('00000000-0000-0000-0000-00000000f001', 10) $$,
  '42501',
  null,
  'RLS refuses a browser a row of its own'
);

reset role;

select is(
  (select count(*) from public.live_week_snapshot where live),
  0::bigint,
  'and leaves it nothing to update'
);

select * from finish();

rollback;
