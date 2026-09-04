-- Drop every policy that decides "admin" from the user's own metadata.
--
-- The pre-refactor schema keyed admin write access on
-- `auth.users.raw_user_meta_data ->> 'is_admin' = 'true'`. That column is the
-- user's *own* metadata: `supabase.auth.updateUser({ data: { is_admin: 'true' } })`
-- writes it, from any signed-in account, with no confirmation. A policy that
-- reads it is a policy any member can satisfy by editing their profile.
--
-- 2026-08-06 replaced that rule with `public.is_admin()` (the JWT email claim)
-- everywhere it was found, but two copies survived the baseline: the
-- `"Admin write access"` FOR ALL policies on `transactions` and
-- `league_franchises`. They sat beside the new `"<table> admin write"`
-- policies, and permissive policies OR together, so each was a second door.
--
-- Found 2026-09-04 in the login audit. They were not exploitable on that day
-- for one accidental reason: the `authenticated` role holds no SELECT on
-- `auth.users`, so the subquery raised "permission denied for table users"
-- instead of returning true (verified with a role-impersonating probe that
-- set the metadata on a real member's row inside a rolled-back transaction).
-- The same error would have refused the *admin's* own browser writes to
-- those two tables. One `GRANT SELECT ON auth.users TO authenticated` --
-- which is exactly the hint the error message prints -- would have turned
-- the refusal into a grant. A rule that is only safe while a different
-- mistake is not made is not a rule, so the policies go.
--
-- Written as a sweep rather than two named drops so that a copy on a table
-- this file does not know about -- the dead history tables carried the same
-- policy before they were dropped -- is caught too, and so the file is a
-- no-op on the empty database CI replays the chain into.

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ILIKE '%raw_user_meta_data%' OR with_check ILIKE '%raw_user_meta_data%')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    RAISE NOTICE 'dropped metadata-keyed policy % on %.%', p.policyname, p.schemaname, p.tablename;
  END LOOP;
END $$;

-- `transactions` keeps its `"transactions admin write"` policy, so the admin
-- loses nothing there. `league_franchises` never got one in the 2026-08-06
-- sweep -- the metadata policy was its *only* write policy, which after the
-- drop above leaves the table with no client write path at all. The browser
-- does not write it today (the sync does, as service_role, which bypasses
-- RLS), but every league table is public-read / is_admin()-write by
-- convention and this one should not be the exception that has to be
-- rediscovered.

DROP POLICY IF EXISTS "league_franchises admin write" ON "public"."league_franchises";
CREATE POLICY "league_franchises admin write" ON "public"."league_franchises"
  USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());
