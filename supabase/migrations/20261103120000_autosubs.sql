-- Autosubs: a member names a bench player to take over if a starter is ruled
-- out when they cannot get to their phone. Decisions that shape this:
--
--   1. An autosub belongs to one week, and to the team. Next week's lineup is
--      a different question, so a row never carries over.
--
--   2. Who may set one is `franchise_accounts`, not a display name. An
--      autosub ends in a write to somebody's ESPN lineup, and CLAUDE.md is
--      plain about this: a display name is fine for deciding what to unmask
--      and not for deciding who may write, because a member can retype it.
--      An admin holds no extra power here: the admin's own team is the only
--      one the admin sees.
--
--   3. The rules are in the RPC, because the anon key reaches PostgREST
--      directly. `set_autosub()` is the only member write path, and there is
--      no member write policy. The roster and kickoff checks repeat in the
--      picker only so that it does not offer a choice the database refuses.
--
--   4. The watcher's clock is pg_cron, and its gate is a query. An autosub
--      only matters in the two hours before its starter's game (when ESPN
--      publishes inactives) and the hour after. `private.dispatch_autosub_watch()`
--      runs every ten minutes and starts `.github/workflows/autosub-watch.yml`
--      only when a row is inside that window, so a week with no autosubs
--      spends no Actions minutes at all. WATCH_BEFORE_MINUTES and
--      WATCH_AFTER_MINUTES in services/autosubPlanner.js are the mirror.
--
--   5. Two switches on the season, because they fail differently.
--      `autosubs_enabled` is the feature: off hides it from every roster,
--      refuses new ones and stops the watcher firing. `autosub_espn_writes`
--      is whether the watcher may change a lineup on ESPN itself. It starts
--      off: ESPN's write API is undocumented and this league has never used
--      it, so an admin turns it on after watching one work. With it off every
--      fired autosub goes to the commissioners to make by hand.
--
--   6. How many a team may set in a week is the admin's call, 1-9: nine is
--      every starter in this league's lineup, so the default of 9 caps nothing
--      until an admin lowers it. It is a third column on `seasons`, which is
--      already `is_admin()`-write, and `set_autosub()` is what enforces it.
--
-- Applied on merge by deploy-migrations.yml, before the bundle that reads it.

-- ---------------------------------------------------------------------------
-- 1. The roles
-- ---------------------------------------------------------------------------
-- Keyed on user_id and granted in Settings -> Roles, like parlay_commissioner.
-- Neither carries a write path: they are who hears about an autosub.

ALTER TABLE "public"."league_roles" DROP CONSTRAINT IF EXISTS "league_roles_role_check";
ALTER TABLE "public"."league_roles" ADD CONSTRAINT "league_roles_role_check"
  CHECK ("role" = ANY (ARRAY['parlay_commissioner'::"text", 'commissioner'::"text", 'vice_commissioner'::"text"]));

-- ---------------------------------------------------------------------------
-- 2. The switches
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."seasons"
  ADD COLUMN IF NOT EXISTS "autosubs_enabled" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "autosub_espn_writes" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "autosub_weekly_limit" integer DEFAULT 9 NOT NULL
    CONSTRAINT "seasons_autosub_weekly_limit_check" CHECK ("autosub_weekly_limit" BETWEEN 1 AND 9);

COMMENT ON COLUMN "public"."seasons"."autosubs_enabled" IS
  'Whether members may set autosubs. Off hides the feature, refuses new ones in set_autosub() and stops the watcher firing the ones already set.';
COMMENT ON COLUMN "public"."seasons"."autosub_espn_writes" IS
  'Whether the watcher may change a lineup on ESPN. Off, every fired autosub goes to the commissioners to make by hand.';
COMMENT ON COLUMN "public"."seasons"."autosub_weekly_limit" IS
  'How many autosubs one team may set in a week, 1-9. Enforced by set_autosub(). Lowering it leaves autosubs already set in place.';

-- ---------------------------------------------------------------------------
-- 3. The autosubs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."autosubs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "season_id" "uuid" NOT NULL REFERENCES "public"."seasons"("id") ON DELETE CASCADE,
    "week" integer NOT NULL,
    "team_id" "uuid" NOT NULL REFERENCES "public"."teams"("id") ON DELETE CASCADE,
    "starter_player_id" "uuid" NOT NULL REFERENCES "public"."players"("id") ON DELETE CASCADE,
    "bench_player_id" "uuid" NOT NULL REFERENCES "public"."players"("id") ON DELETE CASCADE,
    "slot" "text" NOT NULL,
    "status" "text" DEFAULT 'armed'::"text" NOT NULL,
    "injury_status" "text",
    "reason" "text",
    "detail" "text",
    "created_by" "uuid" REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fired_at" timestamp with time zone,
    "notified_at" timestamp with time zone,
    CONSTRAINT "autosubs_status_check" CHECK ("status" = ANY (ARRAY['armed'::"text", 'firing'::"text", 'swapped'::"text", 'manual'::"text"])),
    CONSTRAINT "autosubs_two_players" CHECK ("starter_player_id" <> "bench_player_id"),
    CONSTRAINT "autosubs_fired_stamped" CHECK (("status" = 'armed') = ("fired_at" IS NULL)),
    CONSTRAINT "autosubs_starter_key" UNIQUE ("season_id", "week", "team_id", "starter_player_id"),
    CONSTRAINT "autosubs_bench_key" UNIQUE ("season_id", "week", "team_id", "bench_player_id")
);

ALTER TABLE "public"."autosubs" OWNER TO "postgres";

