-- Taunts: a member can send today's matchup fact to the opponent it is about.
--
-- Every daily matchup fact the member could needle the opponent with comes
-- with a second wording written to the opponent (services/matchupFacts.js:
-- "Harshil is 8-2 all-time against you."). The sender
-- (`scripts/send-notifications.js --matchups`) stores that pairing here as an
-- offer, one per member per day, and links the push to it: tapping the fact
-- opens Alerts with a Taunt button. iOS shows no action buttons on web
-- notifications, so the tap is the way in there; a device that does show them
-- gets a Taunt button on the notification too.
--
-- Pressing Taunt calls `send_taunt()`, which stamps `sent_at` once. A trigger
-- then dispatches `.github/workflows/notify-taunts.yml`, which delivers the
-- taunt to the opponent's devices (topic `taunts`) and their Alerts, and
-- stamps `delivered_at` first so nothing is sent twice.
--
-- Applied on merge by deploy-migrations.yml — never also by hand.

-- ---------------------------------------------------------------------------
-- 1. The offers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."matchup_taunts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "from_user_id" "uuid" NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "season_id" "uuid" NOT NULL REFERENCES "public"."seasons"("id") ON DELETE CASCADE,
    "week" integer NOT NULL,
    "day" "text" NOT NULL,
    "to_team_id" "uuid" NOT NULL REFERENCES "public"."teams"("id") ON DELETE CASCADE,
    "sender_name" "text" NOT NULL,
    "opponent_name" "text" NOT NULL,
    "fact" "text" NOT NULL,
    "taunt" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    CONSTRAINT "matchup_taunts_day_key" UNIQUE ("from_user_id", "season_id", "week", "day"),
    CONSTRAINT "matchup_taunts_delivered_after_sent" CHECK ("delivered_at" IS NULL OR "sent_at" IS NOT NULL)
);

COMMENT ON TABLE "public"."matchup_taunts" IS
  'One taunt offer per member per day: the matchup fact they were sent and the same fact written to the opponent. sent_at is set once by send_taunt(); delivered_at by the sender when it claims the delivery.';
COMMENT ON COLUMN "public"."matchup_taunts"."to_team_id" IS
  'The opponent''s team that week. The accounts to tell are resolved from teams.owner when the taunt is delivered, so an account made later still gets it.';

CREATE INDEX IF NOT EXISTS "matchup_taunts_pending_idx"
  ON "public"."matchup_taunts" ("sent_at") WHERE "delivered_at" IS NULL AND "sent_at" IS NOT NULL;

ALTER TABLE "public"."matchup_taunts" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matchup_taunts read own" ON "public"."matchup_taunts";
CREATE POLICY "matchup_taunts read own" ON "public"."matchup_taunts"
  FOR SELECT TO "authenticated" USING ("from_user_id" = "auth"."uid"());

REVOKE ALL ON TABLE "public"."matchup_taunts" FROM "anon";
REVOKE ALL ON TABLE "public"."matchup_taunts" FROM "authenticated";
GRANT SELECT ON TABLE "public"."matchup_taunts" TO "authenticated";
GRANT ALL ON TABLE "public"."matchup_taunts" TO "service_role";

-- ---------------------------------------------------------------------------
-- 2. Taunting: once per offer, inside two days, approved members only
-- ---------------------------------------------------------------------------
-- Returns 'sent', 'already_sent', 'expired' or 'not_found'. SECURITY DEFINER
-- because there is no member UPDATE policy: this function is the only way a
-- member's press reaches the row, and it touches nothing but `sent_at` on the
-- caller's own offer. The window mirrors TAUNT_WINDOW_HOURS in
-- src/utils/taunts.js.

