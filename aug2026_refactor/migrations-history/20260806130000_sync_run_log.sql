-- A run log for the weekly ESPN sync (§7.2).
--
-- Until now the only record that a weekly update happened was console output in
-- a Railway log stream that scrolled away, which is why the 2026-08-06
-- accidental production sync had to be reconstructed by diffing the data. The
-- job now writes one row per run: what it targeted, what it wrote, and whether
-- it failed. `scripts/sync-week.js` is the only writer.
--
-- Public-read (the league can see whether the site is current) / admin-write,
-- matching every other table's policy shape. The job itself connects with the
-- service-role key, which bypasses RLS.

create table if not exists public.sync_runs (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references public.seasons (id) on delete cascade,
  week_number   integer not null,
  -- 'running' is written at the start so a crashed run is distinguishable from
  -- a run that never started. Terminal states are 'success' and 'failed'.
  status        text not null default 'running'
                  check (status in ('running', 'success', 'failed')),
  trigger       text not null default 'cron'
                  check (trigger in ('cron', 'manual')),
  -- Per-step counts, e.g. {"rosters": {...}, "scores": {"updated": 7}, ...}.
  -- Kept as jsonb rather than columns because the steps change more often than
  -- the shape of a run does.
  steps         jsonb not null default '{}'::jsonb,
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  duration_ms   integer generated always as (
                  case
                    when finished_at is null then null
                    else (extract(epoch from (finished_at - started_at)) * 1000)::integer
                  end
                ) stored
);

comment on table public.sync_runs is
  'One row per weekly ESPN sync run. Written only by scripts/sync-week.js.';

-- The dashboard query is "the latest runs for this season", so index that.
create index if not exists sync_runs_season_started_idx
  on public.sync_runs (season_id, started_at desc);

alter table public.sync_runs enable row level security;

drop policy if exists "sync_runs public read" on public.sync_runs;
create policy "sync_runs public read"
  on public.sync_runs for select
  using (true);

drop policy if exists "sync_runs admin write" on public.sync_runs;
create policy "sync_runs admin write"
  on public.sync_runs for all
  using (public.is_admin())
  with check (public.is_admin());
