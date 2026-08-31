-- Who the admin can hand a role to.
--
-- `league_roles` is keyed on `auth.users.id`, and nothing in the app could turn
-- that into a list of people to choose from: `get_user_display_names` resolves
-- ids you already have, and `auth.users` is not readable from the client at
-- all. So the only way to grant the parlay commissioner role was an INSERT
-- typed by hand with a uuid copied out of the dashboard.
--
-- This is the missing half. It exists so the grant can be a UI on the settings
-- page rather than a migration, which matters because the role is not a
-- one-time decision -- it changes hands, and it can be held by more than one
-- person at a time.
--
-- The email is included deliberately: two of this league's accounts share a
-- display name, and picking the wrong one silently grants the wrong person.

CREATE OR REPLACE FUNCTION "public"."list_league_members"()
RETURNS TABLE ("id" "uuid", "display_name" "text", "email" "text", "created_at" timestamp with time zone)
LANGUAGE "sql" STABLE SECURITY DEFINER SET "search_path" TO 'public'
AS $$
  SELECT
    u.id,
    COALESCE(
      NULLIF(btrim(u.raw_user_meta_data ->> 'name'), ''),
      NULLIF(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      split_part(u.email::text, '@', 1)
    ) AS display_name,
    u.email::text,
    u.created_at
  FROM auth.users u
  -- The guard is inside the body, so a non-admin gets an empty list rather
  -- than an error. This function is SECURITY DEFINER over auth.users; without
  -- this line it would hand every signed-in user the league's email addresses.
  WHERE public.is_admin()
  ORDER BY 2, 3
$$;

ALTER FUNCTION "public"."list_league_members"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."list_league_members"() IS
  'Every account, for the admin''s role-assignment UI. Returns no rows for anyone but the admin -- the is_admin() guard is in the WHERE clause, not in a grant.';

-- Postgres grants EXECUTE to PUBLIC by default and `anon` inherits it, so
-- revoking only the named roles is a silent no-op.
REVOKE ALL ON FUNCTION "public"."list_league_members"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."list_league_members"() FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."list_league_members"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_league_members"() TO "service_role";
