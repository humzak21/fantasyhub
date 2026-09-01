-- Takes: the paper trail.
--
-- A take is an argument the league will have later, and the argument is about
-- what was actually said. `takes` holds only the current row -- `edited_at`
-- says a take moved but not what moved, and a wager that quietly doubled leaves
-- no trace at all beyond a timestamp. `take_events` is the append-only record
-- of every act on a take since it was posted: the wording, the stake, the
-- milestone, the grade, and every Hell Nah placed or taken back.
--
-- Three decisions shape it:
--
--   * **The log is written by triggers, never by the client.** The anon key
--     reaches PostgREST directly, so a log the client appends to is a log the
--     client can forge or forget. There is no INSERT/UPDATE/DELETE policy on
--     this table and no grant for one; the two SECURITY DEFINER functions
--     below are the only writers, and they fire on the same statement as the
--     change they describe. That also means the log cannot drift out of step
--     with the row: a hand-rolled POST straight to `/rest/v1/takes` is logged
--     exactly like an edit made in the app.
--
--   * **One act, one row -- even when a statement does two things.** An UPDATE
--     that rewords a take *and* grades it emits an `edited` and a `graded`,
--     because they are two different things a reader wants to see at two
--     different moments. Within `edited`, the changed fields arrive together in
--     one `changes` object, because rewording a take and restating its stake in
--     the same save is one act.
--
--   * **`changes` records from *and* to.** "Edited" is not information; "the
--     stake went from $20 to $50" is the whole point. Old values are only ever
--     available inside the trigger, so if they are not captured here they are
--     gone.
--
-- Deleting a take takes its log with it (ON DELETE CASCADE). The log is
-- per-take and surfaces inside the take's own detail sheet, so a log for a take
-- that no longer exists has no reader; keeping one would mean keeping the body
-- of a deleted take, which is the opposite of what deleting it meant.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."take_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    "take_id" "uuid" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_id" "uuid",
    "subject_id" "uuid",
    "changes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."take_events" OWNER TO "postgres";

COMMENT ON TABLE "public"."take_events" IS
  'Append-only activity log for takes: posting, rewording, restaking, grading, reopening, and every Hell Nah placed or withdrawn. Written only by log_take_event() and log_take_participant_event(); there is deliberately no client write path, so the log cannot be forged or skipped by a hand-rolled POST.';

COMMENT ON COLUMN "public"."take_events"."event_type" IS
  'posted | edited | graded | reopened | faded | unfaded. The CHECK is named and DO-guarded so a later migration can recreate it with a new act in the list.';
COMMENT ON COLUMN "public"."take_events"."actor_id" IS
  'Who did it, from auth.uid(). Nullable: a service-role or backend write has no auth.uid(), and an unattributed event is worth more than no event.';
COMMENT ON COLUMN "public"."take_events"."subject_id" IS
  'Who the act was about, when that differs from who performed it -- the fader on a faded/unfaded row. The admin holds a FOR ALL policy on take_participants, so "the admin removed X''s Hell Nah" is a state this log has to be able to express.';
COMMENT ON COLUMN "public"."take_events"."changes" IS
  'What moved, as {field: {from, to}}. Old values exist only inside the trigger, so this is the one chance to capture them. Backfilled rows carry {"backfilled": true} instead and no diff -- they predate the log and inventing a "from" would be fabrication.';
COMMENT ON COLUMN "public"."take_events"."created_at" IS
  'When the act happened, not when the row was written: seeded from created_at / edited_at / resolved_at so the log agrees with the timestamps the detail sheet already shows.';
