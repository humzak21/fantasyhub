-- New accounts are approved by the admin, and the approval is a row.
--
-- Anyone can sign up: `AuthContext.signUp` has no allowlist, and nothing in the
-- schema knows a member from a stranger. The masking that hides team and owner
-- names from a visitor is a client-side string compare -- a fresh account
-- unmasks the whole league the moment its display name matches a `teams.owner`
-- value, and the display-name prompt even says when the name typed matches
-- nobody. The only members-only surface the database actually enforced was the
-- takes board (`TO authenticated`), and every member write path -- pick'ems, the
-- TD parlay, playoff picks, award votes -- was open to any signed-in account,
-- because "signed in" was the strongest thing the database could ask.
--
-- This migration adds the missing fact. A confirmed sign-up creates a *pending*
-- request in `member_approvals`; until the admin approves it in Settings ->
-- Approvals the account is a visitor: names stay masked, the members-only reads
-- return nothing, and every member write is refused here rather than in a
-- component, because the anon key reaches PostgREST directly and a rule that
-- only lives in the UI is not a rule.
--
-- Decisions that shape it:
--
--   1. The request is created by a trigger on `auth.users`, the first and only
--      trigger this database has on that table. It fires once the email is
--      confirmed (insert or update of `email_confirmed_at`, when set), so
--      unconfirmed sign-ups -- typos, strangers who never click the link --
--      never reach the queue. It NEVER RAISES: GoTrue runs sign-up and
--      confirmation inside its own transaction, and an exception from a trigger
--      surfaces to the person as "Database error saving new user" and blocks
--      every sign-up, not just theirs. The listing below LEFT JOINs from
--      `auth.users` and the write RPC upserts, so an account the trigger somehow
--      missed still appears pending and can still be approved.
--
--   2. Every account that exists when this runs is grandfathered as approved,
--      and that backfill sits BEFORE any policy is narrowed. Inside the one
--      transaction no existing member is ever, even momentarily, a stranger.
--
--   3. Writes go through `set_member_approval()` and `delete_member_account()`,
--      not through RLS on the table. The RPC stamps `decided_by`/`decided_at`
--      from `auth.uid()`/`now()` where a policy-gated UPDATE would take the
--      client's word for them, and it upserts, which covers the trigger-less
--      case above. The table therefore has no client write policy at all.
--
--   4. `is_approved_member()` folds the admin in, the way `isParlayCommissioner`
--      does on the client, and it is executable by `anon`. The second part is
--      not optional: the baseline write policies on `playoff_picks`,
--      `award_votes` and `pick_em_submissions` carry no `TO` clause, so they are
--      evaluated under `anon` too, and a policy that calls a function the role
--      cannot execute errors instead of denying.
--
--   5. Revoke is a hard delete of the auth user. `auth.*`, `takes`,
--      `take_participants`, `td_parlay_picks`, `award_votes`, `league_roles` and
--      this table cascade; `take_events` keeps its rows with a NULL actor by
--      design; `pick_em_submissions.user_id` and `playoff_picks.user_id` have no
--      FK and keep their rows as league history (only a once-approved member can
--      have any). The person can sign up again, and re-enters the queue through
--      the trigger with a fresh id.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."member_approvals" (
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" "uuid",
    "note" "text",
    CONSTRAINT "member_approvals_status_check"
      CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);

ALTER TABLE "public"."member_approvals" OWNER TO "postgres";

COMMENT ON TABLE "public"."member_approvals" IS
  'One row per confirmed account: pending until the admin decides. Created by the on_auth_user_confirmed trigger, written only by set_member_approval(); there is no client write policy. is_approved_member() is the rule every members-only read and write checks.';
COMMENT ON COLUMN "public"."member_approvals"."status" IS
  'pending | approved | rejected. Only approved grants access; rejected is pending that the admin has hidden from the queue and can reconsider.';
