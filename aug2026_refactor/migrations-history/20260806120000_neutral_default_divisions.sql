-- Stop fabricating league-specific division names on every season insert.
--
-- `create_default_divisions()` fired on every INSERT into `seasons` and created
-- two divisions literally named 'Donkeys' and 'Ninjas' — names from one past
-- season that the admin then renames by hand each year (2025's are 'Assholes'
-- and 'Ninjas'). It fired during the 2026 rollover test and produced exactly
-- that surprise.
--
-- The client-side twin of this — `useSupabaseFantasyData.refreshData()`
-- auto-creating the same two divisions whenever a season had none — is gone
-- with that hook (§6.3). The trigger is deliberately kept rather than dropped:
-- without it a new season would have zero divisions, and standings, playoff
-- odds and the division-based ranking inputs all assume a season has some. The
-- names simply become neutral placeholders instead of stale league lore.
--
-- Reversal: restore the previous body with the two literal names.

create or replace function public.create_default_divisions()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
begin
  -- Placeholder names. The admin renames these; the point of creating them is
  -- that a season always has the two division slots the standings expect.
  insert into public.divisions (season_id, name, display_order) values
    (new.id, 'Division 1', 1),
    (new.id, 'Division 2', 2);

  return new;
end;
$function$;

comment on function public.create_default_divisions() is
  'Seeds two placeholder divisions for a new season. Names are intentionally '
  'generic — the admin renames them. See supabase/migrations/20260806120000.';
