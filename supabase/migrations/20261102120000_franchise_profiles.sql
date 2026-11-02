-- The member profile: what a franchise says about itself.
--
-- /profile/<franchise id> is the History franchise profile with a customizable
-- head on it: an avatar, a bio, a favourite NFL team and player, an accent
-- colour. Every team name on the site links to it. Decisions that shape this:
--
--   1. The row belongs to the franchise, not the account. The page is a
--      franchise's: it exists for a franchise with no account (one left the
--      league, one member's display name matches nobody), and two accounts can
--      speak for one franchise. So `franchise_profiles` is keyed on the
--      franchise, and "whose row is it" is the next point.
--
--   2. Ownership is `franchise_accounts`, written only by an admin. Everything
--      else in the app ties an account to a team by comparing a display name
--      with `teams.owner`, which is fine for deciding what to unmask and not
--      for deciding who may write: `raw_user_meta_data` is `user_metadata`,
--      which `supabase.auth.updateUser({ data })` rewrites from any signed-in
--      account, so a name compare here would let a member retype their name
--      and edit somebody else's page. See CLAUDE.md, "Admin is a row in
--      `league_admins`, never an email or the user's own metadata". The seed
--      below reads the display name once, in a migration, as a starting point;
--      nothing reads it for authorization afterwards.
--
--   3. Members write their own row; an admin writes any row, every field.
--      `can_edit_franchise_profile()` is that rule in one place. There is no
--      DELETE policy: clearing a profile is an UPDATE to nulls.
--
--   4. Reads are approved members only, like Takes. `franchise_profiles` holds
--      what a member wrote about themselves, so a signed-out or unapproved
--      caller reads zero rows straight from PostgREST; the shell's gate on the
--      tab is the affordance and this is the rule.
--
--   5. Avatars are a public bucket with unguessable paths. A public bucket is
--      what lets `<img src>` load without a signed URL on every chip in a
--      fourteen-row table; a file's path carries a random uuid and listing is
--      limited to the owner's folder, so a visitor cannot discover one.
--      Writes are limited to the franchise's own folder, by the same rule as
--      the row. The browser downsizes before uploading (utils/avatarImage.js);
--      the bucket's limits are what actually hold.
--
--   6. An ESPN logo is a pointer, not a copy. The browser cannot read ESPN (the
--      league is private and only the sync holds the cookies), so the rosters
--      step stores each team's logo in `teams.espn_logo_url`, and
--      `avatar_source = 'espn'` means "use the franchise's current logo". A
--      rename-season logo change then lands by itself.
--
-- Applied on merge by deploy-migrations.yml, before the bundle that reads it.

-- ---------------------------------------------------------------------------
-- 1. Which accounts speak for a franchise
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."franchise_accounts" (
    "user_id" "uuid" NOT NULL PRIMARY KEY REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "franchise_id" "uuid" NOT NULL REFERENCES "public"."league_franchises"("id") ON DELETE CASCADE,
    "linked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "linked_by" "uuid" REFERENCES "auth"."users"("id") ON DELETE SET NULL
);

ALTER TABLE "public"."franchise_accounts" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "idx_franchise_accounts_franchise"
  ON "public"."franchise_accounts" ("franchise_id");

COMMENT ON TABLE "public"."franchise_accounts" IS
  'Which accounts may edit which franchise''s profile. Written only by set_franchise_account() (and the service role). An account belongs to at most one franchise; a franchise can have several accounts, or none.';
COMMENT ON COLUMN "public"."franchise_accounts"."linked_by" IS
  'The admin who linked the account, from auth.uid(). NULL for a row seeded by migration.';

ALTER TABLE "public"."franchise_accounts" ENABLE ROW LEVEL SECURITY;

-- A member reads their own link, which is how the page knows to offer Edit. An
-- admin reads them all for Settings -> Franchises. Nobody writes through RLS.
DROP POLICY IF EXISTS "franchise_accounts read own" ON "public"."franchise_accounts";
CREATE POLICY "franchise_accounts read own" ON "public"."franchise_accounts"
  FOR SELECT TO "authenticated"
  USING ("user_id" = "auth"."uid"() OR "public"."is_admin"());

