-- Rewrite the migration ledger to match supabase/migrations/.
--
-- Run ONCE, by hand, in the Supabase SQL editor (project kvcnijyyfylxfarrlxkv),
-- before the first run of .github/workflows/deploy-migrations.yml. It is not a
-- migration and `supabase db push` never reads this directory.
--
-- Why: until 2026-10-08 migrations were applied through the Supabase MCP, which
-- records its own apply-time version (file 20260828120000_td_parlay.sql is
-- version 20260831185117 remotely), and the ledger still listed the 18
-- migrations squashed into 00000000000000_baseline_schema.sql in August 2026.
-- `supabase db push` compares versions, so it has refused for two months. After
-- this, the ledger holds one row per file, version and name from the filename,
-- and `supabase migration list --linked` shows no gap on either side.
--
-- Every file listed below is already in effect on the project (verified
-- 2026-10-08: the parlay_live_snapshot table exists, the Gatamaneni respelling
-- has no rows left to fix, and everything else was applied through the MCP).
-- 20260808130000_drop_espn_staging.sql is deliberately NOT listed: it was never
-- applied — espn_matchups, espn_teams and espn_schedule_imports.raw_data still
-- exist — so it stays pending, and the first workflow run (or npm run db:push)
-- applies it.
--
-- The old rows are kept in schema_migrations_backup_20261008, safe to drop.

create table if not exists supabase_migrations.schema_migrations_backup_20261008 as
  select * from supabase_migrations.schema_migrations;

comment on table supabase_migrations.schema_migrations_backup_20261008 is
  'The migration ledger before 2026-10-08, when it was rewritten to hold exactly the versions of the files in supabase/migrations/. Safe to drop.';

with cleared as (
  delete from supabase_migrations.schema_migrations returning version
)
insert into supabase_migrations.schema_migrations (version, name) values
  ('00000000000000', 'baseline_schema'),
  ('20260808120000', 'espn_direct_import_prep'),
  ('20260810120000', 'player_week_stats'),
  ('20260818120000', 'finalize_season'),
  ('20260818120100', 'finalize_2025_and_2026_config'),
  ('20260818130000', 'drop_legacy_history_objects'),
  ('20260819090000', 'drop_manual_weekly_snapshot_check'),
  ('20260819091000', 'v_franchise_career_security_invoker'),
  ('20260828120000', 'td_parlay'),
  ('20260831120000', 'list_league_members'),
  ('20260831130000', 'takes'),
  ('20260831140000', 'takes_members_only'),
  ('20260831150000', 'takes_wager'),
  ('20260831160000', 'takes_hell_nah'),
  ('20260831170000', 'award_ballot_seasons'),
  ('20260901120000', 'take_events'),
  ('20260901150000', 'seeded_playoff_standings'),
  ('20260901160000', 'finalize_season_seeded'),
  ('20260901170000', 'division_identity'),
  ('20260902120000', 'nfl_schedule'),
  ('20260902130000', 'nfl_team_ratings'),
  ('20260902140000', 'pick_em_deadline_guard'),
  ('20260902150000', 'parlay_picks_visible_as_submitted'),
  ('20260903120000', 'member_approvals'),
  ('20260904120000', 'drop_metadata_admin_policies'),
  ('20260910160000', 'owner_alias_gatamaneni'),
  ('20260915120000', 'postseason_bracket_repair'),
  ('20260915130000', 'transaction_events'),
  ('20260915140000', 'team_week_lineups'),
  ('20260915150000', 'retire_computed_awards'),
  ('20260915160000', 'hand_entered_2024_week1'),
  ('20260915170000', 'transaction_event_player_moves'),
  ('20260915180000', 'pick_em_weeks_user_id_nullable'),
  ('20260915190000', 'take_events_admin_actor'),
  ('20260917120000', 'takes_hell_nah_window'),
  ('20260917130000', 'take_views'),
  ('20260918120000', 'takes_hell_yeah'),
  ('20260919120000', 'takes_hell_yeah_any_time'),
  ('20260920120000', 'parlay_live_snapshot'),
  ('20260927120000', 'power_rankings_backfill_snapshot_type'),
  ('20260929120000', 'cron_dispatch_workflows'),
  ('20261002120000', 'push_notifications'),
  ('20261007120000', 'take_notifications');

select (select count(*) from supabase_migrations.schema_migrations_backup_20261008) as backed_up,
       (select count(*) from supabase_migrations.schema_migrations) as ledger_now;
