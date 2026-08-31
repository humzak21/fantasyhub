-- Takes are members-only, at the database.
--
-- `20260831130000_takes.sql` shipped the board as public-read on the reasoning
-- that a visitor should be able to see what the league had called before
-- deciding whether to join in. The league would rather it were private, so the
-- SELECT policies move from `USING (true)` to `TO authenticated`.
--
-- The tab gate in the shell (`customAccess: isAuthenticated` on the takes tab)
-- is the navigation half of this and landed separately. On its own it would
-- have been decoration: the anon key ships in the client bundle and reaches
-- PostgREST directly, so `/rest/v1/takes?select=*` answered a signed-out
-- caller regardless of what the nav did. This file is what actually makes
-- "hidden behind login" true.
--
-- Nothing else needs to change:
--
--   * The `takes admin write` and `take_participants admin write` policies are
--     `FOR ALL`, so the admin keeps a SELECT path of their own.
--   * `service_role` bypasses RLS entirely, so the sync and any script are
--     unaffected.
--   * The `take_participants` INSERT/DELETE policies contain
--     `EXISTS (SELECT 1 FROM public.takes …)` subqueries, which run as the
--     calling user and are therefore subject to the policy below. They are
--     exercised only by `authenticated`, which the new policy admits, so the
--     co-sign rules keep working unchanged -- verified after applying.
--
-- A signed-out caller now reads zero rows rather than an error, which is what
-- RLS does and is the right shape: there is no such thing here as "this board
-- exists but is not for you" to report.

-- ---------------------------------------------------------------------------
-- 1. takes
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public read takes" ON "public"."takes";
DROP POLICY IF EXISTS "Members read takes" ON "public"."takes";

CREATE POLICY "Members read takes" ON "public"."takes"
  FOR SELECT TO "authenticated" USING (true);

COMMENT ON TABLE "public"."takes" IS
  'League predictions, readable by signed-in members only. Any authenticated member posts one; the admin grades it after its milestone passes. Authors may edit the body within 72 hours and delete while unresolved -- enforced by RLS plus takes_guard_author_update(), not by the UI.';

-- ---------------------------------------------------------------------------
-- 2. take_participants
-- ---------------------------------------------------------------------------
-- Moved together with the parent. Leaving the co-signs public would leak the
-- shape of the board -- who joined what, and how many takes there are -- to
-- exactly the caller the change above is meant to exclude.

DROP POLICY IF EXISTS "Public read take_participants" ON "public"."take_participants";
DROP POLICY IF EXISTS "Members read take_participants" ON "public"."take_participants";

CREATE POLICY "Members read take_participants" ON "public"."take_participants"
  FOR SELECT TO "authenticated" USING (true);