COMMENT ON COLUMN "public"."take_events"."seq" IS
  'Write order, and the tiebreaker the sort actually needs. now() is transaction time, so one statement that rewords and grades a take stamps both events identically -- and the ids are random uuids, which order nothing. Sort (created_at DESC, seq DESC).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_events_pkey') THEN
    ALTER TABLE "public"."take_events" ADD CONSTRAINT "take_events_pkey" PRIMARY KEY ("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_events_take_id_fkey') THEN
    ALTER TABLE "public"."take_events"
      ADD CONSTRAINT "take_events_take_id_fkey" FOREIGN KEY ("take_id")
      REFERENCES "public"."takes"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_events_season_id_fkey') THEN
    ALTER TABLE "public"."take_events"
      ADD CONSTRAINT "take_events_season_id_fkey" FOREIGN KEY ("season_id")
      REFERENCES "public"."seasons"("id") ON DELETE CASCADE;
  END IF;

  -- SET NULL on both actor columns, matching takes.resolved_by: a member
  -- leaving the league must not delete the league's record of what they did.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_events_actor_id_fkey') THEN
    ALTER TABLE "public"."take_events"
      ADD CONSTRAINT "take_events_actor_id_fkey" FOREIGN KEY ("actor_id")
      REFERENCES "auth"."users"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_events_subject_id_fkey') THEN
    ALTER TABLE "public"."take_events"
      ADD CONSTRAINT "take_events_subject_id_fkey" FOREIGN KEY ("subject_id")
      REFERENCES "auth"."users"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_events_event_type_check') THEN
    ALTER TABLE "public"."take_events"
      ADD CONSTRAINT "take_events_event_type_check"
      CHECK (("event_type" = ANY (ARRAY['posted'::"text", 'edited'::"text", 'graded'::"text",
                                        'reopened'::"text", 'faded'::"text", 'unfaded'::"text"])));
  END IF;
END $$;

