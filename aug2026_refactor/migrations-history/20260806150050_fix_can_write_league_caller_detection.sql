-- Correct `can_write_league()` caller detection.
--
-- The first version tested `current_user in ('service_role','postgres',...)`.
-- That is wrong in a way that fails open: inside a SECURITY DEFINER function
-- `current_user` is the function *owner*, not the caller, so the check was
-- true for everyone — including anon. It was caught by a probe that called
-- `disable_roster_trigger()` as anon and expected a denial; the call succeeded.
--
-- `session_user` is no better: every PostgREST request arrives on the
-- `authenticator` role whichever key was used. The JWT is the only thing that
-- distinguishes callers, and its absence means no PostgREST is in front at all
-- (a direct psql/migration connection), which is already privileged.
--
-- Re-verified against production by setting `request.jwt.claims` per caller:
--   anon -> false, authenticated(other) -> false, authenticated(admin) -> true,
--   service_role -> true, no-JWT backend -> true.

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
