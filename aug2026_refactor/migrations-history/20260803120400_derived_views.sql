-- Derived data becomes views (REFACTOR_ANALYSIS.md §3.2).
--
-- Scores in `games` are the single source of truth. Standings, career totals,
-- head-to-head and the record book are computed from them instead of being
-- stored in columns that a refresh_team_stats() call has to remember to update
-- -- the omission that produced recalculate_2024_team_stats.sql,
-- fix_wk1_2024_games.sql and find_missing_2024_game.sql.
--
-- Nothing is dropped here. The stored columns stay until the read paths are
-- repointed (P2); the point of this migration is to make the two comparable.

-- ---------------------------------------------------------------------------
-- v_game_results -- every completed game, once from each team's perspective
-- ---------------------------------------------------------------------------

create or replace view public.v_game_results
with (security_invoker = true) as
select
  g.id                     as game_id,
  g.season_id,
  g.week,
  g.type,
  g.completed_at,
  g.type = 'regular'       as is_regular,
  g.type like 'playoff%'   as is_playoff,
  g.team1_id               as team_id,
  g.team2_id               as opponent_id,
  g.team1_score            as points_for,
  g.team2_score            as points_against,
  case
    when g.team1_score > g.team2_score then 'W'
    when g.team1_score < g.team2_score then 'L'
    else 'T'
  end                      as result
from public.games g
where g.team2_id is not null
  and g.team1_score is not null
  and g.team2_score is not null
union all
select
  g.id, g.season_id, g.week, g.type, g.completed_at,
  g.type = 'regular', g.type like 'playoff%',
  g.team2_id, g.team1_id, g.team2_score, g.team1_score,
  case
    when g.team2_score > g.team1_score then 'W'
    when g.team2_score < g.team1_score then 'L'
    else 'T'
  end
from public.games g
where g.team2_id is not null
  and g.team1_score is not null
  and g.team2_score is not null;

comment on view public.v_game_results is
  'One row per (completed game, team). Base for every standings/career/H2H view.';

-- ---------------------------------------------------------------------------
-- v_team_standings -- replaces the ~25 computed columns on public.teams
-- ---------------------------------------------------------------------------

create or replace view public.v_team_standings
with (security_invoker = true) as
select
  t.id                as team_id,
  t.season_id,
  s.year              as season_year,
  s.status            as season_status,
  t.franchise_id,
  t.name              as team_name,
  t.owner             as owner_name,
  t.division_id,

  count(*) filter (where r.is_regular)                        as games_played,
  count(*) filter (where r.is_regular and r.result = 'W')     as wins,
  count(*) filter (where r.is_regular and r.result = 'L')     as losses,
  count(*) filter (where r.is_regular and r.result = 'T')     as ties,

  round(
    (count(*) filter (where r.is_regular and r.result = 'W')
     + 0.5 * count(*) filter (where r.is_regular and r.result = 'T'))
    / nullif(count(*) filter (where r.is_regular), 0)
  , 4)                                                        as win_percentage,

  coalesce(sum(r.points_for)     filter (where r.is_regular), 0) as points_for,
  coalesce(sum(r.points_against) filter (where r.is_regular), 0) as points_against,
  coalesce(sum(r.points_for)     filter (where r.is_regular), 0)
    - coalesce(sum(r.points_against) filter (where r.is_regular), 0) as point_differential,
  round(avg(r.points_for)     filter (where r.is_regular), 2)   as average_points_for,
  round(avg(r.points_against) filter (where r.is_regular), 2)   as average_points_against,
  max(r.points_for) filter (where r.is_regular)                 as best_week,
  min(r.points_for) filter (where r.is_regular)                 as worst_week,

  count(*) filter (where r.is_playoff and r.result = 'W')       as playoff_wins_played,
  count(*) filter (where r.is_playoff and r.result = 'L')       as playoff_losses_played,

  -- Facts that genuinely are not derivable from scores.
  t.made_playoffs,
  t.playoff_seed,
  t.playoff_finish,
  t.final_rank,

  coalesce(streak.result, 'none')                               as streak_type,
  coalesce(streak.len, 0)                                       as streak_length
from public.teams t
join public.seasons s on s.id = t.season_id
left join public.v_game_results r on r.team_id = t.id
left join lateral (
  -- Gaps-and-islands: the most recent unbroken run of identical results.
  -- Ordered newest-first, the leading run is the only one whose
  -- (overall rank - rank within result) is 0.
  select run.result, count(*) as len
  from (
    select
      r2.result,
      row_number() over (order by r2.week desc)
        - row_number() over (partition by r2.result order by r2.week desc) as grp
    from public.v_game_results r2
    where r2.team_id = t.id and r2.is_regular
  ) run
  where run.grp = 0
  group by run.result
) streak on true
group by
  t.id, t.season_id, s.year, s.status, t.franchise_id, t.name, t.owner,
  t.division_id, t.made_playoffs, t.playoff_seed, t.playoff_finish,
  t.final_rank, streak.result, streak.len;

