-- Push notifications: the league's own app on the member's phone.
--
-- Most of the league opens the site from an iPhone, and iOS (16.4+) delivers
-- Web Push to a site that has been added to the Home Screen and opened from
-- that icon — never to a Safari tab. A member turns notifications on in
-- Settings → Profile; the browser hands back a subscription (an endpoint on
-- Apple's or Google's push service plus two keys), and this table keeps it.
--
-- The sender is `scripts/send-notifications.js`, run by
-- `.github/workflows/notify-pickems.yml`, which pg_cron dispatches at two
-- fixed slots a week through `private.dispatch_github_workflow` — the same
-- clock the ESPN jobs use (20260929120000_cron_dispatch_workflows.sql). The
-- script decides what is due from `pick_em_weeks` and records what it sent in
-- `notification_log`, so a re-run or a manual press sends nothing twice.
--
-- What a member can be sent is `topics`, per device:
--   pickems_open     — the week's pick'ems are open
--   pickems_closing  — pick'ems close in a few hours and you have not picked

-- ---------------------------------------------------------------------------
-- 1. push_subscriptions — one row per device that said yes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "topics" "text"[] DEFAULT ARRAY['pickems_open', 'pickems_closing']::"text"[] NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_sent_at" timestamp with time zone
);

ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";

COMMENT ON TABLE "public"."push_subscriptions" IS
  'One row per device that turned notifications on. Written only through save_push_subscription(); read by the sender with the service role. A member reads and deletes their own rows; nobody reads anybody else''s.';

COMMENT ON COLUMN "public"."push_subscriptions"."endpoint" IS
  'The push service URL the browser handed back. Unique: it identifies the device''s subscription, so the same phone signing in as somebody else moves the row rather than duplicating it.';

COMMENT ON COLUMN "public"."push_subscriptions"."topics" IS
  'What this device wants to be sent. A subset of the values in push_subscriptions_topics_check.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_pkey') THEN
    ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_endpoint_key') THEN
    ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");
  END IF;

  -- A revoked account takes its devices with it, so nobody is notified after
  -- they have been removed from the league.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_user_id_fkey') THEN
    ALTER TABLE "public"."push_subscriptions"
      ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;

  -- Named so adding a topic is one migration that replaces it.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_topics_check') THEN
    ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_topics_check"
      CHECK ("topics" <@ ARRAY['pickems_open', 'pickems_closing']::"text"[]);
  END IF;

  -- Only a real push service. Web Push endpoints are always https.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_endpoint_https') THEN
    ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_endpoint_https"
      CHECK ("endpoint" LIKE 'https://%');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "public"."push_subscriptions" ("user_id");

CREATE OR REPLACE TRIGGER "update_push_subscriptions_updated_at"
  BEFORE UPDATE ON "public"."push_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;

-- Read and delete own. There is no INSERT or UPDATE policy: the write path is
-- save_push_subscription(), because the endpoint is unique and a phone that
-- signs in as somebody else has to move the row, which an own-row UPDATE
-- policy cannot do.
DROP POLICY IF EXISTS "push_subscriptions read own" ON "public"."push_subscriptions";
CREATE POLICY "push_subscriptions read own" ON "public"."push_subscriptions"
  FOR SELECT TO "authenticated" USING ("auth"."uid"() = "user_id");

DROP POLICY IF EXISTS "push_subscriptions delete own" ON "public"."push_subscriptions";
CREATE POLICY "push_subscriptions delete own" ON "public"."push_subscriptions"
  FOR DELETE TO "authenticated" USING ("auth"."uid"() = "user_id");

REVOKE ALL ON TABLE "public"."push_subscriptions" FROM "anon";
REVOKE ALL ON TABLE "public"."push_subscriptions" FROM "authenticated";
GRANT SELECT, DELETE ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";

-- ---------------------------------------------------------------------------
-- 2. save_push_subscription — the only write path for a member
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because it may move a row between users (see above), so it
-- restates the rules RLS would otherwise apply: signed in, approved, and the
-- row it writes is always the caller's. Notifications are about pick'ems, a
-- members-only tab, so a visitor awaiting approval cannot subscribe.