-- The log is always read as "this take, newest first", which is the whole of
-- the access pattern.
CREATE INDEX IF NOT EXISTS "idx_take_events_take_created"
  ON "public"."take_events" USING "btree" ("take_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- 2. The writer for takes
-- ---------------------------------------------------------------------------
-- AFTER, so the BEFORE triggers have already run: `edited_at` is stamped by
-- `set_take_edited_at()` and `takes_guard_author_update()` has already rejected
-- anything an author may not do. A rejected write raises before it gets here,
-- which is why there is no such thing as a logged edit that did not happen.
--
-- `updated_at` is deliberately not compared: it moves on every update, so it
-- describes nothing.
--
-- The two timestamps are taken from the row *only when they actually moved*.
-- `set_take_edited_at()` watches the body and the wager, so a milestone-only
-- change leaves `edited_at` at whatever an earlier reword set it to -- and
-- reading it blindly would date the new event to the old edit, dropping it into
-- the middle of the log.

CREATE OR REPLACE FUNCTION "public"."log_take_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    v_actor   uuid := auth.uid();
    v_changes jsonb := '{}'::jsonb;
    v_at      timestamptz;
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.take_events
        (take_id, season_id, event_type, actor_id, changes, created_at)
      VALUES
        (NEW.id, NEW.season_id, 'posted', COALESCE(v_actor, NEW.user_id),
         jsonb_build_object(
           'body',      jsonb_build_object('to', NEW.body),
           'wager',     jsonb_build_object('to', NEW.wager),
           'milestone', jsonb_build_object('to', NEW.target_type, 'week', NEW.target_week)),
         COALESCE(NEW.created_at, now()));
      RETURN NEW;
    END IF;

    -- The author's two editable columns, plus the milestone -- which only a
    -- privileged writer can move, and which is exactly why a move of it must
    -- leave a mark.
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

    IF v_changes <> '{}'::jsonb THEN
      v_at := CASE WHEN NEW.edited_at IS DISTINCT FROM OLD.edited_at
                   THEN NEW.edited_at ELSE now() END;

      INSERT INTO public.take_events
        (take_id, season_id, event_type, actor_id, changes, created_at)
      VALUES
        (NEW.id, NEW.season_id, 'edited', COALESCE(v_actor, NEW.user_id), v_changes,
         COALESCE(v_at, now()));
    END IF;

    -- Its own row rather than another key in `changes`: grading is a different
    -- act by a different person, and one statement can legitimately do both.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'pending' THEN
        INSERT INTO public.take_events
          (take_id, season_id, event_type, actor_id, changes, created_at)
        VALUES
          (NEW.id, NEW.season_id, 'reopened', COALESCE(v_actor, OLD.resolved_by),
           jsonb_build_object('status', jsonb_build_object('from', OLD.status, 'to', NEW.status)),
           now());
      ELSE
        -- `resolved_by` first: a backend grading pass has no auth.uid(), and
        -- the column is the grader's own record of who did it.
        v_at := CASE WHEN NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
                     THEN NEW.resolved_at ELSE now() END;

        INSERT INTO public.take_events
          (take_id, season_id, event_type, actor_id, changes, created_at)
        VALUES
          (NEW.id, NEW.season_id, 'graded', COALESCE(NEW.resolved_by, v_actor),
           jsonb_build_object('status', jsonb_build_object('from', OLD.status, 'to', NEW.status)),
           COALESCE(v_at, now()));
      END IF;
    END IF;

    RETURN NEW;
  END;
  $$;

ALTER FUNCTION "public"."log_take_event"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."log_take_event"() IS
  'Appends to take_events on every INSERT or UPDATE of takes. Emits one row per act, so a statement that rewords and grades a take in one go produces both an edited and a graded event.';

-- ---------------------------------------------------------------------------
-- 3. The writer for Hell Nahs
-- ---------------------------------------------------------------------------
-- The DELETE branch guards on the parent still existing. Deleting a take
-- cascades into take_participants, which would otherwise fire this trigger and
-- try to insert an `unfaded` row pointing at a take that no longer exists --
-- a foreign key violation that would make deleting a faded take impossible.
-- A cascade is not a withdrawal, so skipping it is also the truthful answer.

CREATE OR REPLACE FUNCTION "public"."log_take_participant_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.take_events
        (take_id, season_id, event_type, actor_id, subject_id, created_at)
      VALUES
        (NEW.take_id, NEW.season_id, 'faded', COALESCE(auth.uid(), NEW.user_id), NEW.user_id,
         COALESCE(NEW.created_at, now()));
      RETURN NEW;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.takes t WHERE t.id = OLD.take_id) THEN
      RETURN OLD;
    END IF;

    INSERT INTO public.take_events
      (take_id, season_id, event_type, actor_id, subject_id, created_at)
    VALUES
      (OLD.take_id, OLD.season_id, 'unfaded', COALESCE(auth.uid(), OLD.user_id), OLD.user_id,
       now());

    RETURN OLD;
  END;
  $$;

ALTER FUNCTION "public"."log_take_participant_event"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."log_take_participant_event"() IS
  'Appends faded / unfaded rows to take_events. Skips the withdrawal row when the parent take is already gone, because that is a cascade from deleting the take rather than somebody backing out.';

-- Neither is meant to be reachable as an RPC. Firing a trigger does not check
-- EXECUTE -- that is settled at CREATE TRIGGER time -- so revoking costs the
-- triggers nothing and takes both functions off the REST surface. `public` as
-- well as the named roles: Postgres grants EXECUTE to PUBLIC by default and
-- `anon` inherits it, so revoking only the named roles is a silent no-op.
REVOKE ALL ON FUNCTION "public"."log_take_event"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."log_take_event"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."log_take_event"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."log_take_participant_event"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."log_take_participant_event"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."log_take_participant_event"() FROM "authenticated";

CREATE OR REPLACE TRIGGER "log_takes_activity"
  AFTER INSERT OR UPDATE ON "public"."takes"
  FOR EACH ROW EXECUTE FUNCTION "public"."log_take_event"();

