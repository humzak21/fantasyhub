-- An autosub locks when either of its players' games starts.
--
-- 20261103120000_autosubs.sql refused to set an autosub on a player whose game
-- had started, but left the row open afterwards: `remove_autosub()` took it
-- down at any time, and `set_autosub()` could re-point it. So a member could
-- name a Thursday bench player, watch Thursday's game, and then keep or drop the
-- autosub knowing how it went. The deadline is per player, not per week: a
-- Sunday starter's autosub with a Sunday bench player stays open until Sunday.
--
-- `private.autosub_locks_at()` is the one definition. It reads `nfl_schedule`
-- live rather than copying a kickoff onto the row, so when the NFL flexes a game
-- the lock moves with it, and the daily refresh is what keeps that table current.
-- `isAutosubLocked` in src/components/autosub/autosubChoices.js is the mirror.
--
-- The watcher is untouched. Locking stops the member, not the autosub: an armed
-- row still fires, and past kickoff it goes to the commissioners.
--
-- Applied on merge by deploy-migrations.yml.

-- ---------------------------------------------------------------------------
-- 1. When a row locks
-- ---------------------------------------------------------------------------
-- The earlier of the two kickoffs. `min()` skips a NULL, so a bye or a game with
-- no time yet never locks a row by itself, and a row with no known kickoff at
-- all returns NULL, which compares as "not locked".

CREATE OR REPLACE FUNCTION "private"."autosub_locks_at"("p_id" "uuid")
  RETURNS timestamp with time zone
  LANGUAGE "sql" STABLE
  SET "search_path" TO ''
  AS $$
  SELECT min(n.game_time)
  FROM public.autosubs a
  JOIN public.seasons s ON s.id = a.season_id
  JOIN public.players p ON p.id IN (a.starter_player_id, a.bench_player_id)
  JOIN public.nfl_schedule n
    ON n.season_year = coalesce(s.espn_season_year, s.year)
   AND n.week = a.week
   AND n.pro_team_id = p.pro_team_id
  WHERE a.id = p_id
$$;

