-- Close the pick'ems submission window in the database.
--
-- `submit_pick_em_picks` has enforced no deadline since it was written. The
-- form hides itself once the week closes, but the anon key reaches PostgREST
-- directly and this is a SECURITY DEFINER function granted to every
-- authenticated user -- so a member could POST picks for a week whose games
-- had already been played, and the board would show them as though they had
-- been made on time. A rule that lives only in a component is not a rule.
-- (Recorded as open in 20260828120000_td_parlay.sql's future-work note; this
-- is item 3 of it.)
--
-- The guard is the same one `submit_td_parlay_pick` already carries, word for
-- word, because the two forms submit together and a window that means one
-- thing for the parlay and another for the picks would be its own bug:
--
--   * `auth.uid()` NULL is 42501 -- not a NULL `user_id` row inserted quietly.
--   * `[submission_opens_at, submission_closes_at)` -- half open, so the close
--     time is the first instant you are late.
--   * `is_closed` is honoured through `COALESCE(..., false)`: the column is
--     nullable and `now() >= x OR NULL` is NULL, which is not TRUE, so an
--     unguarded read would let a manually-closed week keep accepting picks.
--
-- Signature and return shape are unchanged, so no client changes: the DELETE
-- and the per-pick INSERT loop below are the original body verbatim.

CREATE OR REPLACE FUNCTION "public"."submit_pick_em_picks"(
  "p_pick_em_week_id" "uuid",
  "p_picks" "jsonb"
) RETURNS TABLE("submission_id" "uuid", "game_id" "uuid", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_week    pick_em_weeks%ROWTYPE;
    v_pick JSONB;
    v_new_submission_id UUID;
    v_game_id_val UUID;
    v_predicted_winner_val UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be signed in to submit picks.'
          USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_week FROM pick_em_weeks WHERE id = p_pick_em_week_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No pick''em week %', p_pick_em_week_id USING ERRCODE = '22023';
    END IF;

    IF now() < v_week.submission_opens_at THEN
        RAISE EXCEPTION 'Picks for week % are not open yet (opens %).',
          v_week.week_number, v_week.submission_opens_at USING ERRCODE = '22023';
    END IF;

    -- Half-open interval: the close time is the first instant you are late.
    IF now() >= v_week.submission_closes_at OR COALESCE(v_week.is_closed, false) THEN
        RAISE EXCEPTION 'Picks for week % are closed.', v_week.week_number
          USING ERRCODE = '22023';
    END IF;

    -- First, delete any existing picks for this user and week
    DELETE FROM pick_em_submissions
    WHERE pick_em_week_id = p_pick_em_week_id
    AND user_id = v_user_id;

    -- Process each pick
    FOR v_pick IN SELECT * FROM jsonb_array_elements(p_picks)
    LOOP
        -- Extract values from JSONB
        v_game_id_val := (v_pick->>'gameId')::UUID;
        v_predicted_winner_val := (v_pick->>'predictedWinnerTeamId')::UUID;

        -- Simple insert with explicit column names
        INSERT INTO pick_em_submissions (
            pick_em_week_id,
            game_id,
            predicted_winner_team_id,
            confidence_level,
            user_id
        )
        VALUES (
            p_pick_em_week_id,
            v_game_id_val,
            v_predicted_winner_val,
            1,
            v_user_id
        )
        RETURNING pick_em_submissions.id INTO v_new_submission_id;

        -- Return the result using our local variables
        RETURN QUERY SELECT
            v_new_submission_id,
            v_game_id_val,
            'success'::TEXT;
    END LOOP;
END;
$$;

ALTER FUNCTION "public"."submit_pick_em_picks"("uuid", "jsonb") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."submit_pick_em_picks"("uuid", "jsonb") IS
  'Replace the caller''s picks for a week. Raises outside [submission_opens_at, submission_closes_at) and on a closed week -- the same window submit_td_parlay_pick enforces.';

-- Re-asserted, not assumed. `CREATE OR REPLACE` keeps the existing grants, but
-- restating them is what makes this file describe the function's whole access
-- story rather than half of it. Postgres grants EXECUTE to PUBLIC by default
-- and `anon` inherits it, so revoking only the named roles is a silent no-op:
-- PUBLIC has to go first.
REVOKE ALL ON FUNCTION "public"."submit_pick_em_picks"("uuid", "jsonb") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."submit_pick_em_picks"("uuid", "jsonb") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."submit_pick_em_picks"("uuid", "jsonb") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."submit_pick_em_picks"("uuid", "jsonb") TO "service_role";
