-- Which seasons actually have a ballot, for the Results tab's season picker.
--
-- The Awards tab was hard-wired to the active season, so the moment a new
-- season went active the previous season's pie charts became unreachable —
-- even though `awards` and `award_votes` are public-read and the rows never
-- went anywhere. Revealing that access needs one thing the client cannot
-- derive cheaply: the list of seasons that were voted on.
--
-- PostgREST cannot aggregate, so the alternative is pulling every vote row to
-- the browser to build a dropdown — ~250 rows a season, growing forever. This
-- view is one round trip and stays one.
--
-- The inner joins are the filter. A season with computed awards but no ballot
-- (2020-24, which were backfilled by `compute_season_awards` and never voted
-- on) does not appear, so the picker never offers a year whose only possible
-- answer is "No votes yet".
--
-- `security_invoker` so the view carries no privilege of its own; every
-- underlying table is already `FOR SELECT USING (true)`.

CREATE OR REPLACE VIEW public.v_award_ballot_seasons
WITH (security_invoker = true) AS
SELECT
    s.id           AS season_id,
    s.year,
    s.name,
    s.is_active,
    s.is_completed,
    count(DISTINCT a.id)      AS voted_award_count,
    count(v.id)               AS vote_count,
    count(DISTINCT v.user_id) AS voter_count
FROM public.seasons s
JOIN public.awards a
  ON a.season_id = s.id
 AND a.source = 'ballot'
 AND a.category = 'voted'
JOIN public.award_votes v
  ON v.award_id = a.id
GROUP BY s.id, s.year, s.name, s.is_active, s.is_completed;

COMMENT ON VIEW public.v_award_ballot_seasons IS
  'Seasons that have at least one vote on a ballot award. Drives the season picker in the Awards Results tab.';

GRANT SELECT ON public.v_award_ballot_seasons TO anon, authenticated, service_role;
