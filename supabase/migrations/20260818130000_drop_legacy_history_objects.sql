-- Remove the pre-2026 history path, now that nothing reads it.
--
-- Applied 2026-08-19, after checking the duplication claim row by row rather
-- than taking it on trust. Every row of `historical_seasons` (5),
-- `historical_teams` (70), `historical_games` (583) and `season_awards` (55)
-- was present in `seasons`/`teams`/`games`/`awards` under the *same id*, with
-- matching year, name, franchise and scores.
--
-- `head_to_head_records` was the one table with no copy anywhere, and it turned
-- out not to be worth keeping: its 102 pairs total 653 meetings where the games
-- add up to 583. The extra 70 are 2025 weeks 1-10 — it was computed on
-- 2025-11-15, mid-season, and frozen there. So it is not a record of 2020-24 at
-- all; it is a snapshot taken halfway through a season that has since finished.
-- `v_head_to_head` recomputes it from the games every time it is read.
--
-- What is going, and why it is safe:
--
--   `historical_seasons` / `_teams` / `_games`  copied into the live tables
--   `season_awards`                            copied into `awards`
--   `head_to_head_records`                     replaced by `v_head_to_head`
--   `franchise_records`                        replaced by `v_record_book` (0 rows)
--   `historical_rosters`                       never populated (0 rows); it is
--                                              here because `historical_seasons`
--                                              cannot be dropped while it
--                                              references it
--   `mv_*`                                     replaced by `v_franchise_career`
--                                              and friends. Nothing has
--                                              refreshed them since Nov 2025.
--   `transactions_2025` / `team_transactions`   views over the *active* season
--                                              and over `transactions`. The
--                                              first is what labelled 2026's
--                                              numbers "2025".
--   the snapshot/week functions                dead wrappers; the weekly cron
--                                              took this over in Aug 2026.
--
-- `awards_2025` and `playoffs_2025` stay: `services/db/awards.js` and
-- `playoffs.js` still read them, and repointing those is a separate job.

begin;

-- Dead scheduling machinery. `scripts/sync-week.js` writes the weekly snapshot
-- now, and the current week comes from `season_current_week(season_id)`.
drop function if exists public.should_trigger_weekly_snapshot(integer);
drop function if exists public.execute_weekly_snapshot_if_needed(integer);
drop function if exists public.manual_weekly_snapshot_check(integer);
drop function if exists public.get_current_nfl_week(integer);
drop function if exists public.refresh_league_history_views();
drop function if exists public.refresh_transaction_views();
drop table if exists public.nfl_week_calendar;

-- Materialized views nothing refreshes.
drop materialized view if exists public.mv_franchise_career_stats;
drop materialized view if exists public.mv_season_leaderboards;
drop materialized view if exists public.mv_transaction_leaderboards;

-- Views that made one season's data look like another's.
drop view if exists public.transactions_2025;
drop view if exists public.team_transactions;

-- The duplicated history. Child tables first: no CASCADE, so a dependency
-- nobody accounted for fails the migration rather than being dropped silently.
drop table if exists public.franchise_records;
drop table if exists public.head_to_head_records;
drop table if exists public.season_awards;
drop table if exists public.historical_rosters;
drop table if exists public.historical_games;
drop table if exists public.historical_teams;
drop table if exists public.historical_seasons;

commit;
