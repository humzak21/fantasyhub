-- Public-read / admin-write across the league tables (§2.4, §2.6).
--
-- Before this, "authorization" on league data was `auth.uid() IS NOT NULL` —
-- i.e. *any* logged-in user could rewrite seasons, teams, games, weeks,
-- rosters, the ESPN staging tables and the ranking history. `divisions` and
-- `transactions_2025_legacy` were worse still, at a literal `USING (true)`,
-- and `pick_em_submissions` carried an `ALL` policy scoped only to "is logged
-- in", so any user could edit anyone else's picks. The league has one admin;
-- the client could hide buttons but nothing enforced it.
--
-- Every affected table already had its own SELECT policy, so switching the
-- write policies to `is_admin()` leaves public reads untouched — checked before
-- applying, because dropping an `ALL` policy also drops the read it implied.
--
-- Policies that legitimately scope to the calling user (`auth.uid() = user_id`
-- on award_votes, pick_em_submissions, playoff_picks) are kept as they are.
--
-- The admin policies that inlined 'humzak2001@gmail.com' are repointed at
-- is_admin() so who the admin is has exactly one definition.
--
-- service_role bypasses RLS, so scripts and the scheduled sync are unaffected.
--
-- Verified against production by impersonating each caller:
--   anon                  -> reads all 15 league tables, writes nothing
--   authenticated (other) -> every write filtered to 0 rows
--   authenticated (admin) -> writes succeed

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('games',                  'Authenticated write games'),
      ('seasons',                'Authenticated write seasons'),
      ('teams',                  'Authenticated write teams'),
      ('weeks',                  'Authenticated write weeks'),
      ('rosters',                'Authenticated write rosters'),
      ('roster_history',         'Authenticated write roster history'),
      ('weekly_lineups',         'Authenticated write weekly lineups'),
      ('power_rankings_history', 'Authenticated write power rankings history'),
      ('nfl_week_calendar',      'Authenticated write NFL calendar'),
      ('espn_matchups',          'Authenticated write ESPN matchups'),
      ('espn_teams',             'Authenticated write ESPN teams'),
      ('espn_schedule_imports',  'Authenticated write ESPN imports'),
      ('divisions',              'Allow authenticated users to manage divisions'),
      ('transactions_2025_legacy','Allow authenticated write to transactions_2025'),
      ('transactions',           'Authenticated write transactions'),
      ('pick_em_submissions_backup', 'Allow trigger to insert backup records')
    ) as t(tbl, old_policy)
  loop
    if to_regclass('public.' || r.tbl) is null then
      raise notice 'no such table, skipping: %', r.tbl;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', r.old_policy, r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || ' admin write', r.tbl);
    execute format(
      'create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())',
      r.tbl || ' admin write', r.tbl
    );
  end loop;

  -- pick_em_submissions_backup is written by `backup_pick_em_submissions`, a
  -- SECURITY DEFINER trigger owned by postgres, and the table does not FORCE
  -- row security — so the trigger still inserts with the policy tightened.
  -- (Checked before applying; §3.3 wants this table dropped entirely anyway.)

  drop policy if exists "Allow authenticated users to manage their own submissions" on public.pick_em_submissions;
  drop policy if exists "pick_em_submissions admin write" on public.pick_em_submissions;
  create policy "pick_em_submissions admin write" on public.pick_em_submissions
    for all using (public.is_admin()) with check (public.is_admin());

  -- pick_em_weeks.user_id is multi-tenant scaffolding (§3.4); "manage own
  -- pick'em weeks" let any user create and edit league-wide pick'em weeks.
  drop policy if exists "Users can manage own pick'em weeks" on public.pick_em_weeks;

  for r in
    select * from (values
      ('award_votes',    'Allow admin write access to award_votes'),
      ('awards',         'Allow admin write access to awards_2025'),
      ('awards_metadata','Allow admin write access to awards_metadata'),
      ('pick_em_weeks',  'Allow admin write access to pick_em_weeks'),
      ('playoff_config', 'Admin can manage playoff config'),
      ('playoff_config', 'Admin can insert playoff config'),
      ('playoff_config', 'Admin can update playoff config'),
      ('playoff_picks',  'Admin full access to playoff picks')
    ) as t(tbl, old_policy)
  loop
    execute format('drop policy if exists %I on public.%I', r.old_policy, r.tbl);
  end loop;

  for r in
    select unnest(array['award_votes','awards','awards_metadata','pick_em_weeks',
                        'playoff_config','playoff_picks']) as tbl
  loop
    execute format('drop policy if exists %I on public.%I', r.tbl || ' admin write', r.tbl);
    execute format(
      'create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())',
      r.tbl || ' admin write', r.tbl
    );
  end loop;
end $$;
