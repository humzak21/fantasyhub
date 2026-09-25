-- Takes: a Hell Yeah can be given at any time; only its stake has a window.
--
-- `20260918120000_takes_hell_yeah.sql` put Hell Yeahs under the same 72-hour
-- window as Hell Nahs. The league wants it narrower: backing a take is support,
-- and support is welcome whenever somebody comes round to a call -- in week 3
-- or in December. What the window exists to stop is a *stake* declared once
-- the football has answered the question, so the window now applies to the
-- stake and not to the Hell Yeah.
--
--   * **A plain Hell Yeah (no stake) is open until the take is graded**, to
--     give and to take back. It has no stake to lock in, so there is nothing
--     for a deadline to protect on either side of it.
--
--   * **A staked Hell Yeah keeps the window both ways.** It can only be given
--     inside `coalesce(edited_at, created_at) + 72 hours`, and once that has
--     passed it cannot be withdrawn either -- the same pairing, for the same
--     reason, as the Hell Nah window: confidence you can pull once the answer
--     is known is not confidence.
--
--   * **Hell Nah is unchanged.** Still the author's stake, still the window,
--     both ways.
--
-- Every other clause of both policies is the current one verbatim, including
-- `is_approved_member()` at the front: a policy is replaced whole, and the
-- clause easiest to lose while rewriting for something else is that one.
--
-- `log_take_participant_event()` restates both policies as "could a member
-- have done this" for `acted_as_admin`, so it moves with them.
--
-- Existing rows: nothing is altered.

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
                  -- A Hell Nah needs the author's stake to fade.
                  AND (("take_participants"."side" = 'yeah'::"text") OR t."wager" IS NOT NULL)
                  -- The window binds a Hell Nah and a staked Hell Yeah; a
                  -- plain Hell Yeah is open until the take is graded.
                  AND ((("take_participants"."side" = 'yeah'::"text") AND "take_participants"."wager" IS NULL)
                       OR "now"() < COALESCE(t."edited_at", t."created_at") + interval '72 hours')));

DROP POLICY IF EXISTS "take_participants withdraw own" ON "public"."take_participants";
CREATE POLICY "take_participants withdraw own" ON "public"."take_participants"
  FOR DELETE TO "authenticated"
  USING ("public"."is_approved_member"()
         AND ("auth"."uid"() = "user_id")
         AND EXISTS (
           SELECT 1 FROM "public"."takes" t
           WHERE t."id" = "take_participants"."take_id"
             AND t."status" = 'pending'::"text"
             AND ((("take_participants"."side" = 'yeah'::"text") AND "take_participants"."wager" IS NULL)
                  OR "now"() < COALESCE(t."edited_at", t."created_at") + interval '72 hours')));

COMMENT ON TABLE "public"."take_participants" IS
  'One row per approved member who took a side on a take: Hell Nah (side = nah) fades it and covers the author''s stake if it hits; Hell Yeah (side = yeah) backs it, optionally with a stake of the backer''s own as a show of confidence. UNIQUE (take_id, user_id) means one side per member. The business rules -- approved account, not your own take, nothing after resolution, no Hell Nah on an unstaked take, and no Hell Nah or staked Hell Yeah joined or withdrawn once the take has been settled for 72 hours (a plain Hell Yeah is open until grading) -- live in the policy subqueries rather than in the client.';

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
               AND (v_yeah OR t.wager IS NOT NULL)
               AND ((v_yeah AND NEW.wager IS NULL)
                    OR now() < COALESCE(t.edited_at, t.created_at) + interval '72 hours'))));
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
             AND ((OLD.side = 'yeah' AND OLD.wager IS NULL)
                  OR now() < COALESCE(t.edited_at, t.created_at) + interval '72 hours'))));

    RETURN OLD;
  END;
  $$;

ALTER FUNCTION "public"."log_take_participant_event"() OWNER TO "postgres";

-- `public` as well as the named roles: Postgres grants EXECUTE to PUBLIC by
-- default and `anon` inherits it.
REVOKE ALL ON FUNCTION "public"."log_take_participant_event"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."log_take_participant_event"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."log_take_participant_event"() FROM "authenticated";
