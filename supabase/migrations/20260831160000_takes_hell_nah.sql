-- Takes: "+1" becomes "Hell Nah".
--
-- `take_participants` was a co-sign — "I'm calling this too". It now means the
-- opposite: a member pressing **Hell Nah** is fading the take, and agreeing to
-- cover the author's wager if it hits. The table is unchanged because the shape
-- was never the co-sign; it is "one row per member who opted in against this
-- take, once, withdrawably", and that is exactly as true of a fade. Only the
-- meaning moved, so only the comments and one policy clause move with it.
--
-- The one new rule: **there is nothing to fade on a take with no wager.**
-- Nothing is staked, so there is no side to take and the UI shows no button.
-- That could have stayed a UI rule, but the anon key reaches PostgREST
-- directly and a rule that only exists in a component is not a rule — a
-- hand-rolled POST would otherwise write a row that the board has no way to
-- render and no way to settle. It joins the three conditions already in this
-- policy rather than becoming a trigger, because it is a fact about NEW's
-- parent row and WITH CHECK can see it.
--
-- Existing rows: none. At the time of writing the board holds a single take,
-- no wagers and no participants, so there is nothing to backfill or strand.
-- Should any pre-wager row ever exist, note that the *withdraw* policy is
-- deliberately left alone — backing out of a row that should not exist must
-- stay possible.

COMMENT ON TABLE "public"."take_participants" IS
  'One row per member who said Hell Nah to a take -- fading it, and agreeing to cover the author''s wager if it hits. UNIQUE (take_id, user_id) makes the toggle idempotent; the business rules -- not your own take, nothing after resolution, nothing on a take with no wager -- live in the policy subqueries below rather than in the client.';

-- Same three clauses as before, plus the wager. Recreated whole rather than
-- altered: a policy is replaced, not amended, and writing it out is what makes
-- the diff readable.
DROP POLICY IF EXISTS "take_participants insert own" ON "public"."take_participants";
CREATE POLICY "take_participants insert own" ON "public"."take_participants"
  FOR INSERT TO "authenticated"
  WITH CHECK (("auth"."uid"() = "user_id")
              AND EXISTS (
                SELECT 1 FROM "public"."takes" t
                WHERE t."id" = "take_participants"."take_id"
                  AND t."user_id" <> "auth"."uid"()
                  AND t."status" = 'pending'::"text"
                  AND t."wager" IS NOT NULL
                  AND t."season_id" = "take_participants"."season_id"));
