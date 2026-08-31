-- Takes: the league's predictions board.
--
-- A member posts a prediction, everyone -- signed out included -- can read the
-- board, and other members "+1" a take to co-sign it. The admin grades each one
-- correct / incorrect / push once its milestone has passed.
--
-- Two decisions shape the schema:
--
--   * **Timing is a milestone, not a date.** A take resolves at "week N", at the
--     end of the regular season, or at the end of the season. A free date would
--     let two takes about the same event sort apart, and would have to be
--     re-checked against the season calendar every time the schedule moved.
--     `target_type` is a named CHECK precisely so a later migration can add
--     `'nfl_game'` by recreating one constraint, with no data change.
--
--   * **The +1s are their own table.** A counter column cannot say who joined,
--     cannot be withdrawn idempotently, and races under concurrent writes.
--     `take_participants` with a UNIQUE (take_id, user_id) makes the toggle
--     idempotent and makes "who else called this" a plain read.
--
-- The author's rights are deliberately narrow and enforced *here*, not in the
-- UI: withdraw a +1 any time before resolution, delete an unresolved take, and
-- edit the **body only**, within 72 hours of posting, while unresolved. RLS
-- expresses the window; a BEFORE UPDATE trigger expresses "text only", because
-- a WITH CHECK clause sees NEW and cannot compare it to OLD.
--
-- Sort order is deliberately not a column. Milestone ordering is a pure
-- function over a league-sized board and lives in
-- `src/components/takes/milestones.js`, so future game-targeted takes can sort
-- by kickoff without a generated column to migrate.

-- ---------------------------------------------------------------------------
-- 1. takes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."takes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "body" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_week" integer,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "edited_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."takes" OWNER TO "postgres";

COMMENT ON TABLE "public"."takes" IS
  'League predictions. Any authenticated member posts one; everyone can read. The admin grades it after its milestone passes. Authors may edit the body within 72 hours and delete while unresolved -- enforced by RLS plus takes_guard_author_update(), not by the UI.';

COMMENT ON COLUMN "public"."takes"."target_type" IS
  'When this take resolves: week | end_of_regular_season | end_of_season. The CHECK is named and DO-guarded so a later migration can recreate it with nfl_game added.';
COMMENT ON COLUMN "public"."takes"."target_week" IS
  'Set if and only if target_type = ''week''. Mirrors the pattern a future nfl_game_id would follow.';
COMMENT ON COLUMN "public"."takes"."edited_at" IS
  'Stamped by set_take_edited_at() when the body actually changes. updated_at will not do: admin resolution touches it too, so it cannot distinguish "the author reworded this" from "the admin graded it".';
