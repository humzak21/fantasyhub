-- Remove the pre-2026 history path, now that nothing reads it.
--
-- ⚠️ HOLD UNTIL THE NEW HISTORY TAB HAS BEEN SEEN WORKING IN PRODUCTION. ⚠️
--
-- This drops five seasons of duplicated data. Every row in `historical_*` is
-- already in `seasons`/`teams`/`games` under the *same ids* — that is what made
-- the repoint possible — but "already copied" is a claim worth re-checking
-- against the live site before it stops being reversible. Verify first:
--
--   • League History shows six seasons, 2025 among them, with its podium
--   • Records, Head-to-Head and Awards all populate
--   • the browser's network panel shows no request for a `historical_*` table
--
-- Only then apply this.
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
drop function if exists public.manual_weekly_snapshot_check();
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
