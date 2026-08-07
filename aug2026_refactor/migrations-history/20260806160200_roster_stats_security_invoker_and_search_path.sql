-- The last advisor ERROR, and the search_path backlog (§2.5).
--
-- roster_stats evaluated with the *creator's* permissions, so querying it
-- bypassed RLS. Its two sources (teams, rosters) both carry public-read
-- policies, so evaluating as the caller returns the same rows to anon while no
-- longer being a bypass. Verified: anon still reads 84 rows.
-- The other two SECURITY DEFINER views went with ffAnalytics (20260806140000).
alter view public.roster_stats set (security_invoker = true);

-- Pin search_path on every remaining public function lacking it. An unpinned
-- SECURITY DEFINER function resolves unqualified names against the *caller's*
-- search_path, so a caller able to create a temp schema can shadow a table or
-- operator it relies on and have it run with owner rights.
--
-- Applied via ALTER rather than by rewriting bodies: it changes only the
-- setting, so no function's behaviour can shift as a side effect. 62 -> 0.
do $$
declare r record; n int := 0;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prokind = 'f'
      and coalesce(p.proconfig::text, '') not like '%search_path%'
  loop
    execute format('alter function public.%I(%s) set search_path = public', r.proname, r.args);
    n := n + 1;
  end loop;
  raise notice 'pinned search_path on % functions', n;
end $$;
