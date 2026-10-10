-- Takes: a Hell Yeah stake is a bet once every Hell Nah has agreed to it.
--
-- Until now a backer's stake was "a show of confidence, not a bet": it sat
-- beside their name and nobody owed anybody over it
-- (20260918120000_takes_hell_yeah.sql). The league wants it to be able to be
-- a real side bet -- but nobody can be signed up to pay a second person
-- without saying so. So a staked Hell Yeah is now a **proposal** to the
-- people on the other side of the take:
--
--   * **Every Hell Nah on the take is asked**, by push notification
--     (`takes_stakes`) and on the take itself: "Do you accept this Hell Yeah?
--     This means you will have to pay out to <backer> as well."
--
--   * **All of them have to agree.** If every Hell Nah accepts, the stake is
--     in play: if the take hits, each Hell Nah owes the backer their stake as
--     well as owing the author; if it misses, the backer owes each Hell Nah.
--
--   * **One no ends it.** A single decline nullifies the backer's stake for
--     everybody. The take's own stake is untouched and stays in play; the
--     Hell Yeah itself still counts as support.
--
--   * **Silence is not agreement.** Each Hell Nah has three days from the
--     staked Hell Yeah to answer. A stake still waiting on somebody when that
--     runs out -- or when the take is graded -- never went into play.
--
--   * **Saying Hell Nah later is agreeing.** Somebody who fades the take after
--     the stake was put up joins on the terms already on the table: a trigger
--     records their acceptance as they join (`by_joining`), and the client
--     always shows the Hell Nah dialog, listing the stakes, before it writes
--     one. Otherwise a latecomer could veto a stake everybody else had
--     already agreed to.
--
--   * **An answer is final.** There is no member UPDATE or DELETE policy. A
--     yes is a commitment and a no has already ended the stake for others.
--     Withdrawing the Hell Nah (inside its window) is still how a fader steps
--     off the take -- but a no they gave stays on the record, and so the stake
--     stays off.
--
-- The state -- waiting, agreed, declined, lapsed -- is **derived, not stored**
-- (`stakeStatus` in src/components/takes/milestones.js, and the notification
-- planner). Faders join and leave; a stored status would need a trigger on
-- both tables to stay true, and would be one more thing to disagree.
--
-- A response points at the Hell Yeah *row*, so a backer who withdraws and
-- re-stakes makes a fresh proposal: the old answers go with the old row.

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
  "by_joining" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "take_stake_responses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "take_stake_responses_one_answer" UNIQUE ("hell_yeah_id", "user_id"),
  CONSTRAINT "take_stake_responses_response_check"
    CHECK (("response" = ANY (ARRAY['accepted'::"text", 'declined'::"text"]))),
  -- Joining is agreeing; nobody joins by saying no.
  CONSTRAINT "take_stake_responses_join_accepts"
    CHECK ((NOT "by_joining") OR ("response" = 'accepted'::"text")),
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
  'A Hell Nah''s answer to a staked Hell Yeah on the same take. The backer''s stake is in play only once every Hell Nah on the take has accepted; one decline nullifies it (the take''s own stake stands), and a stake not accepted by everyone within 72 hours of the Hell Yeah, or by grading, never went into play. Answers are final. See 20261010120000_take_stake_responses.sql.';

COMMENT ON COLUMN "public"."take_stake_responses"."hell_yeah_id" IS
  'The staked Hell Yeah (take_participants row, side = yeah, wager not null) being answered. Cascades: a withdrawn Hell Yeah takes its answers with it, so re-staking is a fresh proposal.';

COMMENT ON COLUMN "public"."take_stake_responses"."by_joining" IS
  'True when the acceptance was recorded by saying Hell Nah after the stake was put up -- joining on the terms already on the table. Written only by take_participants_accept_stakes_on_join(); not logged as a separate act, since the faded event is the act.';

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
              AND (NOT "by_joining")
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
-- 3. Saying Hell Nah after a stake is agreeing to it
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because the member's own insert policy refuses a stake
-- older than three days, and a latecomer joining a week-old staked take is
-- agreeing to it all the same. ON CONFLICT: a member who faded, accepted,
-- withdrew and faded again already has their answer, and a no stays a no.

CREATE OR REPLACE FUNCTION "public"."take_participants_accept_stakes_on_join"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    INSERT INTO public.take_stake_responses
      (take_id, season_id, hell_yeah_id, user_id, response, by_joining)
    SELECT y.take_id, y.season_id, y.id, NEW.user_id, 'accepted', true
    FROM public.take_participants y
    WHERE y.take_id = NEW.take_id
      AND y.side = 'yeah'
      AND y.wager IS NOT NULL
      AND y.user_id <> NEW.user_id
    ON CONFLICT (hell_yeah_id, user_id) DO NOTHING;
    RETURN NEW;
  END;
  $$;

ALTER FUNCTION "public"."take_participants_accept_stakes_on_join"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."take_participants_accept_stakes_on_join"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."take_participants_accept_stakes_on_join"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."take_participants_accept_stakes_on_join"() FROM "authenticated";

COMMENT ON FUNCTION "public"."take_participants_accept_stakes_on_join"() IS
  'A Hell Nah joining a take that already carries staked Hell Yeahs accepts them: it joins on the terms on the table. Records by_joining acceptances; never overwrites an earlier answer.';

DROP TRIGGER IF EXISTS "take_participants_accept_stakes_on_join" ON "public"."take_participants";
CREATE TRIGGER "take_participants_accept_stakes_on_join"
  AFTER INSERT ON "public"."take_participants"
  FOR EACH ROW WHEN (("new"."side" = 'nah'::"text"))
  EXECUTE FUNCTION "public"."take_participants_accept_stakes_on_join"();

-- ---------------------------------------------------------------------------
-- 4. The log
-- ---------------------------------------------------------------------------
-- An answer is an act on the take, and every act is logged by the database.
-- `stake_accepted` / `stake_declined`, about the fader (subject), with the
-- backer and the stake in `changes` -- the stake as it stood when the answer
-- was given. Acceptances by joining are not logged: the `faded` row is the act.

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
  'Appends stake_accepted / stake_declined to take_events for an explicit answer to a staked Hell Yeah, stamping acted_as_admin when the admin answered for somebody or outside the window. Acceptances by joining are not logged.';

DROP TRIGGER IF EXISTS "take_stake_responses_log" ON "public"."take_stake_responses";
CREATE TRIGGER "take_stake_responses_log"
  AFTER INSERT ON "public"."take_stake_responses"
  FOR EACH ROW WHEN ((NOT "new"."by_joining"))
  EXECUTE FUNCTION "public"."log_take_stake_response_event"();

-- ---------------------------------------------------------------------------
-- 5. The notification topic
-- ---------------------------------------------------------------------------
-- `takes_stakes`: a staked Hell Yeah on a take you said Hell Nah to, asking
-- whether you accept it. Its own topic rather than part of
-- `takes_reactions` (which is about *your* takes): this one asks for an
-- answer with a deadline, and turning off reactions should not silently cost
-- somebody the chance to say no. On for every device already subscribed.

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
  'What this device wants to be sent: pickems_open, pickems_closing, takes_new (every new take but your own), takes_reactions (Hell Yeahs and Hell Nahs on your takes), takes_stakes (a staked Hell Yeah on a take you said Hell Nah to, asking you to accept it), matchup_facts (noon daily, a fact about your week). A subset of push_subscriptions_topics_check.';

-- ---------------------------------------------------------------------------
-- 6. One event, more than one notification
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
