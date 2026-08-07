-- Guard the privileged functions the admin UI actually calls (§2.2).
--
-- These five keep their `authenticated` grant, because the admin *is* an
-- authenticated user and the browser has no other role to offer. Grants alone
-- therefore cannot express "only this one person", so authority is enforced
-- inside each body via `can_write_league()`. Functions the browser never calls
-- are handled by revoke instead — see 20260806150200.
--
-- Each also gains `set search_path = public`, chipping at the 62 functions
-- flagged for mutable search paths (§2.5).

-- ---------------------------------------------------------------------------
-- disable/enable_roster_trigger: the worst of the set. They run ALTER TABLE and
-- had NO authorization check of any kind, so any anonymous visitor could
-- disable a trigger and leave it disabled.
-- ---------------------------------------------------------------------------
create or replace function public.disable_roster_trigger()
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.can_write_league() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  alter table rosters disable trigger set_rosters_user_id;
end;
$function$;

create or replace function public.enable_roster_trigger()
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.can_write_league() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  alter table rosters enable trigger set_rosters_user_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- update_game_result: writes scores and every derived column. Body unchanged
-- apart from the guard and the search_path.
-- ---------------------------------------------------------------------------
create or replace function public.update_game_result(game_id uuid, team1_score numeric, team2_score numeric)
returns games
language plpgsql
security definer
set search_path = public
as $function$
declare
    game_record games%ROWTYPE;
    point_diff DECIMAL(10,2);
begin
    if not public.can_write_league() then
      raise exception 'admin only' using errcode = '42501';
    end if;

    update games
    set
        team1_score = update_game_result.team1_score,
        team2_score = update_game_result.team2_score,
        completed_at = NOW()
    where id = game_id
    returning * into game_record;

    point_diff := ABS(team1_score - team2_score);

    update games
    set
        point_differential = point_diff,
        is_blowout = point_diff >= 30,
        is_close = point_diff <= 5,
        is_tie = team1_score = team2_score,
        winner_team_id = case
            when team1_score > team2_score then team1_id
            when team2_score > team1_score then team2_id
            else NULL
        end,
        loser_team_id = case
            when team1_score < team2_score then team1_id
            when team2_score < team1_score then team2_id
            else NULL
        end
    where id = game_id
    returning * into game_record;

    perform refresh_team_stats(game_record.team1_id);
    perform refresh_team_stats(game_record.team2_id);

    return game_record;
end;
$function$;

-- ---------------------------------------------------------------------------
-- create_pick_em_week: guarded, and its hardcoded 2025 season start removed.
--
-- The old body defaulted every deadline from the literal
-- '2025-09-02 03:00:00-05' — a §4 hardcoded-year survivor that §4 missed
-- because it lives in SQL rather than JS. Left alone it would have produced
-- 2025 deadlines for 2026 pick'em weeks.
--
-- Defaults now come from the season row: `season_week_start()` for the week
-- boundary, and the pickem_*_offset_days / pickem_*_time columns P1 added.
--
-- Also fixes a latent bug: `v_week_start_date` used to be assigned only inside
-- the `p_submission_opens_at is null` branch, so passing an explicit opens_at
-- while leaving closes_at null produced a NULL close time. It is computed
-- unconditionally now.
-- ---------------------------------------------------------------------------
create or replace function public.create_pick_em_week(
  p_season_id uuid,
  p_week_number integer,
  p_submission_opens_at timestamp with time zone default null,
  p_submission_closes_at timestamp with time zone default null,
  p_results_reveal_at timestamp with time zone default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
    v_pick_em_week_id uuid;
    v_week_start timestamptz;
    v_season seasons%ROWTYPE;
    v_tz text;
    v_opens_at timestamptz;
    v_closes_at timestamptz;
    v_reveal_at timestamptz;
begin
    if not public.can_write_league() then
      raise exception 'admin only' using errcode = '42501';
    end if;

    select * into v_season from seasons where id = p_season_id;
    if not found then
      raise exception 'season % not found', p_season_id using errcode = 'P0002';
    end if;

    v_tz := coalesce(v_season.timezone, 'America/New_York');
    v_week_start := public.season_week_start(p_season_id, p_week_number);

    -- Offsets are days from the week start; times are wall-clock in the
    -- league's zone, matching utils/seasonConfig.js on the client.
    v_opens_at := coalesce(
      p_submission_opens_at,
      ((v_week_start at time zone v_tz)::date
        + coalesce(v_season.pickem_open_offset_days, 0)
        + coalesce(v_season.pickem_open_time, time '04:00')) at time zone v_tz
    );

    v_closes_at := coalesce(
      p_submission_closes_at,
      ((v_week_start at time zone v_tz)::date
        + coalesce(v_season.pickem_close_offset_days, 2)
        + coalesce(v_season.pickem_close_time, time '20:00')) at time zone v_tz
    );

    v_reveal_at := coalesce(
      p_results_reveal_at,
      ((v_week_start at time zone v_tz)::date
        + coalesce(v_season.pickem_reveal_offset_days, 7)
        + coalesce(v_season.pickem_reveal_time, time '12:00')) at time zone v_tz
    );

    insert into pick_em_weeks (
        season_id, week_number, submission_opens_at,
        submission_closes_at, results_reveal_at, is_active
    )
    values (
        p_season_id, p_week_number, v_opens_at,
        v_closes_at, v_reveal_at,
        now() between v_opens_at and v_closes_at
    )
    returning id into v_pick_em_week_id;

    return v_pick_em_week_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- get_users_for_admin already checked the admin email inline. Repoint it at
-- is_admin() so there is one definition of who the admin is, and pin its
-- search_path. It reads auth.users, so it stays admin-only rather than moving
-- to can_write_league().
-- ---------------------------------------------------------------------------
create or replace function public.get_users_for_admin(user_ids uuid[])
returns table(id uuid, email text, display_name text)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.is_admin() then
    raise exception 'Admin access required. Unauthorized access to user details is not permitted.'
      using errcode = 'P0001';
  end if;

  if array_length(user_ids, 1) > 100 then
    raise exception 'Too many user IDs requested. Maximum 100 allowed per request.'
      using errcode = 'P0001';
  end if;

  return query
  select
    au.id,
    au.email::text,
    coalesce(
      (au.raw_user_meta_data->>'full_name')::text,
      (au.raw_user_meta_data->>'name')::text,
      au.email::text
    ) as display_name
  from auth.users au
  where au.id = any(user_ids);
end;
$function$;
