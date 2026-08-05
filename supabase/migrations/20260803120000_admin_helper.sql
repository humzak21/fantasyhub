-- is_admin(): the single server-side authority on who may mutate league data.
--
-- Per CLAUDE.md the league has exactly one admin. Until now that rule lived only
-- in client JS (VITE_ADMIN_USER_ID, compiled into the public bundle), so it hid
-- buttons but enforced nothing. Every policy written from here on keys off this
-- function instead.
--
-- STABLE (not IMMUTABLE): auth.jwt() varies per statement but not within one.
-- SECURITY DEFINER + pinned search_path so it cannot be shadowed by a caller's
-- temp schema.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'email') = 'humzak2001@gmail.com', false)
$$;

comment on function public.is_admin() is
  'True when the current JWT belongs to the league admin. Sole authority for admin-write RLS policies.';

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
