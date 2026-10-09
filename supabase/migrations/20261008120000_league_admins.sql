-- The admin is a row, not an email.
--
-- Until now `public.is_admin()` compared the JWT's email claim against one
-- address written into the baseline. That made "who is the admin" a migration:
-- handing the league to a second person, or covering for the admin while they
-- are away, meant editing a function body, and the address sat in the schema,
-- in every pgTAP test that needed an admin, and in every probe written against
-- the live project. It also tied admin to whatever email the account currently
-- had, so an email change was a loss of admin access with nothing in the log.
--
-- This migration replaces the comparison with a table of user ids and gives
-- the admins a way to manage it from the app. Decisions that shape it:
--
--   1. `is_admin()` keeps its signature and attributes and is redefined with
--      CREATE OR REPLACE, so every policy and function that already calls it --
--      the admin-write RLS on every league table, `can_write_league()`,
--      `is_approved_member()`, the take_events attribution triggers,
--      `list_league_members()`, `list_member_approvals()`,
--      `set_member_approval()`, `delete_member_account()` -- picks up the new
--      definition without being touched. None of them is recreated here except
--      `delete_member_account()`, which gains a refusal (section 7).
--
--   2. The table has no client write policy. Writes go through
--      `set_league_admin()`, which stamps `granted_by` from `auth.uid()` where
--      a policy-gated INSERT would take the client's word for it -- the same
--      shape as `set_member_approval()`.
--
--   3. A BEFORE DELETE trigger refuses two deletes no matter who issues them:
--      an admin removing themselves, and the removal of the last admin. A
--      league with no admin cannot be repaired from the app -- only from the
--      SQL editor -- so the database will not reach that state on its own.
--      Triggers are not bypassed by the service role (the same property
--      `takes_guard_author_update()` relies on), which is the point: the guard
--      holds for the dashboard, scripts and cascades alike.
--
--   4. Admin is keyed on `user_id`, like `league_roles`, so it survives an
--      email change. Nothing here reads `raw_user_meta_data` for anything but a
--      display name; see CLAUDE.md, "Admin is a row in `league_admins`, never an
--      email or the user's own metadata" -- the rule there is about the user being unable
--      to grant themselves admin, and a row only an admin can write keeps it.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."league_admins" (
    "user_id" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "granted_by" "uuid"
);

ALTER TABLE "public"."league_admins" OWNER TO "postgres";

COMMENT ON TABLE "public"."league_admins" IS
  'One row per league admin. is_admin() is true exactly when auth.uid() has a row here. Written only by set_league_admin() (and the service role); there is no client write policy. league_admins_guard_delete refuses removing yourself and removing the last admin.';
COMMENT ON COLUMN "public"."league_admins"."granted_by" IS
  'The admin who granted the row, from auth.uid() inside set_league_admin(). NULL for a row seeded by migration or written by the service role, and after the granting account is deleted.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'league_admins_pkey') THEN
    ALTER TABLE "public"."league_admins" ADD CONSTRAINT "league_admins_pkey" PRIMARY KEY ("user_id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'league_admins_user_id_fkey') THEN
    ALTER TABLE "public"."league_admins"
      ADD CONSTRAINT "league_admins_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'league_admins_granted_by_fkey') THEN
    ALTER TABLE "public"."league_admins"
      ADD CONSTRAINT "league_admins_granted_by_fkey" FOREIGN KEY ("granted_by")
      REFERENCES "auth"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "public"."league_admins" ENABLE ROW LEVEL SECURITY;

-- Admins read the table; nobody else does, and nobody writes it through RLS.
-- Keying this policy on is_admin() does not recurse: is_admin() is SECURITY
-- DEFINER owned by postgres, the table's owner, so its own read of this table
-- is not subject to this policy.
DROP POLICY IF EXISTS "league_admins read admin" ON "public"."league_admins";
CREATE POLICY "league_admins read admin" ON "public"."league_admins"
  FOR SELECT TO "authenticated" USING ("public"."is_admin"());

REVOKE ALL ON TABLE "public"."league_admins" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."league_admins" FROM "anon";
REVOKE ALL ON TABLE "public"."league_admins" FROM "authenticated";
GRANT SELECT ON TABLE "public"."league_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."league_admins" TO "service_role";

-- ---------------------------------------------------------------------------
-- 2. The rule
-- ---------------------------------------------------------------------------
-- Same signature and attributes as the baseline, so nothing that depends on it
-- changes. A NULL auth.uid() (anon, the service role, a direct connection)
-- matches no row and is false, not an error; can_write_league() still covers
-- the service role and direct connections on its own.

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.league_admins where user_id = auth.uid())
$$;

ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_admin"() IS
  'True when auth.uid() has a league_admins row. Sole authority for admin-write RLS policies, and folded into can_write_league() and is_approved_member(). SECURITY DEFINER so it reads league_admins past that table''s RLS. Executable by anon on purpose: policies with no TO clause are evaluated under anon, and a policy calling a function the role cannot execute errors instead of denying.';

