-- The pick'em deadline follows the NFL calendar.
--
-- A week's picks close at the season's `pickem_close_*` time, Thursday 8 PM ET,
-- which is 15 minutes before the usual Thursday game. The NFL no longer always
-- opens a week on Thursday night: in 2026, week 1 opened on a Wednesday and so
-- does week 12, the night before Thanksgiving. That deadline would have sat a
-- full day and four games after the first kickoff. Week 1 was set by hand.
--
-- The rule is now: the season's time, or 15 minutes before the week's first
-- kickoff if that comes sooner. A normal Thursday lands on the same 8 PM it
-- always did, and every week is decided the same way, with nobody remembering.
--
-- `create_pick_em_week` is the one place to change. Both forms' RPCs, the parlay
-- and every client read `pick_em_weeks.submission_closes_at`, so they all follow.
-- A deadline the caller passes in is left alone: that is a person choosing.
--
-- A `start_time_tbd` row is skipped because its time is ESPN's placeholder (week
-- 18 reads 3:01 AM on a Sunday until the NFL sets its slate). A week with no
-- calendar rows keeps the season's time: unknown is not "no games".
--
-- The reminder had the same assumption, a pg_cron slot on Thursdays. That slot
-- stays, because it is also the retry for winner notifications, which run in
-- playoff weeks with no pick'em row at all. Beside it, a query keeps the clock:
-- every 15 minutes it asks whether a deadline is three hours away and starts the
-- workflow only if so, the same shape as `dispatch_autosub_watch`. On a normal
-- week both fire and `notification_log` sends the reminder once.
--
-- Applied on merge by deploy-migrations.yml.

CREATE OR REPLACE FUNCTION "public"."create_pick_em_week"("p_season_id" "uuid", "p_week_number" integer, "p_submission_opens_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_submission_closes_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_results_reveal_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_pick_em_week_id uuid;
    v_week_start timestamptz;
    v_season seasons%ROWTYPE;
    v_tz text;
    v_opens_at timestamptz;
    v_closes_at timestamptz;
    v_reveal_at timestamptz;
    v_first_kickoff timestamptz;
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

    if p_submission_closes_at is null then
      select min(n.game_time) into v_first_kickoff
      from nfl_schedule n
      where n.season_year = coalesce(v_season.espn_season_year, v_season.year)
        and n.week = p_week_number
        and n.game_time is not null
        and not n.start_time_tbd;

      -- `least` ignores a NULL, so a week with no calendar keeps the season's time.
      v_closes_at := least(v_closes_at, v_first_kickoff - interval '15 minutes');
    end if;

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
$$;

CREATE OR REPLACE FUNCTION "private"."dispatch_pickems_deadline"()
  RETURNS void
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  BEGIN
    -- A 15-minute band for a 15-minute job, so each deadline matches one run.
    IF EXISTS (
      SELECT 1
      FROM public.pick_em_weeks w
      JOIN public.seasons s ON s.id = w.season_id AND s.is_active
      WHERE w.submission_closes_at >  now() + interval '2 hours 45 minutes'
        AND w.submission_closes_at <= now() + interval '3 hours'
    ) THEN
      PERFORM private.dispatch_github_workflow('notify-pickems.yml');
    END IF;
  END;
  $$;

ALTER FUNCTION "private"."dispatch_pickems_deadline"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."dispatch_pickems_deadline"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."dispatch_pickems_deadline"() FROM "anon";
REVOKE ALL ON FUNCTION "private"."dispatch_pickems_deadline"() FROM "authenticated";

SELECT cron.schedule(
  'notify-pickems-deadline',
  '*/15 * * * *',
  $$ SELECT private.dispatch_pickems_deadline() $$
);
