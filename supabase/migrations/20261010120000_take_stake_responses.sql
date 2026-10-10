-- Takes: a Hell Yeah stake is a side bet with whichever Hell Nahs take it on.
--
-- Until now a backer's stake was "a show of confidence, not a bet": it sat
-- beside their name and nobody owed anybody over it
-- (20260918120000_takes_hell_yeah.sql). The league wants it to be able to be
-- a real side bet -- but nobody can be signed up to pay a second person
-- without saying so. So a staked Hell Yeah is now an **offer** to the people
-- on the other side of the take:
--
--   * **Every Hell Nah on the take is asked**, by push notification
--     (`takes_stakes`) and on the take itself: "Do you accept this Hell Yeah?
--     This means you will have to pay out to <backer> as well."
--
--   * **Each Hell Nah decides for themselves.** One who accepts is in on the
--     backer's stake: if the take hits they owe the backer as well as the
--     author; if it misses the backer owes them. One who declines is in on
--     the author's stake only. Nobody's answer binds anybody else.
--
--   * **If nobody accepts, the stake is null.** Every Hell Nah declined, or
--     the time to answer ran out with no yes. The take's own stake is
--     untouched either way, and the Hell Yeah itself still counts as support.
--
--   * **Silence is a no.** The offer is open for three days from the staked
--     Hell Yeah. A Hell Nah who has not accepted by then -- or by grading --
--     is not in on it. Somebody who says Hell Nah while the offer is still
--     open is asked like everybody else; after it has closed, they are not.
--
--   * **An answer is final.** There is no member UPDATE or DELETE policy. A
--     yes is a commitment to pay somebody. Withdrawing the Hell Nah (inside
--     its window) is still how a fader steps off the take altogether.
--
-- Who is in on a stake -- and whether it is in play, waiting, or null -- is
-- **derived, not stored** (`stakeStatus` in src/components/takes/milestones.js,
-- and the notification planner). Faders join and leave; a stored status would
-- need a trigger on both tables to stay true.
--
-- A response points at the Hell Yeah *row*, so a backer who withdraws and
-- re-stakes makes a fresh offer: the old answers go with the old row.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."take_stake_responses" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "take_id" "uuid" NOT NULL,
  "season_id" "uuid" NOT NULL,
  "hell_yeah_id" "uuid" NOT NULL,
  "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
  "response" "text" NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "take_stake_responses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "take_stake_responses_one_answer" UNIQUE ("hell_yeah_id", "user_id"),
  CONSTRAINT "take_stake_responses_response_check"
    CHECK (("response" = ANY (ARRAY['accepted'::"text", 'declined'::"text"]))),
  CONSTRAINT "take_stake_responses_take_id_fkey" FOREIGN KEY ("take_id")
    REFERENCES "public"."takes"("id") ON DELETE CASCADE,
  CONSTRAINT "take_stake_responses_season_id_fkey" FOREIGN KEY ("season_id")
    REFERENCES "public"."seasons"("id") ON DELETE CASCADE,
  -- The Hell Yeah taken back, stake and all, takes its answers with it.
  CONSTRAINT "take_stake_responses_hell_yeah_id_fkey" FOREIGN KEY ("hell_yeah_id")
    REFERENCES "public"."take_participants"("id") ON DELETE CASCADE,
  CONSTRAINT "take_stake_responses_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "auth"."users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "take_stake_responses_take_id_idx"
  ON "public"."take_stake_responses" ("take_id");

ALTER TABLE "public"."take_stake_responses" OWNER TO "postgres";

COMMENT ON TABLE "public"."take_stake_responses" IS
  'A Hell Nah''s answer to a staked Hell Yeah on the same take. Each Hell Nah decides for themselves: one who accepts is in on the backer''s stake (owes the backer too if the take hits, is owed by the backer if it misses); one who declines, or has not accepted within 72 hours of the Hell Yeah or by grading, is not. If nobody accepts, the backer''s stake is null; the take''s own stake stands either way. Answers are final. See 20261010120000_take_stake_responses.sql.';

COMMENT ON COLUMN "public"."take_stake_responses"."hell_yeah_id" IS
  'The staked Hell Yeah (take_participants row, side = yeah, wager not null) being answered. Cascades: a withdrawn Hell Yeah takes its answers with it, so re-staking is a fresh offer.';

