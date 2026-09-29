-- The ESPN crons: Supabase keeps the clock, GitHub Actions still does the work.
--
-- Both jobs were `schedule:` triggers in GitHub Actions, and GitHub schedules
-- are best-effort. Measured over September 2026 the daily refresh (16:40 UTC)
-- started 112-335 minutes late — every game Sunday it landed during the early
-- games it exists to precede — and the weekly sync (Tuesday 10:00 UTC) started
-- 241-286 minutes late. The run was created that late, so no runner, queue or
-- concurrency setting could recover it.
--
-- A `workflow_dispatch` is not subject to that queue: it starts within seconds.
-- So pg_cron fires on the minute and asks GitHub's API to dispatch the
-- workflow, and the workflows have no `schedule:` of their own. The secrets,
-- logs, the `espn-write` concurrency group and scripts/sync-week.js are
-- untouched; only the clock moved.
--
-- The dispatch sends `inputs.trigger = 'cron'`, which the workflows read to
-- leave off `--manual`. Without it every run would log as a button press, and
-- the Automations dashboard — which counts only `trigger = 'cron'` runs toward
-- a slot — would call every slot missed while every run happened.
--
-- The token is a fine-grained GitHub PAT scoped to humzak21/fantasyhub with
-- Actions: read and write, stored in Vault as `github_actions_dispatch_token`
-- (never in a migration). Without it the function raises, and the failure is
-- in cron.job_run_details. A token GitHub rejects (expired, revoked) does not
-- raise — pg_net is asynchronous — and shows as a non-204 row in
-- net._http_response for six hours; the dashboard's "missed" warning is the
-- durable signal.
--
-- Changing a schedule means changing it here (cron.schedule upserts by name)
-- and in AUTOMATIONS in src/components/admin/automations/automationCatalog.js,
-- which is how the dashboard knows what a slot is.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Not `public`: PostgREST exposes that schema, and nothing a browser can reach
-- should be able to start a production sync. The revokes are belt and braces.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.dispatch_github_workflow(p_workflow text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  select decrypted_secret
    into v_token
    from vault.decrypted_secrets
   where name = 'github_actions_dispatch_token';

  if v_token is null then
    raise exception 'Vault secret github_actions_dispatch_token is missing; % was not dispatched', p_workflow;
  end if;

  return net.http_post(
    url := pg_catalog.format(
      'https://api.github.com/repos/humzak21/fantasyhub/actions/workflows/%s/dispatches',
      p_workflow
    ),
    headers := pg_catalog.jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'fantasyhub-pg-cron',
      'Content-Type', 'application/json'
    ),
    body := pg_catalog.jsonb_build_object(
      'ref', 'main',
      'inputs', pg_catalog.jsonb_build_object('trigger', 'cron')
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke execute on function private.dispatch_github_workflow(text) from public, anon, authenticated;

comment on function private.dispatch_github_workflow(text) is
  'Starts a GitHub Actions workflow on main with inputs.trigger = cron. Called only by pg_cron; see 20260929120000_cron_dispatch_workflows.sql.';

-- UTC, as GitHub's cron was. Job names are the automation ids in the catalog.
select cron.schedule(
  'weekly-sync',
  '0 10 * * 2',
  $$ select private.dispatch_github_workflow('sync-week.yml') $$
);

select cron.schedule(
  'daily-refresh',
  '40 16 * * *',
  $$ select private.dispatch_github_workflow('daily-refresh.yml') $$
);
