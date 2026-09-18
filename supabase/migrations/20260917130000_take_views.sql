-- Takes: one row per member recording when they last read the board.
--
-- The Takes tab carries a count of predictions posted since the viewer last
-- looked. That mark shipped in `localStorage`, which made it per-browser: a
-- member who read the board on their phone still had the badge up on their
-- laptop, and clearing browser data started the count from the whole board
-- again. This is the row that fixes it -- the mark follows the person.
--
-- **One row per member, not one per member per season.** The tab only ever
-- renders the active season, so exactly one board is ever on screen, and the
-- mark is an absolute instant rather than a week or a count: every take in a
-- past season was posted before it by construction, so they read as seen
-- without a season column having to say so. A season picker on the tab would
-- change that, and would be the thing to add the column for.
--
-- **The mark never moves backwards.** `mark_takes_seen()` writes
-- `greatest(stored, incoming)` rather than the incoming value, because two
-- devices are exactly what this table exists to serve and they do not take
-- turns: a laptop left open on a stale board would otherwise un-see, on write,
-- everything the phone had just read. The client mirrors the same rule before
-- it sends, so a no-op costs nothing, but the database is what makes it true
-- under a race.
--
-- **Nobody reads anybody else's.** Who has looked at the board is the one fact
-- on this board that is not the league's business -- it is not a public read
-- like `takes` and `take_participants` are, and there is no admin read either:
-- an admin who could see who had not read a take would be a surveillance
-- feature nobody asked for. The policies are own-row for all three commands.
--
-- The client half is `useTakesSeen` (`hooks/queries/useTakes.js`) over
-- `services/db/takes.js`, and `src/components/takes/seen.js` holds the pure
-- rule for what "unread" counts.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."take_views" (
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "last_seen_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."take_views" OWNER TO "postgres";

COMMENT ON TABLE "public"."take_views" IS
  'One row per member: the newest take they have seen on the board, which is what the Takes tab''s unread count is measured against. Own-row read and write only -- who has read the board is nobody else''s business, including the admin''s.';

COMMENT ON COLUMN "public"."take_views"."last_seen_at" IS
  'The created_at of the newest take this member has been shown -- a take''s own timestamp, never now(). A clock ahead of the database''s would otherwise mark takes seen before they were written. Moves forward only; see mark_takes_seen().';

DO $$
BEGIN
  -- The primary key *is* the "one row per member" rule; there is no separate
  -- unique constraint to drift from it.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_views_pkey') THEN
    ALTER TABLE "public"."take_views" ADD CONSTRAINT "take_views_pkey" PRIMARY KEY ("user_id");
  END IF;

  -- A departing member takes their receipt with them. CASCADE rather than SET
  -- NULL: unlike a grade or a take, this row is of no interest to anybody once
  -- the person it belongs to is gone.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_views_user_id_fkey') THEN
    ALTER TABLE "public"."take_views"
      ADD CONSTRAINT "take_views_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE TRIGGER "update_take_views_updated_at"
  BEFORE UPDATE ON "public"."take_views"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- ---------------------------------------------------------------------------
-- 2. RLS -- own row, all three commands
-- ---------------------------------------------------------------------------
-- Per-command policies including the DELETE one, which nothing calls today:
-- the alternative is a member who cannot reset their own badge without an
-- admin, and the row is theirs.
--
-- `is_approved_member()` leads each write policy, per the rule in CLAUDE.md
-- that every member write path carries the guard. It is close to moot here --
-- an unapproved caller reads zero takes, so their mark would describe nothing
-- -- but "close to moot" is how a guard gets left off the one path where it
-- was not.

ALTER TABLE "public"."take_views" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "take_views read own" ON "public"."take_views";
CREATE POLICY "take_views read own" ON "public"."take_views"
  FOR SELECT TO "authenticated" USING ("auth"."uid"() = "user_id");

DROP POLICY IF EXISTS "take_views insert own" ON "public"."take_views";
CREATE POLICY "take_views insert own" ON "public"."take_views"
  FOR INSERT TO "authenticated"
  WITH CHECK ("public"."is_approved_member"() AND ("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "take_views update own" ON "public"."take_views";
CREATE POLICY "take_views update own" ON "public"."take_views"
  FOR UPDATE TO "authenticated"
  USING ("public"."is_approved_member"() AND ("auth"."uid"() = "user_id"))
  WITH CHECK ("public"."is_approved_member"() AND ("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "take_views delete own" ON "public"."take_views";
CREATE POLICY "take_views delete own" ON "public"."take_views"
  FOR DELETE TO "authenticated" USING ("auth"."uid"() = "user_id");

-- `anon` gets nothing: a NULL uid matches no row, but there is no reason to
-- hand the table to a role that can never have one.
REVOKE ALL ON TABLE "public"."take_views" FROM "anon";
REVOKE ALL ON TABLE "public"."take_views" FROM "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."take_views" TO "authenticated";
GRANT ALL ON TABLE "public"."take_views" TO "service_role";

-- ---------------------------------------------------------------------------
-- 3. The write path
-- ---------------------------------------------------------------------------
-- An RPC rather than a plain upsert, for one reason: `greatest`. PostgREST's
-- upsert cannot express "keep whichever is newer" in its DO UPDATE, so a
-- second device writing a staler mark would win by arriving last.
--
-- **SECURITY INVOKER**, against the pattern of the submit RPCs, and
-- deliberately: those are DEFINER because they write rows the caller has no
-- policy for, and so have to restate the rules RLS would have applied. This
-- one touches nothing but the caller's own row, so the policies above are
-- already exactly the rule -- making it DEFINER would mean copying the
-- approval guard and the own-row check into a second place to disagree with.
-- `auth.uid()` reads the caller's JWT either way.
--
-- Returns the stored mark, so the client can put the answer straight into its
-- cache instead of following the write with a read.

CREATE OR REPLACE FUNCTION "public"."mark_takes_seen"("p_last_seen_at" timestamp with time zone)
  RETURNS timestamp with time zone
  LANGUAGE "plpgsql" SECURITY INVOKER
  SET "search_path" TO 'public'
  AS $$
  DECLARE
    v_user_id uuid := auth.uid();
    v_stored timestamp with time zone;
  BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'You must be signed in to do that'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_last_seen_at IS NULL THEN
      RAISE EXCEPTION 'A mark needs a timestamp'
        USING ERRCODE = 'null_value_not_allowed';
    END IF;

    INSERT INTO public.take_views (user_id, last_seen_at)
    VALUES (v_user_id, p_last_seen_at)
    ON CONFLICT (user_id) DO UPDATE
      SET last_seen_at = GREATEST(public.take_views.last_seen_at, EXCLUDED.last_seen_at)
    RETURNING last_seen_at INTO v_stored;

    RETURN v_stored;
  END;
  $$;

ALTER FUNCTION "public"."mark_takes_seen"(timestamp with time zone) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."mark_takes_seen"(timestamp with time zone) IS
  'Records that the caller has seen every take posted up to p_last_seen_at, and returns the stored mark. Writes greatest(stored, incoming) so a second device holding a staler board cannot un-see what the first has read. SECURITY INVOKER: it touches only the caller''s own row, so take_views'' policies are the rule and are not restated here.';

REVOKE ALL ON FUNCTION "public"."mark_takes_seen"(timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."mark_takes_seen"(timestamp with time zone) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."mark_takes_seen"(timestamp with time zone) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."mark_takes_seen"(timestamp with time zone) TO "service_role";
