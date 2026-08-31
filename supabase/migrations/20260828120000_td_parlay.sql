-- The weekly TD parlay: one NFL player per member per week.
--
-- The league's members each name one player they think will score a touchdown.
-- Submissions live inside the pick'ems window and nowhere else -- there is no
-- second deadline to explain, and "is the parlay open" is answered by the same
-- `pick_em_weeks` row that answers it for pick'ems. A week with no pick'em row
-- has no parlay, which is why `pick_em_week_id` is the parent key rather than
-- (season, week): the activation rule falls out of the foreign key instead of
-- being restated in the UI.
--
-- Grading is out of the app for now. `scored_td` is nullable and stays NULL
-- until somebody sets it; nothing in the schema pretends to know whether a
-- touchdown happened. See "Future work" at the foot of this file.
--
-- Two things this migration deliberately does NOT do:
--   * It does not enforce one pick per *player* per week. Two members may pick
--     the same player; that is a parlay, not a draft.
--   * It does not resolve free-text picks. `player_id` is nullable and
--     `player_name_raw` always holds a readable name, so a player missing from
--     the synced `players` table is still a valid pick.

-- ---------------------------------------------------------------------------
-- 1. league_roles: one non-admin role, and room for the next one
-- ---------------------------------------------------------------------------
-- `is_admin()` is the only role this database has ever had, and it is a single
-- hardcoded email. The parlay needs people who can see everyone's picks without
-- being able to change anything -- which is a read grant, not administration,
-- and folding it into `is_admin()` would hand them the whole league.
--
-- Keyed on `user_id`, not email: `is_admin()` reads the JWT email and would
-- silently stop matching if the admin ever changed address. A uuid does not
-- move. The `role` CHECK is a one-value list today; adding a role is a one-line
-- ALTER rather than a new table.

CREATE TABLE IF NOT EXISTS "public"."league_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "league_roles_role_check" CHECK (("role" = ANY (ARRAY['parlay_commissioner'::"text"])))
);

ALTER TABLE "public"."league_roles" OWNER TO "postgres";

COMMENT ON TABLE "public"."league_roles" IS
  'Named, non-admin grants. Keyed on auth.users.id so a role survives an email change, unlike is_admin(). Written by the admin through Settings -> Roles; there is no other write path.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'league_roles_pkey') THEN
    ALTER TABLE "public"."league_roles" ADD CONSTRAINT "league_roles_pkey" PRIMARY KEY ("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'league_roles_user_id_role_key') THEN
    ALTER TABLE "public"."league_roles"
      ADD CONSTRAINT "league_roles_user_id_role_key" UNIQUE ("user_id", "role");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'league_roles_user_id_fkey') THEN
    ALTER TABLE "public"."league_roles"
      ADD CONSTRAINT "league_roles_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE "public"."league_roles" ENABLE ROW LEVEL SECURITY;

-- Not `USING (true)`: the roster of who holds which role is nobody else's
-- business, and this table is not league data.
DROP POLICY IF EXISTS "league_roles read own or admin" ON "public"."league_roles";
CREATE POLICY "league_roles read own or admin" ON "public"."league_roles"
  FOR SELECT USING (("auth"."uid"() = "user_id") OR "public"."is_admin"());

DROP POLICY IF EXISTS "league_roles admin write" ON "public"."league_roles";
CREATE POLICY "league_roles admin write" ON "public"."league_roles"
  USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

GRANT ALL ON TABLE "public"."league_roles" TO "anon";
GRANT ALL ON TABLE "public"."league_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."league_roles" TO "service_role";

-- SECURITY DEFINER because the caller cannot read anyone else's league_roles
-- row -- and must not need to in order for a policy to test their own.
CREATE OR REPLACE FUNCTION "public"."is_parlay_commissioner"() RETURNS boolean
  LANGUAGE "sql" STABLE SECURITY DEFINER SET "search_path" TO 'public'
  AS $$
  SELECT EXISTS (
    SELECT 1 FROM league_roles
    WHERE user_id = auth.uid() AND role = 'parlay_commissioner'
  )
$$;

ALTER FUNCTION "public"."is_parlay_commissioner"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_parlay_commissioner"() IS
  'True for anyone the admin has granted parlay_commissioner. Anonymous callers have a NULL auth.uid(), so this is false for them rather than erroring.';