comment on view public.v_team_standings is
  'Standings per (team, season) computed from games. Replaces teams.wins/losses/points_for/... and refresh_team_stats().';

-- ---------------------------------------------------------------------------
-- team_standings_as_of -- the same thing, restricted to weeks 1..N
-- ---------------------------------------------------------------------------
-- The power-ranking calculator needs "standings as they were entering week N".
-- A view cannot take a parameter, so this is the callable form.

create or replace function public.team_standings_as_of(
  p_season_id uuid,
  p_through_week integer
)
returns table (
  team_id uuid,
  team_name text,
  owner_name text,
  games_played bigint,
  wins bigint,
  losses bigint,
  ties bigint,
  win_percentage numeric,
  points_for numeric,
  points_against numeric,
  point_differential numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id,
    t.name,
    t.owner,
    count(*) filter (where r.is_regular),
    count(*) filter (where r.is_regular and r.result = 'W'),
    count(*) filter (where r.is_regular and r.result = 'L'),
    count(*) filter (where r.is_regular and r.result = 'T'),
    round(
      (count(*) filter (where r.is_regular and r.result = 'W')
       + 0.5 * count(*) filter (where r.is_regular and r.result = 'T'))
      / nullif(count(*) filter (where r.is_regular), 0)
    , 4),
    coalesce(sum(r.points_for)     filter (where r.is_regular), 0),
    coalesce(sum(r.points_against) filter (where r.is_regular), 0),
    coalesce(sum(r.points_for)     filter (where r.is_regular), 0)
      - coalesce(sum(r.points_against) filter (where r.is_regular), 0)
  from public.teams t
  left join public.v_game_results r
    on r.team_id = t.id and r.week <= p_through_week
  where t.season_id = p_season_id
  group by t.id, t.name, t.owner
$$;

comment on function public.team_standings_as_of(uuid, integer) is
  'Standings for a season restricted to weeks 1..p_through_week.';

-- ---------------------------------------------------------------------------
-- v_franchise_career -- replaces mv_franchise_career_stats AND the JS merge
-- ---------------------------------------------------------------------------
-- The matview only ever saw historical_teams, which is why
-- leagueHistoryManager.js had to bolt the current season on in JavaScript
-- (getFranchiseCareerStatsWithCurrentSeason, ...). This reads the unified
-- tables, so the active season is simply included.

create or replace view public.v_franchise_career
with (security_invoker = true) as
select
  f.id                          as franchise_id,
  f.owner_name,
  f.display_name,
  f.is_active,
  count(st.team_id)                                          as seasons_played,
  min(st.season_year)                                        as first_season,
  max(st.season_year)                                        as last_season,
  coalesce(sum(st.wins), 0)                                  as total_wins,
  coalesce(sum(st.losses), 0)                                as total_losses,
  coalesce(sum(st.ties), 0)                                  as total_ties,
  round(
    (coalesce(sum(st.wins), 0) + 0.5 * coalesce(sum(st.ties), 0))
    / nullif(coalesce(sum(st.games_played), 0), 0)
  , 4)                                                       as career_win_percentage,
  count(*) filter (where st.made_playoffs)                   as playoff_appearances,
  count(*) filter (where st.playoff_finish = 'champion')      as championships,
  count(*) filter (where st.playoff_finish = '2nd')           as runner_ups,
  coalesce(sum(st.points_for), 0)                            as career_points_for,
  coalesce(sum(st.points_against), 0)                        as career_points_against,
  coalesce(sum(st.point_differential), 0)                    as career_point_differential,
  round(avg(st.average_points_for), 2)                       as avg_points_per_game,
  round(avg(st.final_rank), 2)                               as avg_final_rank,
  min(st.final_rank)                                         as best_finish,
  max(st.final_rank)                                         as worst_finish
from public.league_franchises f
left join public.v_team_standings st on st.franchise_id = f.id
group by f.id, f.owner_name, f.display_name, f.is_active;

comment on view public.v_franchise_career is
  'All-time franchise totals across every season, current one included. Replaces mv_franchise_career_stats plus the current-season merge in leagueHistoryManager.js.';

-- ---------------------------------------------------------------------------
-- v_head_to_head -- replaces the head_to_head_records table
-- ---------------------------------------------------------------------------
-- One row per ordered franchise pair (both directions), so a lookup by
-- franchise_id needs no "which side am I on" logic at the call site.

create or replace view public.v_head_to_head
with (security_invoker = true) as
select
  t.franchise_id                                            as franchise_id,
  o.franchise_id                                            as opponent_franchise_id,
  count(*)                                                  as total_matchups,
  count(*) filter (where r.result = 'W')                    as wins,
  count(*) filter (where r.result = 'L')                    as losses,
  count(*) filter (where r.result = 'T')                    as ties,
  count(*) filter (where r.is_regular)                      as regular_season_matchups,
  count(*) filter (where r.is_regular and r.result = 'W')   as regular_season_wins,
  count(*) filter (where r.is_playoff)                      as playoff_matchups,
  count(*) filter (where r.is_playoff and r.result = 'W')   as playoff_wins,
  sum(r.points_for)                                         as total_points_for,
  sum(r.points_against)                                     as total_points_against,
  round(avg(r.points_for), 2)                               as avg_points_for,
  round(avg(r.points_against), 2)                           as avg_points_against,
  max(r.points_for)                                         as highest_score,
  max(r.points_for - r.points_against)                      as largest_margin
from public.v_game_results r
join public.teams t on t.id = r.team_id
join public.teams o on o.id = r.opponent_id
where t.franchise_id is not null
  and o.franchise_id is not null
group by t.franchise_id, o.franchise_id;

comment on view public.v_head_to_head is
  'All-time head-to-head per ordered franchise pair. Replaces head_to_head_records and scripts/calculateHeadToHeadHistory.js.';

-- ---------------------------------------------------------------------------
-- v_record_book -- replaces the (empty) franchise_records table
-- ---------------------------------------------------------------------------

create or replace view public.v_record_book
with (security_invoker = true) as
-- Single-game extremes
select
  'highest_single_game'                     as record_type,
  'game'                                    as scope,
  t.franchise_id,
  t.owner                                   as owner_name,
  r.points_for                              as value,
  round(r.points_for, 2)::text || ' pts'    as value_label,
  r.season_id,
  s.year                                    as season_year,
  r.week,
  r.game_id
from public.v_game_results r
join public.teams t   on t.id = r.team_id
join public.seasons s on s.id = r.season_id
where r.points_for = (select max(x.points_for) from public.v_game_results x)

union all
select
  'lowest_single_game', 'game', t.franchise_id, t.owner,
  r.points_for, round(r.points_for, 2)::text || ' pts',
  r.season_id, s.year, r.week, r.game_id
from public.v_game_results r
join public.teams t   on t.id = r.team_id
join public.seasons s on s.id = r.season_id
where r.points_for = (select min(x.points_for) from public.v_game_results x)

union all
select
  'largest_margin', 'game', t.franchise_id, t.owner,
  r.points_for - r.points_against,
  round(r.points_for - r.points_against, 2)::text || ' pt margin',
  r.season_id, s.year, r.week, r.game_id
from public.v_game_results r
join public.teams t   on t.id = r.team_id
join public.seasons s on s.id = r.season_id
where r.points_for - r.points_against
      = (select max(x.points_for - x.points_against) from public.v_game_results x)

-- Season extremes
union all
select
  'most_points_season', 'season', st.franchise_id, st.owner_name,
  st.points_for, round(st.points_for, 2)::text || ' pts',
  st.season_id, st.season_year, null, null
from public.v_team_standings st
where st.points_for = (select max(x.points_for) from public.v_team_standings x)

union all
select
  'fewest_points_season', 'season', st.franchise_id, st.owner_name,
  st.points_for, round(st.points_for, 2)::text || ' pts',
  st.season_id, st.season_year, null, null
from public.v_team_standings st
where st.games_played > 0
  and st.points_for = (
    select min(x.points_for) from public.v_team_standings x where x.games_played > 0
  )

union all
select
  'best_record_season', 'season', st.franchise_id, st.owner_name,
  st.win_percentage,
  st.wins::text || '-' || st.losses::text
    || case when st.ties > 0 then '-' || st.ties::text else '' end,
  st.season_id, st.season_year, null, null
from public.v_team_standings st
where st.games_played > 0
  and st.win_percentage = (
    select max(x.win_percentage) from public.v_team_standings x where x.games_played > 0
  );

comment on view public.v_record_book is
  'League record book computed from games. Replaces the never-populated franchise_records table.';

grant select on
  public.v_game_results,
  public.v_team_standings,
  public.v_franchise_career,
  public.v_head_to_head,
  public.v_record_book
to anon, authenticated;

grant execute on function public.team_standings_as_of(uuid, integer) to anon, authenticated;
