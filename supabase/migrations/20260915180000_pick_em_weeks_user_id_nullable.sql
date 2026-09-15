-- pick_em_weeks.user_id: a week the weekly sync opens has no creator.
--
-- The sync's first step (`pickEmWeek`, services/db/pickems.js::ensurePickEmWeek)
-- creates the week's row through create_pick_em_week while holding the
-- service-role key. That RPC names no user_id, so the column default and the
-- set_user_id() trigger both fall back to auth.uid() — which is NULL for the
-- service role, whose JWT carries a role and no subject. The column was NOT
-- NULL, so the insert was refused. The step shipped on 2026-09-03 but every run
-- found week 1 already open by hand; 2026-09-15 was the first Tuesday it had a
-- row to create, and week 2's pick'ems never opened. The step is non-fatal, so
-- the run still reported success.
--
-- Nothing reads the column — no policy, view, function or client code — so it
-- now records who opened a week when a person did, and NULL when the cron did.
-- The default and the trigger stay, so the admin button still stamps the admin
-- rather than the sync inventing an attribution.
--
-- supabase/tests/database/pick_em_weeks_service_role.test.sql exercises both
-- callers against the replayed schema in CI.

alter table public.pick_em_weeks
  alter column user_id drop not null;

comment on column public.pick_em_weeks.user_id is
  'Who opened the week, when a person did (the admin, from the Pick''ems admin panel). NULL when the weekly sync opened it with the service-role key, which has no auth.uid().';