-- Postgres grants EXECUTE to PUBLIC by default and `anon` inherits it, so
-- revoking only the named roles is a silent no-op.
REVOKE ALL ON FUNCTION "public"."is_parlay_commissioner"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_parlay_commissioner"() FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."is_parlay_commissioner"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_parlay_commissioner"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_parlay_commissioner"() TO "service_role";

-- ---------------------------------------------------------------------------
-- 2. td_parlay_picks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."td_parlay_picks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pick_em_week_id" "uuid" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "week" integer NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "player_id" "uuid",
    "player_name_raw" "text" NOT NULL,
    "scored_td" boolean,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "td_parlay_picks_week_check" CHECK (("week" > 0)),
    CONSTRAINT "td_parlay_picks_player_name_raw_check" CHECK ((length("btrim"("player_name_raw")) > 0))
);

ALTER TABLE "public"."td_parlay_picks" OWNER TO "postgres";

COMMENT ON TABLE "public"."td_parlay_picks" IS
  'One touchdown pick per member per pick''em week. Written only through submit_td_parlay_pick(); there is no user INSERT/UPDATE policy.';

COMMENT ON COLUMN "public"."td_parlay_picks"."season_id" IS
  'Denormalized from the pick_em_weeks row by the RPC, never accepted from the client. The season dashboard reads a whole season without joining.';
COMMENT ON COLUMN "public"."td_parlay_picks"."player_id" IS
  'NULL for a free-text pick, and also for a matched pick whose player row is later deleted -- which is why player_name_raw is NOT NULL and always standalone.';
COMMENT ON COLUMN "public"."td_parlay_picks"."player_name_raw" IS
  'The canonical players.name on a matched pick, the trimmed text as typed otherwise. Readable without the join in both cases.';
COMMENT ON COLUMN "public"."td_parlay_picks"."scored_td" IS
  'NULL = ungraded. Nothing ingests touchdown stats yet; grading happens outside the app. Re-picking resets this to NULL.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'td_parlay_picks_pkey') THEN
    ALTER TABLE "public"."td_parlay_picks" ADD CONSTRAINT "td_parlay_picks_pkey" PRIMARY KEY ("id");
  END IF;

  -- The RPC's conflict target: one pick per member per week, and re-picking
  -- updates rather than accumulating.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'td_parlay_picks_user_week_key') THEN
    ALTER TABLE "public"."td_parlay_picks"
      ADD CONSTRAINT "td_parlay_picks_user_week_key" UNIQUE ("user_id", "pick_em_week_id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'td_parlay_picks_pick_em_week_id_fkey') THEN
    ALTER TABLE "public"."td_parlay_picks"
      ADD CONSTRAINT "td_parlay_picks_pick_em_week_id_fkey" FOREIGN KEY ("pick_em_week_id")
      REFERENCES "public"."pick_em_weeks"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'td_parlay_picks_season_id_fkey') THEN
    ALTER TABLE "public"."td_parlay_picks"
      ADD CONSTRAINT "td_parlay_picks_season_id_fkey" FOREIGN KEY ("season_id")
      REFERENCES "public"."seasons"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'td_parlay_picks_user_id_fkey') THEN
    ALTER TABLE "public"."td_parlay_picks"
      ADD CONSTRAINT "td_parlay_picks_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;

  -- SET NULL, not CASCADE: losing the player row must not lose the pick. The
  -- name survives in player_name_raw, which is the whole reason it is stored.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'td_parlay_picks_player_id_fkey') THEN
    ALTER TABLE "public"."td_parlay_picks"
      ADD CONSTRAINT "td_parlay_picks_player_id_fkey" FOREIGN KEY ("player_id")
      REFERENCES "public"."players"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_td_parlay_picks_season_week"
  ON "public"."td_parlay_picks" USING "btree" ("season_id", "week");

CREATE INDEX IF NOT EXISTS "idx_td_parlay_picks_pick_em_week"
  ON "public"."td_parlay_picks" USING "btree" ("pick_em_week_id");

