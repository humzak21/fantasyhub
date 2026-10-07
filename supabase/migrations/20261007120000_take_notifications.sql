-- Push notifications for takes.
--
-- Two new topics beside the pick'em pair (20261002120000_push_notifications.sql):
--   takes_new        — somebody posted a take. Every device with it on, except
--                      the author's own.
--   takes_reactions  — somebody said Hell Yeah or Hell Nah to *your* take.
--                      Only the author's devices.
--
-- Pick'ems are a clock (Tuesday open, Thursday close), so pg_cron dispatches
-- them. Takes are not: they arrive whenever a member posts one. So the clock
-- here is the take itself — every post, Hell Yeah and Hell Nah already writes
-- a `take_events` row (log_take_event / log_take_participant_event), and a
-- statement trigger on that table dispatches `.github/workflows/notify-takes.yml`
-- through the same `private.dispatch_github_workflow` the crons use. The
-- sender (`scripts/send-notifications.js --takes`) reads the recent events
-- nobody has been told about yet, claims each in `notification_log`, and sends.
--
-- `take_events` is therefore the outbox, and stays append-only: what has been
-- sent is recorded beside it in `notification_log`, never on the event.

-- ---------------------------------------------------------------------------
-- 1. The topics
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_topics_check') THEN
    ALTER TABLE "public"."push_subscriptions" DROP CONSTRAINT "push_subscriptions_topics_check";
  END IF;

  ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_topics_check"
    CHECK ("topics" <@ ARRAY['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions']::"text"[]);
END $$;

ALTER TABLE "public"."push_subscriptions"
  ALTER COLUMN "topics" SET DEFAULT ARRAY['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions']::"text"[];

-- "Everyone with notifications on" hears about new takes: a device that is
-- subscribed today gets both take topics, and its owner can switch either
-- off in Settings. Idempotent — a topic already present is not added twice.
UPDATE "public"."push_subscriptions"
SET "topics" = "topics"
  || CASE WHEN 'takes_new' = ANY ("topics") THEN ARRAY[]::"text"[] ELSE ARRAY['takes_new']::"text"[] END
  || CASE WHEN 'takes_reactions' = ANY ("topics") THEN ARRAY[]::"text"[] ELSE ARRAY['takes_reactions']::"text"[] END
WHERE NOT ("topics" @> ARRAY['takes_new', 'takes_reactions']::"text"[]);

-- The default is the only thing that changes; the client always sends its
-- topics explicitly. Recreated whole so the signature, grants and comment stay
-- exactly as 20261002120000 left them.
CREATE OR REPLACE FUNCTION "public"."save_push_subscription"(
  "p_endpoint" "text",
  "p_p256dh" "text",
  "p_auth" "text",
  "p_topics" "text"[] DEFAULT ARRAY['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions']::"text"[],
  "p_user_agent" "text" DEFAULT NULL
)
  RETURNS "text"[]
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  DECLARE
    v_user_id uuid := auth.uid();
    v_topics text[];
  BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'You must be signed in to do that'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT public.is_approved_member() THEN
      RAISE EXCEPTION 'Your account has not been approved yet'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_endpoint IS NULL OR p_p256dh IS NULL OR p_auth IS NULL THEN
      RAISE EXCEPTION 'A subscription needs an endpoint and both keys'
        USING ERRCODE = 'null_value_not_allowed';
    END IF;

    v_topics := coalesce(p_topics, ARRAY[]::text[]);

    INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, topics, user_agent)
    VALUES (v_user_id, p_endpoint, p_p256dh, p_auth, v_topics, left(p_user_agent, 400))
    ON CONFLICT (endpoint) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          topics = EXCLUDED.topics,
          user_agent = EXCLUDED.user_agent
    RETURNING topics INTO v_topics;

    RETURN v_topics;
  END;
  $$;

