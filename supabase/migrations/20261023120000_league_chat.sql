-- League chat (JITS-42): where its snapshot of the league lives, and a log of
-- what was asked.
--
-- The chat answers by querying a snapshot of the league's history: one SQLite
-- file, rebuilt by scripts/build-league-chat-db.js after every daily refresh
-- and weekly sync, and stored in the private `league-chat` bucket beside the
-- sql.js wasm that wrote it. The `league-chat` edge function loads it, lets a
-- model write the queries, and checks every number in the answer against what
-- the queries returned (services/leagueAgent.js). Model-written SQL never
-- touches this database: it runs against that in-memory copy, which holds only
-- what the site already shows members.
--
-- The bucket has no storage policies, so only the service role (the build
-- script, the edge function) can read or write it. `chat_log` is the service
-- role's alone too, and it is also how the daily cap is counted.
--
-- Applied on merge by deploy-migrations.yml — never also by hand.

-- CI's throwaway database runs without the storage service, so there is no
-- storage schema to insert into there.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('league-chat', 'league-chat', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "public"."chat_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "user_id" "uuid" NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "question" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "answer" "text" NOT NULL DEFAULT '',
    "queries" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "model_calls" integer DEFAULT 0 NOT NULL,
    "problems" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "model" "text",
    "latency_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_log_kind_check" CHECK ("kind" IN ('answer', 'data', 'none', 'off', 'error'))
);

COMMENT ON TABLE "public"."chat_log" IS
  'Every league chat question: what was asked, the queries the model ran (SQL, row count, error), what kind of reply went back (a checked answer, the query results, nothing found, chat switched off, an error), how many drafts it took and why any failed the check. Also counts the daily cap.';

CREATE INDEX IF NOT EXISTS "chat_log_user_created_idx" ON "public"."chat_log" ("user_id", "created_at" DESC);

ALTER TABLE "public"."chat_log" ENABLE ROW LEVEL SECURITY;

-- No policies: the edge function, as the service role, is the only reader and
-- writer. Revoke the default grants so PostgREST does not even list it.
REVOKE ALL ON TABLE "public"."chat_log" FROM "anon", "authenticated";
GRANT ALL ON TABLE "public"."chat_log" TO "service_role";
