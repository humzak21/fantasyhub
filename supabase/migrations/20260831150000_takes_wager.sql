-- Takes: what the author is willing to risk on it.
--
-- A take now carries an optional stake -- "$20", "40 FAAB", "my dignity" --
-- which is what members are betting against anyone who thinks the take will
-- not hit. It is deliberately free text and not a number with a unit:
-- the league bets FAAB, cash and worse in the same breath, and a numeric
-- column would force this system to have an opinion about which.
--
-- Three consequences the schema has to absorb:
--
--   * **Optional means NULL, not empty string.** A blank stake and no stake
--     are the same fact, and two spellings of one fact is how a column starts
--     needing `COALESCE` at every read. `takes_wager_check` rejects a
--     whitespace-only value outright; `services/db/takes.js` normalizes to
--     NULL before it ever gets here.
--
--   * **The author may edit it.** `takes_guard_author_update()` enumerates the
--     columns an author may *not* touch, so `wager` is editable by omission --
--     but by accident rather than by intent, which is not a state to leave a
--     security guard in. The function is recreated below with the rule stated,
--     and its exception message updated so a rejected write says something
--     true.
--
--   * **Changing it is an edit.** `set_take_edited_at()` stamps `edited_at`
--     when the body changes; reworking the stake is the same kind of act and
--     has to read as one, or a take whose bet quietly doubled shows no sign of
--     having moved.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."takes"
  ADD COLUMN IF NOT EXISTS "wager" "text";

COMMENT ON COLUMN "public"."takes"."wager" IS
  'Optional. What the author is putting at risk on this take -- FAAB, cash, or otherwise. Free text on purpose: the league bets in several currencies at once and a typed column would have to pick one. NULL means no stake; the CHECK forbids the empty-string spelling of the same thing.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takes_wager_check') THEN
    ALTER TABLE "public"."takes"
      ADD CONSTRAINT "takes_wager_check"
      CHECK (("wager" IS NULL) OR ("char_length"("btrim"("wager")) BETWEEN 1 AND 200));
  END IF;
END $$;

-- The table's own description promised "the body" was all an author could
-- edit. It is now two columns, so say so.
COMMENT ON TABLE "public"."takes" IS
  'League predictions. Any authenticated member posts one; members read them. The admin grades it after its milestone passes. Authors may edit the body and the wager within 72 hours and delete while unresolved -- enforced by RLS plus takes_guard_author_update(), not by the UI.';

-- ---------------------------------------------------------------------------
-- 2. Reworking the stake counts as an edit
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."set_take_edited_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    IF NEW.body IS DISTINCT FROM OLD.body
    OR NEW.wager IS DISTINCT FROM OLD.wager THEN
      NEW.edited_at := now();
    END IF;
    RETURN NEW;
  END;
  $$;

ALTER FUNCTION "public"."set_take_edited_at"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."set_take_edited_at"() IS
  'Stamps takes.edited_at when the body or the wager actually changes, so the "edited" indicator is a fact about the row rather than something the client asserts.';

-- ---------------------------------------------------------------------------
-- 3. The author's editable surface, stated rather than implied
-- ---------------------------------------------------------------------------
-- Same enumeration as before -- wager is absent from it, which is what permits
-- the edit -- but the message no longer claims the body is the only column,
-- and the comment records that the omission is deliberate.
--
-- `can_write_league()` rather than `is_admin()`, per CLAUDE.md: the service
-- role bypasses RLS but *not* triggers, and `is_admin()` reads a JWT email the
-- service role does not have.

CREATE OR REPLACE FUNCTION "public"."takes_guard_author_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    IF public.can_write_league() THEN
      RETURN NEW;
    END IF;

    -- Everything an author may not move. `body` and `wager` are the two
    -- columns deliberately missing from this list.
    IF NEW.season_id   IS DISTINCT FROM OLD.season_id
    OR NEW.user_id     IS DISTINCT FROM OLD.user_id
    OR NEW.target_type IS DISTINCT FROM OLD.target_type
    OR NEW.target_week IS DISTINCT FROM OLD.target_week
    OR NEW.status      IS DISTINCT FROM OLD.status
    OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
    OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
    OR NEW.created_at  IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Only the body and wager of a take may be edited'
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
  END;
  $$;

ALTER FUNCTION "public"."takes_guard_author_update"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."takes_guard_author_update"() IS
  'Restricts a non-privileged UPDATE on takes to the body and wager columns. RLS cannot express this: WITH CHECK sees NEW only and cannot compare it to OLD.';

-- Firing a trigger does not check EXECUTE -- that is settled at CREATE TRIGGER
-- time -- so revoking costs the triggers nothing and keeps both functions off
-- the REST surface. `public` as well as the named roles: Postgres grants
-- EXECUTE to PUBLIC by default and `anon` inherits it.
REVOKE ALL ON FUNCTION "public"."set_take_edited_at"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."set_take_edited_at"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."set_take_edited_at"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."takes_guard_author_update"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."takes_guard_author_update"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."takes_guard_author_update"() FROM "authenticated";
