-- Per-player, per-week scoring, so the power ranking can see rosters.
--
-- The weekly sync already fetches everything this table holds: the scores step
-- pulls `mMatchupScore`, whose `rosterForCurrentScoringPeriod` carries every
-- player's lineup slot, actual points and projection for that week, scored with
-- this league's own settings. It was parsed and thrown away, because nothing
-- week-grained was persisted anywhere -- `players` is a global last-write-wins
-- snapshot and `rosters` is deleted and rewritten on every sync, so by
-- Wednesday there is no record of who started on Sunday.
--
-- `weekly_lineups` is deliberately not reused: its grain is one row per
-- team-week with hardcoded slot columns, which cannot represent a bench, an IR
-- slot, or a roster that carries three quarterbacks.

-- ---------------------------------------------------------------------------
-- 1. player_week_stats
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."player_week_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "week" integer NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "espn_player_id" integer,
    "lineup_slot_id" integer,
    "roster_slot" "text",
    "started" boolean DEFAULT false NOT NULL,
    "position" "text",
    "actual_points" numeric(10,2),
    "projected_points" numeric(10,2),
    "injury_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "player_week_stats_week_check" CHECK (("week" > 0))
);

ALTER TABLE "public"."player_week_stats" OWNER TO "postgres";

COMMENT ON TABLE "public"."player_week_stats" IS
  'One row per player per week: which team held them, whether they started, and what they scored. Written by scripts/sync-week.js from ESPN rosterForCurrentScoringPeriod; read by the power ranking calculator for roster strength and lineup efficiency.';

COMMENT ON COLUMN "public"."player_week_stats"."lineup_slot_id" IS
  'Raw ESPN lineupSlotId, kept for audit -- roster_slot is the mapped value.';
COMMENT ON COLUMN "public"."player_week_stats"."started" IS
  'True for every slot that is not bench (20) or IR (21).';
COMMENT ON COLUMN "public"."player_week_stats"."position" IS
  'Position as of this week. players.position drifts as ESPN reclassifies.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_week_stats_pkey'
  ) THEN
    ALTER TABLE "public"."player_week_stats"
      ADD CONSTRAINT "player_week_stats_pkey" PRIMARY KEY ("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_week_stats_season_week_player_key'
  ) THEN
    -- The upsert conflict target. A player is on exactly one roster in a given
    -- week; a mid-week re-sync after a trade rewrites the row with the new
    -- team, which is ESPN's truth at sync time.
    ALTER TABLE "public"."player_week_stats"
      ADD CONSTRAINT "player_week_stats_season_week_player_key"
      UNIQUE ("season_id", "week", "player_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_week_stats_season_id_fkey'
  ) THEN
    ALTER TABLE "public"."player_week_stats"
      ADD CONSTRAINT "player_week_stats_season_id_fkey" FOREIGN KEY ("season_id")
      REFERENCES "public"."seasons"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_week_stats_team_id_fkey'
  ) THEN
    ALTER TABLE "public"."player_week_stats"
      ADD CONSTRAINT "player_week_stats_team_id_fkey" FOREIGN KEY ("team_id")
      REFERENCES "public"."teams"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_week_stats_player_id_fkey'
  ) THEN
    ALTER TABLE "public"."player_week_stats"
      ADD CONSTRAINT "player_week_stats_player_id_fkey" FOREIGN KEY ("player_id")
      REFERENCES "public"."players"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_player_week_stats_season_week"
  ON "public"."player_week_stats" USING "btree" ("season_id", "week");

CREATE INDEX IF NOT EXISTS "idx_player_week_stats_team"
  ON "public"."player_week_stats" USING "btree" ("team_id", "season_id", "week");

CREATE OR REPLACE TRIGGER "update_player_week_stats_updated_at"
  BEFORE UPDATE ON "public"."player_week_stats"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- ---------------------------------------------------------------------------
-- 2. RLS: public read, admin write
-- ---------------------------------------------------------------------------
-- The same shape every league table has. The sync runs as the service role,
-- which bypasses RLS entirely, so no SECURITY DEFINER function is involved and
-- `can_write_league()` is not needed here.

ALTER TABLE "public"."player_week_stats" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read player_week_stats" ON "public"."player_week_stats";
CREATE POLICY "Public read player_week_stats" ON "public"."player_week_stats"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "player_week_stats admin write" ON "public"."player_week_stats";
CREATE POLICY "player_week_stats admin write" ON "public"."player_week_stats"
  USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

GRANT ALL ON TABLE "public"."player_week_stats" TO "anon";
GRANT ALL ON TABLE "public"."player_week_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."player_week_stats" TO "service_role";

-- ---------------------------------------------------------------------------
-- 3. power_rankings_history.components
-- ---------------------------------------------------------------------------
-- The eight fixed component columns (performance_score, team_strength, ...)
-- named a set of components that no longer exists. Rather than add four more
-- columns and repeat the mistake the next time the algorithm changes, the
-- snapshot now carries whatever components it computed as jsonb.
--
-- The legacy columns stay: they hold the only record of the pre-overhaul
-- snapshots, and `getPowerRankingsHistory` falls back to them for rows written
-- before this migration. New rows leave them NULL.

ALTER TABLE "public"."power_rankings_history"
  ADD COLUMN IF NOT EXISTS "components" "jsonb";

COMMENT ON COLUMN "public"."power_rankings_history"."components" IS
  'Normalized 0-100 power ranking components as of this snapshot, keyed by component name (see POWER_RANKING_WEIGHTS in types/index.js). NULL components mean the input was unavailable that week. Rows written before 2026-08-10 have NULL here and use the legacy *_score columns instead.';
