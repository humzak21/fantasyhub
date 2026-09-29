-- pg_cron keeps the clock for the two ESPN workflows and dispatches them
-- through GitHub's API (20260929120000_cron_dispatch_workflows.sql). This
-- asserts the half a unit test cannot see: the jobs and their UTC schedules
-- (which AUTOMATIONS in automationCatalog.js must match), that nothing a
-- browser holds can start a production sync, and the exact request GitHub
-- would receive — including `inputs.trigger = cron`, without which every run
-- logs as a button press and the dashboard calls every slot missed.
--
-- Everything is rolled back, and pg_net only sends requests that commit, so
-- nothing here reaches GitHub. Assumes no github_actions_dispatch_token in
-- Vault, which is true of the throwaway database CI replays into.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select is(
  (select schedule from cron.job where jobname = 'weekly-sync'),
  '0 10 * * 2',
  'the weekly sync fires Tuesdays at 10:00 UTC'
);

select is(
  (select schedule from cron.job where jobname = 'daily-refresh'),
  '40 16 * * *',
  'the daily refresh fires every day at 16:40 UTC'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage')
    and not has_schema_privilege('authenticated', 'private', 'usage'),
  'the browser roles cannot reach the private schema'
);

select ok(
  not has_function_privilege('anon', 'private.dispatch_github_workflow(text)', 'execute')
    and not has_function_privilege('authenticated', 'private.dispatch_github_workflow(text)', 'execute'),
  'the browser roles cannot dispatch a workflow'
);

select throws_ok(
  $$ select private.dispatch_github_workflow('sync-week.yml') $$,
  'P0001',
  'Vault secret github_actions_dispatch_token is missing; sync-week.yml was not dispatched',
  'without the token it raises, so cron.job_run_details records the failure'
);

select vault.create_secret('test-token', 'github_actions_dispatch_token');

-- Exactly one call: the function has a side effect, so it must not sit in a
-- WHERE clause where the planner evaluates it per row.
create temp table dispatched as
  select private.dispatch_github_workflow('daily-refresh.yml') as id;

select is(
  (select q.url from net.http_request_queue q join dispatched d using (id)),
  'https://api.github.com/repos/humzak21/fantasyhub/actions/workflows/daily-refresh.yml/dispatches',
  'it posts to the workflow''s dispatch endpoint'
);

select is(
  (select q.method from net.http_request_queue q join dispatched d using (id)),
  'POST',
  'as a POST'
);

select is(
  (select pg_catalog.convert_from(q.body, 'utf8')::jsonb from net.http_request_queue q join dispatched d using (id)),
  '{"ref": "main", "inputs": {"trigger": "cron"}}'::jsonb,
  'on main, as a cron run'
);

select is(
  (select q.headers ->> 'Authorization' from net.http_request_queue q join dispatched d using (id)),
  'Bearer test-token',
  'with the token from Vault'
);

select * from finish();

rollback;