-- Postgres grants EXECUTE to PUBLIC by default and `anon` inherits it, so
-- revoking only the named roles is a silent no-op.
REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_admin"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."is_admin"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "service_role";

-- ---------------------------------------------------------------------------
-- 3. Seed the admins
-- ---------------------------------------------------------------------------
-- INSERT ... SELECT from auth.users rather than VALUES: CI replays every
-- migration into an empty database, where a bare insert would violate the FK.
-- In production both accounts exist; if neither matched (a typo in an id) the
-- league would be left with no admin at all, so that case raises and the
-- whole migration rolls back. An empty auth.users is CI and is allowed.

INSERT INTO "public"."league_admins" ("user_id", "granted_by")
SELECT u."id", NULL
FROM "auth"."users" u
WHERE u."id" IN (
  '351ac315-81a2-4867-b584-172cc84e3ced',  -- Humza Khalil (the admin until now)
  '00fc835f-50ed-49d6-a460-862982f2b27a'   -- Harshil Pareek
)
ON CONFLICT ("user_id") DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users)
     AND NOT EXISTS (SELECT 1 FROM public.league_admins) THEN
    RAISE EXCEPTION 'league_admins: no seeded admin matched an account; refusing to leave the league with no admin';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. The guard: never remove yourself, never remove the last admin
-- ---------------------------------------------------------------------------
-- BEFORE DELETE FOR EACH ROW, so it also runs for the cascade from deleting an
-- auth.users row: deleting the last admin's account is refused too, on
-- purpose. A plpgsql trigger function is VOLATILE, so in a multi-row DELETE
-- each row's count sees the rows already deleted by the same statement, and
-- `DELETE FROM league_admins` stops at the last one. (TRUNCATE fires no row
-- trigger; only postgres and the service role hold it.)
--
-- SECURITY DEFINER so the count sees every row whatever the caller's RLS.

CREATE OR REPLACE FUNCTION "public"."league_admins_guard_delete"() RETURNS "trigger"
  LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public'
  AS $$
BEGIN
  IF OLD.user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove your own admin access' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*) FROM public.league_admins) <= 1 THEN
    RAISE EXCEPTION 'The league must keep at least one admin' USING ERRCODE = '22023';
  END IF;

  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."league_admins_guard_delete"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."league_admins_guard_delete"() IS
  'BEFORE DELETE guard on league_admins: refuses removing your own row and removing the last admin, for every caller including the service role and auth.users cascades.';

-- Firing a trigger does not check EXECUTE; nobody calls this directly.
REVOKE ALL ON FUNCTION "public"."league_admins_guard_delete"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."league_admins_guard_delete"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."league_admins_guard_delete"() FROM "authenticated";

DROP TRIGGER IF EXISTS "league_admins_guard_delete" ON "public"."league_admins";
CREATE TRIGGER "league_admins_guard_delete"
  BEFORE DELETE ON "public"."league_admins"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."league_admins_guard_delete"();

-- ---------------------------------------------------------------------------
-- 5. The listing
-- ---------------------------------------------------------------------------
-- Modeled on list_member_approvals(): SECURITY DEFINER over auth.users with
-- the is_admin() guard in the WHERE clause, so a non-admin gets an empty list
-- rather than an error. The display_name expression is copied from there
-- verbatim so a person reads the same in both panels.

