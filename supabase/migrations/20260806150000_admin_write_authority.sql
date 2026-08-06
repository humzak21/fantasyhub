-- `can_write_league()` — the guard privileged functions call (§2.2, §2.6).
--
-- Two traps are baked into this definition; both were hit while writing it.
--
-- 1. `is_admin()` alone is not usable as an in-function guard. It reads the JWT
--    email, and the **service role has no email claim** — `select is_admin()`
--    under service_role returns FALSE. Dropping `if not is_admin() then raise`
--    into these functions would have locked out `scripts/sync-week.js` and
--    every other script (the automation §7 just built) while looking correct.
--
-- 2. **`current_user` cannot identify the caller here.** Inside a
--    SECURITY DEFINER function `current_user` is the function *owner*
--    (postgres), not whoever called it — that is what SECURITY DEFINER means.
--    A first version tested `current_user in ('service_role','postgres',...)`
--    and so returned true for everyone, including anon. `session_user` is no
--    better: every PostgREST request arrives as the `authenticator` role
--    regardless of which key was used.
--
-- What does identify the caller is the JWT PostgREST attaches to the request.
-- No JWT at all means nothing is proxying — a direct psql/migration
-- connection — which is already privileged.
--
-- Verified against production by setting `request.jwt.claims` per caller:
--
--   anon                  -> false
--   authenticated (other) -> false
--   authenticated (admin) -> true
--   service_role          -> true   (is_admin() is false here — see trap 1)
--   backend (no JWT)      -> true
--
-- STABLE, not IMMUTABLE: the claims vary per statement but not within one.

create or replace function public.can_write_league()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when nullif(current_setting('request.jwt.claims', true), '') is null
      then true
    else public.is_admin()
         or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
  end
$$;

comment on function public.can_write_league() is
  'True for the league admin, a service_role caller, or a direct backend connection (no PostgREST JWT). Guard for privileged SECURITY DEFINER functions. Deliberately does NOT test current_user: inside a SECURITY DEFINER function that is the owner, not the caller.';

revoke execute on function public.can_write_league() from public;
grant execute on function public.can_write_league() to anon, authenticated, service_role;
