-- Drop the ESPN staging layer.
--
-- `scripts/sync-schedule.js` and `scripts/sync-week.js` now write `teams` and
-- `games` directly through `services/db/games.js::upsertEspnGames`. Nothing
-- reads or writes these tables any more, and the function that bridged them
-- into `games` was the source of the defects the direct writer fixes: it
-- matched teams by owner-name string equality, dropped `espn_matchup_id`,
-- flattened the playoff bracket to a flat 'playoff' and stamped `completed_at`
-- with the import time.
--
-- Everything worth keeping was copied into the live tables by
-- 20260808120000_espn_direct_import_prep.sql. Apply that first, and verify a
-- real sync run against production before applying this — once these tables are
-- gone the 2025 ESPN matchup ids cannot be re-derived.
--
-- `espn_schedule_imports` stays: it is the import log the settings screen reads.

-- The bridge, plus four functions that only ever existed to debug it. None has
-- a caller anywhere in the repo.
DROP FUNCTION IF EXISTS "public"."assign_schedule_to_season"("uuid", "uuid", "uuid", "text");
DROP FUNCTION IF EXISTS "public"."get_pending_schedule_imports"();
DROP FUNCTION IF EXISTS "public"."cleanup_old_espn_imports"();
DROP FUNCTION IF EXISTS "public"."direct_match_test"("uuid", "uuid");
DROP FUNCTION IF EXISTS "public"."test_owner_matching"("uuid", "uuid");

-- Children first; both carry an import_id FK into espn_schedule_imports.
DROP TABLE IF EXISTS "public"."espn_matchups";
DROP TABLE IF EXISTS "public"."espn_teams";

-- The full ESPN response, ~1.4 MB a row, written on every import and never read
-- back. The fetch is reproducible from ESPN; the log row is what has value.
ALTER TABLE "public"."espn_schedule_imports" DROP COLUMN IF EXISTS "raw_data";

COMMENT ON TABLE "public"."espn_schedule_imports" IS
  'Log of ESPN schedule imports. One row per scripts/sync-schedule.js run; teams and games are written directly by that script. Rows dated before 2026-08 came from the staging pipeline this replaced.';
