-- The TD parlay's live status, computed once and shared.
--
-- One row per pick'em week. The `parlay-live` edge function fetches ESPN's
-- public scoreboard at most once every 30 minutes, only during game windows,
-- boils it down to a per-pick "scored a rushing/receiving TD yet" status, and
-- stores it here. Every viewer reads this one small row instead of each browser
-- fetching ESPN — so ESPN is hit once per half-hour no matter how many people
-- are watching, and never outside a game window.
--
-- This is a *live, unofficial* overlay and nothing more. It never writes
-- td_parlay_picks.scored_td — the Tuesday sync's grader remains the only writer
-- of the official grade, which always wins in the UI. This table can be dropped
-- with no effect on the official result.
--
--   status        { [pickId]: { state, scored, tds, detail } }  — the answer the UI renders
--   event_states  { [espnEventId]: 'in' | 'post' | 'not_started' } — lets a refresh
--                 skip re-fetching a game that is already final (its TDs cannot change),
--                 which is what keeps the Sunday call count low as games end
--   live          was any picked team's game in progress at the last refresh
--   refreshed_at  when ESPN was last pulled — the 30-minute clock reads this

create table if not exists public.parlay_live_snapshot (
  pick_em_week_id uuid primary key references public.pick_em_weeks(id) on delete cascade,
  status jsonb not null default '{}'::jsonb,
  event_states jsonb not null default '{}'::jsonb,
  live boolean not null default false,
  refreshed_at timestamptz not null default now()
);

alter table public.parlay_live_snapshot enable row level security;

-- Public read, like td_parlay_picks and the rest of the parlay board. The
-- client reads the snapshot through the edge function's response, but a plain
-- read is harmless and useful (last-known status with no round trip to ESPN).
drop policy if exists "parlay_live readable by all" on public.parlay_live_snapshot;
create policy "parlay_live readable by all"
  on public.parlay_live_snapshot for select using (true);

-- No anon/authenticated write policy exists on purpose: the edge function is the
-- only writer and it runs as the service role, which bypasses RLS. A browser
-- cannot write a fake live status even though the anon key reaches PostgREST
-- directly — the same shape as td_parlay_picks, whose only write path is an RPC.
grant select on public.parlay_live_snapshot to anon, authenticated;