COMMENT ON COLUMN "public"."member_approvals"."decided_by" IS
  'The admin who last approved or rejected, from auth.uid() inside the RPC. NULL for a grandfathered row and after a return to pending.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_approvals_pkey') THEN
    ALTER TABLE "public"."member_approvals" ADD CONSTRAINT "member_approvals_pkey" PRIMARY KEY ("user_id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_approvals_user_id_fkey') THEN
    ALTER TABLE "public"."member_approvals"
      ADD CONSTRAINT "member_approvals_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_approvals_decided_by_fkey') THEN
    ALTER TABLE "public"."member_approvals"
      ADD CONSTRAINT "member_approvals_decided_by_fkey" FOREIGN KEY ("decided_by")
      REFERENCES "auth"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "public"."member_approvals" ENABLE ROW LEVEL SECURITY;

-- Your own row, or everything if you are the admin. No write policy: see the
-- header. `anon` gets nothing -- a NULL uid would match no row anyway, but
-- there is no reason to hand it the table.
DROP POLICY IF EXISTS "member_approvals read own or admin" ON "public"."member_approvals";
CREATE POLICY "member_approvals read own or admin" ON "public"."member_approvals"
  FOR SELECT USING (("auth"."uid"() = "user_id") OR "public"."is_admin"());

REVOKE ALL ON TABLE "public"."member_approvals" FROM "anon";
REVOKE ALL ON TABLE "public"."member_approvals" FROM "authenticated";
GRANT SELECT ON TABLE "public"."member_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."member_approvals" TO "service_role";

-- ---------------------------------------------------------------------------
-- 2. The rule
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER for the same reason as is_parlay_commissioner(): a policy on
-- another table has to be able to test the caller's row without the caller
-- needing a grant on this one.

CREATE OR REPLACE FUNCTION "public"."is_approved_member"() RETURNS boolean
  LANGUAGE "sql" STABLE SECURITY DEFINER SET "search_path" TO 'public'
  AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.member_approvals m
    WHERE m.user_id = auth.uid() AND m.status = 'approved'
  )
$$;

ALTER FUNCTION "public"."is_approved_member"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_approved_member"() IS
  'True for the admin and for any account whose member_approvals row is approved. NULL auth.uid() is false, not an error. Executable by anon on purpose: the baseline write policies have no TO clause and are evaluated under anon.';

-- Postgres grants EXECUTE to PUBLIC by default and `anon` inherits it, so
-- revoking only the named roles is a silent no-op.
REVOKE ALL ON FUNCTION "public"."is_approved_member"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_approved_member"() FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."is_approved_member"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_approved_member"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_approved_member"() TO "service_role";

-- ---------------------------------------------------------------------------
-- 3. The trigger on auth.users
-- ---------------------------------------------------------------------------
-- Never raises. `ON CONFLICT DO NOTHING` absorbs GoTrue's habit of rewriting
-- whole rows (an UPDATE OF email_confirmed_at fires when the column is in the
-- SET list, changed or not); the EXCEPTION block absorbs everything else, with
-- a warning in the Postgres log rather than an error in someone's sign-up.

CREATE OR REPLACE FUNCTION "public"."handle_confirmed_user"() RETURNS "trigger"
  LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public'
  AS $$
BEGIN
  INSERT INTO public.member_approvals (user_id, status)
  VALUES (NEW.id, 'pending')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'member_approvals: could not queue user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."handle_confirmed_user"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."handle_confirmed_user"() IS
  'Queues a pending member_approvals row for a confirmed auth.users row. Must never raise: an exception here is "Database error saving new user" for every sign-up. Fired by on_auth_user_confirmed.';

-- Firing a trigger does not check EXECUTE; nobody calls this directly.
REVOKE ALL ON FUNCTION "public"."handle_confirmed_user"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."handle_confirmed_user"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."handle_confirmed_user"() FROM "authenticated";

