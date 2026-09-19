-- Takes: Hell Yeah, the other half of Hell Nah.
--
-- A Hell Nah fades a take. A **Hell Yeah** backs it: "this is a good call".
-- At its core that is all it is -- a show of support, on any take, staked or
-- not. What makes it more is optional: every Hell Yeah asks whether the
-- backer wants to put a stake of their own on the take. Skip that and the
-- Hell Yeah still counts.
--
-- **A Hell Yeah stake is a show of confidence, not a bet.** It is shown beside
-- the backer's name, and nobody owes anybody over it: a Hell Nah's price is
-- the author's stake and nothing else, so the people fading a take never owe
-- a backer, whenever the backer arrived. That is also why a staked Hell Yeah
-- is allowed on an unstaked take -- there is no other side it needs.
--
-- The shape is the one `take_participants` already has -- one row per member
-- who took a side on a take, once, withdrawably, inside the same three-day
-- window -- so a Hell Yeah is a row in that table rather than a table of its
-- own:
--
--   * **`side` says which.** `'nah'` or `'yeah'`. UNIQUE (take_id, user_id)
--     is untouched, and that is now a rule in its own right: a member is on
--     one side of a take or neither, never both. Switching is a withdrawal and
--     a fresh row, inside the window like everything else.
--
--   * **The default is `'nah'`, and that is for the rollout, not a preference.**
--     This is a static bundle; the browser tabs open when this migration lands
--     are running the build that sends no `side`. Every row that build writes
--     is a Hell Nah, so defaulting to one keeps it correct until it reloads.
--     The new client always sends `side` explicitly.
--
--   * **`wager` is the backer's stake**, free text for the same reason
--     `takes.wager` is, NULL for "none" for the same reason, and only ever on
--     a Hell Yeah -- a Hell Nah's price is the author's stake, never its own.
--
--   * **One window, both sides.** The three-day clause from
--     `20260917120000_takes_hell_nah_window.sql` now governs Hell Yeahs too,
--     joining and withdrawing alike. Backing a take after the football has
--     answered it is as empty as fading one, and confidence declared once the
--     result is known is not confidence.
--
--   * **No member UPDATE policy**, as before. Changing your stake is taking
--     your Hell Yeah back and giving it again, so the log shows both acts and
--     the window applies to each.
--
-- The log gains `backed` / `unbacked` beside `faded` / `unfaded`, and a
-- backed row carries the stake in `changes.wager` -- what the backer said
-- they would put on it, recorded as it was when they said it.
--
-- Existing rows: every one is a Hell Nah and becomes `side = 'nah'` through
-- the default. Nothing else moves.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."take_participants"
  ADD COLUMN IF NOT EXISTS "side" "text" DEFAULT 'nah'::"text" NOT NULL;

ALTER TABLE "public"."take_participants"
  ADD COLUMN IF NOT EXISTS "wager" "text";

COMMENT ON COLUMN "public"."take_participants"."side" IS
  'nah = Hell Nah (fading the take, covering the author''s stake if it hits); yeah = Hell Yeah (backing it). Defaults to nah so a client built before Hell Yeah existed keeps writing what it meant; the current client always sends it.';

COMMENT ON COLUMN "public"."take_participants"."wager" IS
  'Optional, Hell Yeah only: what the backer says they would put on the take -- a show of confidence, not a bet. Nobody owes anybody over it; in particular a Hell Nah never owes a backer. Free text like takes.wager; NULL means none, and the CHECK forbids the empty-string spelling.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_participants_side_check') THEN
    ALTER TABLE "public"."take_participants"
      ADD CONSTRAINT "take_participants_side_check"
      CHECK (("side" = ANY (ARRAY['nah'::"text", 'yeah'::"text"])));
  END IF;

  -- A stake belongs to a Hell Yeah, and is a phrase: the same 1..200 as
  -- `takes_wager_check`, so the two boxes accept the same things.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_participants_wager_check') THEN
    ALTER TABLE "public"."take_participants"
      ADD CONSTRAINT "take_participants_wager_check"
      CHECK (("wager" IS NULL)
             OR (("side" = 'yeah'::"text") AND ("char_length"("btrim"("wager")) BETWEEN 1 AND 200)));
  END IF;
END $$;

COMMENT ON TABLE "public"."take_participants" IS
  'One row per approved member who took a side on a take: Hell Nah (side = nah) fades it and covers the author''s stake if it hits; Hell Yeah (side = yeah) backs it, optionally with a stake of the backer''s own as a show of confidence. UNIQUE (take_id, user_id) means one side per member. The business rules -- approved account, not your own take, nothing after resolution, no Hell Nah on an unstaked take, and nothing once the take has been settled for 72 hours -- live in the policy subqueries rather than in the client.';