ALTER FUNCTION "private"."autosub_locks_at"("uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."autosub_locks_at"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."autosub_locks_at"("uuid") FROM "anon";
REVOKE ALL ON FUNCTION "private"."autosub_locks_at"("uuid") FROM "authenticated";

COMMENT ON FUNCTION "private"."autosub_locks_at"("uuid") IS
  'When an autosub stops being the member''s to change: the earlier of its two players'' kickoffs, read live from nfl_schedule so a flexed game moves it.';

-- ---------------------------------------------------------------------------
-- 2. Re-pointing a locked autosub
-- ---------------------------------------------------------------------------
-- Recreated whole, so the rest stays exactly as 20261103120000 left it. A
-- replaced function keeps its owner and grants.

CREATE OR REPLACE FUNCTION "public"."set_autosub"(
  "p_team_id" "uuid",
  "p_week" integer,
  "p_starter_player_id" "uuid",
  "p_bench_player_id" "uuid"
)
  RETURNS "uuid"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  DECLARE
    v_user_id uuid := auth.uid();
    v_season public.seasons%ROWTYPE;
    v_nfl_year integer;
    v_slot text;
    v_bench_slot text;
    v_position text;
    v_starter_game public.nfl_schedule%ROWTYPE;
    v_bench_game public.nfl_schedule%ROWTYPE;
    v_used integer;
    v_existing uuid;
    v_id uuid;
  BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'You must be signed in to do that'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT public.is_approved_member() THEN
      RAISE EXCEPTION 'Your account has not been approved yet'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT s.* INTO v_season
    FROM public.seasons s
    JOIN public.teams t ON t.season_id = s.id
    WHERE t.id = p_team_id AND s.is_active;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'That team is not in the active season'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_season.autosubs_enabled THEN
      RAISE EXCEPTION 'Autosubs are turned off'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT public.owns_team(p_team_id) THEN
      RAISE EXCEPTION 'You can only set autosubs on your own team'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT r.roster_slot INTO v_slot
    FROM public.rosters r
    WHERE r.team_id = p_team_id AND r.player_id = p_starter_player_id;

    IF v_slot IS NULL OR v_slot IN ('BE', 'IR') THEN
      RAISE EXCEPTION 'That player is not in your starting lineup'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT r.roster_slot, p.position INTO v_bench_slot, v_position
    FROM public.rosters r
    JOIN public.players p ON p.id = r.player_id
    WHERE r.team_id = p_team_id AND r.player_id = p_bench_player_id;

    IF v_bench_slot IS DISTINCT FROM 'BE' THEN
      RAISE EXCEPTION 'That player is not on your bench'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT (v_position = v_slot OR (v_slot = 'FLEX' AND v_position IN ('RB', 'WR', 'TE'))) THEN
      RAISE EXCEPTION 'A % cannot play at %', v_position, v_slot
        USING ERRCODE = 'check_violation';
    END IF;

    v_nfl_year := coalesce(v_season.espn_season_year, v_season.year);

    SELECT n.* INTO v_starter_game
    FROM public.nfl_schedule n
    JOIN public.players p ON p.pro_team_id = n.pro_team_id
    WHERE p.id = p_starter_player_id AND n.season_year = v_nfl_year AND n.week = p_week;

    IF NOT FOUND OR v_starter_game.opponent_pro_team_id IS NULL THEN
      RAISE EXCEPTION 'That player has no game this week'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_starter_game.game_time <= now() THEN
      RAISE EXCEPTION 'That player''s game has already kicked off'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT n.* INTO v_bench_game
    FROM public.nfl_schedule n
    JOIN public.players p ON p.pro_team_id = n.pro_team_id
    WHERE p.id = p_bench_player_id AND n.season_year = v_nfl_year AND n.week = p_week;

    IF NOT FOUND OR v_bench_game.opponent_pro_team_id IS NULL THEN
      RAISE EXCEPTION 'Your bench player has no game this week'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_bench_game.game_time <= now() THEN
      RAISE EXCEPTION 'Your bench player''s game has already kicked off'
        USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.autosubs a
      WHERE a.season_id = v_season.id AND a.week = p_week AND a.team_id = p_team_id
        AND a.bench_player_id = p_bench_player_id
        AND a.starter_player_id <> p_starter_player_id
    ) THEN
      RAISE EXCEPTION 'That bench player is already covering another starter'
        USING ERRCODE = 'unique_violation';
    END IF;

    SELECT a.id INTO v_existing
    FROM public.autosubs a
    WHERE a.season_id = v_season.id AND a.week = p_week AND a.team_id = p_team_id
      AND a.starter_player_id = p_starter_player_id;

    IF v_existing IS NOT NULL AND private.autosub_locks_at(v_existing) <= now() THEN
      RAISE EXCEPTION 'That autosub is locked: one of its games has started'
        USING ERRCODE = 'check_violation';
    END IF;

    -- A fired autosub still counts: it was set. Pointing an existing one at a
    -- different bench player does not, since it adds nothing. The row lock is
    -- what stops two devices on one team both reading the count under the limit.
    PERFORM 1 FROM public.teams t WHERE t.id = p_team_id FOR UPDATE;

    SELECT count(*) INTO v_used
    FROM public.autosubs a
    WHERE a.season_id = v_season.id AND a.week = p_week AND a.team_id = p_team_id
      AND a.starter_player_id <> p_starter_player_id;

    IF v_used >= v_season.autosub_weekly_limit THEN
      RAISE EXCEPTION 'You have reached the limit of % this week', v_season.autosub_weekly_limit
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.autosubs (season_id, week, team_id, starter_player_id, bench_player_id, slot, created_by)
    VALUES (v_season.id, p_week, p_team_id, p_starter_player_id, p_bench_player_id, v_slot, v_user_id)
    ON CONFLICT (season_id, week, team_id, starter_player_id) DO UPDATE
      SET bench_player_id = EXCLUDED.bench_player_id,
          slot = EXCLUDED.slot,
          created_by = EXCLUDED.created_by
      WHERE public.autosubs.status = 'armed'
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'That autosub has already fired'
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN v_id;
  END;
  $$;

-- ---------------------------------------------------------------------------
-- 3. Removing a locked autosub
-- ---------------------------------------------------------------------------
-- Still false for a row that is not the caller's or has fired, so nothing about
-- another team's row is given away. A raise for a locked one, because that is a
-- member's own row and they should hear why it stayed.

CREATE OR REPLACE FUNCTION "public"."remove_autosub"("p_id" "uuid")
  RETURNS boolean
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  BEGIN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'You must be signed in to do that'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.autosubs a
      WHERE a.id = p_id AND a.status = 'armed' AND public.owns_team(a.team_id)
    ) THEN
      RETURN false;
    END IF;

    IF private.autosub_locks_at(p_id) <= now() THEN
      RAISE EXCEPTION 'That autosub is locked: one of its games has started'
        USING ERRCODE = 'check_violation';
    END IF;

    DELETE FROM public.autosubs a WHERE a.id = p_id;
    RETURN true;
  END;
  $$;
