-- The TD parlay board shows picks as they are submitted.
--
-- `20260828120000_td_parlay.sql` withheld everyone else's pick until the week's
-- `submission_closes_at`, on the reasoning that nobody should see your player
-- before they commit to theirs. The league has decided the opposite: the board
-- is part of the fun while the window is open, and it is the *only* way to see
-- who has not entered yet in time to chase them.
--
-- This has to happen here and nowhere else. The old comment on that policy is
-- still true in the direction that matters -- the anon key reaches PostgREST
-- directly, so a UI that simply started rendering the list would have been
-- rendering an empty one, and a UI that "hid" picks would hide nothing. The row
-- filter is the rule; this changes the rule.
--
-- The shape matches `pick_em_submissions`, which has carried
-- `Allow public read access` since the baseline: the pick'ems and the parlay
-- are one form with one window, and a board that was public for one half and
-- members-only for the other would be its own bug. Names are still not exposed
-- by this -- `td_parlay_picks` stores a uuid, and `get_user_display_names` is
-- the public-safe resolver the rest of the app already uses.

DROP POLICY IF EXISTS "td_parlay_picks read after close" ON "public"."td_parlay_picks";

DROP POLICY IF EXISTS "td_parlay_picks read all" ON "public"."td_parlay_picks";
CREATE POLICY "td_parlay_picks read all" ON "public"."td_parlay_picks"
  FOR SELECT USING (true);

-- `td_parlay_picks read own` and `td_parlay_picks read privileged` are left in
-- place even though a permissive `USING (true)` subsumes both. They cost
-- nothing (multiple permissive SELECT policies OR together, and the planner
-- short-circuits on the constant), and they are what a future narrowing of the
-- public policy would fall back to -- deleting them would make "members only"
-- a change that silently locks a member out of their own row.

COMMENT ON TABLE "public"."td_parlay_picks" IS
  'One touchdown pick per member per pick''em week. Readable by anyone, as submitted -- the week''s picks are not held back to the deadline. Written only through submit_td_parlay_pick(); there is no user INSERT/UPDATE policy, and that is where the deadline is enforced.';
