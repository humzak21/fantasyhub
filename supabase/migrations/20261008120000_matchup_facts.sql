-- Daily matchup facts: at noon in the season's zone, every member hears the
-- most unusual true thing the league's data says about their week — about
-- them (honest), about this week's opponent (unflattering), or about the two
-- of them.
--
-- One new topic beside the pick'em and take ones:
--   matchup_facts — once a day, a fact about you, your opponent or the rivalry.
--
-- The facts are computed by services/matchupFacts.js in
-- `scripts/send-notifications.js --matchups`, which
-- `.github/workflows/notify-matchups.yml` runs. pg_cron dispatches it at
-- 16:00 and 17:00 UTC every day, because pg_cron has no time zones and noon
-- Eastern is one of those under daylight time and the other after it. The
-- workflow passes `--at-noon` on a cron run, so only the slot that is noon in
-- the season's zone sends; the other finds nothing due.
--
-- notification_log needs nothing new: a day is claimed as
-- (kind = 'matchup_facts:<weekday>', season, week), which the existing unique
-- key already makes once-only. What each member was told is
-- `matchup_fact_log`, so no sentence is ever sent to them twice.
--
-- Applying: the constraint swap below is a DROP, which the Supabase MCP
-- cannot run (see CLAUDE.md, "Scripts write to production"). Paste this file
-- into the dashboard's SQL editor.

-- ---------------------------------------------------------------------------
-- 1. The topic, on for every device that has notifications on
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_topics_check') THEN
    ALTER TABLE "public"."push_subscriptions" DROP CONSTRAINT "push_subscriptions_topics_check";
  END IF;

  ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_topics_check"
    CHECK ("topics" <@ ARRAY['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions', 'matchup_facts']::"text"[]);
END $$;

ALTER TABLE "public"."push_subscriptions"
  ALTER COLUMN "topics" SET DEFAULT ARRAY['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions', 'matchup_facts']::"text"[];

-- On by default for members who already have notifications on; each can
-- switch it off in Settings. Idempotent.
UPDATE "public"."push_subscriptions"
SET "topics" = "topics" || ARRAY['matchup_facts']::"text"[]
WHERE NOT ('matchup_facts' = ANY ("topics"));

-- The default is the only thing that changes; the client always sends its
-- topics explicitly. Recreated whole so the signature, grants and comment stay
-- exactly as 20261007120000 left them.
CREATE OR REPLACE FUNCTION "public"."save_push_subscription"(
  "p_endpoint" "text",
  "p_p256dh" "text",
  "p_auth" "text",
  "p_topics" "text"[] DEFAULT ARRAY['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions', 'matchup_facts']::"text"[],
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
  'What this device wants to be sent: pickems_open, pickems_closing, takes_new (every new take but your own), takes_reactions (Hell Yeahs and Hell Nahs on your takes), matchup_facts (noon daily, a fact about your week). A subset of push_subscriptions_topics_check.';

-- ---------------------------------------------------------------------------
-- 2. What each member has been told
-- ---------------------------------------------------------------------------
-- One row per member per day. The sender reads a member's rows before
-- choosing (services/matchupFacts.js::pickFact): a sentence in here is never
-- sent to them again, and its family not for three weeks. Written by the
-- sender (service role) only; a member may read their own.

CREATE TABLE IF NOT EXISTS "public"."matchup_fact_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "user_id" "uuid" NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "season_id" "uuid" NOT NULL REFERENCES "public"."seasons"("id") ON DELETE CASCADE,
    "week" integer NOT NULL,
    "day" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "family" "text" NOT NULL,
    "fact" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "matchup_fact_log_subject_check" CHECK ("subject" IN ('self', 'opponent', 'rivalry')),
    CONSTRAINT "matchup_fact_log_day_key" UNIQUE ("user_id", "season_id", "week", "day")
);

COMMENT ON TABLE "public"."matchup_fact_log" IS
  'Every daily matchup fact sent, one row per member per day. The sender never sends a member a fact already here.';

ALTER TABLE "public"."matchup_fact_log" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."matchup_fact_log" FROM "anon";
REVOKE ALL ON TABLE "public"."matchup_fact_log" FROM "authenticated";
GRANT SELECT ON TABLE "public"."matchup_fact_log" TO "authenticated";
GRANT ALL ON TABLE "public"."matchup_fact_log" TO "service_role";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'matchup_fact_log' AND policyname = 'Members read own matchup facts'
  ) THEN
    CREATE POLICY "Members read own matchup facts" ON "public"."matchup_fact_log"
      FOR SELECT TO "authenticated" USING ("user_id" = "auth"."uid"());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. The clock
-- ---------------------------------------------------------------------------
-- 16:00 UTC is noon EDT, 17:00 UTC noon EST. Both dispatch; the script sends
-- only from the one that is noon (`--at-noon`), and the day's claim stops a
-- second send if both ever were.

select cron.schedule(
  'notify-matchup-facts',
  '0 16,17 * * *',
  $$ select private.dispatch_github_workflow('notify-matchups.yml') $$
);