CREATE OR REPLACE FUNCTION "public"."send_taunt"("p_id" "uuid")
  RETURNS "text"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  DECLARE
    v_user_id uuid := auth.uid();
    v_row public.matchup_taunts%ROWTYPE;
    v_changed integer;
  BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'You must be signed in to do that'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT public.is_approved_member() THEN
      RAISE EXCEPTION 'Your account has not been approved yet'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_row FROM public.matchup_taunts WHERE id = p_id AND from_user_id = v_user_id;
    IF NOT FOUND THEN
      RETURN 'not_found';
    END IF;
    IF v_row.sent_at IS NOT NULL THEN
      RETURN 'already_sent';
    END IF;
    IF v_row.created_at < now() - interval '48 hours' THEN
      RETURN 'expired';
    END IF;

    UPDATE public.matchup_taunts SET sent_at = now() WHERE id = p_id AND sent_at IS NULL;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RETURN CASE WHEN v_changed = 1 THEN 'sent' ELSE 'already_sent' END;
  END;
  $$;

REVOKE ALL ON FUNCTION "public"."send_taunt"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."send_taunt"("uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."send_taunt"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."send_taunt"("uuid") TO "service_role";

-- ---------------------------------------------------------------------------
-- 3. Delivering: a taunt sent dispatches notify-taunts.yml
-- ---------------------------------------------------------------------------
-- Never raises: it runs inside the member's press, and a missing Vault token
-- must not refuse it. A manual run of the workflow delivers anything sent in
-- the last six hours that was missed.

CREATE OR REPLACE FUNCTION "private"."dispatch_taunt_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  BEGIN
    BEGIN
      PERFORM private.dispatch_github_workflow('notify-taunts.yml');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify-taunts.yml was not dispatched: %', SQLERRM;
    END;
    RETURN NULL;
  END;
  $$;

ALTER FUNCTION "private"."dispatch_taunt_notifications"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."dispatch_taunt_notifications"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."dispatch_taunt_notifications"() FROM "anon";
REVOKE ALL ON FUNCTION "private"."dispatch_taunt_notifications"() FROM "authenticated";

DROP TRIGGER IF EXISTS "matchup_taunts_dispatch_notifications" ON "public"."matchup_taunts";
CREATE TRIGGER "matchup_taunts_dispatch_notifications"
  AFTER UPDATE OF "sent_at" ON "public"."matchup_taunts"
  FOR EACH ROW
  WHEN (OLD."sent_at" IS NULL AND NEW."sent_at" IS NOT NULL)
  EXECUTE FUNCTION "private"."dispatch_taunt_notifications"();

-- ---------------------------------------------------------------------------
-- 4. The topic, on for every device that has notifications on
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_topics_check') THEN
    ALTER TABLE "public"."push_subscriptions" DROP CONSTRAINT "push_subscriptions_topics_check";
  END IF;

  ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_topics_check"
    CHECK ("topics" <@ ARRAY['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions', 'takes_stakes', 'matchup_facts', 'taunts']::"text"[]);
END $$;

ALTER TABLE "public"."push_subscriptions"
  ALTER COLUMN "topics" SET DEFAULT ARRAY['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions', 'takes_stakes', 'matchup_facts', 'taunts']::"text"[];

UPDATE "public"."push_subscriptions"
SET "topics" = "topics" || ARRAY['taunts']::"text"[]
WHERE NOT ('taunts' = ANY ("topics"));

-- The default is the only thing that changes; the client always sends its
-- topics explicitly. Recreated whole so the signature, grants and comment stay
-- exactly as 20261010120000 left them.
CREATE OR REPLACE FUNCTION "public"."save_push_subscription"(
  "p_endpoint" "text",
  "p_p256dh" "text",
  "p_auth" "text",
  "p_topics" "text"[] DEFAULT ARRAY['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions', 'takes_stakes', 'matchup_facts', 'taunts']::"text"[],
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
  'What this device wants to be sent: pickems_open, pickems_closing, takes_new (every new take but your own), takes_reactions (Hell Yeahs and Hell Nahs on your takes), takes_stakes (a staked Hell Yeah on a take you said Hell Nah to, asking whether you accept it), matchup_facts (noon daily, a fact about your week), taunts (your opponent taunting you with their fact). A subset of push_subscriptions_topics_check.';
