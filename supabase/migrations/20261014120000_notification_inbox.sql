-- Alerts: every push notification a member was sent, kept so it can be read
-- again. A push on iOS is gone the moment it is tapped, and its title is cut
-- to one line on the lock screen, so "what did that say?" had no answer.
--
-- `notification_inbox` is one row per member per notification (not per
-- device: a member with a phone and a laptop was told once). The sender
-- (`scripts/send-notifications.js`, service role) writes it for every kind it
-- sends — pick'ems, takes, matchup facts and test sends — and the Alerts
-- page (`/alerts`, the bell beside the cog) reads it, with the unread count on
-- the bell.
--
-- Members read, mark read and delete their own rows and nothing else. Nobody
-- but the service role inserts: what a member was told is the sender's
-- account, not something a browser can add to. The only column a member may
-- change is `read_at`, and `mark_notifications_read()` stamps it with the
-- database's clock rather than the browser's.
--
-- Applied on merge by deploy-migrations.yml, like every migration since
-- 2026-10-08 — never also by hand.

CREATE TABLE IF NOT EXISTS "public"."notification_inbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "user_id" "uuid" NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone
);

COMMENT ON TABLE "public"."notification_inbox" IS
  'Every push notification sent to a member, one row per member per notification, for the Alerts page. Written by the sender (service role) only.';
COMMENT ON COLUMN "public"."notification_inbox"."kind" IS
  'The notification''s kind as the sender names it: pickems_open, takes_new, matchup_facts:fri, test, …';
COMMENT ON COLUMN "public"."notification_inbox"."read_at" IS
  'When the member marked it read; NULL is unread. Set by mark_notifications_read().';

CREATE INDEX IF NOT EXISTS "notification_inbox_user_created_idx"
  ON "public"."notification_inbox" ("user_id", "created_at" DESC);

ALTER TABLE "public"."notification_inbox" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_inbox read own" ON "public"."notification_inbox";
CREATE POLICY "notification_inbox read own" ON "public"."notification_inbox"
  FOR SELECT TO "authenticated" USING ("user_id" = "auth"."uid"());

DROP POLICY IF EXISTS "notification_inbox mark own" ON "public"."notification_inbox";
CREATE POLICY "notification_inbox mark own" ON "public"."notification_inbox"
  FOR UPDATE TO "authenticated"
  USING ("user_id" = "auth"."uid"())
  WITH CHECK ("user_id" = "auth"."uid"());

DROP POLICY IF EXISTS "notification_inbox delete own" ON "public"."notification_inbox";
CREATE POLICY "notification_inbox delete own" ON "public"."notification_inbox"
  FOR DELETE TO "authenticated" USING ("user_id" = "auth"."uid"());

REVOKE ALL ON TABLE "public"."notification_inbox" FROM "anon";
REVOKE ALL ON TABLE "public"."notification_inbox" FROM "authenticated";
GRANT SELECT, DELETE ON TABLE "public"."notification_inbox" TO "authenticated";
-- Column-level: the policy says whose rows, this says which column. Without
-- it a member could rewrite the title of what they were sent.
GRANT UPDATE ("read_at") ON TABLE "public"."notification_inbox" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_inbox" TO "service_role";

-- Mark the caller's alerts read: the given ids, or every unread one when
-- `p_ids` is NULL. Returns how many changed. SECURITY INVOKER: it touches only
-- the caller's own rows, so the policies above already are the rule.
CREATE OR REPLACE FUNCTION "public"."mark_notifications_read"("p_ids" "uuid"[] DEFAULT NULL)
  RETURNS integer
  LANGUAGE "sql" SECURITY INVOKER
  SET "search_path" TO ''
  AS $$
    WITH marked AS (
      UPDATE public.notification_inbox
      SET read_at = now()
      WHERE user_id = auth.uid()
        AND read_at IS NULL
        AND (p_ids IS NULL OR id = ANY (p_ids))
      RETURNING 1
    )
    SELECT count(*)::integer FROM marked;
  $$;

REVOKE ALL ON FUNCTION "public"."mark_notifications_read"("uuid"[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."mark_notifications_read"("uuid"[]) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."mark_notifications_read"("uuid"[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."mark_notifications_read"("uuid"[]) TO "service_role";
