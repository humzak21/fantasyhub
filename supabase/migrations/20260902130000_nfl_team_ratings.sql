-- NFL team strength, from ESPN's Football Power Index.
--
-- The power ranking's `nflSos` component asks "how tough are the real-NFL
-- opponents this team's starters face for the rest of the season", and that
-- question needs a number per pro team. This is that number, snapshotted
-- weekly: ESPN's endpoint serves the *current* FPI only, so the snapshot is
-- what makes a past week's ranking reproducible rather than a value that
-- silently drifts under it.
--
-- Source: https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex
-- (auth-free, verified 2026-09-01). Its team `id`s are ESPN's NFL-side id
-- space, which is NOT the fantasy `proTeamId` space the rest of this system
-- stores -- the join is by abbreviation, in services/espnFpiMapper.js. If the
-- endpoint disappears, the documented fallback is nflverse's `nfldata`
-- standings CSVs (results-based sos/sov, also abbreviation-keyed).

-- ---------------------------------------------------------------------------
-- nfl_team_ratings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."nfl_team_ratings" (
  "id"                  "uuid" NOT NULL DEFAULT "gen_random_uuid"(),
  "season_year"         integer NOT NULL,
  "week"                integer NOT NULL,
  "pro_team_id"         integer NOT NULL,
  "fpi"                 numeric,
  "epa_offense"         numeric,
  "epa_defense"         numeric,
  "epa_special_teams"   numeric,
  "fpi_rank"            integer,
  "sos_remaining_rank"  integer,
  "projected_wins"      numeric,
  "projected_losses"    numeric,
  "playoff_probability" numeric,
  "fetched_at"          timestamp with time zone NOT NULL DEFAULT "now"(),
  "created_at"          timestamp with time zone NOT NULL DEFAULT "now"(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT "now"()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'nfl_team_ratings_pkey') THEN
    ALTER TABLE ONLY "public"."nfl_team_ratings"
      ADD CONSTRAINT "nfl_team_ratings_pkey" PRIMARY KEY ("id");
  END IF;

  -- The conflict target every writer upserts on, and the only index this table
  -- needs: its btree also serves the (season_year) prefix read behind
  -- "latest week for a year", the only shape anything asks for.
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'nfl_team_ratings_team_week_key') THEN
    ALTER TABLE ONLY "public"."nfl_team_ratings"
      ADD CONSTRAINT "nfl_team_ratings_team_week_key" UNIQUE ("season_year", "week", "pro_team_id");
  END IF;

  -- ESPN's proTeamId 0 is the free-agent pseudo-team; an unmapped abbreviation
  -- is dropped in the mapper with a warning, never written as 0.
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'nfl_team_ratings_real_team') THEN
    ALTER TABLE ONLY "public"."nfl_team_ratings"
      ADD CONSTRAINT "nfl_team_ratings_real_team" CHECK ("pro_team_id" > 0);
  END IF;
END
$$;

COMMENT ON TABLE "public"."nfl_team_ratings" IS
  'ESPN Football Power Index per NFL team, snapshotted per fantasy scoring period. ESPN serves current FPI only, so weekly snapshots are what make past rankings reproducible. Keyed by season_year, not season_id -- same rationale as nfl_schedule. Every rating column is nullable: a gap in the payload must not block the row. Fed by scripts/sync-nfl-ratings.js and the weekly sync''s nflRatings step.';

COMMENT ON COLUMN "public"."nfl_team_ratings"."season_year" IS
  'The NFL season, e.g. 2026. Deliberately not a FK to seasons -- the NFL is league-independent, same as nfl_schedule.';

COMMENT ON COLUMN "public"."nfl_team_ratings"."week" IS
  'The fantasy scoring period this snapshot serves -- the week the sync ran for, not an NFL-side concept. "Latest" for a year is the max of this column.';

COMMENT ON COLUMN "public"."nfl_team_ratings"."pro_team_id" IS
  'The fantasy proTeamId space (players.pro_team_id, nfl_schedule.pro_team_id). The FPI payload''s own team ids are a DIFFERENT id space (ESPN''s NFL-side ids); the mapper joins by abbreviation, with WSH aliased to WAS.';

COMMENT ON COLUMN "public"."nfl_team_ratings"."fpi" IS
  'Overall FPI, points above an average NFL team. The number nflSos consumes: overall rather than a unit split because it is the only single figure signed correctly for every lineup slot.';

COMMENT ON COLUMN "public"."nfl_team_ratings"."fetched_at" IS
  'When the snapshot was pulled from ESPN. The payload''s own lastUpdated moves independently of our sync.';

ALTER TABLE "public"."nfl_team_ratings" ENABLE ROW LEVEL SECURITY;

-- The standard league-table posture: anybody may read, only the league may
-- write. `can_write_league()` and not `is_admin()`, because the writer is the
-- GitHub Actions cron holding the service role, which has no JWT email for
-- `is_admin()` to read.
DROP POLICY IF EXISTS "nfl_team_ratings public read" ON "public"."nfl_team_ratings";
CREATE POLICY "nfl_team_ratings public read" ON "public"."nfl_team_ratings"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "nfl_team_ratings league write" ON "public"."nfl_team_ratings";
CREATE POLICY "nfl_team_ratings league write" ON "public"."nfl_team_ratings"
  USING ("public"."can_write_league"()) WITH CHECK ("public"."can_write_league"());

GRANT ALL ON TABLE "public"."nfl_team_ratings" TO "anon";
GRANT ALL ON TABLE "public"."nfl_team_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."nfl_team_ratings" TO "service_role";