-- ---------------------------------------------------------------------------
-- 2. The insert policy
-- ---------------------------------------------------------------------------
-- The current policy verbatim -- `is_approved_member()` leading it, the
-- window at its foot -- with the wager clause made per side. A policy is
-- replaced whole rather than amended, so the approval guard is re-copied here
-- deliberately; losing it while rewriting for Hell Yeah would reopen the board
-- to every signed-up visitor.
--
-- The withdraw policy needs no change: it already covers "your own row, on an
-- ungraded take, inside the window", whichever side the row is on.

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
                  AND t."season_id" = "take_participants"."season_id"
                  AND "now"() < COALESCE(t."edited_at", t."created_at") + interval '72 hours'
                  -- A Hell Nah needs the author's stake to fade. A Hell Yeah
                  -- needs nothing, stake or not: its stake is owed by nobody.
                  AND (("take_participants"."side" = 'yeah'::"text") OR t."wager" IS NOT NULL)));

-- ---------------------------------------------------------------------------
-- 3. The log
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_events_event_type_check') THEN
    ALTER TABLE "public"."take_events" DROP CONSTRAINT "take_events_event_type_check";
  END IF;

  ALTER TABLE "public"."take_events"
    ADD CONSTRAINT "take_events_event_type_check"
    CHECK (("event_type" = ANY (ARRAY['posted'::"text", 'edited'::"text", 'graded'::"text",
                                      'reopened'::"text", 'faded'::"text", 'unfaded'::"text",
                                      'backed'::"text", 'unbacked'::"text"])));
END $$;

COMMENT ON COLUMN "public"."take_events"."event_type" IS
  'posted | edited | graded | reopened | faded | unfaded | backed | unbacked. backed/unbacked are Hell Yeahs given and taken back; a backed row carries the backer''s stake, if any, as changes.wager.to. The CHECK is named and DO-guarded so a later migration can recreate it with a new act in the list.';

COMMENT ON COLUMN "public"."take_events"."subject_id" IS
  'Who the act was about, when that differs from who performed it -- the member on a faded/unfaded/backed/unbacked row. The admin holds a FOR ALL policy on take_participants, so "the admin removed X''s Hell Nah" is a state this log has to be able to express.';

-- The 20260915190000 function, per side. The "could a member have done this"
-- clauses are the insert and withdraw policies' take subqueries restated over
-- NEW/OLD, now including the three-day window, which the Hell Nah window
-- migration added to the policies but not here: without it, the admin placing
-- a Hell Nah on a take whose window had closed read under their own name, as
-- though any member could have.

CREATE OR REPLACE FUNCTION "public"."log_take_participant_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    v_actor uuid := auth.uid();
    v_admin boolean := public.is_admin();
    v_yeah  boolean;
  BEGIN
    IF TG_OP = 'INSERT' THEN
      v_yeah := NEW.side = 'yeah';

      INSERT INTO public.take_events
        (take_id, season_id, event_type, actor_id, subject_id, changes, created_at, acted_as_admin)
      VALUES
        (NEW.take_id, NEW.season_id,
         CASE WHEN v_yeah THEN 'backed' ELSE 'faded' END,
         COALESCE(v_actor, NEW.user_id), NEW.user_id,
         CASE WHEN v_yeah AND NEW.wager IS NOT NULL
              THEN jsonb_build_object('wager', jsonb_build_object('to', NEW.wager))
              ELSE '{}'::jsonb END,
         COALESCE(NEW.created_at, now()),
         v_admin AND NOT (
           v_actor IS NOT NULL
           AND v_actor = NEW.user_id
           AND EXISTS (
             SELECT 1 FROM public.takes t
             WHERE t.id = NEW.take_id
               AND t.user_id <> v_actor
               AND t.status = 'pending'
               AND now() < COALESCE(t.edited_at, t.created_at) + interval '72 hours'
               AND (v_yeah OR t.wager IS NOT NULL))));
      RETURN NEW;
    END IF;

    -- A cascade from deleting the take, not somebody backing out.
    IF NOT EXISTS (SELECT 1 FROM public.takes t WHERE t.id = OLD.take_id) THEN
      RETURN OLD;
    END IF;

    INSERT INTO public.take_events
      (take_id, season_id, event_type, actor_id, subject_id, created_at, acted_as_admin)
    VALUES
      (OLD.take_id, OLD.season_id,
       CASE WHEN OLD.side = 'yeah' THEN 'unbacked' ELSE 'unfaded' END,
       COALESCE(v_actor, OLD.user_id), OLD.user_id,
       now(),
       v_admin AND NOT (
         v_actor IS NOT NULL
         AND v_actor = OLD.user_id
         AND EXISTS (
           SELECT 1 FROM public.takes t
           WHERE t.id = OLD.take_id
             AND t.status = 'pending'
             AND now() < COALESCE(t.edited_at, t.created_at) + interval '72 hours')));

    RETURN OLD;
  END;
  $$;

ALTER FUNCTION "public"."log_take_participant_event"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."log_take_participant_event"() IS
  'Appends faded / unfaded (Hell Nah) and backed / unbacked (Hell Yeah) rows to take_events, with a Hell Yeah''s stake in changes.wager, stamping acted_as_admin when the admin moved somebody else''s row or one a member could not have. Skips the withdrawal row when the parent take is already gone, because that is a cascade from deleting the take rather than somebody backing out.';

-- `public` as well as the named roles: Postgres grants EXECUTE to PUBLIC by
-- default and `anon` inherits it.
REVOKE ALL ON FUNCTION "public"."log_take_participant_event"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."log_take_participant_event"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."log_take_participant_event"() FROM "authenticated";