COMMENT ON TABLE "public"."autosubs" IS
  'One bench player named to take over from one starter for one week if the starter is ruled out. Written by set_autosub() and remove_autosub() for members, and by scripts/autosub-watch.js (service role) when one fires.';
COMMENT ON COLUMN "public"."autosubs"."slot" IS
  'The starter''s lineup slot when the autosub was set, for the member''s view. The watcher reads the live slot from ESPN.';
COMMENT ON COLUMN "public"."autosubs"."status" IS
  'armed: waiting. firing: claimed by a run. swapped: confirmed on ESPN. manual: the commissioners were asked to make it.';
COMMENT ON COLUMN "public"."autosubs"."reason" IS
  'Why it went to the commissioners: kicked_off, writes_off, bench_unavailable, bench_out, ineligible, espn_refused, unconfirmed, interrupted.';
COMMENT ON COLUMN "public"."autosubs"."detail" IS
  'ESPN''s refusal code, when it gave one.';
COMMENT ON COLUMN "public"."autosubs"."notified_at" IS
  'When the commissioners were told. A fired row with no stamp is told by the next run.';

CREATE INDEX IF NOT EXISTS "autosubs_open_idx"
  ON "public"."autosubs" ("season_id", "week") WHERE "notified_at" IS NULL;

-- Is this the caller's team this season? An approved member, linked to the
-- team's franchise. SECURITY INVOKER: `teams` is public-read and the link is
-- an own-row read, so the policies already are the rule. No admin clause, on
-- purpose: an autosub is the manager's, and the admin manages one team.
CREATE OR REPLACE FUNCTION "public"."owns_team"("p_team_id" "uuid")
RETURNS boolean
LANGUAGE "sql" STABLE
SET "search_path" TO 'public'
AS $$
  select public.is_approved_member()
     and exists (
       select 1
       from public.teams t
       join public.franchise_accounts fa on fa.franchise_id = t.franchise_id
       where t.id = p_team_id
         and fa.user_id = auth.uid())
$$;

ALTER FUNCTION "public"."owns_team"("uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."owns_team"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."owns_team"("uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."owns_team"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."owns_team"("uuid") TO "service_role";

ALTER TABLE "public"."autosubs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "autosubs read own team" ON "public"."autosubs";
CREATE POLICY "autosubs read own team" ON "public"."autosubs"
  FOR SELECT TO "authenticated" USING ("public"."owns_team"("team_id"));

REVOKE ALL ON TABLE "public"."autosubs" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."autosubs" FROM "anon";
REVOKE ALL ON TABLE "public"."autosubs" FROM "authenticated";
GRANT SELECT ON TABLE "public"."autosubs" TO "authenticated";
GRANT ALL ON TABLE "public"."autosubs" TO "service_role";

-- ---------------------------------------------------------------------------
-- 4. Setting and removing one
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because there is no member write policy: this function is
-- the only way in, and it says why it refused. `canCoverSlot` in
-- services/autosubPlanner.js is the mirror of the eligibility clause.

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

ALTER FUNCTION "public"."set_autosub"("uuid", integer, "uuid", "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."set_autosub"("uuid", integer, "uuid", "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."set_autosub"("uuid", integer, "uuid", "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."set_autosub"("uuid", integer, "uuid", "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."set_autosub"("uuid", integer, "uuid", "uuid") TO "service_role";

-- A fired autosub stays: it is what tells the member what happened. Returns
-- whether a row went.
CREATE OR REPLACE FUNCTION "public"."remove_autosub"("p_id" "uuid")
  RETURNS boolean
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  DECLARE
    v_changed integer;
  BEGIN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'You must be signed in to do that'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    DELETE FROM public.autosubs a
    WHERE a.id = p_id AND a.status = 'armed' AND public.owns_team(a.team_id);

    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RETURN v_changed = 1;
  END;
  $$;

ALTER FUNCTION "public"."remove_autosub"("uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."remove_autosub"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."remove_autosub"("uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."remove_autosub"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."remove_autosub"("uuid") TO "service_role";

-- ---------------------------------------------------------------------------
-- 5. The watcher's clock
-- ---------------------------------------------------------------------------
-- `private`, like every dispatch, because nothing a browser holds should start
-- a workflow. The join on the starter's kickoff is also what ends the
-- dispatches for a row that is never settled: it leaves the window.

CREATE OR REPLACE FUNCTION "private"."dispatch_autosub_watch"()
  RETURNS void
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM public.autosubs a
      JOIN public.seasons s ON s.id = a.season_id AND s.is_active
      JOIN public.players p ON p.id = a.starter_player_id
      JOIN public.nfl_schedule n
        ON n.season_year = coalesce(s.espn_season_year, s.year)
       AND n.week = a.week
       AND n.pro_team_id = p.pro_team_id
      WHERE n.game_time BETWEEN now() - interval '1 hour' AND now() + interval '2 hours'
        AND ((a.status = 'armed' AND s.autosubs_enabled) OR (a.status <> 'armed' AND a.notified_at IS NULL))
    ) THEN
      PERFORM private.dispatch_github_workflow('autosub-watch.yml');
    END IF;
  END;
  $$;

ALTER FUNCTION "private"."dispatch_autosub_watch"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."dispatch_autosub_watch"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."dispatch_autosub_watch"() FROM "anon";
REVOKE ALL ON FUNCTION "private"."dispatch_autosub_watch"() FROM "authenticated";

COMMENT ON FUNCTION "private"."dispatch_autosub_watch"() IS
  'Starts autosub-watch.yml when an autosub is inside its watch window. Called only by pg_cron, every ten minutes.';

SELECT cron.schedule(
  'autosub-watch',
  '*/10 * * * *',
  $$ SELECT private.dispatch_autosub_watch() $$
);
