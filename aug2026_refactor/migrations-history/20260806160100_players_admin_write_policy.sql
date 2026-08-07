-- "Only admins can modify players" was defined as USING (false) — it denied
-- everyone, including the admin, despite its name. Player rows are written by
-- the ESPN sync under service_role (which bypasses RLS), so nothing was broken
-- by it, but the policy did not mean what it said. Make it match.
drop policy if exists "Only admins can modify players" on public.players;
drop policy if exists "players admin write" on public.players;
create policy "players admin write" on public.players
  for all using (public.is_admin()) with check (public.is_admin());
