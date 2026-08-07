-- Drop the ffAnalytics storage along with the subsystem (§7.4).
--
-- The pipeline that wrote these was never actually running: `weekly_player_stats`
-- held 0 rows and `team_analytics_summary` 28, against ~15 services, 8 R scripts
-- and a config CLI. All of that application code is deleted in this same change,
-- so nothing reads these objects any more.
--
-- This is the one intentional exception to the "additive, never destructive"
-- rule the rest of the refactor follows, because keeping the tables would keep
-- a live security hole: §2.3 flags `team_analytics_summary` as the project's
-- highest-severity advisor finding — RLS disabled, so it is readable AND
-- writable by `anon`. Dropping it resolves that finding outright rather than
-- policying a table nothing uses.
--
-- `current_player_analytics` and `latest_team_analytics` are two of the three
-- SECURITY DEFINER views from §2.5; they go with the tables they read.
-- `roster_stats`, the third, reads real roster data and is deliberately kept —
-- retrofitting it with `security_invoker` belongs to the P0 pass.
--
-- Reversal: the table definitions are in git history. The 28 analytics rows are
-- recoverable from PITR; they were derived output, not league records.

drop view if exists public.latest_team_analytics;
drop view if exists public.current_player_analytics;

drop table if exists public.weekly_player_stats;
drop table if exists public.team_analytics_summary;