ALTER TABLE "public"."take_stake_responses" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Policies
-- ---------------------------------------------------------------------------
-- Read: members, like the rest of the board. Write: your own answer, once,
-- to a staked Hell Yeah on an ungraded take you are fading, inside three
-- days of the stake. Admin: everything, the usual repair path.

DROP POLICY IF EXISTS "Members read take_stake_responses" ON "public"."take_stake_responses";
CREATE POLICY "Members read take_stake_responses" ON "public"."take_stake_responses"
  FOR SELECT TO "authenticated"
  USING ("public"."is_approved_member"());

DROP POLICY IF EXISTS "take_stake_responses answer own" ON "public"."take_stake_responses";
CREATE POLICY "take_stake_responses answer own" ON "public"."take_stake_responses"
  FOR INSERT TO "authenticated"
  WITH CHECK ("public"."is_approved_member"()
              AND ("auth"."uid"() = "user_id")
              AND EXISTS (
                SELECT 1
                FROM "public"."take_participants" y
                JOIN "public"."takes" t ON t."id" = y."take_id"
                WHERE y."id" = "take_stake_responses"."hell_yeah_id"
                  AND y."take_id" = "take_stake_responses"."take_id"
                  AND t."season_id" = "take_stake_responses"."season_id"
                  AND y."side" = 'yeah'::"text"
                  AND y."wager" IS NOT NULL
                  AND t."status" = 'pending'::"text"
                  AND "now"() < y."created_at" + interval '72 hours')
              AND EXISTS (
                SELECT 1 FROM "public"."take_participants" n
                WHERE n."take_id" = "take_stake_responses"."take_id"
                  AND n."user_id" = "auth"."uid"()
                  AND n."side" = 'nah'::"text"));

DROP POLICY IF EXISTS "take_stake_responses admin write" ON "public"."take_stake_responses";
CREATE POLICY "take_stake_responses admin write" ON "public"."take_stake_responses"
  FOR ALL TO "authenticated"
  USING ("public"."is_admin"())
  WITH CHECK ("public"."is_admin"());

-- UPDATE and DELETE are for the admin's FOR ALL policy; no member policy
-- matches either, so an answer cannot be changed or taken back.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."take_stake_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."take_stake_responses" TO "service_role";

-- ---------------------------------------------------------------------------
-- 3. The log
-- ---------------------------------------------------------------------------
-- An answer is an act on the take, and every act is logged by the database.
-- `stake_accepted` / `stake_declined`, about the fader (subject), with the
-- backer and the stake in `changes` -- the stake as it stood when the answer
-- was given.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'take_events_event_type_check') THEN
    ALTER TABLE "public"."take_events" DROP CONSTRAINT "take_events_event_type_check";
  END IF;

  ALTER TABLE "public"."take_events"
    ADD CONSTRAINT "take_events_event_type_check"
    CHECK (("event_type" = ANY (ARRAY['posted'::"text", 'edited'::"text", 'graded'::"text",
                                      'reopened'::"text", 'faded'::"text", 'unfaded'::"text",
                                      'backed'::"text", 'unbacked'::"text",
                                      'stake_accepted'::"text", 'stake_declined'::"text"])));
END $$;

COMMENT ON COLUMN "public"."take_events"."event_type" IS
  'posted | edited | graded | reopened | faded | unfaded | backed | unbacked | stake_accepted | stake_declined. backed/unbacked are Hell Yeahs given and taken back; a backed row carries the backer''s stake, if any, as changes.wager.to. stake_accepted/stake_declined are a Hell Nah''s answer to a staked Hell Yeah (subject = the Hell Nah, changes.backer = the backer''s user id, changes.wager.to = the stake). The CHECK is named and DO-guarded so a later migration can recreate it with a new act in the list.';

CREATE OR REPLACE FUNCTION "public"."log_take_stake_response_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    v_actor uuid := auth.uid();
    v_admin boolean := public.is_admin();
    v_backer uuid;
    v_wager text;
    v_member_could boolean;
  BEGIN
    SELECT y.user_id, y.wager INTO v_backer, v_wager
    FROM public.take_participants y WHERE y.id = NEW.hell_yeah_id;

    -- "Could a member have done this": the insert policy over NEW.
    v_member_could := v_actor IS NOT NULL
      AND v_actor = NEW.user_id
      AND EXISTS (
        SELECT 1
        FROM public.take_participants y
        JOIN public.takes t ON t.id = y.take_id
        WHERE y.id = NEW.hell_yeah_id
          AND t.status = 'pending'
          AND now() < y.created_at + interval '72 hours');

    INSERT INTO public.take_events
      (take_id, season_id, event_type, actor_id, subject_id, changes, created_at, acted_as_admin)
    VALUES
      (NEW.take_id, NEW.season_id,
       CASE WHEN NEW.response = 'accepted' THEN 'stake_accepted' ELSE 'stake_declined' END,
       COALESCE(v_actor, NEW.user_id), NEW.user_id,
       jsonb_build_object('backer', v_backer, 'wager', jsonb_build_object('to', v_wager)),
       NEW.created_at,
       v_admin AND NOT v_member_could);

    RETURN NEW;
  END;
  $$;