COMMENT ON COLUMN "public"."push_subscriptions"."topics" IS
  'What this device wants to be sent: pickems_open, pickems_closing, takes_new (every new take but your own), takes_reactions (Hell Yeahs and Hell Nahs on your takes). A subset of push_subscriptions_topics_check.';

-- ---------------------------------------------------------------------------
-- 2. notification_log learns per-event rows
-- ---------------------------------------------------------------------------
-- A pick'em notification is one per (kind, season, week). A take notification
-- is one per take event, so the row carries the event instead of a week. The
-- unique key on the event is the same claim-then-send guard: two runs racing
-- over one Hell Nah cannot both send it.

ALTER TABLE "public"."notification_log" ADD COLUMN IF NOT EXISTS "take_event_id" "uuid";
ALTER TABLE "public"."notification_log" ALTER COLUMN "week" DROP NOT NULL;

COMMENT ON COLUMN "public"."notification_log"."take_event_id" IS
  'For a take notification, the take_events row it announced. Unique: an event is sent at most once. NULL for the weekly pick''em kinds, which are keyed by week instead.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_log_take_event_id_key') THEN
    ALTER TABLE "public"."notification_log"
      ADD CONSTRAINT "notification_log_take_event_id_key" UNIQUE ("take_event_id");
  END IF;

  -- Deleting a take cascades its events, and with them the record of having
  -- announced them; there is nothing left to point at.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_log_take_event_id_fkey') THEN
    ALTER TABLE "public"."notification_log"
      ADD CONSTRAINT "notification_log_take_event_id_fkey" FOREIGN KEY ("take_event_id")
      REFERENCES "public"."take_events"("id") ON DELETE CASCADE;
  END IF;

  -- Every row is keyed one way or the other. A row with neither would dodge
  -- both unique keys and could be sent any number of times.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_log_keyed') THEN
    ALTER TABLE "public"."notification_log" ADD CONSTRAINT "notification_log_keyed"
      CHECK ("week" IS NOT NULL OR "take_event_id" IS NOT NULL);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. The trigger: a take event starts the sender
-- ---------------------------------------------------------------------------
-- FOR EACH STATEMENT with a transition table, so one statement is at most one
-- dispatch however many events it wrote. pg_net queues the request in the
-- caller's transaction and sends it after commit, so a rolled-back post
-- dispatches nothing.
--
-- It must never raise. This runs inside a member's post or Hell Nah, and a
-- missing Vault token (dispatch_github_workflow raises) must not refuse the
-- take. The cost of swallowing it is a notification that never goes out;
-- the WARNING lands in the Postgres log.
--
-- A burst — three Hell Nahs in a minute — is three dispatches, and GitHub
-- keeps one running and one pending per concurrency group, replacing the
-- pending one each time. The run that finally goes reads every unsent event,
-- so the burst is sent, once.

CREATE OR REPLACE FUNCTION "private"."dispatch_take_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  BEGIN
    IF EXISTS (SELECT 1 FROM new_events WHERE event_type IN ('posted', 'faded', 'backed')) THEN
      BEGIN
        PERFORM private.dispatch_github_workflow('notify-takes.yml');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify-takes.yml was not dispatched: %', SQLERRM;
      END;
    END IF;
    RETURN NULL;
  END;
  $$;

ALTER FUNCTION "private"."dispatch_take_notifications"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."dispatch_take_notifications"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."dispatch_take_notifications"() FROM "anon";
REVOKE ALL ON FUNCTION "private"."dispatch_take_notifications"() FROM "authenticated";

COMMENT ON FUNCTION "private"."dispatch_take_notifications"() IS
  'Statement trigger on take_events: dispatches notify-takes.yml when a take was posted, faded or backed. Never raises; see 20261007120000_take_notifications.sql.';

DROP TRIGGER IF EXISTS "take_events_dispatch_notifications" ON "public"."take_events";
CREATE TRIGGER "take_events_dispatch_notifications"
  AFTER INSERT ON "public"."take_events"
  REFERENCING NEW TABLE AS "new_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "private"."dispatch_take_notifications"();
