-- The week in progress, computed once and shared.
--
-- One row per season and week. The `live-scores` edge function pulls ESPN's
-- league payload and public scoreboard at most every 15 minutes, only while a
-- game is on, and stores the result here. Every viewer reads this one row, so
-- ESPN is called once for the league however many people are watching, and
-- never on a Wednesday.
--
-- This is a *live, unofficial* overlay and nothing more. It must not become a
-- way of writing `games`: `games.is_completed` is generated from the two scores
-- and the triggers roll standings from it, so a partial score there would
-- complete the game, move the standings and feed the parlay grader. The Tuesday
-- sync stays the only author of a result. This table can be dropped with no
-- effect on anything official.
--
-- Keyed by (season, week) rather than by the current week, because the week
-- rolls over at 00:00 ET on Tuesday and Monday night's final is not synced until
-- 05:00: Tuesday morning keeps reading last week's row.
--
--   matchups      [{ espnMatchupId, home, away, espnWinner }]; a side is
--                 { espnTeamId, points, projected }
--   lineups       { [espnTeamId]: entries }, self-sufficient, so a Sunday-noon
--                 pickup renders with no `players` row yet
--   nfl_games     { [abbreviation]: { state, detail, clock, period } }
--   live          was any NFL game in progress at the last refresh
--   refreshed_at  when ESPN last answered; the 15-minute clock reads this
--   refreshing_at the claim, so two viewers cannot both call ESPN
--   last_error    why the newest attempt failed, for the automations dashboard

create table if not exists public.live_week_snapshot (
  season_id uuid not null references public.seasons(id) on delete cascade,
  week integer not null check (week > 0),
  matchups jsonb not null default '[]'::jsonb,
  lineups jsonb not null default '{}'::jsonb,
  nfl_games jsonb not null default '{}'::jsonb,
  live boolean not null default false,
  refreshed_at timestamptz,
  refreshing_at timestamptz,
  last_error text,
  primary key (season_id, week)
);

alter table public.live_week_snapshot enable row level security;

-- Public read, like `games`. No anon or authenticated write policy exists on
-- purpose: the edge function is the only writer and it runs as the service role,
-- so a browser cannot write a fake score even though the anon key reaches
-- PostgREST directly.
drop policy if exists "live_week_snapshot readable by all" on public.live_week_snapshot;
create policy "live_week_snapshot readable by all"
  on public.live_week_snapshot for select using (true);

grant select on public.live_week_snapshot to anon, authenticated;

-- Take the right to refresh a week. True for exactly one caller at a time.
--
-- One statement, so it is atomic where a read and a write would race. It checks
-- `refreshed_at` as well as the claim, because a refresh that has just finished
-- has released its claim: a second viewer who read the old row a moment ago
-- would otherwise find nothing stopping them.
--
-- A failed refresh leaves its claim in place rather than releasing it, so a dead
-- cookie costs one attempt per `p_retry_after_seconds`, not one per viewer.
create or replace function public.claim_live_week_refresh(
  p_season_id uuid,
  p_week integer,
  p_fresh_for_seconds integer,
  p_retry_after_seconds integer
)
returns boolean
language sql
volatile
set search_path = public
as $$
  with claimed as (
    insert into public.live_week_snapshot as snapshot (season_id, week, refreshing_at)
    values (p_season_id, p_week, now())
    on conflict (season_id, week) do update
      set refreshing_at = now()
      where (snapshot.refreshing_at is null
             or snapshot.refreshing_at < now() - make_interval(secs => p_retry_after_seconds))
        and (snapshot.refreshed_at is null
             or snapshot.refreshed_at < now() - make_interval(secs => p_fresh_for_seconds))
    returning 1
  )
  select exists (select 1 from claimed);
$$;

-- Postgres grants EXECUTE to PUBLIC by default and `anon` inherits it.
revoke execute on function public.claim_live_week_refresh(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_live_week_refresh(uuid, integer, integer, integer)
  to service_role;
