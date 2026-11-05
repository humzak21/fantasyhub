-- A player's page: every week he spent on a roster here, and his career.
--
-- Every player name on the site opens his page (`?player=<players.id>`). The
-- page needs two things the browser cannot work out from one player's rows:
-- where each of his weeks ranked among everybody else's that week, and where
-- his career stands among every other player at his position. Both need the
-- whole league's `player_week_stats`, which passes 22,000 rows, so they are
-- views here rather than a league-wide read on every open.
--
-- `v_player_week_lines` is one row per `player_week_stats` row, with the
-- season's year, the franchise that held him, his ranks that week and his
-- team's game. `v_player_careers` is one row per player ever rostered, read
-- from it, so a week means the same thing in both.
--
-- Two rules, both load-bearing:
--
-- * Ranks are among appeared rows only. `appeared` is the rule of
--   `utils/franchiseWeeks.js::appeared`: a result, and either a non-zero one or
--   a stat line behind it. A settled week stores 0 for every rostered player,
--   the one on IR included, and ranking those would hand the injured a rank
--   and push every real zero down the board. A row that did not appear has
--   NULL for all four rank columns and takes no slot in anybody's pool. Ranks
--   are competition ranking (1, 1, 3), `rank()` over points within the
--   (season, week), and within its position for `position_rank`.
--
-- * Unknown is NULL, never 0. A week with no game row has no score, no result
--   and no `is_bye`; a player with no appeared week has no points per game.
--   A 0 would read as a result to every caller.
--
-- Both are `security_invoker`, so the tables' own public-read policies decide
-- who reads them, as with `v_game_results`. Additive: nothing reads them until
-- the client that does ships.

-- ---------------------------------------------------------------------------
-- 1. v_player_week_lines
-- ---------------------------------------------------------------------------

create or replace view public.v_player_week_lines with (security_invoker = true) as
select
    pws.id,
    pws.season_id,
    s.year,
    pws.week,
    pws.player_id,
    pws.espn_player_id,
    pws.team_id,
    t.franchise_id,
    pws.position,
    pws.roster_slot,
    pws.started,
    pws.actual_points,
    pws.projected_points,
    pws.pro_team_id,
    pws.injury_status,
    pws.stat_breakdown,
    (pws.actual_points is not null
      and (pws.actual_points <> 0 or pws.stat_breakdown is not null)) as appeared,
    r.overall_rank,
    r.overall_of,
    r.position_rank,
    r.position_of,
    g.id as game_id,
    g.type as game_type,
    g.team_score,
    g.opponent_score,
    g.opponent_team_id,
    ot.franchise_id as opponent_franchise_id,
    case
      when g.id is null or g.is_bye then null
      when g.team_score is null or g.opponent_score is null then null
      when g.team_score > g.opponent_score then 'W'
      when g.team_score < g.opponent_score then 'L'
      else 'T'
    end as result,
    g.is_bye
from public.player_week_stats pws
join public.seasons s on s.id = pws.season_id
left join public.teams t on t.id = pws.team_id
left join (
    -- The pool is the appeared rows of the week, and nothing else.
    select
        a.id,
        rank() over (partition by a.season_id, a.week
                     order by a.actual_points desc)::integer as overall_rank,
        count(*) over (partition by a.season_id, a.week)::integer as overall_of,
        rank() over (partition by a.season_id, a.week, a.position
                     order by a.actual_points desc)::integer as position_rank,
        count(*) over (partition by a.season_id, a.week, a.position)::integer as position_of
    from public.player_week_stats a
    where a.actual_points is not null
      and (a.actual_points <> 0 or a.stat_breakdown is not null)
) r on r.id = pws.id
left join lateral (
    -- One game per team-week. Should a team-week ever hold two rows, a real
    -- game beats a bye, then the lower id: the same answer every read.
    select
        gm.id,
        gm.type,
        (coalesce(gm.type = 'bye', false) or gm.team2_id is null) as is_bye,
        case when gm.team1_id = pws.team_id then gm.team1_score else gm.team2_score end as team_score,
        case
          when coalesce(gm.type = 'bye', false) or gm.team2_id is null then null
          when gm.team1_id = pws.team_id then gm.team2_score
          else gm.team1_score
        end as opponent_score,
        case
          when coalesce(gm.type = 'bye', false) or gm.team2_id is null then null
          when gm.team1_id = pws.team_id then gm.team2_id
          else gm.team1_id
        end as opponent_team_id
    from public.games gm
    where gm.season_id = pws.season_id
      and gm.week = pws.week
      and (gm.team1_id = pws.team_id or gm.team2_id = pws.team_id)
    order by (coalesce(gm.type = 'bye', false) or gm.team2_id is null), gm.id
    limit 1
) g on true
left join public.teams ot on ot.id = g.opponent_team_id;

comment on view public.v_player_week_lines is
  'One row per player_week_stats row, for a player''s page: the season year, the franchise that held him, '
  'appeared (a result, non-zero or with a stat line; utils/franchiseWeeks.js::appeared), his competition rank '
  'that week among appeared rows overall and at his position (NULL when he did not appear), and his team''s game '
  '(scores, opponent, W/L/T; NULL with no game row, no result on a bye).';

grant select on public.v_player_week_lines to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. v_player_careers
-- ---------------------------------------------------------------------------
-- Points are over appeared weeks only, so an injury is not a bad game. The
-- started/bench split is known whenever he played, so it is 0 rather than NULL
-- for a player who played and was never benched; it is NULL only when he never
-- played at all.

create or replace view public.v_player_careers with (security_invoker = true) as
select
    p.id as player_id,
    p.espn_player_id,
    p.name,
    p.position,
    count(*)::integer as weeks_rostered,
    count(*) filter (where l.started)::integer as weeks_started,
    count(*) filter (where l.appeared)::integer as games_played,
    count(*) filter (where l.started and l.appeared)::integer as started_games,
    sum(l.actual_points) filter (where l.appeared) as total_points,
    avg(l.actual_points) filter (where l.appeared) as points_per_game,
    case when bool_or(l.appeared)
      then coalesce(sum(l.actual_points) filter (where l.appeared and l.started), 0)
    end as started_points,
    case when bool_or(l.appeared)
      then coalesce(sum(l.actual_points) filter (where l.appeared and not l.started), 0)
    end as bench_points,
    max(l.actual_points) filter (where l.appeared) as best_points,
    min(l.actual_points) filter (where l.appeared) as worst_points,
    stddev_pop(l.actual_points) filter (where l.appeared) as points_stddev,
    count(distinct l.season_id)::integer as seasons_played,
    min(l.year) as first_year,
    max(l.year) as last_year,
    count(distinct l.franchise_id)::integer as franchises,
    (array_agg(l.team_id order by l.year desc, l.week desc))[1] as last_team_id
from public.players p
join public.v_player_week_lines l on l.player_id = p.id
group by p.id, p.espn_player_id, p.name, p.position;

comment on view public.v_player_careers is
  'One row per player ever rostered here, from v_player_week_lines: weeks rostered and started, games played '
  '(appeared weeks), and points over appeared weeks only (NULL with none). Read whole by the client, which ranks '
  'points per game within position.';

grant select on public.v_player_careers to anon, authenticated;
