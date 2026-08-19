-- Finish a season, in the database.
--
-- Nothing ever wrote `seasons.is_completed` or the `teams` placement columns
-- for a live season: 2020-24 got theirs from an import script that was deleted
-- in the August 2026 refactor, and 2025 got none at all. So 2025 sat at
-- `status = 'upcoming'` with NULL `playoff_finish`, invisible to every view
-- League History reads.
--
-- `finalize_season` derives the placements from the games that were actually
-- played and writes them. `compute_season_awards` derives the eleven computed
-- awards the same way. Both are idempotent, both refuse to guess: an
-- unfinished game or an unfamiliar bracket shape raises rather than inventing
-- a champion.

-- ---------------------------------------------------------------------------
-- finalize_season
-- ---------------------------------------------------------------------------

create or replace function public.finalize_season(
  p_season_id uuid,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
-- pg_temp last: this function keeps its working state in temp tables, and a
-- SECURITY DEFINER body must not resolve `teams` to something a caller made.
set search_path = public, pg_temp
as $$
declare
  v_season      seasons%rowtype;
  v_team_count  integer;
  v_incomplete  integer;
  v_title_games integer;
  v_bracket     uuid[];
  v_final_week  integer;
  v_champion    uuid;
  v_runner_up   uuid;
  v_losers      uuid[];
  v_round_week  integer;
  v_winner      uuid;
  v_hi          uuid;
  v_lo          uuid;
  v_round       record;
  v_result      jsonb;
begin
  -- `can_write_league()`, not `is_admin()`: the latter reads the JWT email and
  -- the service role has none, so an admin-only guard would lock out every
  -- script. Never test current_user here — it is the owner, not the caller.
  if not public.can_write_league() then
    raise exception 'finalize_season: not authorised';
  end if;

  select * into v_season from seasons where id = p_season_id;
  if not found then
    raise exception 'finalize_season: season % not found', p_season_id;
  end if;

  -- Preconditions. A season with a game still in flight has no final standing,
  -- and a bracket we do not recognise is one we must not guess at.
  select count(*) into v_incomplete
  from games
  where season_id = p_season_id
    and type is distinct from 'bye'
    and team2_id is not null
    and coalesce(is_completed, false) = false;

  if v_incomplete > 0 then
    raise exception 'finalize_season: % game(s) of the % season are not complete',
      v_incomplete, v_season.year;
  end if;

  select count(*) into v_title_games
  from games
  where season_id = p_season_id and type = 'playoff_championship';

  if v_title_games <> 1 then
    raise exception
      'finalize_season: expected exactly one playoff_championship game in %, found %',
      v_season.year, v_title_games;
  end if;

  select max(week) into v_final_week from games where season_id = p_season_id;

  -- Overall standing, the fallback every tiebreak below falls back to.
  drop table if exists _fs_standing;
  create temp table _fs_standing on commit drop as
  select st.team_id,
         st.owner_name,
         st.wins,
         st.losses,
         st.points_for,
         (row_number() over (order by st.wins desc, st.points_for desc, st.team_id))::int as pos
  from v_team_standings st
  where st.season_id = p_season_id;

  select count(*) into v_team_count from _fs_standing;

  -- The bracket is whoever appeared in a bracket game, plus whoever was given a
  -- first-round bye. Byes are one-sided rows, so only team1_id is meaningful.
  select array_agg(distinct tid) into v_bracket
  from (
    select team1_id as tid from games
     where season_id = p_season_id
       and type in ('playoff_first_round', 'playoff_semifinals', 'playoff_championship')
    union all
    select team2_id from games
     where season_id = p_season_id
       and type in ('playoff_first_round', 'playoff_semifinals', 'playoff_championship')
    union all
    select team1_id from games
     where season_id = p_season_id and type = 'bye'
  ) b
  where tid is not null;

  if coalesce(array_length(v_bracket, 1), 0) <> 6 then
    raise exception
      'finalize_season: expected a 6-team bracket in %, found % team(s) — finalize by hand',
      v_season.year, coalesce(array_length(v_bracket, 1), 0);
  end if;

  drop table if exists _fs_assign;
  create temp table _fs_assign (
    team_id        uuid primary key,
    playoff_seed   integer,
    made_playoffs  boolean,
    playoff_wins   integer not null default 0,
    playoff_losses integer not null default 0,
    playoff_finish text,
    final_rank     integer
  ) on commit drop;

  -- Seeds 1-6 to the bracket by standing, 7-N to everyone else by standing.
  -- 2020-24 seed all fourteen teams; this keeps that convention.
  insert into _fs_assign (team_id, playoff_seed, made_playoffs)
  select s.team_id,
         (row_number() over (
            partition by (s.team_id = any(v_bracket)) order by s.pos
          ))::int + case when s.team_id = any(v_bracket) then 0 else 6 end,
         s.team_id = any(v_bracket)
  from _fs_standing s;

  -- Podium: the title game settles 1 and 2 outright.
  select winner_team_id, loser_team_id into v_champion, v_runner_up
  from games
  where season_id = p_season_id and type = 'playoff_championship'
  limit 1;

  if v_champion is null then
    raise exception 'finalize_season: the % championship game has no winner', v_season.year;
  end if;

  update _fs_assign set playoff_finish = 'champion', final_rank = 1 where team_id = v_champion;
  update _fs_assign set playoff_finish = '2nd',      final_rank = 2 where team_id = v_runner_up;

  -- 3rd/4th and 5th/6th: the two teams knocked out in the same round meet again
  -- later (a third-place game, or 2025's two-leg fifth-place series). The
  -- latest such meeting decides it; with no rematch, the standing does.
  for v_round in
    select *
    from (values
      ('playoff_semifinals'::text,  3, '3rd'::text, '4th'::text),
      ('playoff_first_round'::text, 5, '5th'::text, '6th'::text)
    ) as r(round_type, base_rank, hi_finish, lo_finish)
  loop
    select array_agg(g.loser_team_id), max(g.week)
      into v_losers, v_round_week
    from games g
    where g.season_id = p_season_id
      and g.type = v_round.round_type
      and g.loser_team_id is not null;

    if coalesce(array_length(v_losers, 1), 0) <> 2 then
      raise exception
        'finalize_season: expected 2 losers in % for %, found %',
        v_round.round_type, v_season.year, coalesce(array_length(v_losers, 1), 0);
    end if;

    select g.winner_team_id into v_winner
    from games g
    where g.season_id = p_season_id
      and g.week > v_round_week
      and (   (g.team1_id = v_losers[1] and g.team2_id = v_losers[2])
           or (g.team1_id = v_losers[2] and g.team2_id = v_losers[1]))
      and g.winner_team_id is not null
    order by g.week desc
    limit 1;

    if v_winner is null then
      select case
               when (select pos from _fs_standing where team_id = v_losers[1])
                  <= (select pos from _fs_standing where team_id = v_losers[2])
               then v_losers[1] else v_losers[2]
             end
        into v_winner;
    end if;

    v_hi := v_winner;
    v_lo := case when v_winner = v_losers[1] then v_losers[2] else v_losers[1] end;

    update _fs_assign
       set playoff_finish = v_round.hi_finish, final_rank = v_round.base_rank
     where team_id = v_hi;
    update _fs_assign
       set playoff_finish = v_round.lo_finish, final_rank = v_round.base_rank + 1
     where team_id = v_lo;
  end loop;

  -- Consolation, 7 through N. Each final-week consolation championship settles
  -- one adjacent pair; the pairs themselves are ordered by how far they got in
  -- the consolation bracket, then by regular-season standing.
  drop table if exists _fs_pairs;
  create temp table _fs_pairs on commit drop as
  with cons_pre as (
    select r.team_id, count(*) filter (where r.result = 'W') as wins
    from v_game_results r
    where r.season_id = p_season_id
      and r.type like 'playoff_consolation%'
      and r.week < v_final_week
    group by r.team_id
  ),
  finals as (
    select
      case
        when g.winner_team_id is not null then g.winner_team_id
        when (select pos from _fs_standing where team_id = g.team1_id)
           <= (select pos from _fs_standing where team_id = g.team2_id) then g.team1_id
        else g.team2_id
      end as hi,
      case
        when g.winner_team_id is not null then g.loser_team_id
        when (select pos from _fs_standing where team_id = g.team1_id)
           <= (select pos from _fs_standing where team_id = g.team2_id) then g.team2_id
        else g.team1_id
      end as lo
    from games g
    where g.season_id = p_season_id
      and g.type = 'playoff_consolation_championship'
      and g.week = v_final_week
      and g.team2_id is not null
  )
  select f.hi,
         f.lo,
         coalesce(ph.wins, 0) + coalesce(pl.wins, 0) as pair_wins,
         least(sh.pos, sl.pos) as best_pos
  from finals f
  join _fs_standing sh on sh.team_id = f.hi
  join _fs_standing sl on sl.team_id = f.lo
  left join cons_pre ph on ph.team_id = f.hi
  left join cons_pre pl on pl.team_id = f.lo;

  with ranked as (
    select hi, lo,
           row_number() over (order by pair_wins desc, best_pos asc, hi) as pair_pos
    from _fs_pairs
  ),
  spread as (
    select hi as team_id, 7 + (pair_pos - 1) * 2 as rnk from ranked
    union all
    select lo,            8 + (pair_pos - 1) * 2      from ranked
  )
  update _fs_assign a
     set playoff_finish = 'none', final_rank = s.rnk
    from spread s
   where a.team_id = s.team_id;

  -- Anyone the consolation bracket did not place (a season with no consolation
  -- games at all, or a team that sat one out) takes what ranks are left, best
  -- standing first.
  with leftovers as (
    select a.team_id, row_number() over (order by s.pos) as ord
    from _fs_assign a
    join _fs_standing s on s.team_id = a.team_id
    where a.final_rank is null
  ),
  free_ranks as (
    select gs.rnk, row_number() over (order by gs.rnk) as ord
    from generate_series(1, v_team_count) gs(rnk)
    where gs.rnk not in (select final_rank from _fs_assign where final_rank is not null)
  )
  update _fs_assign a
     set playoff_finish = coalesce(a.playoff_finish, 'none'), final_rank = f.rnk
    from leftovers l
    join free_ranks f on f.ord = l.ord
   where a.team_id = l.team_id;

  -- Playoff records are a bracket-team statistic; the historical rows leave
  -- everyone else at zero rather than counting consolation games.
  update _fs_assign a
     set playoff_wins = coalesce(p.w, 0), playoff_losses = coalesce(p.l, 0)
    from (
      select r.team_id,
             count(*) filter (where r.result = 'W') as w,
             count(*) filter (where r.result = 'L') as l
      from v_game_results r
      where r.season_id = p_season_id and r.is_playoff
      group by r.team_id
    ) p
   where a.team_id = p.team_id and a.made_playoffs;

  if not p_dry_run then
    update teams t
       set made_playoffs  = a.made_playoffs,
           playoff_seed   = a.playoff_seed,
           playoff_wins   = a.playoff_wins,
           playoff_losses = a.playoff_losses,
           playoff_finish = a.playoff_finish,
           final_rank     = a.final_rank
      from _fs_assign a
     where t.id = a.team_id;

    update seasons
       set is_completed = true,
           completed_at = coalesce(completed_at, now())
     where id = p_season_id;
  end if;

  select jsonb_build_object(
    'season_id', p_season_id,
    'year', v_season.year,
    'dry_run', p_dry_run,
    'assignments', coalesce(jsonb_agg(
      jsonb_build_object(
        'team_id', a.team_id,
        'owner', s.owner_name,
        'record', s.wins || '-' || s.losses,
        'seed', a.playoff_seed,
        'made_playoffs', a.made_playoffs,
        'finish', a.playoff_finish,
        'final_rank', a.final_rank,
        'playoff_wins', a.playoff_wins,
        'playoff_losses', a.playoff_losses
      ) order by a.final_rank
    ), '[]'::jsonb)
  ) into v_result
  from _fs_assign a
  join _fs_standing s on s.team_id = a.team_id;

  return v_result;
end;
$$;

comment on function public.finalize_season(uuid, boolean) is
  'Derive and write a season''s final placements from its games. Idempotent; '
  'raises rather than guessing. Pass p_dry_run to see the assignments first.';

-- Postgres grants EXECUTE to PUBLIC by default and `anon` inherits it, so
-- revoking only the named roles would be a silent no-op.
revoke all on function public.finalize_season(uuid, boolean) from public;
revoke all on function public.finalize_season(uuid, boolean) from anon;
revoke all on function public.finalize_season(uuid, boolean) from authenticated;
grant execute on function public.finalize_season(uuid, boolean) to authenticated;
grant execute on function public.finalize_season(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- compute_season_awards
-- ---------------------------------------------------------------------------

-- What makes the upsert idempotent. Ballot awards share the table and are not
-- unique per type, so the constraint has to be partial.
create unique index if not exists awards_computed_season_type_idx
  on public.awards (season_id, award_type)
  where source = 'computed';

create or replace function public.compute_season_awards(p_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year   integer;
  v_result jsonb;
begin
  if not public.can_write_league() then
    raise exception 'compute_season_awards: not authorised';
  end if;

  select year into v_year from seasons where id = p_season_id;
  if v_year is null then
    raise exception 'compute_season_awards: season % not found', p_season_id;
  end if;

  -- Every award below is a regular-season statistic except the championship,
  -- which comes from `teams.playoff_finish` — so call this after finalising.
  drop table if exists _csa_rows;
  create temp table _csa_rows on commit drop as
  with st as (
    select * from v_team_standings
    where season_id = p_season_id and games_played > 0
  ),
  gr as (
    select r.* from v_game_results r
    where r.season_id = p_season_id and r.is_regular
  ),
  sigma as (
    select team_id, round(stddev_samp(points_for), 2) as sd
    from gr group by team_id having count(*) > 1
  )
  select * from (
    (select 'champion'::text as award_type,
            'League Champion'::text as title,
            'standard'::text as category,
            format('Won the %s championship', v_year) as description,
            3 as display_order,
            st.team_id,
            null::numeric as value,
            (st.wins || '-' || st.losses)::text as value_label
     from st where st.playoff_finish = 'champion' limit 1)

    union all
    (select 'best_record', 'Best Regular Season Record', 'regular_season',
            format('Best record in %s regular season', v_year), 1,
            st.team_id, st.wins::numeric, (st.wins || '-' || st.losses)::text
     from st order by st.win_percentage desc, st.points_for desc limit 1)

    union all
    (select 'highest_points', 'Highest Points Scored', 'regular_season',
            format('Highest total points in %s', v_year), 4,
            st.team_id, st.points_for,
            to_char(st.points_for, 'FM9999999990.00') || ' points'
     from st order by st.points_for desc limit 1)

    union all
    (select 'highest_weekly_score', 'Highest Weekly Score', 'regular_season',
            format('Highest single-week score in %s', v_year), 5,
            gr.team_id, gr.points_for,
            to_char(gr.points_for, 'FM9999999990.00') || ' points (Week ' || gr.week || ')'
     from gr order by gr.points_for desc limit 1)

    union all
    (select 'most_blowouts', 'Most Blowout Wins', 'regular_season',
            format('Most wins by 25+ points in %s', v_year), 8,
            b.team_id, b.n::numeric, b.n || ' blowout wins'
     from (
       select gr.team_id, count(*) as n, sum(gr.points_for) as pf
       from gr where gr.points_for - gr.points_against >= 25
       group by gr.team_id
     ) b order by b.n desc, b.pf desc limit 1)

    union all
    (select 'worst_record', 'Worst Record', 'dubious',
            format('Worst record in %s', v_year), 11,
            st.team_id, st.losses::numeric, (st.wins || '-' || st.losses)::text
     from st order by st.win_percentage asc, st.points_for asc limit 1)

    union all
    (select 'lowest_points', 'Lowest Points Scored', 'dubious',
            format('Lowest total points in %s', v_year), 6,
            st.team_id, st.points_for,
            to_char(st.points_for, 'FM9999999990.00') || ' points'
     from st order by st.points_for asc limit 1)

    union all
    (select 'lowest_weekly_score', 'Lowest Weekly Score', 'dubious',
            format('Lowest single-week score in %s', v_year), 7,
            gr.team_id, gr.points_for,
            to_char(gr.points_for, 'FM9999999990.00') || ' points (Week ' || gr.week || ')'
     from gr order by gr.points_for asc limit 1)

    union all
    (select 'biggest_blowout_loss', 'Biggest Blowout Loss', 'dubious',
            format('Largest margin of defeat in %s', v_year), 2,
            gr.team_id, gr.points_against - gr.points_for,
            'Lost by ' || to_char(gr.points_against - gr.points_for, 'FM9999999990.00')
              || ' points (Week ' || gr.week || ')'
     from gr order by gr.points_against - gr.points_for desc limit 1)

    union all
    (select 'most_points_against', 'Most Points Against', 'dubious',
            format('Most points scored against in %s', v_year), 10,
            st.team_id, st.points_against,
            to_char(st.points_against, 'FM9999999990.00') || ' points'
     from st order by st.points_against desc limit 1)

    union all
    (select 'most_consistent', 'Most Consistent', 'advanced',
            format('Most consistent weekly scores in %s — lowest standard deviation in weekly scoring', v_year), 9,
            sigma.team_id, sigma.sd, 'σ = ' || to_char(sigma.sd, 'FM9999999990.00')
     from sigma order by sigma.sd asc limit 1)
  ) a;

  insert into awards (
    season_id, title, description, icon, category, winner_id, source, award_type,
    winner_franchise_id, winner_team_id, value, value_label, display_order, awarded_at
  )
  select p_season_id, r.title, r.description, null, r.category, t.owner, 'computed', r.award_type,
         t.franchise_id, r.team_id, r.value, r.value_label, r.display_order, now()
  from _csa_rows r
  join teams t on t.id = r.team_id
  on conflict (season_id, award_type) where source = 'computed'
  do update set
    title               = excluded.title,
    description         = excluded.description,
    category            = excluded.category,
    winner_id           = excluded.winner_id,
    winner_franchise_id = excluded.winner_franchise_id,
    winner_team_id      = excluded.winner_team_id,
    value               = excluded.value,
    value_label         = excluded.value_label,
    display_order       = excluded.display_order,
    awarded_at          = excluded.awarded_at,
    updated_at          = now();

  select jsonb_build_object(
    'season_id', p_season_id,
    'year', v_year,
    'awards', coalesce(jsonb_agg(
      jsonb_build_object(
        'award_type', r.award_type,
        'winner', t.owner,
        'value_label', r.value_label
      ) order by r.display_order
    ), '[]'::jsonb)
  ) into v_result
  from _csa_rows r
  join teams t on t.id = r.team_id;

  return v_result;
end;
$$;

comment on function public.compute_season_awards(uuid) is
  'Upsert the eleven computed awards for a season. Idempotent on '
  '(season_id, award_type) where source = ''computed''; leaves ballot awards alone.';

revoke all on function public.compute_season_awards(uuid) from public;
revoke all on function public.compute_season_awards(uuid) from anon;
revoke all on function public.compute_season_awards(uuid) from authenticated;
grant execute on function public.compute_season_awards(uuid) to authenticated;
grant execute on function public.compute_season_awards(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- v_franchise_career: ignore seasons nobody has played yet
-- ---------------------------------------------------------------------------
--
-- A season created in August has fourteen teams and no games. Counted as a
-- season played, it inflated `seasons_played` and dragged `avg_final_rank` and
-- `worst_finish` toward a rank nobody had earned.

create or replace view public.v_franchise_career as
 select f.id as franchise_id,
    f.owner_name,
    f.display_name,
    f.is_active,
    count(st.team_id) as seasons_played,
    min(st.season_year) as first_season,
    max(st.season_year) as last_season,
    coalesce(sum(st.wins), (0)::numeric) as total_wins,
    coalesce(sum(st.losses), (0)::numeric) as total_losses,
    coalesce(sum(st.ties), (0)::numeric) as total_ties,
    round(((coalesce(sum(st.wins), (0)::numeric) + (0.5 * coalesce(sum(st.ties), (0)::numeric)))
           / nullif(coalesce(sum(st.games_played), (0)::numeric), (0)::numeric)), 4) as career_win_percentage,
    count(*) filter (where st.made_playoffs) as playoff_appearances,
    count(*) filter (where (st.playoff_finish = 'champion'::text)) as championships,
    count(*) filter (where (st.playoff_finish = '2nd'::text)) as runner_ups,
    coalesce(sum(st.points_for), (0)::numeric) as career_points_for,
    coalesce(sum(st.points_against), (0)::numeric) as career_points_against,
    coalesce(sum(st.point_differential), (0)::numeric) as career_point_differential,
    round(avg(st.average_points_for), 2) as avg_points_per_game,
    round(avg(st.final_rank), 2) as avg_final_rank,
    min(st.final_rank) as best_finish,
    max(st.final_rank) as worst_finish
   from league_franchises f
     left join v_team_standings st
       on st.franchise_id = f.id and st.games_played > 0
  group by f.id, f.owner_name, f.display_name, f.is_active;
