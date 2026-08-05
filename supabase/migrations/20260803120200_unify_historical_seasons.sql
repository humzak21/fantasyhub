-- Collapse the "historical" universe into the live tables (REFACTOR_ANALYSIS.md §3.1).
--
-- historical_seasons/teams/games are structurally the same domain as
-- seasons/teams/games; keeping them apart is why leagueHistoryManager.js has to
-- implement every all-time stat twice and merge the halves in JS.
--
-- Rows are copied with their ORIGINAL uuids, so historical_teams.season_id and
-- historical_games.team1_id/team2_id/winner_team_id resolve against the live
-- tables without any id remapping. Verified beforehand: no id collisions
-- between the two universes, no duplicate (season, team_name) pairs.
--
-- The source tables are left in place and untouched. They are dropped only
-- after the new read paths have been verified in production (§3.6).

-- ---------------------------------------------------------------------------
-- 0. Quiet the triggers that would corrupt a bulk backfill
-- ---------------------------------------------------------------------------
-- trigger_create_default_divisions fabricates divisions named 'Donkeys' and
--   'Ninjas' on every seasons INSERT, which collides with the real division
--   rows created in step 3. (This is the server-side twin of the hook side
--   effect flagged in §6.3 -- it should be removed there too.)
-- before_game_update / after_game_completion recompute teams.wins,
--   points_for, ... from games on every INSERT. Letting them fire would
--   overwrite the archived regular-season splits being copied in step 4 with
--   playoff-inclusive totals, silently changing every number the History tab
--   shows. Stored stats are reconciled against computed ones in §3.2 instead.
--
-- Re-enabled at the end of this migration; the whole file is one transaction,
-- so a failure leaves the triggers on.

alter table public.seasons disable trigger trigger_create_default_divisions;
alter table public.games   disable trigger before_game_update;
alter table public.games   disable trigger after_game_completion;

-- ---------------------------------------------------------------------------
-- 1. Make the live tables able to hold seasons that predate the app
-- ---------------------------------------------------------------------------

-- user_id is multi-tenant scaffolding for a design that never happened (§3.4).
-- Archived seasons have no owning user, and NOT NULL DEFAULT auth.uid() would
-- attribute them to whoever ran the migration. Relax now, drop in P2.
alter table public.seasons alter column user_id drop not null;
alter table public.teams   alter column user_id drop not null;
alter table public.games   alter column user_id drop not null;
alter table public.weeks   alter column user_id drop not null;

-- The legacy (user_id, year) uniqueness is meaningless once user_id is gone,
-- and it does not constrain rows where user_id is null. seasons_year_key
-- (added in the previous migration) is the real constraint.
alter table public.seasons drop constraint if exists seasons_year_user_unique;

alter table public.seasons
  add column if not exists scoring_type text;

-- Facts about a season that genuinely are not derivable from game scores.
-- (The derived columns -- wins, points_for, ... -- are populated here only so
-- the old and new read paths can be compared; they become views in §3.2.)
alter table public.teams
  add column if not exists made_playoffs boolean,
  add column if not exists playoff_seed integer,
  add column if not exists playoff_wins integer,
  add column if not exists playoff_losses integer,
  add column if not exists playoff_finish text,
  add column if not exists final_rank integer,
  add column if not exists season_stats jsonb,
  add column if not exists draft_picks jsonb;

alter table public.games
  add column if not exists is_upset boolean default false,
  add column if not exists espn_matchup_id integer,
  add column if not exists espn_scoring_period_id integer,
  add column if not exists created_at timestamptz default now();

-- ---------------------------------------------------------------------------
-- 2. Seasons
-- ---------------------------------------------------------------------------
-- start_date is the Tuesday before that year's NFL kickoff Thursday -- the same
-- rule that produced the 2025 value (2025-09-04 kickoff -> 2025-09-02).

insert into public.seasons (
  id, user_id, year, name, league_size, regular_season_weeks, playoff_weeks,
  is_active, is_completed, created_at, completed_at,
  stats, playoff_bracket, scoring_type, start_date, espn_league_id,
  espn_season_year
)
-- total_weeks is omitted deliberately: it is already a generated column
-- (regular_season_weeks + playoff_weeks).
select
  hs.id,
  null,
  hs.year,
  hs.name,
  hs.league_size,
  hs.regular_season_weeks,
  hs.playoff_weeks,
  false,
  true,
  hs.created_at,
  hs.updated_at,
  coalesce(hs.stats, '{}'::jsonb),
  hs.playoff_bracket,
  hs.scoring_type,
  k.start_date,
  hs.espn_league_id,
  hs.year