ALTER FUNCTION "public"."log_take_stake_response_event"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."log_take_stake_response_event"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."log_take_stake_response_event"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."log_take_stake_response_event"() FROM "authenticated";

COMMENT ON FUNCTION "public"."log_take_stake_response_event"() IS
  'Appends stake_accepted / stake_declined to take_events for a Hell Nah''s answer to a staked Hell Yeah, stamping acted_as_admin when the admin answered for somebody or outside the window.';

DROP TRIGGER IF EXISTS "take_stake_responses_log" ON "public"."take_stake_responses";
CREATE TRIGGER "take_stake_responses_log"
  AFTER INSERT ON "public"."take_stake_responses"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."log_take_stake_response_event"();

-- ---------------------------------------------------------------------------
-- 4. The notification topic
-- ---------------------------------------------------------------------------
-- `takes_stakes`: a staked Hell Yeah on a take you said Hell Nah to, asking
-- whether you accept it. Its own topic rather than part of
-- `takes_reactions` (which is about *your* takes): this one asks for an
-- answer with a deadline, and turning off reactions should not silently cost
-- somebody the chance to take the stake on. On for every device already subscribed.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_topics_check') THEN
    ALTER TABLE "public"."push_subscriptions" DROP CONSTRAINT "push_subscriptions_topics_check";
  END IF;

  ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_topics_check"
    CHECK ("topics" <@ ARRAY['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions', 'takes_stakes', 'matchup_facts']::"text"[]);
END $$;

ALTER TABLE "public"."push_subscriptions"
  ALTER COLUMN "topics" SET DEFAULT ARRAY['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions', 'takes_stakes', 'matchup_facts']::"text"[];

UPDATE "public"."push_subscriptions"
SET "topics" = "topics" || ARRAY['takes_stakes']::"text"[]
WHERE NOT ('takes_stakes' = ANY ("topics"));

-- The default is the only thing that changes; the client always sends its
-- topics explicitly. Recreated whole so the signature, grants and comment stay
-- exactly as 20261009120000 left them.
CREATE OR REPLACE FUNCTION "public"."save_push_subscription"(
  "p_endpoint" "text",
  "p_p256dh" "text",
  "p_auth" "text",
  "p_topics" "text"[] DEFAULT ARRAY['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions', 'takes_stakes', 'matchup_facts']::"text"[],
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
  'What this device wants to be sent: pickems_open, pickems_closing, takes_new (every new take but your own), takes_reactions (Hell Yeahs and Hell Nahs on your takes), takes_stakes (a staked Hell Yeah on a take you said Hell Nah to, asking whether you accept it), matchup_facts (noon daily, a fact about your week). A subset of push_subscriptions_topics_check.';

-- ---------------------------------------------------------------------------
-- 5. One event, more than one notification
-- ---------------------------------------------------------------------------
-- A staked Hell Yeah is one `backed` event that now tells two audiences: the
-- author (takes_reactions) and the Hell Nahs (takes_stakes). The claim was
-- unique on the event alone, which would let only the first be sent. It is
-- unique on (event, kind) now -- still at most once per audience.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_log_take_event_id_key') THEN
    ALTER TABLE "public"."notification_log" DROP CONSTRAINT "notification_log_take_event_id_key";
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_log_take_event_kind_key') THEN
    ALTER TABLE "public"."notification_log"
      ADD CONSTRAINT "notification_log_take_event_kind_key" UNIQUE ("take_event_id", "kind");
  END IF;
END $$;

COMMENT ON COLUMN "public"."notification_log"."take_event_id" IS
  'For a take notification, the take_events row it announced. Unique with kind: an event is sent at most once to each audience (a staked Hell Yeah tells the author under takes_reactions and the Hell Nahs under takes_stakes). NULL for the weekly pick''em kinds, which are keyed by week instead.';