COMMENT ON COLUMN "public"."takes"."resolved_by" IS
  'Who graded it. Deliberately outside takes_resolution_check: a service-role or backend grading pass has no auth.uid(), and a NULL grader must not block a valid resolution.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takes_pkey') THEN
    ALTER TABLE "public"."takes" ADD CONSTRAINT "takes_pkey" PRIMARY KEY ("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takes_season_id_fkey') THEN
    ALTER TABLE "public"."takes"
      ADD CONSTRAINT "takes_season_id_fkey" FOREIGN KEY ("season_id")
      REFERENCES "public"."seasons"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takes_user_id_fkey') THEN
    ALTER TABLE "public"."takes"
      ADD CONSTRAINT "takes_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;

  -- The grader may leave the league; the grade stays. SET NULL, not CASCADE:
  -- deleting a user must not delete the league's record of a resolved take.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takes_resolved_by_fkey') THEN
    ALTER TABLE "public"."takes"
      ADD CONSTRAINT "takes_resolved_by_fkey" FOREIGN KEY ("resolved_by")
      REFERENCES "auth"."users"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takes_body_check') THEN
    ALTER TABLE "public"."takes"
      ADD CONSTRAINT "takes_body_check"
      CHECK (("char_length"("btrim"("body")) BETWEEN 1 AND 500));
  END IF;

  -- The NFL extensibility point. Recreating this one constraint with
  -- 'nfl_game' in the list is the whole of that schema change.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takes_target_type_check') THEN
    ALTER TABLE "public"."takes"
      ADD CONSTRAINT "takes_target_type_check"
      CHECK (("target_type" = ANY (ARRAY['week'::"text", 'end_of_regular_season'::"text", 'end_of_season'::"text"])));
  END IF;

  -- Biconditional, not two one-way checks: a week take without a week and an
  -- end-of-season take carrying one are the same bug seen from two sides.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takes_target_week_check') THEN
    ALTER TABLE "public"."takes"
      ADD CONSTRAINT "takes_target_week_check"
      CHECK ((("target_type" = 'week'::"text") = ("target_week" IS NOT NULL))
             AND ("target_week" IS NULL OR "target_week" > 0));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takes_status_check') THEN
    ALTER TABLE "public"."takes"
      ADD CONSTRAINT "takes_status_check"
      CHECK (("status" = ANY (ARRAY['pending'::"text", 'correct'::"text", 'incorrect'::"text", 'push'::"text"])));
  END IF;

  -- Status and resolution cannot disagree. Reopening must null resolved_at in
  -- the same statement that sets status back to 'pending', which is what stops
  -- a half-reopened take reading as graded to one query and ungraded to another.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takes_resolution_check') THEN
    ALTER TABLE "public"."takes"
      ADD CONSTRAINT "takes_resolution_check"
      CHECK ((("status" = 'pending'::"text") = ("resolved_at" IS NULL)));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_takes_season_created"
  ON "public"."takes" USING "btree" ("season_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_takes_user"
  ON "public"."takes" USING "btree" ("user_id");

-- ---------------------------------------------------------------------------
-- 2. The two triggers that make the author's rights true
-- ---------------------------------------------------------------------------

-- Server-side so the "edited" flag can be neither forged by a client nor
-- forgotten by a caller.
CREATE OR REPLACE FUNCTION "public"."set_take_edited_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    IF NEW.body IS DISTINCT FROM OLD.body THEN
      NEW.edited_at := now();
    END IF;
    RETURN NEW;
  END;
  $$;

ALTER FUNCTION "public"."set_take_edited_at"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."set_take_edited_at"() IS
  'Stamps takes.edited_at when the body actually changes, so the "edited" indicator is a fact about the row rather than something the client asserts.';

-- "Edit the text only" cannot be said in RLS: a WITH CHECK expression sees only
-- NEW, so it can require `status = 'pending'` but cannot notice that the author
-- just changed the milestone, reassigned the take, or graded it themselves.
-- A BEFORE UPDATE trigger sees both rows, so this is where that rule lives.
--
-- `can_write_league()` rather than `is_admin()`, per CLAUDE.md: the service role
-- bypasses RLS but *not* triggers, and `is_admin()` reads a JWT email the
-- service role does not have -- so an is_admin() guard here would reject every
-- backend write.
CREATE OR REPLACE FUNCTION "public"."takes_guard_author_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    IF public.can_write_league() THEN
      RETURN NEW;
    END IF;

    IF NEW.season_id   IS DISTINCT FROM OLD.season_id
    OR NEW.user_id     IS DISTINCT FROM OLD.user_id
    OR NEW.target_type IS DISTINCT FROM OLD.target_type
    OR NEW.target_week IS DISTINCT FROM OLD.target_week
    OR NEW.status      IS DISTINCT FROM OLD.status
    OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
    OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
    OR NEW.created_at  IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Only the body of a take may be edited'
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
  END;
  $$;

ALTER FUNCTION "public"."takes_guard_author_update"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."takes_guard_author_update"() IS
  'Restricts a non-privileged UPDATE on takes to the body column. RLS cannot express this: WITH CHECK sees NEW only and cannot compare it to OLD.';

-- Neither is meant to be reachable as an RPC. Firing a trigger does not check
-- EXECUTE -- that is settled at CREATE TRIGGER time -- so revoking costs the
-- triggers nothing and takes both functions off the REST surface. `public` as
-- well as the named roles: Postgres grants EXECUTE to PUBLIC by default and
-- `anon` inherits it, so revoking only the named roles is a silent no-op.
REVOKE ALL ON FUNCTION "public"."set_take_edited_at"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."set_take_edited_at"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."set_take_edited_at"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."takes_guard_author_update"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."takes_guard_author_update"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."takes_guard_author_update"() FROM "authenticated";

CREATE OR REPLACE TRIGGER "set_takes_user_id"
  BEFORE INSERT ON "public"."takes"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();

CREATE OR REPLACE TRIGGER "set_takes_edited_at"
  BEFORE UPDATE ON "public"."takes"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_take_edited_at"();

CREATE OR REPLACE TRIGGER "takes_guard_author_update"
  BEFORE UPDATE ON "public"."takes"
  FOR EACH ROW EXECUTE FUNCTION "public"."takes_guard_author_update"();

CREATE OR REPLACE TRIGGER "update_takes_updated_at"
  BEFORE UPDATE ON "public"."takes"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- ---------------------------------------------------------------------------
-- 3. takes RLS
-- ---------------------------------------------------------------------------
-- Per-command policies, including the DELETE one the pick'ems tables forgot --
-- without it an author's "delete my take" silently matches no rows and reports
-- success.

ALTER TABLE "public"."takes" ENABLE ROW LEVEL SECURITY;

-- The board is public: a signed-out visitor reads it, which is the point.
DROP POLICY IF EXISTS "Public read takes" ON "public"."takes";
CREATE POLICY "Public read takes" ON "public"."takes"
  FOR SELECT USING (true);

-- A take is born ungraded. Without the three resolution clauses an author could
-- post one already marked correct.
DROP POLICY IF EXISTS "takes insert own" ON "public"."takes";
CREATE POLICY "takes insert own" ON "public"."takes"
  FOR INSERT TO "authenticated"
  WITH CHECK (("auth"."uid"() = "user_id")
              AND ("status" = 'pending'::"text")
              AND ("resolved_at" IS NULL)
              AND ("resolved_by" IS NULL));

-- The 72-hour window, and only while ungraded. The companion guard trigger
-- narrows this further to the body column.
DROP POLICY IF EXISTS "takes author edit" ON "public"."takes";
CREATE POLICY "takes author edit" ON "public"."takes"
  FOR UPDATE TO "authenticated"
  USING (("auth"."uid"() = "user_id")
         AND ("status" = 'pending'::"text")
         AND ("now"() < "created_at" + interval '72 hours'))
  WITH CHECK (("auth"."uid"() = "user_id") AND ("status" = 'pending'::"text"));

-- No time limit on deletion, but a graded take is league record and stays.
DROP POLICY IF EXISTS "takes author delete" ON "public"."takes";
CREATE POLICY "takes author delete" ON "public"."takes"
  FOR DELETE TO "authenticated"
  USING (("auth"."uid"() = "user_id") AND ("status" = 'pending'::"text"));

-- Grading is a plain UPDATE under this policy. No SECURITY DEFINER RPC: there
-- is no multi-row atomicity to guarantee and no privileged data to read.
DROP POLICY IF EXISTS "takes admin write" ON "public"."takes";
CREATE POLICY "takes admin write" ON "public"."takes"
  USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

GRANT ALL ON TABLE "public"."takes" TO "anon";
GRANT ALL ON TABLE "public"."takes" TO "authenticated";
GRANT ALL ON TABLE "public"."takes" TO "service_role";

-- ---------------------------------------------------------------------------
-- 4. take_participants -- the +1 co-signs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."take_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "take_id" "uuid" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."take_participants" OWNER TO "postgres";

COMMENT ON TABLE "public"."take_participants" IS
  'One row per member who co-signed a take. UNIQUE (take_id, user_id) makes the +1 toggle idempotent; the business rules -- no self co-sign, nothing after resolution -- live in the policy subqueries below rather than in the client.';

COMMENT ON COLUMN "public"."take_participants"."season_id" IS
  'Denormalized from the parent take so a whole season''s co-signs read without a join. The INSERT policy checks it matches the take, so it cannot drift.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_participants_pkey') THEN
    ALTER TABLE "public"."take_participants"
      ADD CONSTRAINT "take_participants_pkey" PRIMARY KEY ("id");
  END IF;

  -- What makes the toggle idempotent: a double-tapped +1 conflicts instead of
  -- accumulating a second row that the withdraw would then miss.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_participants_take_user_key') THEN
    ALTER TABLE "public"."take_participants"
      ADD CONSTRAINT "take_participants_take_user_key" UNIQUE ("take_id", "user_id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_participants_take_id_fkey') THEN
    ALTER TABLE "public"."take_participants"
      ADD CONSTRAINT "take_participants_take_id_fkey" FOREIGN KEY ("take_id")
      REFERENCES "public"."takes"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_participants_season_id_fkey') THEN
    ALTER TABLE "public"."take_participants"
      ADD CONSTRAINT "take_participants_season_id_fkey" FOREIGN KEY ("season_id")
      REFERENCES "public"."seasons"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_participants_user_id_fkey') THEN
    ALTER TABLE "public"."take_participants"
      ADD CONSTRAINT "take_participants_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_take_participants_take"
  ON "public"."take_participants" USING "btree" ("take_id");

CREATE INDEX IF NOT EXISTS "idx_take_participants_season"
  ON "public"."take_participants" USING "btree" ("season_id");

CREATE OR REPLACE TRIGGER "set_take_participants_user_id"
  BEFORE INSERT ON "public"."take_participants"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id"();

ALTER TABLE "public"."take_participants" ENABLE ROW LEVEL SECURITY;

-- Who co-signed is part of the board, so it is public like the board.
DROP POLICY IF EXISTS "Public read take_participants" ON "public"."take_participants";
CREATE POLICY "Public read take_participants" ON "public"."take_participants"
  FOR SELECT USING (true);

-- Every rule about *whether* a +1 is allowed is in this subquery: it is your
-- own row, on somebody else's take, that is still ungraded, and the
-- denormalized season matches the take's. None of it is a UI decision.
DROP POLICY IF EXISTS "take_participants insert own" ON "public"."take_participants";
CREATE POLICY "take_participants insert own" ON "public"."take_participants"
  FOR INSERT TO "authenticated"
  WITH CHECK (("auth"."uid"() = "user_id")
              AND EXISTS (
                SELECT 1 FROM "public"."takes" t
                WHERE t."id" = "take_participants"."take_id"
                  AND t."user_id" <> "auth"."uid"()
                  AND t."status" = 'pending'::"text"
                  AND t."season_id" = "take_participants"."season_id"));

-- Withdrawable right up to resolution, and frozen after it: a co-sign is a
-- prediction of your own, so backing out once the result is known is not a
-- thing the schema should permit.
DROP POLICY IF EXISTS "take_participants withdraw own" ON "public"."take_participants";
CREATE POLICY "take_participants withdraw own" ON "public"."take_participants"
  FOR DELETE TO "authenticated"
  USING (("auth"."uid"() = "user_id")
         AND EXISTS (
           SELECT 1 FROM "public"."takes" t
           WHERE t."id" = "take_participants"."take_id"
             AND t."status" = 'pending'::"text"));

DROP POLICY IF EXISTS "take_participants admin write" ON "public"."take_participants";
CREATE POLICY "take_participants admin write" ON "public"."take_participants"
  USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

GRANT ALL ON TABLE "public"."take_participants" TO "anon";
GRANT ALL ON TABLE "public"."take_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."take_participants" TO "service_role";
