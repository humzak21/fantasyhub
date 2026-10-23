-- League chat (JITS-42): the fact cards it answers from, and a log of what was
-- asked.
--
-- `league_facts` is one short, true sentence per row, written by
-- scripts/build-league-facts.js from the same code the History tab draws with,
-- and tagged with who, which seasons and which weeks it is about. The
-- `league-chat` edge function picks the cards a question is about and lets a
-- model word the answer from them, then checks every number in the answer
-- against them (services/leagueQuestion.js). So these rows are the only source
-- of anything the chat says.
--
-- A rebuild inserts a new `generation`, points `league_facts_meta` at it, then
-- deletes the old one: a question reads the generation the meta row names, and
-- never half a rebuild.
--
-- Nobody but the service role reads or writes either table. The cards name
-- every owner, and the function — not a policy — decides who may ask (approved
-- members, the same rule as Takes). `chat_log` is also how the daily cap is
-- counted.
--
-- Applied on merge by deploy-migrations.yml — never also by hand.

CREATE TABLE IF NOT EXISTS "public"."league_facts" (
    "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "generation" bigint NOT NULL,
    "topic" "text" NOT NULL,
    "owners" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "seasons" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "weeks" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "phase" "text",
    "text" "text" NOT NULL,
    "link" "text"
);

COMMENT ON TABLE "public"."league_facts" IS
  'League chat fact cards: one true sentence each, built by scripts/build-league-facts.js. owners holds ownerKey values (alias-resolved, lower-case).';

CREATE INDEX IF NOT EXISTS "league_facts_generation_idx" ON "public"."league_facts" ("generation");
CREATE INDEX IF NOT EXISTS "league_facts_owners_idx" ON "public"."league_facts" USING gin ("owners");
CREATE INDEX IF NOT EXISTS "league_facts_seasons_idx" ON "public"."league_facts" USING gin ("seasons");

CREATE TABLE IF NOT EXISTS "public"."league_facts_meta" (
    "id" boolean DEFAULT true NOT NULL PRIMARY KEY CHECK ("id"),
    "generation" bigint NOT NULL,
    "lexicon" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "this_week" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "current_year" integer,
    "current_week" integer,
    "played_week" integer,
    "card_count" integer DEFAULT 0 NOT NULL,
    "built_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

COMMENT ON TABLE "public"."league_facts_meta" IS
  'The one row saying which league_facts generation is current, the names a question can use for each owner, and this week''s pairings.';

CREATE TABLE IF NOT EXISTS "public"."chat_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "user_id" "uuid" NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "question" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "answer" "text" NOT NULL DEFAULT '',
    "card_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "problems" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "model" "text",
    "latency_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_log_kind_check" CHECK ("kind" IN ('answer', 'facts', 'none', 'error'))
);

COMMENT ON TABLE "public"."chat_log" IS
  'Every league chat question: what was asked, what kind of reply went back (a checked answer, the cards themselves, nothing found), how many drafts it took and why any failed the check. Also counts the daily cap.';

CREATE INDEX IF NOT EXISTS "chat_log_user_created_idx" ON "public"."chat_log" ("user_id", "created_at" DESC);

ALTER TABLE "public"."league_facts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."league_facts_meta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."chat_log" ENABLE ROW LEVEL SECURITY;

-- No policies: the service role (scripts, the edge function) is the only reader
-- and writer. Revoke the default grants so PostgREST does not even list them.
REVOKE ALL ON TABLE "public"."league_facts" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."league_facts_meta" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."chat_log" FROM "anon", "authenticated";
GRANT ALL ON TABLE "public"."league_facts" TO "service_role";
GRANT ALL ON TABLE "public"."league_facts_meta" TO "service_role";
GRANT ALL ON TABLE "public"."chat_log" TO "service_role";
