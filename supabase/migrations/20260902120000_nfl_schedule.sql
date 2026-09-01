-- The NFL calendar: who each pro team plays in each week, and when.
--
-- Nothing in this system knew who a player's team plays in a given week. The
-- parlay UI could not show "vs BUF" or grey out a bye, the research panel could
-- not either, and `player_week_stats.pro_team_id` -- written on every sync
-- since the player-stats step existed -- was a join key with nothing to join
-- to. This is that table, in the shape the td_parlay migration's "Future work"
-- note spec'd for it.
--
-- Source: ESPN's fantasy v3 `proTeamSchedules_wl` view, which needs no cookies
-- (verified 2026-09-01 against 2020-2026). Its `proTeamId` space is the same
-- one `player_week_stats.pro_team_id` and `players.pro_team_id` already store,
-- so there is no crosswalk anywhere in this subsystem.

-- ---------------------------------------------------------------------------
-- nfl_schedule
-- ---------------------------------------------------------------------------
-- Two rows per game, one from each team's perspective, plus an explicit row
-- per bye. Every consumer asks the same team-keyed question -- "who does team
-- T play in week W" -- and this shape answers it with a single lookup instead
-- of an OR across two columns.
CREATE TABLE IF NOT EXISTS "public"."nfl_schedule" (
  "id"                   "uuid" NOT NULL DEFAULT "gen_random_uuid"(),
  "season_year"          integer NOT NULL,
  "week"                 integer NOT NULL,
  "pro_team_id"          integer NOT NULL,
  "opponent_pro_team_id" integer,
  "is_home"              boolean,
  "game_time"            timestamp with time zone,
  "espn_game_id"         bigint,
  "start_time_tbd"       boolean NOT NULL DEFAULT false,
  "stats_official"       boolean NOT NULL DEFAULT false,
  "created_at"           timestamp with time zone NOT NULL DEFAULT "now"(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT "now"()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'nfl_schedule_pkey') THEN
    ALTER TABLE ONLY "public"."nfl_schedule"
      ADD CONSTRAINT "nfl_schedule_pkey" PRIMARY KEY ("id");
  END IF;

  -- The conflict target every writer upserts on, and the only index this table
  -- needs: its btree also serves the (season_year) and (season_year, week)
  -- prefix reads, which are the only two shapes anything asks for.
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'nfl_schedule_team_week_key') THEN
    ALTER TABLE ONLY "public"."nfl_schedule"
      ADD CONSTRAINT "nfl_schedule_team_week_key" UNIQUE ("season_year", "week", "pro_team_id");
  END IF;

  -- A bye is all-or-nothing. Without this a row could claim a bye and still
  -- carry a kickoff time, and the readers could not tell which half to trust.
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'nfl_schedule_bye_shape') THEN
    ALTER TABLE ONLY "public"."nfl_schedule"
      ADD CONSTRAINT "nfl_schedule_bye_shape" CHECK (
        (("opponent_pro_team_id" IS NULL) = ("is_home" IS NULL))
        AND ("opponent_pro_team_id" IS NOT NULL
             OR ("game_time" IS NULL AND "espn_game_id" IS NULL))
      );
  END IF;

  -- ESPN's proTeamId 0 is the free-agent pseudo-team and has no games. It is
  -- filtered in the mapper; this is the assertion that it stays filtered.
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'nfl_schedule_real_team') THEN
    ALTER TABLE ONLY "public"."nfl_schedule"
      ADD CONSTRAINT "nfl_schedule_real_team" CHECK (
        "pro_team_id" > 0 AND ("opponent_pro_team_id" IS NULL OR "opponent_pro_team_id" > 0)
      );
  END IF;

  -- A team does not play itself. Cheap, and it catches a mirrored-row bug in
  -- the mapper at write time rather than in a chip six weeks later.
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'nfl_schedule_not_self') THEN
    ALTER TABLE ONLY "public"."nfl_schedule"
      ADD CONSTRAINT "nfl_schedule_not_self" CHECK (
        "opponent_pro_team_id" IS NULL OR "opponent_pro_team_id" <> "pro_team_id"
      );
  END IF;
END
$$;