from public.historical_seasons hs
join (values
  (2020, date '2020-09-08'),
  (2021, date '2021-09-07'),
  (2022, date '2022-09-06'),
  (2023, date '2023-09-05'),
  (2024, date '2024-09-03')
) as k(year, start_date) on k.year = hs.year
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Divisions
-- ---------------------------------------------------------------------------
-- historical_teams carries a division *name*; the live model uses a
-- season-scoped divisions row. Create the rows so both eras use one shape.

insert into public.divisions (season_id, name, display_order)
select
  t.season_id,
  t.division_name,
  dense_rank() over (partition by t.season_id order by t.division_name)
from (
  select distinct season_id, division_name
  from public.historical_teams
  where division_name is not null
) t
on conflict (season_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Teams
-- ---------------------------------------------------------------------------

insert into public.teams (
  id, user_id, season_id, name, owner, created_at, updated_at,
  franchise_id, espn_team_id, division_id,
  wins, losses, ties, win_percentage,
  points_for, points_against, point_differential, average_points_for,
  strength_of_schedule, power_rating,
  made_playoffs, playoff_seed, playoff_wins, playoff_losses, playoff_finish,
  final_rank, season_stats, draft_picks
)
select
  ht.id,
  null,
  ht.season_id,
  ht.team_name,
  f.owner_name,
  ht.created_at,
  ht.updated_at,
  ht.franchise_id,
  ht.espn_team_id,
  d.id,
  ht.regular_season_wins,
  ht.regular_season_losses,
  ht.regular_season_ties,
  ht.regular_season_win_percentage,
  ht.points_for,
  ht.points_against,
  ht.point_differential,
  ht.average_points_per_game,
  ht.strength_of_schedule,
  ht.power_rating,
  ht.made_playoffs,
  ht.playoff_seed,
  ht.playoff_wins,
  ht.playoff_losses,
  ht.playoff_finish,
  ht.final_rank,
  ht.season_stats,
  ht.draft_picks
from public.historical_teams ht
left join public.league_franchises f on f.id = ht.franchise_id
left join public.divisions d
  on d.season_id = ht.season_id and d.name = ht.division_name
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Games
-- ---------------------------------------------------------------------------

insert into public.games (
  id, user_id, season_id, week, team1_id, team2_id,
  team1_score, team2_score, type,
  winner_team_id, loser_team_id, is_tie, point_differential,
  is_blowout, is_close, is_upset,
  espn_matchup_id, espn_scoring_period_id, completed_at, created_at
)
-- is_completed is omitted deliberately: on public.games it is generated from
-- (team1_score is not null and team2_score is not null).
select
  hg.id,
  null,
  hg.season_id,
  hg.week,
  hg.team1_id,
  hg.team2_id,
  hg.team1_score,
  hg.team2_score,
  hg.type,
  hg.winner_team_id,
  hg.loser_team_id,
  hg.is_tie,
  hg.point_differential,
  hg.is_blowout,
  hg.is_close,
  hg.is_upset,
  hg.espn_matchup_id,
  hg.espn_scoring_period_id,
  hg.completed_at,
  hg.created_at
from public.historical_games hg
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Restore triggers
-- ---------------------------------------------------------------------------

alter table public.seasons enable trigger trigger_create_default_divisions;
alter table public.games   enable trigger before_game_update;
alter table public.games   enable trigger after_game_completion;

-- ---------------------------------------------------------------------------
-- 7. Indexes for the season-scoped reads this makes hotter
-- ---------------------------------------------------------------------------

create index if not exists teams_season_id_idx        on public.teams (season_id);
create index if not exists teams_franchise_id_idx     on public.teams (franchise_id);
create index if not exists games_season_week_idx      on public.games (season_id, week);
create index if not exists games_team1_idx            on public.games (team1_id);
create index if not exists games_team2_idx            on public.games (team2_id);
