-- Two more things worth a push.
--
-- 1. An author's reword of their take. The clock on a take restarts when its
--    wording changes (20260917120000_takes_hell_nah_window.sql), because a
--    reworded take is a different sentence from the one people faded, and
--    nothing told them it had changed. It goes out under the existing
--    `takes_new` topic. Only the author's own edit counts: `acted_as_admin` is
--    false exactly when the edit is the author's reword inside their 72 hours,
--    and an admin correcting a take is not news.
--
-- 2. Winning. A new topic, `pickems_wins`, on by default like every topic
--    before it: the week's pick'ems, a tourney, the playoff bracket challenge.
--    It needs no clock of its own. The sender works out what is due on the
--    two notify-pickems slots that already exist (Tuesday 14:00 UTC, four hours
--    after the weekly sync scores the week, and Thursday 21:30 UTC as the
--    retry), through `planWinnerNotifications`.

-- ---------------------------------------------------------------------------
-- 1. The trigger announces an author's edit
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "private"."dispatch_take_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM new_events
      WHERE event_type IN ('posted', 'faded', 'backed')
         OR (event_type = 'edited' AND NOT acted_as_admin)
    ) THEN
      BEGIN
        PERFORM private.dispatch_github_workflow('notify-takes.yml');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify-takes.yml was not dispatched: %', SQLERRM;
      END;
    END IF;
    RETURN NULL;
  END;
  $$;

COMMENT ON FUNCTION "private"."dispatch_take_notifications"() IS
  'Statement trigger on take_events: dispatches notify-takes.yml when a take was posted, faded, backed or reworded by its author. Never raises; see 20261007120000_take_notifications.sql.';

-- ---------------------------------------------------------------------------
-- 2. The topic
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_topics_check') THEN
    ALTER TABLE "public"."push_subscriptions" DROP CONSTRAINT "push_subscriptions_topics_check";
  END IF;

  ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_topics_check"
    CHECK ("topics" <@ ARRAY['pickems_open', 'pickems_closing', 'pickems_wins', 'takes_new', 'takes_reactions', 'takes_stakes', 'matchup_facts', 'taunts']::"text"[]);
END $$;

ALTER TABLE "public"."push_subscriptions"
  ALTER COLUMN "topics" SET DEFAULT ARRAY['pickems_open', 'pickems_closing', 'pickems_wins', 'takes_new', 'takes_reactions', 'takes_stakes', 'matchup_facts', 'taunts']::"text"[];

UPDATE "public"."push_subscriptions"
SET "topics" = "topics" || ARRAY['pickems_wins']::"text"[]
WHERE NOT ('pickems_wins' = ANY ("topics"));

-- The default is the only thing that changes; the client always sends its
-- topics explicitly. Recreated whole so the signature, grants and comment stay
-- exactly as 20261020120000 left them.
CREATE OR REPLACE FUNCTION "public"."save_push_subscription"(
  "p_endpoint" "text",
  "p_p256dh" "text",
  "p_auth" "text",
  "p_topics" "text"[] DEFAULT ARRAY['pickems_open', 'pickems_closing', 'pickems_wins', 'takes_new', 'takes_reactions', 'takes_stakes', 'matchup_facts', 'taunts']::"text"[],
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
  'What this device wants to be sent: pickems_open, pickems_closing, pickems_wins (you won a week, a tourney or the playoff bracket challenge), takes_new (every new or reworded take but your own), takes_reactions (Hell Yeahs and Hell Nahs on your takes), takes_stakes (a staked Hell Yeah on a take you said Hell Nah to, asking whether you accept it), matchup_facts (noon daily, a fact about your week), taunts (your opponent sent you their fact). A subset of push_subscriptions_topics_check.';