REVOKE ALL ON TABLE "public"."franchise_accounts" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."franchise_accounts" FROM "anon";
REVOKE ALL ON TABLE "public"."franchise_accounts" FROM "authenticated";
GRANT SELECT ON TABLE "public"."franchise_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."franchise_accounts" TO "service_role";

-- Link an account, or unlink it with a NULL franchise. Stamps `linked_by`
-- server-side, where a policy-gated INSERT would take the client's word for it.
CREATE OR REPLACE FUNCTION "public"."set_franchise_account"("p_user_id" "uuid", "p_franchise_id" "uuid")
RETURNS void
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can link an account to a franchise'
      using errcode = '42501';
  end if;

  if p_franchise_id is null then
    delete from public.franchise_accounts where user_id = p_user_id;
    return;
  end if;

  insert into public.franchise_accounts (user_id, franchise_id, linked_by)
  values (p_user_id, p_franchise_id, auth.uid())
  on conflict (user_id) do update
    set franchise_id = excluded.franchise_id,
        linked_at = now(),
        linked_by = excluded.linked_by;
end;
$$;

ALTER FUNCTION "public"."set_franchise_account"("uuid", "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."set_franchise_account"("uuid", "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."set_franchise_account"("uuid", "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."set_franchise_account"("uuid", "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."set_franchise_account"("uuid", "uuid") TO "service_role";

-- The seed: every approved account whose display name is exactly an owner's,
-- which is 14 accounts across 13 franchises today (two accounts are the same
-- person), and the one account whose name does not match its owner in full.
-- Only these two statements read the display name. The second names ids
-- because a partial match is exactly what a rule should not guess at.
INSERT INTO "public"."franchise_accounts" ("user_id", "franchise_id")
SELECT u.id, f.id
FROM auth.users u
JOIN public.member_approvals a ON a.user_id = u.id AND a.status = 'approved'
JOIN public.league_franchises f
  ON lower(btrim(f.owner_name)) = lower(btrim(coalesce(
       u.raw_user_meta_data ->> 'full_name',
       u.raw_user_meta_data ->> 'name',
       '')))
ON CONFLICT ("user_id") DO NOTHING;

INSERT INTO "public"."franchise_accounts" ("user_id", "franchise_id")
SELECT u.id, f.id
FROM auth.users u
JOIN public.league_franchises f ON f.id = 'f35b0eb5-3841-42d7-8402-2a898c62195f'
WHERE u.id = '77686211-a35a-4ffd-81b1-2e919fcf5b48'
ON CONFLICT ("user_id") DO NOTHING;

-- An empty seed against a real league would leave every member unable to edit
-- their page with nothing to say why. CI's replay has no accounts and passes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users)
     AND EXISTS (SELECT 1 FROM public.league_franchises)
     AND EXISTS (SELECT 1 FROM public.member_approvals WHERE status = 'approved')
     AND NOT EXISTS (SELECT 1 FROM public.franchise_accounts) THEN
    RAISE EXCEPTION 'franchise_accounts seeded nothing; refusing to continue';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. The rule
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: `franchise_accounts`' own-row read policy already answers
-- this, and `is_admin()` / `is_approved_member()` are DEFINER themselves.

CREATE OR REPLACE FUNCTION "public"."can_edit_franchise_profile"("p_franchise_id" "uuid")
RETURNS boolean
LANGUAGE "sql" STABLE
SET "search_path" TO 'public'
AS $$
  select public.is_admin()
      or (public.is_approved_member()
          and exists (
            select 1 from public.franchise_accounts fa
            where fa.user_id = auth.uid()
              and fa.franchise_id = p_franchise_id))
$$;

ALTER FUNCTION "public"."can_edit_franchise_profile"("uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."can_edit_franchise_profile"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_edit_franchise_profile"("uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."can_edit_franchise_profile"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_edit_franchise_profile"("uuid") TO "service_role";

-- The same rule for a storage path, `<franchise id>/<file>`. Compared as text,
-- so a folder that is not a uuid is a refusal and not a cast error.
CREATE OR REPLACE FUNCTION "public"."can_edit_avatar_path"("p_name" "text")
RETURNS boolean
LANGUAGE "sql" STABLE
SET "search_path" TO 'public'
AS $$
  select public.is_admin()
      or (public.is_approved_member()
          and exists (
            select 1 from public.franchise_accounts fa
            where fa.user_id = auth.uid()
              and fa.franchise_id::text = split_part(p_name, '/', 1)))
$$;

ALTER FUNCTION "public"."can_edit_avatar_path"("text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."can_edit_avatar_path"("text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_edit_avatar_path"("text") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."can_edit_avatar_path"("text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_edit_avatar_path"("text") TO "service_role";

-- ---------------------------------------------------------------------------
-- 3. The profile
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."franchise_profiles" (
    "franchise_id" "uuid" NOT NULL PRIMARY KEY REFERENCES "public"."league_franchises"("id") ON DELETE CASCADE,
    "bio" "text",
    "favorite_nfl_team" "text",
    "favorite_player_id" "uuid" REFERENCES "public"."players"("id") ON DELETE SET NULL,
    "favorite_player_name" "text",
    "accent_hue" smallint,
    "avatar_source" "text",
    "avatar_path" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    CONSTRAINT "franchise_profiles_bio_length" CHECK (char_length("bio") <= 500),
    CONSTRAINT "franchise_profiles_nfl_team_shape" CHECK ("favorite_nfl_team" ~ '^[A-Z]{2,3}$'),
    CONSTRAINT "franchise_profiles_player_name_length" CHECK (char_length("favorite_player_name") <= 100),
    CONSTRAINT "franchise_profiles_accent_hue_range" CHECK ("accent_hue" BETWEEN 0 AND 359),
    CONSTRAINT "franchise_profiles_avatar_source_check" CHECK ("avatar_source" IN ('upload', 'espn')),
    -- An upload names a file in this franchise's own folder, so a row cannot
    -- point at another franchise's picture. `espn` carries no path.
    CONSTRAINT "franchise_profiles_avatar_path_check" CHECK (
      ("avatar_source" = 'upload'
        AND "avatar_path" IS NOT NULL
        AND "avatar_path" LIKE "franchise_id"::text || '/%')
      OR ("avatar_source" IS DISTINCT FROM 'upload' AND "avatar_path" IS NULL)
    )
);

ALTER TABLE "public"."franchise_profiles" OWNER TO "postgres";

COMMENT ON TABLE "public"."franchise_profiles" IS
  'What a franchise says about itself on /profile/<id>. Approved members read; can_edit_franchise_profile() writes. A franchise with no row has nothing customized.';
COMMENT ON COLUMN "public"."franchise_profiles"."favorite_player_name" IS
  'Stays readable if the player row goes, the way td_parlay_picks.player_name_raw does. Canonicalized from `players` by the stamp trigger when an id is given.';
COMMENT ON COLUMN "public"."franchise_profiles"."accent_hue" IS
  'An oklch hue. The palette''s lightness and chroma stay fixed, so a member can pick a colour but not one that cannot be read on black.';
COMMENT ON COLUMN "public"."franchise_profiles"."avatar_source" IS
  'upload: `avatar_path` in the profile-avatars bucket. espn: the franchise''s newest teams.espn_logo_url. NULL: the team''s initials.';

-- Who and when come from the database, and a chosen player's name comes from
-- the players table, so none of the three is the client's to state.
CREATE OR REPLACE FUNCTION "public"."franchise_profiles_stamp"()
RETURNS trigger
LANGUAGE "plpgsql"
SET "search_path" TO 'public'
AS $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.favorite_player_id is not null then
    select p.name into new.favorite_player_name
    from public.players p
    where p.id = new.favorite_player_id;
  end if;

  return new;
end;
$$;

ALTER FUNCTION "public"."franchise_profiles_stamp"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "franchise_profiles_stamp" ON "public"."franchise_profiles";
CREATE TRIGGER "franchise_profiles_stamp"
  BEFORE INSERT OR UPDATE ON "public"."franchise_profiles"
  FOR EACH ROW EXECUTE FUNCTION "public"."franchise_profiles_stamp"();

ALTER TABLE "public"."franchise_profiles" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read franchise_profiles" ON "public"."franchise_profiles";
CREATE POLICY "Members read franchise_profiles" ON "public"."franchise_profiles"
  FOR SELECT TO "authenticated"
  USING ("public"."is_approved_member"());

DROP POLICY IF EXISTS "franchise_profiles insert own" ON "public"."franchise_profiles";
CREATE POLICY "franchise_profiles insert own" ON "public"."franchise_profiles"
  FOR INSERT TO "authenticated"
  WITH CHECK ("public"."can_edit_franchise_profile"("franchise_id"));

DROP POLICY IF EXISTS "franchise_profiles update own" ON "public"."franchise_profiles";
CREATE POLICY "franchise_profiles update own" ON "public"."franchise_profiles"
  FOR UPDATE TO "authenticated"
  USING ("public"."can_edit_franchise_profile"("franchise_id"))
  WITH CHECK ("public"."can_edit_franchise_profile"("franchise_id"));

REVOKE ALL ON TABLE "public"."franchise_profiles" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."franchise_profiles" FROM "anon";
REVOKE ALL ON TABLE "public"."franchise_profiles" FROM "authenticated";
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."franchise_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."franchise_profiles" TO "service_role";

-- ---------------------------------------------------------------------------
-- 4. The ESPN logo
-- ---------------------------------------------------------------------------
-- Rendered only as an image, and only ever an https URL, so a logo field ESPN
-- serves oddly cannot end up on a page as anything else. The mapper drops
-- anything else before it gets here.

ALTER TABLE "public"."teams" ADD COLUMN IF NOT EXISTS "espn_logo_url" "text";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_espn_logo_url_https') THEN
    ALTER TABLE "public"."teams"
      ADD CONSTRAINT "teams_espn_logo_url_https" CHECK ("espn_logo_url" ~ '^https://');
  END IF;
END $$;

COMMENT ON COLUMN "public"."teams"."espn_logo_url" IS
  'ESPN''s team logo, from the mTeam view, refreshed by the sync''s rosters step. What avatar_source = ''espn'' points at.';

-- ---------------------------------------------------------------------------
-- 5. The avatars
-- ---------------------------------------------------------------------------
-- CI's throwaway database runs without the storage service, so there is no
-- storage schema to touch there. can_edit_avatar_path() above has no storage
-- dependency, which is what lets the pgTAP suite test the rule anyway.

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'profile-avatars',
    'profile-avatars',
    true,
    1048576,
    ARRAY['image/webp', 'image/jpeg', 'image/png']
  )
  ON CONFLICT (id) DO NOTHING;

  DROP POLICY IF EXISTS "profile avatars read own" ON storage.objects;
  CREATE POLICY "profile avatars read own" ON storage.objects
    FOR SELECT TO "authenticated"
    USING ("bucket_id" = 'profile-avatars' AND public.can_edit_avatar_path("name"));

  DROP POLICY IF EXISTS "profile avatars insert own" ON storage.objects;
  CREATE POLICY "profile avatars insert own" ON storage.objects
    FOR INSERT TO "authenticated"
    WITH CHECK ("bucket_id" = 'profile-avatars' AND public.can_edit_avatar_path("name"));

  DROP POLICY IF EXISTS "profile avatars delete own" ON storage.objects;
  CREATE POLICY "profile avatars delete own" ON storage.objects
    FOR DELETE TO "authenticated"
    USING ("bucket_id" = 'profile-avatars' AND public.can_edit_avatar_path("name"));
END
$$;
