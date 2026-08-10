-- Prepare the live tables to receive ESPN data directly.
--
-- The ESPN staging layer (espn_schedule_imports -> espn_teams/espn_matchups ->
-- assign_schedule_to_season -> games) is being removed in favour of one
-- idempotent writer, services/db/games.js::upsertGamesFromESPN, shared by the
-- season-start import and the weekly sync.
--
-- This migration only adds and backfills. The staging tables are read here for
-- the last time and are dropped in a later migration, so this one must be
-- applied first.

-- ---------------------------------------------------------------------------
-- 1. Team abbreviation
-- ---------------------------------------------------------------------------
-- ESPN's `abbrev` was captured in espn_teams and then thrown away when the
-- staging row became a real team. It is the only piece of ESPN team identity
-- the live table was missing.

ALTER TABLE "public"."teams" ADD COLUMN IF NOT EXISTS "abbreviation" "text";

COMMENT ON COLUMN "public"."teams"."abbreviation" IS
  'ESPN team abbreviation (team.abbrev), refreshed by the ESPN schedule sync.';

-- Backfill from the staging rows before they disappear. Only seasons whose year
-- matches an import are covered; everything else picks one up on the next sync.
DO $$
BEGIN
  IF to_regclass('public.espn_teams') IS NULL THEN
    RAISE NOTICE 'espn_teams is already gone; skipping abbreviation backfill';
    RETURN;
  END IF;

  UPDATE public.teams t
  SET abbreviation = src.abbreviation
  FROM (
    SELECT DISTINCT ON (i.season_year, e.espn_team_id)
           i.season_year, e.espn_team_id, e.abbreviation
    FROM public.espn_teams e
    JOIN public.espn_schedule_imports i ON i.id = e.import_id
    WHERE e.abbreviation IS NOT NULL
    ORDER BY i.season_year, e.espn_team_id, i.imported_at DESC
  ) src
  JOIN public.seasons s ON s.year = src.season_year
  WHERE t.season_id = s.id
    AND t.espn_team_id = src.espn_team_id
    AND t.abbreviation IS NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. ESPN identity on games
-- ---------------------------------------------------------------------------
-- games.espn_matchup_id and espn_scoring_period_id have existed all along;
-- assign_schedule_to_season never wrote them, so the one season imported
-- through it (2025) has none while the seasons loaded another way have them on
-- every row. Recover them from the staged matchups.
--
-- Verified before writing this: for the assigned 2025 import all 98 staged
-- matchups map to a team by espn_team_id, all 98 match exactly one game, and
-- the ESPN home team is always team1 -- so the join below is exact and the
-- reversed-teams branch is belt and braces for other seasons.

DO $$
DECLARE
  v_filled integer;
BEGIN
  IF to_regclass('public.espn_matchups') IS NULL THEN
    RAISE NOTICE 'espn_matchups is already gone; skipping ESPN id backfill';
    RETURN;
  END IF;

  WITH staged AS (
    SELECT DISTINCT ON (s.id, m.week, m.home_espn_team_id, m.away_espn_team_id)
           s.id AS season_id,
           m.week,
           m.espn_matchup_id,
           m.scoring_period_id,
           home.id AS home_team_id,
           away.id AS away_team_id
    FROM public.espn_matchups m
    JOIN public.espn_schedule_imports i ON i.id = m.import_id
    JOIN public.seasons s ON s.year = i.season_year
    JOIN public.teams home
      ON home.season_id = s.id AND home.espn_team_id = m.home_espn_team_id
    JOIN public.teams away
      ON away.season_id = s.id AND away.espn_team_id = m.away_espn_team_id
    ORDER BY s.id, m.week, m.home_espn_team_id, m.away_espn_team_id, i.imported_at DESC
  )
  UPDATE public.games g
  SET espn_matchup_id = staged.espn_matchup_id,
      espn_scoring_period_id = staged.scoring_period_id
  FROM staged
  WHERE g.season_id = staged.season_id
    AND g.week = staged.week
    AND g.espn_matchup_id IS NULL
    AND (
      (g.team1_id = staged.home_team_id AND g.team2_id = staged.away_team_id)
      OR
      (g.team1_id = staged.away_team_id AND g.team2_id = staged.home_team_id)
    );

  GET DIAGNOSTICS v_filled = ROW_COUNT;
  RAISE NOTICE 'backfilled espn_matchup_id on % games', v_filled;
END $$;

-- ---------------------------------------------------------------------------
-- 3. The upsert key
-- ---------------------------------------------------------------------------
-- The ESPN matchup id is what makes the new writer idempotent: re-running a
-- sync updates the same row even if ESPN swaps home and away, which the
-- existing (season_id, week, team1_id, team2_id) key cannot survive.
--
-- Deliberately NOT a partial index. `WHERE espn_matchup_id IS NOT NULL` would
-- be the natural way to say "byes and hand-created games are exempt", but a
-- partial index can only be inferred as an ON CONFLICT target when the same
-- predicate is restated in the statement, and PostgREST's `on_conflict`
-- parameter cannot express one — every upsert would fail with 42P10.
--
-- A plain unique index gives the same exemption for free: Postgres compares
-- nulls as distinct, so any number of rows per season may carry a null ESPN id
-- while every real ESPN matchup stays unique. `games_week_teams_unique` still
-- covers games entered by hand.

CREATE UNIQUE INDEX IF NOT EXISTS "games_season_espn_matchup_unique"
  ON "public"."games" ("season_id", "espn_matchup_id");

COMMENT ON INDEX "public"."games_season_espn_matchup_unique" IS
  'Conflict target for services/db/games.js::upsertEspnGames. Rows with a null espn_matchup_id (byes, hand-created games) never collide, because nulls compare as distinct.';