CREATE OR REPLACE TRIGGER "log_take_participants_activity"
  AFTER INSERT OR DELETE ON "public"."take_participants"
  FOR EACH ROW EXECUTE FUNCTION "public"."log_take_participant_event"();

-- ---------------------------------------------------------------------------
-- 4. RLS -- readable by members, writable by nobody
-- ---------------------------------------------------------------------------
-- Members-only, matching `takes` itself: the log quotes the body of every take
-- it describes, so leaving it public would hand a signed-out caller the board
-- that `20260831140000_takes_members_only.sql` closed.
--
-- There is no write policy of any kind, and the grants below stop at SELECT.
-- The triggers are SECURITY DEFINER owned by `postgres`, which owns this table
-- and is therefore not subject to its policies -- so they write and nobody
-- else does. `service_role` keeps a full grant because it bypasses RLS anyway
-- and a future backfill script needs somewhere to stand.

ALTER TABLE "public"."take_events" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read take_events" ON "public"."take_events";
CREATE POLICY "Members read take_events" ON "public"."take_events"
  FOR SELECT TO "authenticated" USING (true);

REVOKE ALL ON TABLE "public"."take_events" FROM "anon";
REVOKE ALL ON TABLE "public"."take_events" FROM "authenticated";

GRANT SELECT ON TABLE "public"."take_events" TO "anon";
GRANT SELECT ON TABLE "public"."take_events" TO "authenticated";
GRANT ALL ON TABLE "public"."take_events" TO "service_role";

-- ---------------------------------------------------------------------------
-- 5. Backfill
-- ---------------------------------------------------------------------------
-- Every take that already exists gets the events its own columns can prove:
-- it was posted, and -- where the timestamps say so -- edited and graded. Each
-- carries `{"backfilled": true}` and **no diff**, because the old values were
-- never recorded and writing the current body in as what was "posted" would be
-- a fabrication the reader has no way to detect. The UI renders these without
-- detail and says why.
--
-- Guarded on absence rather than on a one-shot flag: applying this file twice
-- must not double the log, and a take posted after the triggers install already
-- has a real `posted` row that these must not duplicate.

INSERT INTO public.take_events (take_id, season_id, event_type, actor_id, changes, created_at)
SELECT t.id, t.season_id, 'posted', t.user_id, '{"backfilled": true}'::jsonb,
       COALESCE(t.created_at, now())
FROM public.takes t
WHERE NOT EXISTS (
  SELECT 1 FROM public.take_events e WHERE e.take_id = t.id AND e.event_type = 'posted');

-- One row, not one per edit: `edited_at` remembers only the most recent one.
INSERT INTO public.take_events (take_id, season_id, event_type, actor_id, changes, created_at)
SELECT t.id, t.season_id, 'edited', t.user_id, '{"backfilled": true}'::jsonb, t.edited_at
FROM public.takes t
WHERE t.edited_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.take_events e WHERE e.take_id = t.id AND e.event_type = 'edited');

INSERT INTO public.take_events (take_id, season_id, event_type, actor_id, changes, created_at)
SELECT t.id, t.season_id, 'graded', t.resolved_by,
       jsonb_build_object('backfilled', true,
                          'status', jsonb_build_object('to', t.status)),
       t.resolved_at
FROM public.takes t
WHERE t.resolved_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.take_events e WHERE e.take_id = t.id AND e.event_type = 'graded');

-- Fades keep their own timestamp and actor, so these are exact rather than
-- backfilled approximations -- the row records who and when.
INSERT INTO public.take_events (take_id, season_id, event_type, actor_id, subject_id, created_at)
SELECT p.take_id, p.season_id, 'faded', p.user_id, p.user_id, COALESCE(p.created_at, now())
FROM public.take_participants p
WHERE NOT EXISTS (
  SELECT 1 FROM public.take_events e
  WHERE e.take_id = p.take_id AND e.event_type = 'faded' AND e.subject_id = p.user_id);
