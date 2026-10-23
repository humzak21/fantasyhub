-- How many people may submit pick'ems: the denominator of "9 of 14 picked".
--
-- The home page's pick'ems widget counts who has picked and who has entered
-- the TD parlay this week, and "of N" has to be the set of people who *could*
-- have: approved members, which is exactly who `submit_pick_em_picks` and
-- `submit_td_parlay_pick` let through (`is_approved_member()`). The browser
-- cannot count them today -- `list_member_approvals()` and
-- `list_league_members()` are admin-only -- and the season's team count is not
-- the same set: the admin may own no team, and a co-manager owns none.
--
-- So one integer, and nothing else. The fold is `is_approved_member()`'s:
-- approved `member_approvals` rows, plus `league_admins` not already counted
-- (an admin is approved with no row). A count says nothing about who.
--
-- SECURITY DEFINER because `member_approvals` is readable only by its own row
-- and by the admin; STABLE because it reads. EXECUTE goes to `authenticated`
-- only: the widget is approved-members-only, a visitor has no use for the
-- number, and Postgres grants EXECUTE to PUBLIC by default -- which `anon`
-- inherits -- so PUBLIC is revoked too, not just the named roles.

CREATE OR REPLACE FUNCTION "public"."count_approved_members"() RETURNS integer
  LANGUAGE "sql" STABLE SECURITY DEFINER SET "search_path" TO 'public'
  AS $$
  SELECT count(*)::integer FROM (
    SELECT m.user_id FROM public.member_approvals m WHERE m.status = 'approved'
    UNION
    SELECT a.user_id FROM public.league_admins a
  ) AS members
$$;

ALTER FUNCTION "public"."count_approved_members"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."count_approved_members"() IS
  'How many accounts may submit pick''ems: approved member_approvals rows plus admins not already counted -- the same fold as is_approved_member(). One integer, no identities. Executable by authenticated only.';

REVOKE ALL ON FUNCTION "public"."count_approved_members"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."count_approved_members"() FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."count_approved_members"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."count_approved_members"() TO "service_role";
