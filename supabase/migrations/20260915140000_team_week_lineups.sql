-- One row per team per settled week: what the lineup scored against what the
-- best legal lineup would have.
--
-- The lineup records (efficiency, perfect-lineup rate, points left on the
-- bench, avoidable losses) are all questions about the optimal lineup, and the
-- optimal lineup is a greedy fill of this league's QB/2RB/2WR/TE/FLEX/D-ST/K
-- template — `optimalLineupPoints` in services/powerRankingCalculator.js. That
-- function is the single definition. Restating it in SQL as a view would make
-- two; computing it in the browser would mean shipping every player-week the
-- league has ever had. So the writer computes it once, beside the player rows
-- it is computed from.
--
-- Written only by `services/db/playerWeekStats.js::upsertPlayerWeekStats`, in
-- the same call that writes `player_week_stats`, so the two cannot disagree.
-- Only for a settled week — every counted starter carries an actual — because
-- a projection is not a lineup result. `bench_points` is generated: it is
-- `optimal - starter` by definition and nothing should write it.

create table if not exists public.team_week_lineups (
  id               uuid primary key default gen_random_uuid(),
  season_id        uuid not null references public.seasons(id) on delete cascade,
  week             integer not null,
  team_id          uuid not null references public.teams(id) on delete cascade,
  starter_points   numeric not null,
  optimal_points   numeric not null,
  bench_points     numeric generated always as (optimal_points - starter_points) stored,
  starters_scoring integer not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint team_week_lineups_team_week_key unique (season_id, week, team_id),
  constraint team_week_lineups_week_check check (week > 0),
  constraint team_week_lineups_optimal_check check (optimal_points >= starter_points),
  constraint team_week_lineups_starters_check check (starters_scoring >= 0)
);

comment on table public.team_week_lineups is
  'Per team per settled week: starter points, the optimal lineup''s points (optimalLineupPoints, the single definition), and how many starters scored. Written by upsertPlayerWeekStats alongside player_week_stats; feeds the lineup records.';
comment on column public.team_week_lineups.starters_scoring is
  'Starters with more than zero actual points. A win with fewer than nine is the short-handed-win record.';

alter table public.team_week_lineups enable row level security;

drop policy if exists "team_week_lineups public read" on public.team_week_lineups;
create policy "team_week_lineups public read" on public.team_week_lineups
  for select using (true);

drop policy if exists "team_week_lineups league write" on public.team_week_lineups;
create policy "team_week_lineups league write" on public.team_week_lineups
  using (public.can_write_league()) with check (public.can_write_league());

grant all on table public.team_week_lineups to anon;
grant all on table public.team_week_lineups to authenticated;
grant all on table public.team_week_lineups to service_role;
