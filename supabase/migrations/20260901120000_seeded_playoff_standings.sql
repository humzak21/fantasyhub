-- Playoff qualification, from 2026 on.
--
-- The old rule was top three per division, and this function was one of the
-- four independent places that encoded it (`division_rank <= 3`). From 2026:
--
--   * seeds 1-2 are the two division winners, ordered against each other;
--   * seeds 3-6 are the next four teams league-wide, division ignored, so one
--     division can send five teams and the other only its winner.
--
-- The canonical sort is the same one the baseline already used for
-- `division_rank`: win% desc, points for desc, points against asc — with the
-- team id last so the order is deterministic rather than merely stable.
-- `utils/playoffSeeding.js` is the client-side mirror of this and is tested
-- against the same cases.
--
-- 2020-2025 keep their meaning: below 2026 the seed columns are NULL and
-- `playoff_position` is `division_rank <= 3`, exactly as before.

-- The OUT signature gains three columns, and `create or replace function`
-- refuses to change one. Dropping discards the grants with it, so they are
-- restored at the bottom — without them anonymous standings break.
drop function if exists public.get_standings_by_division(uuid);

create function public.get_standings_by_division(season_id_param uuid)
returns table(
  team_id uuid,
  team_name text,
  owner text,
  division_id integer,
  division_name character varying,
  wins integer,
  losses integer,
  ties integer,
  points_for numeric,
  points_against numeric,
  point_differential numeric,
  win_percentage numeric,
  streak_type character varying,
  streak_length integer,
  division_rank integer,
  playoff_position boolean,
  playoff_seed integer,
  is_bye boolean,
  is_wildcard boolean
)
language plpgsql
set search_path to 'public'
as $$
declare
  v_year       integer;
  v_seeded     boolean;
  v_divisions  integer;
begin
  select s.year into v_year from seasons s where s.id = season_id_param;
  v_seeded := coalesce(v_year, 0) >= 2026;

  -- How many divisions actually have teams in them. Two is the league; this
  -- function also runs while an admin is halfway through moving teams around,
  -- and seeding has to produce something rather than hand a bye to a division
  -- of one. `utils/playoffSeeding.js` makes the same best-effort fallback.
  select count(distinct t.division_id) into v_divisions
  from teams t
  where t.season_id = season_id_param and t.division_id is not null;

  return query
  with team_stats as (
    select
      t.id as team_id,
      t.name as team_name,
      t.owner,
      t.division_id,
      d.name as division_name,
      t.wins,
      t.losses,
      t.ties,
      t.points_for,
      t.points_against,
      t.point_differential,
      t.win_percentage,
      coalesce((t.current_streak->>'type')::varchar, 'none') as streak_type,
      coalesce((t.current_streak->>'length')::integer, 0) as streak_length,
      row_number() over (
        partition by t.division_id
        order by t.win_percentage desc, t.points_for desc, t.points_against asc, t.id
      ) as division_rank
    from teams t
    left join divisions d on t.division_id = d.id
    where t.season_id = season_id_param
  ),
  -- Byes: the winner of each division. With anything other than two populated
  -- divisions, the two best teams league-wide.
  bye_candidates as (
    select
      ts.team_id as bye_team_id,
      (row_number() over (
        order by ts.win_percentage desc, ts.points_for desc, ts.points_against asc, ts.team_id
      ))::int as bye_seed
    from team_stats ts
    where (v_divisions = 2 and ts.division_id is not null and ts.division_rank = 1)
       or (v_divisions <> 2)
  ),
  byes as (
    select bc.bye_team_id, bc.bye_seed
    from bye_candidates bc
    where bc.bye_seed <= 2
  ),
  -- Wildcards: everyone else, best first, league-wide. Seeded straight after
  -- the byes; only the first four of them qualify.
  wildcards as (
    select
      ts.team_id as wc_team_id,
      ((row_number() over (
        order by ts.win_percentage desc, ts.points_for desc, ts.points_against asc, ts.team_id
      )) + (select count(*) from byes))::int as wc_seed
    from team_stats ts
    where not exists (select 1 from byes b where b.bye_team_id = ts.team_id)
  ),
  seeded as (
    select
      ts.*,
      b.bye_seed,
      case when w.wc_seed <= 6 then w.wc_seed end as wildcard_seed
    from team_stats ts
    left join byes b on b.bye_team_id = ts.team_id
    left join wildcards w on w.wc_team_id = ts.team_id
  )
  select
    sd.team_id,
    sd.team_name,
    sd.owner,
    sd.division_id,
    sd.division_name,
    sd.wins,
    sd.losses,
    sd.ties,
    sd.points_for,
    sd.points_against,
    sd.point_differential,
    sd.win_percentage,
    sd.streak_type,
    sd.streak_length,
    sd.division_rank::integer,
    case
      when v_seeded then coalesce(sd.bye_seed, sd.wildcard_seed) is not null
      else sd.division_rank <= 3
    end as playoff_position,
    case when v_seeded then coalesce(sd.bye_seed, sd.wildcard_seed) end as playoff_seed,
    case when v_seeded then sd.bye_seed is not null else false end as is_bye,
    case when v_seeded then sd.wildcard_seed is not null else false end as is_wildcard
  from seeded sd
  order by sd.division_id, sd.division_rank;
end;
$$;

alter function public.get_standings_by_division(uuid) owner to postgres;

comment on function public.get_standings_by_division(uuid) is
  'Standings grouped by division. From 2026 also returns the playoff seed '
  '(1-2 division winners on byes, 3-6 league-wide wildcards); earlier seasons '
  'keep top-3-per-division and NULL seeds.';

-- The drop above took the baseline grants with it.
grant all on function public.get_standings_by_division(uuid) to anon;
grant all on function public.get_standings_by_division(uuid) to authenticated;
grant all on function public.get_standings_by_division(uuid) to service_role;
