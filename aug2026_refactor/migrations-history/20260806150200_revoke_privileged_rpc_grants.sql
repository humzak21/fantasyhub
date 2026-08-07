-- Revoke EXECUTE from anon/authenticated on privileged functions (§2.2).
--
-- Supabase's default grants made every function in `public` callable by any
-- visitor holding the anon key — i.e. anyone who opens the site — via
-- `POST /rest/v1/rpc/<name>`. Because they are SECURITY DEFINER they run with
-- the owner's rights and bypass RLS entirely. That included `execute_trade`,
-- `drop_player_from_roster` and `disable_roster_trigger`.
--
-- Two mechanisms, chosen per function:
--
--   * **Revoke** (this file) for anything the browser never calls. Scripts are
--     unaffected: `service_role` keeps EXECUTE on everything and is how
--     `scripts/sync-week.js` reaches these.
--   * **In-function guard** (20260806150100) for the ones the admin UI *does*
--     call. Grants cannot express "only this one person" — the admin is just
--     an `authenticated` user — so those keep the grant and check
--     `can_write_league()` internally.
--
-- Read-only functions the public site depends on are deliberately untouched:
-- get_standings_by_division, check_awards_unlock_status, get_current_nfl_week,
-- get_user_display_names, get_available_snapshot_weeks, the franchise/history
-- getters, season_week_start, team_standings_as_of, is_admin.
--
-- The call sites were established by grepping the app for `.rpc('...')` and
-- tracing each to a component; the snapshot and view-refresh helpers exist in
-- `services/db/` but nothing in the UI calls them (`refreshMaterializedViews`
-- is even commented "admin only - requires service role").

do $$
declare
  fn text;
  stmts text;
  privileged text[] := array[
    -- roster / trade mutation
    'execute_trade',
    'add_player_to_roster',
    'drop_player_from_roster',
    'sync_player_from_espn',
    'sync_team_roster_from_espn',
    'sync_espn_player_stats',
    -- stats refresh
    'refresh_season_stats',
    'refresh_team_stats',
    'debug_refresh_season_data',
    'calculate_team_roster_analytics',
    'calculate_total_transactions',
    'update_player_averages',
    -- pick'em administration and scoring
    'calculate_pick_em_results',
    'calculate_weekly_pick_em_scores',
    'update_season_pick_em_standings',
    'backup_pick_em_submissions',
    'update_playoff_pick_results',
    -- power ranking snapshots
    'calculate_power_rankings',
    'save_power_rankings_snapshot',
    'save_enhanced_power_rankings_snapshot',
    'save_weekly_power_rankings_snapshot',
    'should_trigger_weekly_snapshot',
    'execute_weekly_snapshot_if_needed',
    'manual_weekly_snapshot_check',
    'cleanup_old_power_rankings_snapshots',
    -- materialised view refreshes (expensive; admin/backend only)
    'refresh_league_history_views',
    'refresh_transaction_views',
    -- schedule import staging
    'cleanup_old_espn_imports',
    'direct_match_test',
    'test_owner_matching',
    -- misc
    'set_user_id',
    -- trigger functions: fired by the trigger mechanism, which does not check
    -- EXECUTE, so revoking here costs nothing and closes a direct-call path
    'after_game_completion',
    'auto_save_weekly_snapshot',
    'trigger_update_team_stats',
    'update_updated_at_column',
    'update_transactions_2025_updated_at',
    'create_default_divisions'
  ];
begin
  foreach fn in array privileged loop
    -- Overloads share a name, so revoke across every signature.
    select coalesce(string_agg(
             format('revoke execute on function public.%I(%s) from anon, authenticated;',
                    p.proname, pg_get_function_identity_arguments(p.oid)),
             ' '), '')
      into stmts
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn;

    if stmts <> '' then
      execute stmts;
    else
      raise notice 'no such function, skipping: %', fn;
    end if;
  end loop;
end $$;


-- `assign_schedule_to_season` is called from the admin schedule-import UI, so it
-- keeps its `authenticated` grant and needs an internal guard instead. Its body
-- is ~130 lines of ESPN matchup mapping that writes `games`; rather than retype
-- it and risk a transcription error, the guard is injected into the existing
-- definition programmatically so the body is preserved byte-for-byte.
do $$
declare
  def text;
  guarded text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'assign_schedule_to_season';

  if def is null then
    raise notice 'assign_schedule_to_season not found; skipping';
    return;
  end if;

  if position('can_write_league' in def) > 0 then
    raise notice 'assign_schedule_to_season already guarded';
    return;
  end if;

  -- Pin the search path on the header...
  guarded := replace(def, E' SECURITY DEFINER', E' SECURITY DEFINER\n SET search_path TO ''public''');

  -- ...and make the guard the first statement of the body. The body's opening
  -- BEGIN is the first one after the AS $function$ delimiter.
  guarded := overlay(
    guarded
    placing E'BEGIN\n    IF NOT public.can_write_league() THEN\n        RAISE EXCEPTION ''admin only'' USING ERRCODE = ''42501'';\n    END IF;\n'
    from position(E'BEGIN' in guarded)
    for 5
  );

  execute guarded;
end $$;

grant execute on function public.assign_schedule_to_season(uuid, uuid, uuid, text) to authenticated;
