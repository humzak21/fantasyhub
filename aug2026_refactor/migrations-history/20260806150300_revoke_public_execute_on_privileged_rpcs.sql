-- Finish the RPC lockdown: revoke from PUBLIC, not just from anon (§2.2).
--
-- The previous migration revoked EXECUTE from `anon, authenticated` and the
-- verification query still reported every function as anon-callable. The reason
-- is in the ACL: Postgres grants EXECUTE on new functions to **PUBLIC** by
-- default, which shows as the empty-grantee entry `=X/postgres`. `anon`
-- inherits from PUBLIC, so revoking its explicit grant changes nothing while
-- the PUBLIC grant stands. Revoking a role you never granted to is silently a
-- no-op, which is why this failed quietly rather than erroring.
--
-- It also picks up the six admin-UI functions, which the previous migration
-- deliberately left out of its revoke list (they need `authenticated`) but
-- which should still lose PUBLIC and anon.
--
-- Verified: no privileged function is anon-callable; the backend-only ones are
-- not authenticated-callable either; every public read path still resolves for
-- anon; service_role retains EXECUTE on all functions; the six admin-UI
-- functions remain callable by authenticated and are guarded internally.

do $$
declare
  fn text;
  stmts text;
  -- Never called from the browser.
  backend_only text[] := array[
    'execute_trade','add_player_to_roster','drop_player_from_roster',
    'sync_player_from_espn','sync_team_roster_from_espn','sync_espn_player_stats',
    'refresh_season_stats','refresh_team_stats','debug_refresh_season_data',
    'calculate_team_roster_analytics','calculate_total_transactions','update_player_averages',
    'calculate_pick_em_results','calculate_weekly_pick_em_scores','update_season_pick_em_standings',
    'backup_pick_em_submissions','update_playoff_pick_results',
    'calculate_power_rankings','save_power_rankings_snapshot','save_enhanced_power_rankings_snapshot',
    'save_weekly_power_rankings_snapshot','should_trigger_weekly_snapshot',
    'execute_weekly_snapshot_if_needed','manual_weekly_snapshot_check',
    'cleanup_old_power_rankings_snapshots',
    'refresh_league_history_views','refresh_transaction_views',
    'cleanup_old_espn_imports','direct_match_test','test_owner_matching',
    'set_user_id',
    'after_game_completion','auto_save_weekly_snapshot','trigger_update_team_stats',
    'update_updated_at_column','update_transactions_2025_updated_at','create_default_divisions'
  ];
  -- Called by the admin UI: keep authenticated, guarded by can_write_league().
  admin_ui text[] := array[
    'disable_roster_trigger','enable_roster_trigger','update_game_result',
    'create_pick_em_week','get_users_for_admin','assign_schedule_to_season'
  ];
begin
  foreach fn in array backend_only loop
    select coalesce(string_agg(
             format('revoke execute on function public.%I(%s) from public, anon, authenticated; '
                 || 'grant execute on function public.%I(%s) to service_role;',
                    p.proname, pg_get_function_identity_arguments(p.oid),
                    p.proname, pg_get_function_identity_arguments(p.oid)),
             ' '), '')
      into stmts
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname = fn;
    if stmts <> '' then execute stmts; end if;
  end loop;

  foreach fn in array admin_ui loop
    select coalesce(string_agg(
             format('revoke execute on function public.%I(%s) from public, anon; '
                 || 'grant execute on function public.%I(%s) to authenticated, service_role;',
                    p.proname, pg_get_function_identity_arguments(p.oid),
                    p.proname, pg_get_function_identity_arguments(p.oid)),
             ' '), '')
      into stmts
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname = fn;
    if stmts <> '' then execute stmts; end if;
  end loop;
end $$;