CREATE OR REPLACE FUNCTION "public"."list_league_admins"()
RETURNS TABLE (
  "user_id" "uuid",
  "display_name" "text",
  "email" "text",
  "granted_at" timestamp with time zone,
  "granted_by" "uuid"
)
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
    a.granted_at,
    a.granted_by
  FROM public.league_admins a
  JOIN auth.users u ON u.id = a.user_id
  WHERE public.is_admin()
  ORDER BY a.granted_at, 2
$$;

ALTER FUNCTION "public"."list_league_admins"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."list_league_admins"() IS
  'Every league admin with name and email, oldest grant first, for Settings -> Admins. Returns no rows for anyone but an admin -- the is_admin() guard is in the WHERE clause, not in a grant.';

REVOKE ALL ON FUNCTION "public"."list_league_admins"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."list_league_admins"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."list_league_admins"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_league_admins"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_league_admins"() TO "service_role";

-- ---------------------------------------------------------------------------
-- 6. Grant / revoke
-- ---------------------------------------------------------------------------
-- The only write path from the browser. is_admin(), not can_write_league():
-- this acts as a person and records who, and the service role is nobody (it
-- writes the table directly if it ever must). The self-removal check repeats
-- the trigger's so the message is the RPC's own; the last-admin case cannot be
-- reached from here, since a caller who is an admin and is not removing
-- themselves leaves at least their own row.

CREATE OR REPLACE FUNCTION "public"."set_league_admin"(
  "p_user_id" "uuid",
  "p_grant" boolean
) RETURNS boolean
  LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public'
  AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to change who is an admin' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can change who is an admin' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR p_grant IS NULL THEN
    RAISE EXCEPTION 'set_league_admin needs a user and a grant/revoke flag' USING ERRCODE = '22023';
  END IF;

  IF p_grant THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'No account with id %', p_user_id USING ERRCODE = '22023';
    END IF;

    INSERT INTO league_admins (user_id, granted_by)
    VALUES (p_user_id, v_uid)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN FOUND;
  ELSE
    IF p_user_id = v_uid THEN
      RAISE EXCEPTION 'You cannot remove your own admin access' USING ERRCODE = '22023';
    END IF;

    DELETE FROM league_admins WHERE user_id = p_user_id;
    RETURN FOUND;
  END IF;
END;
$$;

ALTER FUNCTION "public"."set_league_admin"("uuid", boolean) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."set_league_admin"("uuid", boolean) IS
  'Admin-only. p_grant true adds the account to league_admins (granted_by = the caller); false removes it. Returns whether a row changed, so granting an existing admin or revoking a non-admin is false, not an error. Refuses removing your own access; the delete trigger also refuses removing the last admin.';

REVOKE ALL ON FUNCTION "public"."set_league_admin"("uuid", boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."set_league_admin"("uuid", boolean) FROM "anon";
REVOKE ALL ON FUNCTION "public"."set_league_admin"("uuid", boolean) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."set_league_admin"("uuid", boolean) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."set_league_admin"("uuid", boolean) TO "service_role";

-- ---------------------------------------------------------------------------
-- 7. Revoke an account: never an admin's
-- ---------------------------------------------------------------------------
-- Body from 20260903120000_member_approvals.sql, verbatim, plus one refusal.
-- Deleting an admin's auth.users row would cascade into league_admins, where
-- the trigger refuses only the last admin -- so without this check one admin
-- could delete another's account outright. Taking away admin is its own,
-- deliberate act in Settings -> Admins first.

CREATE OR REPLACE FUNCTION "public"."delete_member_account"("p_user_id" "uuid") RETURNS boolean
  LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public'
  AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the admin can revoke an account.' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot revoke your own account.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.league_admins WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Revoke admin access before deleting this account' USING ERRCODE = '22023';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;
  RETURN FOUND;
END;
$$;

ALTER FUNCTION "public"."delete_member_account"("uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_member_account"("uuid") IS
  'Admin-only, irreversible: deletes the auth.users row and everything that cascades from it. Refuses the caller''s own id and any account that holds a league_admins row (revoke admin first). The person can sign up again and re-enters the queue.';

REVOKE ALL ON FUNCTION "public"."delete_member_account"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_member_account"("uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."delete_member_account"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."delete_member_account"("uuid") TO "service_role";