CREATE OR REPLACE TRIGGER "update_td_parlay_picks_updated_at"
  BEFORE UPDATE ON "public"."td_parlay_picks"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- ---------------------------------------------------------------------------
-- 3. RLS: picks are secret until the deadline passes
-- ---------------------------------------------------------------------------
-- Not the usual `USING (true)`. The point of the parlay is that nobody sees
-- your player before they commit to theirs, and "hide it in the UI" is not
-- hiding it -- the anon key reaches PostgREST directly. So the privacy rule is
-- the row filter, and the UI is free to be naive about it.
--
-- Multiple permissive SELECT policies OR together, which is exactly the shape
-- wanted here: own row, or past the close time, or privileged.

ALTER TABLE "public"."td_parlay_picks" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "td_parlay_picks read own" ON "public"."td_parlay_picks";
CREATE POLICY "td_parlay_picks read own" ON "public"."td_parlay_picks"
  FOR SELECT USING ("auth"."uid"() = "user_id");

-- Gated on the week's own close time, not on a flag somebody has to remember
-- to set. `is_closed` closing the week early is honoured too.
DROP POLICY IF EXISTS "td_parlay_picks read after close" ON "public"."td_parlay_picks";
CREATE POLICY "td_parlay_picks read after close" ON "public"."td_parlay_picks"
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM "public"."pick_em_weeks" pew
    WHERE pew."id" = "td_parlay_picks"."pick_em_week_id"
      AND ("now"() >= pew."submission_closes_at" OR COALESCE(pew."is_closed", false))
  ));

DROP POLICY IF EXISTS "td_parlay_picks read privileged" ON "public"."td_parlay_picks";
CREATE POLICY "td_parlay_picks read privileged" ON "public"."td_parlay_picks"
  FOR SELECT USING ("public"."is_admin"() OR "public"."is_parlay_commissioner"());

-- The admin writes; the commissioner does not. View-only falls out of there
-- being no policy naming them here -- it is not a UI decision.
-- This is also how a grade gets flipped until auto-grading exists.
DROP POLICY IF EXISTS "td_parlay_picks admin write" ON "public"."td_parlay_picks";
CREATE POLICY "td_parlay_picks admin write" ON "public"."td_parlay_picks"
  USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

-- No user INSERT or UPDATE policy: submissions go through the RPC below, which
-- is where the deadline is enforced. A direct insert has nowhere to land.
GRANT ALL ON TABLE "public"."td_parlay_picks" TO "anon";
GRANT ALL ON TABLE "public"."td_parlay_picks" TO "authenticated";
GRANT ALL ON TABLE "public"."td_parlay_picks" TO "service_role";

-- ---------------------------------------------------------------------------
-- 4. submit_td_parlay_pick: the only write path
-- ---------------------------------------------------------------------------
-- `submit_pick_em_picks` checks no deadline at all -- it will happily write a
-- pick for a week that closed in October. That is a pre-existing gap and fixing
-- it there is its own change; this function does not repeat it.
--
-- A user-identity RPC, so the guard is `auth.uid()`, NOT `can_write_league()`:
-- this writes on behalf of whoever is calling, and the league-write guard would
-- let the service role submit as nobody.

