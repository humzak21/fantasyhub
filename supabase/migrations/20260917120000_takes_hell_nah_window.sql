-- Takes: a Hell Nah closes three days after the take last moved.
--
-- Until now a fade could be placed, and taken back, at any point before the
-- admin graded the take. Both halves of that were a problem, and they are the
-- same problem seen from two sides: a take posted in September and resolving at
-- the end of the season was open to fresh Hell Nahs in December, by which point
-- the football has answered most of the question; and anyone already on the
-- other side of it could step off just as late, for exactly the same reason.
-- A bet you can join or leave once you know the answer is not a bet.
--
-- So one window governs both: `now() < coalesce(edited_at, created_at) +
-- interval '72 hours'`.
--
--   * **Measured from the last edit, not from posting.** The author has 72
--     hours to reword a take and to restate its stake (`takes author edit`),
--     and a reworded take is a different sentence from the one people faded.
--     Resetting the clock is what keeps the fade an agreement to *this*
--     wording: somebody who faded "Bijan finishes top 3" and woke up to
--     "Bijan finishes top 5" gets their three days back, and so does everybody
--     who had not decided yet. `set_take_edited_at()` stamps that column only
--     when the body or the wager actually changes, so a grade or a milestone
--     move does not reopen anything.
--
--   * **The same expression in both policies.** Fading and un-fading are one
--     rule, and writing it twice in one migration is the only way to keep the
--     two from drifting: a window that closed for joining but stayed open for
--     leaving would be strictly worse than no window at all, because only the
--     side with something to lose would use it.
--
--   * **The admin is untouched.** `take_participants admin write` is a
--     separate permissive `FOR ALL` policy and permissive policies OR
--     together, so the commissioner can still add or remove a Hell Nah on a
--     take of any age — which is what makes a genuine mistake fixable without
--     a migration. The admin's own writes are attributed as "Admin" by
--     `log_take_participant_event()` already.
--
-- Existing rows: nothing is deleted or altered. Fades already placed stand;
-- what changes is that the ones on takes older than three days can no longer
-- be withdrawn by their owner, which is the rule the league asked for applied
-- to the board as it stands.
--
-- `src/components/takes/milestones.js` mirrors this as `FADE_WINDOW_MS`,
-- `canFade` and `canWithdrawFade`, so the UI does not render a button whose
-- only outcome is an error. Changing the interval here means changing it
-- there.

-- Each body below is the *current* policy verbatim -- which since
-- `20260903120000_member_approvals.sql` means `is_approved_member()` leads it,
-- and since `20260831160000_takes_hell_nah.sql` means the insert requires a
-- wager -- plus the window. A policy is replaced whole rather than amended, so
-- the clause that is easiest to lose here is the one that was added last:
-- dropping the approval guard while rewriting for the deadline would quietly
-- reopen the board's write paths to every signed-up visitor.

COMMENT ON TABLE "public"."take_participants" IS
  'One row per approved member who said Hell Nah to a take -- fading it, and agreeing to cover the author''s wager if it hits. UNIQUE (take_id, user_id) makes the toggle idempotent; the business rules -- approved account, not your own take, nothing after resolution, nothing on a take with no wager, and nothing once the take has been settled for 72 hours -- live in the policy subqueries rather than in the client.';

DROP POLICY IF EXISTS "take_participants insert own" ON "public"."take_participants";
CREATE POLICY "take_participants insert own" ON "public"."take_participants"
  FOR INSERT TO "authenticated"
  WITH CHECK ("public"."is_approved_member"()
              AND ("auth"."uid"() = "user_id")
              AND EXISTS (
                SELECT 1 FROM "public"."takes" t
                WHERE t."id" = "take_participants"."take_id"
                  AND t."user_id" <> "auth"."uid"()
                  AND t."status" = 'pending'::"text"
                  AND t."wager" IS NOT NULL
                  AND t."season_id" = "take_participants"."season_id"
                  AND "now"() < COALESCE(t."edited_at", t."created_at") + interval '72 hours'));

-- Withdrawing gains the same window. It keeps the `status = 'pending'` clause
-- as well, which is now redundant for any take older than the window but is
-- the clause that actually states the older rule -- a graded take is league
-- record either way, and leaving it in means this policy still says so if the
-- interval ever changes.
--
-- Note there is deliberately no grace for a take carrying no `created_at`: the
-- column is defaulted rather than NOT NULL, and such a row compares NULL and
-- is refused rather than staying open forever.
DROP POLICY IF EXISTS "take_participants withdraw own" ON "public"."take_participants";
CREATE POLICY "take_participants withdraw own" ON "public"."take_participants"
  FOR DELETE TO "authenticated"
  USING ("public"."is_approved_member"()
         AND ("auth"."uid"() = "user_id")
         AND EXISTS (
           SELECT 1 FROM "public"."takes" t
           WHERE t."id" = "take_participants"."take_id"
             AND t."status" = 'pending'::"text"
             AND "now"() < COALESCE(t."edited_at", t."created_at") + interval '72 hours'));
