-- Takes: when the admin changes a take, the log says "Admin".
--
-- The admin can now edit every facet of a take from its detail sheet -- the
-- wording, the stake, the milestone, the grade, who posted it, and who has
-- said Hell Nah to it. Nothing about the write path changes for that: the
-- `takes admin write` and `take_participants admin write` policies already
-- allowed all of it, `takes_guard_author_update()` already let
-- `can_write_league()` through, and `log_take_event()` already recorded every
-- move. What the log could not say is *in what capacity* somebody acted. The
-- admin is also a member with a team and takes of their own, so "Humza Khalil
-- edited this take" is ambiguous between an author rewording their own call
-- and the commissioner rewriting somebody else's -- and those are the two
-- readings a league argument turns on.
--
-- `take_events.acted_as_admin` records it, and the triggers decide it, for the
-- same reason they write the log at all: a flag the client sends is a flag the
-- client can forget or forge.
--
-- **The rule is "used the admin's privilege", not "is the admin".** An event is
-- an admin act when `is_admin()` is true *and* the same statement would have
-- been refused to an ordinary member in the admin's position:
--
--   * posted   -- on somebody else's behalf, or born already graded.
--   * edited   -- anything but the author's own reword of body/wager, inside
--                 72 hours, while ungraded, touching nothing else. A save that
--                 rewords *and* grades is an admin edit: the statement was one
--                 act and only the admin could make it.
--   * graded / reopened -- always; no member policy permits either.
--   * faded    -- for somebody else, or on a take a member could not fade
--                 (their own, graded, or unstaked).
--   * unfaded  -- somebody else's, or after the take was graded.
--
-- So the admin posting, rewording or fading as a member still reads under
-- their own name, and everything done *to* the league's takes reads as Admin.
--
-- `is_admin()` and not `can_write_league()`, deliberately and against the
-- usual rule for privileged functions: this is attribution, not a guard. The
-- service role has no person behind it, and labelling a backend pass "Admin"
-- would claim a human made a call that a script did.
--
-- `changes.author` is new too: reassigning a take moves who owes whom, so it is
-- logged with both sides like every other field.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."take_events"
  ADD COLUMN IF NOT EXISTS "acted_as_admin" boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN "public"."take_events"."acted_as_admin" IS
  'True when the act used the admin''s privilege -- something the member policies would have refused the same person. Set by log_take_event() / log_take_participant_event() only. The UI names these actors "Admin". False for the admin acting as an ordinary member (posting, rewording their own take in its window, fading).';

COMMENT ON COLUMN "public"."take_events"."changes" IS
  'What moved, as {field: {from, to}}: body, wager, milestone ({from, fromWeek, to, week}), author (user ids), status. Old values exist only inside the trigger, so this is the one chance to capture them. Backfilled rows carry {"backfilled": true} instead and no diff -- they predate the log and inventing a "from" would be fabrication.';

-- ---------------------------------------------------------------------------
-- 2. The writer for takes
-- ---------------------------------------------------------------------------
-- The body is the 20260901120000 function with three additions: the author
-- diff, the member-edit predicate, and the flag on every insert. The timestamp
-- rules are unchanged -- see that file for why `edited_at` and `resolved_at`
-- are only read when they moved.

CREATE OR REPLACE FUNCTION "public"."log_take_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    v_actor       uuid := auth.uid();
    v_admin       boolean := public.is_admin();
    v_changes     jsonb := '{}'::jsonb;
    v_at          timestamptz;
    v_member_edit boolean;
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.take_events
        (take_id, season_id, event_type, actor_id, changes, created_at, acted_as_admin)
      VALUES
        (NEW.id, NEW.season_id, 'posted', COALESCE(v_actor, NEW.user_id),
         jsonb_build_object(
           'body',      jsonb_build_object('to', NEW.body),
           'wager',     jsonb_build_object('to', NEW.wager),
           'milestone', jsonb_build_object('to', NEW.target_type, 'week', NEW.target_week)),
         COALESCE(NEW.created_at, now()),
         v_admin AND (v_actor IS DISTINCT FROM NEW.user_id OR NEW.status <> 'pending'));
      RETURN NEW;
    END IF;

    IF NEW.body IS DISTINCT FROM OLD.body THEN
      v_changes := v_changes ||
        jsonb_build_object('body', jsonb_build_object('from', OLD.body, 'to', NEW.body));
    END IF;

    IF NEW.wager IS DISTINCT FROM OLD.wager THEN
      v_changes := v_changes ||
        jsonb_build_object('wager', jsonb_build_object('from', OLD.wager, 'to', NEW.wager));
    END IF;

    IF NEW.target_type IS DISTINCT FROM OLD.target_type
    OR NEW.target_week IS DISTINCT FROM OLD.target_week THEN
      v_changes := v_changes || jsonb_build_object('milestone', jsonb_build_object(
        'from', OLD.target_type, 'fromWeek', OLD.target_week,
        'to',   NEW.target_type, 'week',     NEW.target_week));
    END IF;

    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      v_changes := v_changes ||
        jsonb_build_object('author', jsonb_build_object('from', OLD.user_id, 'to', NEW.user_id));
    END IF;

    IF v_changes <> '{}'::jsonb THEN
      -- The `takes author edit` policy plus `takes_guard_author_update()`,
      -- restated over OLD and NEW: what this statement would have been allowed
      -- to do had the caller not been the admin.
      v_member_edit := v_actor IS NOT NULL
        AND v_actor = OLD.user_id
        AND NEW.user_id = OLD.user_id
        AND OLD.status = 'pending'
        AND NEW.status = 'pending'
        AND now() < OLD.created_at + interval '72 hours'
        AND NEW.target_type IS NOT DISTINCT FROM OLD.target_type
        AND NEW.target_week IS NOT DISTINCT FROM OLD.target_week;

      v_at := CASE WHEN NEW.edited_at IS DISTINCT FROM OLD.edited_at
                   THEN NEW.edited_at ELSE now() END;

      INSERT INTO public.take_events
        (take_id, season_id, event_type, actor_id, changes, created_at, acted_as_admin)
      VALUES
        (NEW.id, NEW.season_id, 'edited', COALESCE(v_actor, NEW.user_id), v_changes,
         COALESCE(v_at, now()),
         v_admin AND NOT v_member_edit);
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'pending' THEN
        INSERT INTO public.take_events
          (take_id, season_id, event_type, actor_id, changes, created_at, acted_as_admin)
        VALUES
          (NEW.id, NEW.season_id, 'reopened', COALESCE(v_actor, OLD.resolved_by),
           jsonb_build_object('status', jsonb_build_object('from', OLD.status, 'to', NEW.status)),
           now(),
           v_admin);
      ELSE
        v_at := CASE WHEN NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
                     THEN NEW.resolved_at ELSE now() END;

        INSERT INTO public.take_events
          (take_id, season_id, event_type, actor_id, changes, created_at, acted_as_admin)
        VALUES
          (NEW.id, NEW.season_id, 'graded', COALESCE(NEW.resolved_by, v_actor),
           jsonb_build_object('status', jsonb_build_object('from', OLD.status, 'to', NEW.status)),
           COALESCE(v_at, now()),
           v_admin);
      END IF;
    END IF;

    RETURN NEW;
  END;
  $$;