CREATE OR REPLACE FUNCTION "public"."submit_td_parlay_pick"(
  "p_pick_em_week_id" "uuid",
  "p_player_id" "uuid" DEFAULT NULL,
  "p_player_name" "text" DEFAULT NULL
) RETURNS "public"."td_parlay_picks"
  LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public'
  AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_week    pick_em_weeks%ROWTYPE;
  v_name    text;
  v_row     td_parlay_picks%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to submit a parlay pick.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_week FROM pick_em_weeks WHERE id = p_pick_em_week_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pick''em week %', p_pick_em_week_id USING ERRCODE = '22023';
  END IF;

  IF now() < v_week.submission_opens_at THEN
    RAISE EXCEPTION 'The parlay for week % is not open yet (opens %).',
      v_week.week_number, v_week.submission_opens_at USING ERRCODE = '22023';
  END IF;

  -- Half-open interval: the close time is the first instant you are late.
  IF now() >= v_week.submission_closes_at OR COALESCE(v_week.is_closed, false) THEN
    RAISE EXCEPTION 'The parlay for week % is closed.', v_week.week_number
      USING ERRCODE = '22023';
  END IF;

  IF p_player_id IS NOT NULL THEN
    -- Canonical name, not the client's spelling of it, so the dashboard reads
    -- the same whichever way the pick was made.
    SELECT name INTO v_name FROM players WHERE id = p_player_id;
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Unknown player %', p_player_id USING ERRCODE = '22023';
    END IF;
  ELSE
    v_name := btrim(COALESCE(p_player_name, ''));
    IF v_name = '' THEN
      RAISE EXCEPTION 'A player name is required.' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO td_parlay_picks (
    pick_em_week_id, season_id, week, user_id, player_id, player_name_raw, submitted_at
  ) VALUES (
    p_pick_em_week_id, v_week.season_id, v_week.week_number, v_user_id,
    p_player_id, v_name, now()
  )
  ON CONFLICT (user_id, pick_em_week_id) DO UPDATE SET
    player_id       = EXCLUDED.player_id,
    player_name_raw = EXCLUDED.player_name_raw,
    -- A new player is a new question. Carrying the old grade over would assert
    -- something about a pick that was never made.
    scored_td       = NULL,
    submitted_at    = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

ALTER FUNCTION "public"."submit_td_parlay_pick"("uuid", "uuid", "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."submit_td_parlay_pick"("uuid", "uuid", "text") IS
  'Insert or replace the caller''s TD parlay pick for a pick''em week. Raises outside [submission_opens_at, submission_closes_at). Pass p_player_id for a matched player (the canonical name is looked up) or p_player_name alone for a free-text pick.';

REVOKE ALL ON FUNCTION "public"."submit_td_parlay_pick"("uuid", "uuid", "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."submit_td_parlay_pick"("uuid", "uuid", "text") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."submit_td_parlay_pick"("uuid", "uuid", "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."submit_td_parlay_pick"("uuid", "uuid", "text") TO "service_role";

-- ---------------------------------------------------------------------------
-- 5. player_week_stats.pro_team_id
-- ---------------------------------------------------------------------------
-- Costs one column and one line in the writer: `services/espnPlayerStatsMapper.js`
-- already extracts `proTeamId` per player and `services/db/playerWeekStats.js`
-- was dropping it on the floor. It is the join key the future `nfl_schedule`
-- table needs, and backfilling it later would mean re-fetching every past week
-- from ESPN.

ALTER TABLE "public"."player_week_stats" ADD COLUMN IF NOT EXISTS "pro_team_id" integer;

COMMENT ON COLUMN "public"."player_week_stats"."pro_team_id" IS
  'ESPN proTeamId -- the NFL team, not the fantasy team (that is team_id). Join key for a future nfl_schedule table; NULL for rows written before 2026-08-28.';

-- ---------------------------------------------------------------------------
-- Seeding
-- ---------------------------------------------------------------------------
-- Nothing is seeded here, and not only because a hardcoded uuid would be wrong
-- on every database but one: the role changes hands and more than one person
-- can hold it, so it is assigned in the app. The admin picks commissioners in
-- Settings -> Roles, which writes this table directly through the
-- `league_roles admin write` policy. See
-- `20260831120000_list_league_members.sql` for the member list that picker
-- reads, and `src/components/admin/LeagueRolesManager.jsx` for the UI.
--
-- Until somebody is granted the role, only the admin can open the parlay tab,
-- which is a working state rather than a broken one.

-- ---------------------------------------------------------------------------
-- Future work
-- ---------------------------------------------------------------------------
-- 1. NFL schedules. Nothing in this system knows who a player's team plays in a
--    given week, so the parlay UI cannot show "vs BUF" or grey out a bye. That
--    needs `nfl_schedule(season_year, week, pro_team_id, opponent_pro_team_id
--    NULL=bye, is_home, game_time, UNIQUE(season_year, week, pro_team_id))` fed
--    from ESPN's `proTeamSchedules_wl` view. The UI has the slots reserved.
-- 2. Auto-grading. A sync step reading weekly TD stats by `espn_player_id` can
--    set `scored_td` for every pick with a non-NULL `player_id`; free-text
--    picks stay manual by construction.
-- 3. `submit_pick_em_picks` still enforces no deadline. Same guard as above.