-- The WHEN clause must not mention OLD: this also covers INSERT, which is how
-- an auto-confirmed or dashboard-created account arrives.
DROP TRIGGER IF EXISTS "on_auth_user_confirmed" ON "auth"."users";
CREATE TRIGGER "on_auth_user_confirmed"
  AFTER INSERT OR UPDATE OF "email_confirmed_at" ON "auth"."users"
  FOR EACH ROW
  WHEN (NEW."email_confirmed_at" IS NOT NULL)
  EXECUTE FUNCTION "public"."handle_confirmed_user"();

-- ---------------------------------------------------------------------------
-- 4. Grandfather every existing account
-- ---------------------------------------------------------------------------
-- Before any guard below references the table. Idempotent, and a no-op on the
-- empty database CI replays the chain into.

INSERT INTO "public"."member_approvals" ("user_id", "status", "requested_at", "decided_at", "note")
SELECT u."id", 'approved', u."created_at", "now"(), 'grandfathered: account predates approvals'
FROM "auth"."users" u
ON CONFLICT ("user_id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. The admin's queue
-- ---------------------------------------------------------------------------
-- Modeled on list_league_members(): SECURITY DEFINER over auth.users with the
-- is_admin() guard in the WHERE clause, so a non-admin gets an empty list
-- rather than an error. LEFT JOIN so an account with no row (the trigger
-- failed, or the account predates a fix) still shows as pending. Returns every
-- status; the client groups them.

CREATE OR REPLACE FUNCTION "public"."list_member_approvals"()
RETURNS TABLE (
  "user_id" "uuid",
  "display_name" "text",
  "email" "text",
  "email_confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone,
  "status" "text",
  "requested_at" timestamp with time zone,
  "decided_at" timestamp with time zone,
  "note" "text"
)
LANGUAGE "sql" STABLE SECURITY DEFINER SET "search_path" TO 'public'
AS $$
  SELECT
    u.id,
    COALESCE(
      NULLIF(btrim(u.raw_user_meta_data ->> 'name'), ''),
      NULLIF(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      split_part(u.email::text, '@', 1)
    ) AS display_name,
    u.email::text,
    u.email_confirmed_at,
    u.created_at,
    COALESCE(m.status, 'pending') AS status,
    COALESCE(m.requested_at, u.email_confirmed_at) AS requested_at,
    m.decided_at,
    m.note
  FROM auth.users u
  LEFT JOIN public.member_approvals m ON m.user_id = u.id
  WHERE public.is_admin()
    AND u.email_confirmed_at IS NOT NULL
  ORDER BY 6, 7, 2
$$;

ALTER FUNCTION "public"."list_member_approvals"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."list_member_approvals"() IS
  'Every confirmed account with its approval status, for Settings -> Approvals. Returns no rows for anyone but the admin -- the is_admin() guard is in the WHERE clause, not in a grant.';

REVOKE ALL ON FUNCTION "public"."list_member_approvals"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."list_member_approvals"() FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."list_member_approvals"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_member_approvals"() TO "service_role";

-- ---------------------------------------------------------------------------
-- 6. Approve / reject / back to pending
-- ---------------------------------------------------------------------------
-- is_admin(), not can_write_league(): this acts as a person and records who,
-- and the service role is nobody.

CREATE OR REPLACE FUNCTION "public"."set_member_approval"(
  "p_user_id" "uuid",
  "p_status" "text",
  "p_note" "text" DEFAULT NULL
) RETURNS "public"."member_approvals"
  LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public'
  AS $$
DECLARE
  v_row member_approvals%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the admin can approve members.' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Unknown approval status %', p_status USING ERRCODE = '22023';
  END IF;

  INSERT INTO member_approvals (user_id, status, decided_at, decided_by, note)
  VALUES (
    p_user_id,
    p_status,
    CASE WHEN p_status = 'pending' THEN NULL ELSE now() END,
    CASE WHEN p_status = 'pending' THEN NULL ELSE auth.uid() END,
    p_note
  )
  ON CONFLICT (user_id) DO UPDATE SET
    status     = EXCLUDED.status,
    decided_at = EXCLUDED.decided_at,
    decided_by = EXCLUDED.decided_by,
    note       = EXCLUDED.note
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

ALTER FUNCTION "public"."set_member_approval"("uuid", "text", "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."set_member_approval"("uuid", "text", "text") IS
  'Admin-only upsert of an account''s approval status, stamping decided_at/decided_by server-side. Upsert rather than update so an account the trigger missed can still be approved.';

REVOKE ALL ON FUNCTION "public"."set_member_approval"("uuid", "text", "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."set_member_approval"("uuid", "text", "text") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."set_member_approval"("uuid", "text", "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."set_member_approval"("uuid", "text", "text") TO "service_role";

-- ---------------------------------------------------------------------------
-- 7. Revoke: delete the account
-- ---------------------------------------------------------------------------
-- `postgres` holds DELETE on auth.users (verified on the live project), so a
-- postgres-owned SECURITY DEFINER can do what the client never could. The
-- cascade is listed in the header.

CREATE OR REPLACE FUNCTION "public"."delete_member_account"("p_user_id" "uuid") RETURNS boolean
  LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public'
  AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the admin can revoke an account.' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot revoke your own account.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;
  RETURN FOUND;
END;
$$;

ALTER FUNCTION "public"."delete_member_account"("uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_member_account"("uuid") IS
  'Admin-only, irreversible: deletes the auth.users row and everything that cascades from it. Refuses the admin''s own id. The person can sign up again and re-enters the queue.';

REVOKE ALL ON FUNCTION "public"."delete_member_account"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_member_account"("uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."delete_member_account"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."delete_member_account"("uuid") TO "service_role";

-- ---------------------------------------------------------------------------
-- 8. Members-only reads: takes, take_participants, take_events
-- ---------------------------------------------------------------------------
-- `TO authenticated USING (true)` becomes `USING (is_approved_member())`. The
-- take_participants write policies subquery `takes` as the calling user, so an
-- approved member passes both halves and an unapproved one neither -- which is
-- the intent, and is verified below in this file's probe notes.

DROP POLICY IF EXISTS "Members read takes" ON "public"."takes";
CREATE POLICY "Members read takes" ON "public"."takes"
  FOR SELECT TO "authenticated" USING ("public"."is_approved_member"());

COMMENT ON TABLE "public"."takes" IS
  'League predictions, readable by approved members only (is_approved_member()). Any approved member posts one; the admin grades it after its milestone passes. Authors may edit the body within 72 hours and delete while unresolved -- enforced by RLS plus takes_guard_author_update(), not by the UI.';

DROP POLICY IF EXISTS "Members read take_participants" ON "public"."take_participants";
CREATE POLICY "Members read take_participants" ON "public"."take_participants"
  FOR SELECT TO "authenticated" USING ("public"."is_approved_member"());

COMMENT ON TABLE "public"."take_participants" IS
  'One row per approved member who said Hell Nah to a take -- fading it, and agreeing to cover the author''s wager if it hits. UNIQUE (take_id, user_id) makes the toggle idempotent; the business rules -- approved account, not your own take, nothing after resolution, nothing on a take with no wager -- live in the policy subqueries rather than in the client.';

DROP POLICY IF EXISTS "Members read take_events" ON "public"."take_events";
CREATE POLICY "Members read take_events" ON "public"."take_events"
  FOR SELECT TO "authenticated" USING ("public"."is_approved_member"());

-- ---------------------------------------------------------------------------
-- 9. Member writes on takes and take_participants
-- ---------------------------------------------------------------------------
-- Each body is the current policy verbatim plus the guard.

DROP POLICY IF EXISTS "takes insert own" ON "public"."takes";
CREATE POLICY "takes insert own" ON "public"."takes"
  FOR INSERT TO "authenticated"
  WITH CHECK ("public"."is_approved_member"()
              AND ("auth"."uid"() = "user_id")
              AND ("status" = 'pending'::"text")
              AND ("resolved_at" IS NULL)
              AND ("resolved_by" IS NULL));

DROP POLICY IF EXISTS "takes author edit" ON "public"."takes";
CREATE POLICY "takes author edit" ON "public"."takes"
  FOR UPDATE TO "authenticated"
  USING ("public"."is_approved_member"()
         AND ("auth"."uid"() = "user_id")
         AND ("status" = 'pending'::"text")
         AND ("now"() < "created_at" + interval '72 hours'))
  WITH CHECK ("public"."is_approved_member"()
              AND ("auth"."uid"() = "user_id")
              AND ("status" = 'pending'::"text"));

DROP POLICY IF EXISTS "takes author delete" ON "public"."takes";
CREATE POLICY "takes author delete" ON "public"."takes"
  FOR DELETE TO "authenticated"
  USING ("public"."is_approved_member"()
         AND ("auth"."uid"() = "user_id")
         AND ("status" = 'pending'::"text"));

DROP POLICY IF EXISTS "take_participants insert own" ON "public"."take_participants";
CREATE POLICY "take_participants insert own" ON "public"."take_participants"
  FOR INSERT TO "authenticated"
  WITH CHECK ("public"."is_approved_member"()
              AND ("auth"."uid"() = "user_id")
              AND EXISTS (
                SELECT 1 FROM "public"."takes" t
                WHERE t."id" = "take_participants"."take_id"
                  AND t."user_id" <> "auth"."uid"()
                  AND t."status" = 'pending'::"text"
                  AND t."wager" IS NOT NULL
                  AND t."season_id" = "take_participants"."season_id"));

DROP POLICY IF EXISTS "take_participants withdraw own" ON "public"."take_participants";
CREATE POLICY "take_participants withdraw own" ON "public"."take_participants"
  FOR DELETE TO "authenticated"
  USING ("public"."is_approved_member"()
         AND ("auth"."uid"() = "user_id")
         AND EXISTS (
           SELECT 1 FROM "public"."takes" t
           WHERE t."id" = "take_participants"."take_id"
             AND t."status" = 'pending'::"text"));

-- ---------------------------------------------------------------------------
-- 10. Member writes on playoff_picks, award_votes, pick_em_submissions
-- ---------------------------------------------------------------------------
-- Baseline policies, no TO clause (evaluated under anon as well, hence the
-- anon EXECUTE grant on the rule). Bodies verbatim plus the guard.

DROP POLICY IF EXISTS "Users can insert own picks" ON "public"."playoff_picks";
CREATE POLICY "Users can insert own picks" ON "public"."playoff_picks"
  FOR INSERT WITH CHECK ("public"."is_approved_member"()
    AND ("auth"."uid"() = "user_id")
    AND ("now"() < COALESCE(( SELECT "c"."submission_deadline"
       FROM "public"."playoff_config" "c"
      WHERE ("c"."season_id" = "playoff_picks"."season_id")), 'infinity'::timestamp with time zone)));

DROP POLICY IF EXISTS "Users can update own picks" ON "public"."playoff_picks";
CREATE POLICY "Users can update own picks" ON "public"."playoff_picks"
  FOR UPDATE USING ("public"."is_approved_member"()
    AND ("auth"."uid"() = "user_id")
    AND ("now"() < COALESCE(( SELECT "c"."submission_deadline"
       FROM "public"."playoff_config" "c"
      WHERE ("c"."season_id" = "playoff_picks"."season_id")), 'infinity'::timestamp with time zone)));

DROP POLICY IF EXISTS "Users can insert votes" ON "public"."award_votes";
CREATE POLICY "Users can insert votes" ON "public"."award_votes"
  FOR INSERT WITH CHECK ("public"."is_approved_member"() AND ("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "Users can update own votes" ON "public"."award_votes";
CREATE POLICY "Users can update own votes" ON "public"."award_votes"
  FOR UPDATE USING ("public"."is_approved_member"() AND ("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "Users can manage own submissions" ON "public"."pick_em_submissions";
CREATE POLICY "Users can manage own submissions" ON "public"."pick_em_submissions"
  FOR INSERT WITH CHECK ("public"."is_approved_member"() AND ("auth"."uid"() = "user_id"));

DROP POLICY IF EXISTS "Users can update own submissions" ON "public"."pick_em_submissions";
CREATE POLICY "Users can update own submissions" ON "public"."pick_em_submissions"
  FOR UPDATE USING ("public"."is_approved_member"() AND ("auth"."uid"() = "user_id"));

-- ---------------------------------------------------------------------------
-- 11. The SECURITY DEFINER submit RPCs
-- ---------------------------------------------------------------------------
-- RLS does not apply inside a definer function, so each carries the guard
-- itself, immediately after its sign-in check and before it looks anything
-- up -- an unapproved caller learns they are unapproved, not that the week id
-- was bad. The pick'ems and parlay guards stay word for word identical, as
-- 20260902140000 requires. Bodies are otherwise verbatim.

-- 11a. submit_pick_em_picks (body from 20260902140000_pick_em_deadline_guard.sql)

CREATE OR REPLACE FUNCTION "public"."submit_pick_em_picks"(
  "p_pick_em_week_id" "uuid",
  "p_picks" "jsonb"
) RETURNS TABLE("submission_id" "uuid", "game_id" "uuid", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_week    pick_em_weeks%ROWTYPE;
    v_pick JSONB;
    v_new_submission_id UUID;
    v_game_id_val UUID;
    v_predicted_winner_val UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be signed in to submit picks.'
          USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_approved_member() THEN
        RAISE EXCEPTION 'Your account has not been approved yet.'
          USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_week FROM pick_em_weeks WHERE id = p_pick_em_week_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No pick''em week %', p_pick_em_week_id USING ERRCODE = '22023';
    END IF;

    IF now() < v_week.submission_opens_at THEN
        RAISE EXCEPTION 'Picks for week % are not open yet (opens %).',
          v_week.week_number, v_week.submission_opens_at USING ERRCODE = '22023';
    END IF;

    -- Half-open interval: the close time is the first instant you are late.
    IF now() >= v_week.submission_closes_at OR COALESCE(v_week.is_closed, false) THEN
        RAISE EXCEPTION 'Picks for week % are closed.', v_week.week_number
          USING ERRCODE = '22023';
    END IF;

    -- First, delete any existing picks for this user and week
    DELETE FROM pick_em_submissions
    WHERE pick_em_week_id = p_pick_em_week_id
    AND user_id = v_user_id;

    -- Process each pick
    FOR v_pick IN SELECT * FROM jsonb_array_elements(p_picks)
    LOOP
        -- Extract values from JSONB
        v_game_id_val := (v_pick->>'gameId')::UUID;
        v_predicted_winner_val := (v_pick->>'predictedWinnerTeamId')::UUID;

        -- Simple insert with explicit column names
        INSERT INTO pick_em_submissions (
            pick_em_week_id,
            game_id,
            predicted_winner_team_id,
            confidence_level,
            user_id
        )
        VALUES (
            p_pick_em_week_id,
            v_game_id_val,
            v_predicted_winner_val,
            1,
            v_user_id
        )
        RETURNING pick_em_submissions.id INTO v_new_submission_id;

        -- Return the result using our local variables
        RETURN QUERY SELECT
            v_new_submission_id,
            v_game_id_val,
            'success'::TEXT;
    END LOOP;
END;
$$;

ALTER FUNCTION "public"."submit_pick_em_picks"("uuid", "jsonb") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."submit_pick_em_picks"("uuid", "jsonb") IS
  'Replace the caller''s picks for a week. Requires an approved account; raises outside [submission_opens_at, submission_closes_at) and on a closed week -- the same guards submit_td_parlay_pick enforces.';

REVOKE ALL ON FUNCTION "public"."submit_pick_em_picks"("uuid", "jsonb") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."submit_pick_em_picks"("uuid", "jsonb") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."submit_pick_em_picks"("uuid", "jsonb") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."submit_pick_em_picks"("uuid", "jsonb") TO "service_role";

-- 11b. submit_td_parlay_pick (body from 20260828120000_td_parlay.sql)

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

  IF NOT public.is_approved_member() THEN
    RAISE EXCEPTION 'Your account has not been approved yet.'
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
  'Insert or replace the caller''s TD parlay pick for a pick''em week. Requires an approved account; raises outside [submission_opens_at, submission_closes_at). Pass p_player_id for a matched player (the canonical name is looked up) or p_player_name alone for a free-text pick.';

REVOKE ALL ON FUNCTION "public"."submit_td_parlay_pick"("uuid", "uuid", "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."submit_td_parlay_pick"("uuid", "uuid", "text") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."submit_td_parlay_pick"("uuid", "uuid", "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."submit_td_parlay_pick"("uuid", "uuid", "text") TO "service_role";

-- 11c. submit_playoff_picks (body from the baseline, which had no sign-in
-- check at all -- a NULL auth.uid() would have reached the insert and been
-- refused by NOT NULL, which is the right outcome by accident. Both checks
-- are added; the rest is verbatim, including the compat views it writes
-- through, which are security_invoker and so run as postgres in here exactly
-- as they did before.)

CREATE OR REPLACE FUNCTION "public"."submit_playoff_picks"("p_season_id" "uuid", "p_picks" "jsonb", "p_championship_point_total" double precision DEFAULT NULL::double precision) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  pick_record jsonb;
  deadline timestamptz;
  result_count int := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to submit picks.'
      using errcode = '42501';
  end if;

  if not public.is_approved_member() then
    raise exception 'Your account has not been approved yet.'
      using errcode = '42501';
  end if;

  select submission_deadline into deadline
  from playoffs_2025_config
  where season_id = p_season_id;

  deadline := coalesce(deadline, 'infinity'::timestamptz);

  if now() > deadline then
    raise exception 'Submission deadline has passed';
  end if;

  for pick_record in select * from jsonb_array_elements(p_picks)
  loop
    insert into playoffs_2025 (
      user_id, season_id, matchup_id, game_id,
      predicted_winner_team_id, championship_point_total
    )
    values (
      auth.uid(),
      p_season_id,
      pick_record->>'matchup_id',
      (pick_record->>'game_id')::uuid,
      (pick_record->>'predicted_winner_team_id')::uuid,
      case
        when pick_record->>'matchup_id' = 'championship'
        then coalesce((pick_record->>'championship_point_total')::float8, p_championship_point_total)
        else null
      end
    )
    on conflict (user_id, matchup_id)
    do update set
      predicted_winner_team_id = excluded.predicted_winner_team_id,
      game_id = excluded.game_id,
      championship_point_total = excluded.championship_point_total,
      updated_at = now();

    result_count := result_count + 1;
  end loop;

  return jsonb_build_object('success', true, 'picks_submitted', result_count);
end;
$$;

ALTER FUNCTION "public"."submit_playoff_picks"("uuid", "jsonb", double precision) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."submit_playoff_picks"("uuid", "jsonb", double precision) IS
  'Upsert the caller''s playoff bracket picks. Requires a signed-in, approved account; raises after playoff_config.submission_deadline.';

REVOKE ALL ON FUNCTION "public"."submit_playoff_picks"("uuid", "jsonb", double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."submit_playoff_picks"("uuid", "jsonb", double precision) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."submit_playoff_picks"("uuid", "jsonb", double precision) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."submit_playoff_picks"("uuid", "jsonb", double precision) TO "service_role";

-- ---------------------------------------------------------------------------
-- Verified after applying (role-impersonating probes via execute_sql)
-- ---------------------------------------------------------------------------
-- See CLAUDE.md, "New accounts are approved, and the approval is a row", for
-- the probe list: anon and an unapproved authenticated caller read zero takes
-- and are refused by every write policy and all three submit RPCs before any
-- week lookup; an approved member passes the take_participants subquery; the
-- admin email claim is approved with no row; the listing is empty for a
-- non-admin; the two write RPCs raise 42501 for a non-admin and the delete
-- refuses the admin's own id.