COMMENT ON TABLE "public"."nfl_schedule" IS
  'The NFL calendar, team-perspective: two rows per game (one per side) plus an explicit row per bye. Keyed by season_year, not season_id -- the NFL calendar is league-independent and outlives any one fantasy season row. Fed from ESPN proTeamSchedules_wl by scripts/sync-nfl-schedule.js and the weekly sync. Carries no scores: that payload has none (verified 2026-09-01 against the completed 2025 season).';

COMMENT ON COLUMN "public"."nfl_schedule"."season_year" IS
  'The NFL season, e.g. 2026. Deliberately not a FK to seasons: this table describes the league''s calendar, not ours, and a year we have no fantasy season for is still a legitimate row.';

COMMENT ON COLUMN "public"."nfl_schedule"."week" IS
  'ESPN scoringPeriodId. 1..17 in 2020, 1..18 since. NFL playoff periods do not appear in this payload.';

COMMENT ON COLUMN "public"."nfl_schedule"."pro_team_id" IS
  'ESPN proTeamId -- the same id space as player_week_stats.pro_team_id and players.pro_team_id, which is what makes this table joinable with no crosswalk. See getNFLTeamAbbreviation() in services/db/espnMapping.js.';

COMMENT ON COLUMN "public"."nfl_schedule"."opponent_pro_team_id" IS
  'NULL means a bye, by assertion rather than by absence. A missing row is a failed fetch; this is the difference, and it is why byes get a row of their own instead of being inferred from a gap.';

COMMENT ON COLUMN "public"."nfl_schedule"."stats_official" IS
  'ESPN''s own "this game is final" flag -- the only completion signal the payload carries. The gate a future TD auto-grader waits on before believing a stat line.';

ALTER TABLE "public"."nfl_schedule" ENABLE ROW LEVEL SECURITY;

-- The standard league-table posture: anybody may read, only the league may
-- write. `can_write_league()` and not `is_admin()`, because the writer is the
-- GitHub Actions cron holding the service role, which has no JWT email for
-- `is_admin()` to read.
DROP POLICY IF EXISTS "nfl_schedule public read" ON "public"."nfl_schedule";
CREATE POLICY "nfl_schedule public read" ON "public"."nfl_schedule"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "nfl_schedule league write" ON "public"."nfl_schedule";
CREATE POLICY "nfl_schedule league write" ON "public"."nfl_schedule"
  USING ("public"."can_write_league"()) WITH CHECK ("public"."can_write_league"());

GRANT ALL ON TABLE "public"."nfl_schedule" TO "anon";
GRANT ALL ON TABLE "public"."nfl_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."nfl_schedule" TO "service_role";

-- ---------------------------------------------------------------------------
-- player_week_stats.stat_breakdown
-- ---------------------------------------------------------------------------
-- The sync has always downloaded this and always thrown it away: every roster
-- entry in `rosterForCurrentScoringPeriod` carries a raw per-category stat map
-- alongside the fantasy total, and `espnPlayerStatsMapper.js` read the total
-- and dropped the map.
--
-- A jsonb column rather than TD columns, and rather than a table of its own:
-- the (season, week, player) grain already exists here, and the whole category
-- surface is worth keeping for the player-level Statistics work that has no
-- other source. Touchdown counts are *derived* from it -- see ESPN_STAT_IDS in
-- services/db/espnMapping.js -- so there is exactly one copy of the number and
-- no second one to fall out of step.
ALTER TABLE "public"."player_week_stats"
  ADD COLUMN IF NOT EXISTS "stat_breakdown" "jsonb";

COMMENT ON COLUMN "public"."player_week_stats"."stat_breakdown" IS
  'The raw ESPN per-category stat map for this player-week (statSourceId 0, statSplitTypeId 1), keyed by stat id as a string: "4"=passing TD, "25"=rushing TD, "43"=receiving TD. NULL for every row written before 2026-09 and for any week ESPN reported no categories. Derive from it, never copy a figure out into a column of its own.';

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------
-- A leftover from a dropped `nfl_week_calendar` table: the function survived
-- its subject and has referenced nothing since. Removing it now so it cannot
-- be mistaken for part of this subsystem.
DROP FUNCTION IF EXISTS "public"."validate_nfl_calendar"(integer);