ALTER FUNCTION "public"."log_take_event"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."log_take_event"() IS
  'Appends to take_events on every INSERT or UPDATE of takes. Emits one row per act, so a statement that rewords and grades a take in one go produces both an edited and a graded event. Stamps acted_as_admin when the act used the admin''s privilege.';

-- ---------------------------------------------------------------------------
-- 3. The writer for Hell Nahs
-- ---------------------------------------------------------------------------
-- The two EXISTS clauses are the `take_participants insert own` and `withdraw
-- own` policies' take subqueries, read here as "could a member have done this".
-- The cascade guard from 20260901120000 is unchanged.

CREATE OR REPLACE FUNCTION "public"."log_take_participant_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    v_actor uuid := auth.uid();
    v_admin boolean := public.is_admin();
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.take_events
        (take_id, season_id, event_type, actor_id, subject_id, created_at, acted_as_admin)
      VALUES
        (NEW.take_id, NEW.season_id, 'faded', COALESCE(v_actor, NEW.user_id), NEW.user_id,
         COALESCE(NEW.created_at, now()),
         v_admin AND NOT (
           v_actor IS NOT NULL
           AND v_actor = NEW.user_id
           AND EXISTS (
             SELECT 1 FROM public.takes t
             WHERE t.id = NEW.take_id
               AND t.user_id <> v_actor
               AND t.status = 'pending'
               AND t.wager IS NOT NULL)));
      RETURN NEW;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.takes t WHERE t.id = OLD.take_id) THEN
      RETURN OLD;
    END IF;

    INSERT INTO public.take_events
      (take_id, season_id, event_type, actor_id, subject_id, created_at, acted_as_admin)
    VALUES
      (OLD.take_id, OLD.season_id, 'unfaded', COALESCE(v_actor, OLD.user_id), OLD.user_id,
       now(),
       v_admin AND NOT (
         v_actor IS NOT NULL
         AND v_actor = OLD.user_id
         AND EXISTS (
           SELECT 1 FROM public.takes t
           WHERE t.id = OLD.take_id
             AND t.status = 'pending')));

    RETURN OLD;
  END;
  $$;

ALTER FUNCTION "public"."log_take_participant_event"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."log_take_participant_event"() IS
  'Appends faded / unfaded rows to take_events, stamping acted_as_admin when the admin moved somebody else''s Hell Nah or one a member could not have. Skips the withdrawal row when the parent take is already gone, because that is a cascade from deleting the take rather than somebody backing out.';

-- CREATE OR REPLACE keeps the existing ACL, but restating the revokes costs
-- nothing and keeps both off the REST surface if this file is ever the first
-- to define them. `public` as well as the named roles: Postgres grants EXECUTE
-- to PUBLIC by default and `anon` inherits it.
REVOKE ALL ON FUNCTION "public"."log_take_event"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."log_take_event"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."log_take_event"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."log_take_participant_event"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."log_take_participant_event"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."log_take_participant_event"() FROM "authenticated";

-- ---------------------------------------------------------------------------
-- 4. Backfill
-- ---------------------------------------------------------------------------
-- Only what the rows themselves prove, with no reference to who the admin is:
-- no member policy has ever permitted grading or reopening, moving a milestone,
-- editing somebody else's take, or moving somebody else's Hell Nah, so any
-- attributed event of those shapes was the admin's privilege. What cannot be
-- proven -- an admin rewording their own take after its window -- stays under
-- their name rather than being guessed at.
--
-- A NULL actor is left alone: that is a service-role write or a departed
-- account, and neither is "Admin". Idempotent by construction.

UPDATE public.take_events e
SET acted_as_admin = true
WHERE NOT e.acted_as_admin
  AND e.actor_id IS NOT NULL
  AND (
    e.event_type IN ('graded', 'reopened')
    OR (e.event_type IN ('faded', 'unfaded') AND e.subject_id IS DISTINCT FROM e.actor_id)
    OR (e.event_type = 'edited' AND (
          e.changes ? 'milestone'
          OR e.changes ? 'author'
          OR e.actor_id IS DISTINCT FROM (SELECT t.user_id FROM public.takes t WHERE t.id = e.take_id)))
  );