CREATE OR REPLACE FUNCTION "public"."save_push_subscription"(
  "p_endpoint" "text",
  "p_p256dh" "text",
  "p_auth" "text",
  "p_topics" "text"[] DEFAULT ARRAY['pickems_open', 'pickems_closing']::"text"[],
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

ALTER FUNCTION "public"."save_push_subscription"("text", "text", "text", "text"[], "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."save_push_subscription"("text", "text", "text", "text"[], "text") IS
  'Stores (or moves to the caller) one device''s push subscription with the topics it wants, and returns the stored topics. Approved members only. SECURITY DEFINER because the endpoint is unique and may belong to the previous account on that device.';

REVOKE ALL ON FUNCTION "public"."save_push_subscription"("text", "text", "text", "text"[], "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."save_push_subscription"("text", "text", "text", "text"[], "text") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."save_push_subscription"("text", "text", "text", "text"[], "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."save_push_subscription"("text", "text", "text", "text"[], "text") TO "service_role";

-- ---------------------------------------------------------------------------
-- 3. notification_log — what was sent, so nothing is sent twice
-- ---------------------------------------------------------------------------
-- One row per (kind, season, week). The sender inserts it *before* sending,
-- so two runs racing on the same slot cannot both send: the second insert
-- hits the unique key and that run skips. A send that then fails outright
-- still holds the row; the counts on it say so.

CREATE TABLE IF NOT EXISTS "public"."notification_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "week" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recipients" integer DEFAULT 0 NOT NULL,
    "delivered" integer DEFAULT 0 NOT NULL,
    "failed" integer DEFAULT 0 NOT NULL,
    "removed" integer DEFAULT 0 NOT NULL
);

ALTER TABLE "public"."notification_log" OWNER TO "postgres";

COMMENT ON TABLE "public"."notification_log" IS
  'One row per notification sent to the league: which kind, for which week, and how many devices it reached. The unique key is what stops a re-run sending twice.';

COMMENT ON COLUMN "public"."notification_log"."removed" IS
  'Devices the push service reported gone (404/410) — subscriptions deleted during this send.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_log_pkey') THEN
    ALTER TABLE "public"."notification_log" ADD CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_log_kind_season_week_key') THEN
    ALTER TABLE "public"."notification_log"
      ADD CONSTRAINT "notification_log_kind_season_week_key" UNIQUE ("kind", "season_id", "week");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_log_season_id_fkey') THEN
    ALTER TABLE "public"."notification_log"
      ADD CONSTRAINT "notification_log_season_id_fkey" FOREIGN KEY ("season_id")
      REFERENCES "public"."seasons"("id") ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE "public"."notification_log" ENABLE ROW LEVEL SECURITY;

-- The admin can see what went out; members have no reason to.
DROP POLICY IF EXISTS "notification_log admin read" ON "public"."notification_log";
CREATE POLICY "notification_log admin read" ON "public"."notification_log"
  FOR SELECT TO "authenticated" USING ("public"."is_admin"());

REVOKE ALL ON TABLE "public"."notification_log" FROM "anon";
REVOKE ALL ON TABLE "public"."notification_log" FROM "authenticated";
GRANT SELECT ON TABLE "public"."notification_log" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_log" TO "service_role";

-- ---------------------------------------------------------------------------
-- 4. The clock
-- ---------------------------------------------------------------------------
-- Two fixed slots, UTC like every pg_cron job here. The script works out what
-- is actually due from pick_em_weeks, so a slot with nothing due sends
-- nothing, and the two slots only need to land somewhere sensible:
--
--   Tuesday 14:00 UTC  — 10 AM EDT / 9 AM EST. The week's row is created by
--                        the 10:00 UTC weekly sync; this is a civil hour after.
--   Thursday 21:30 UTC — 5:30 PM EDT / 4:30 PM EST, two and a half to three
--                        and a half hours before the default 8 PM ET close.
--
-- A season that moves pickem_close_time far from 8 PM ET moves this slot too;
-- the script's own window (CLOSING_LEAD_HOURS) is what decides whether a
-- reminder is due, so a slot that lands outside it sends nothing rather than
-- a wrong reminder.

select cron.schedule(
  'notify-pickems-open',
  '0 14 * * 2',
  $$ select private.dispatch_github_workflow('notify-pickems.yml') $$
);

select cron.schedule(
  'notify-pickems-closing',
  '30 21 * * 4',
  $$ select private.dispatch_github_workflow('notify-pickems.yml') $$
);
