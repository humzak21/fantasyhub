-- A division that survives its season.
--
-- `divisions` is per-season by construction: `id` is a serial, a row belongs to
-- one `season_id`, and `teams.division_id` points at that year's row. That part
-- is right — membership genuinely changes every year. What was missing is the
-- other half: a way to say *this* division is last year's division, renamed.
--
-- Today that continuity is implicit. `copyDivisionsToSeason` matches on
-- `display_order`, which works only for as long as nobody reorders anything,
-- and leaves no trace afterwards — nothing in the database records that the
-- 2026 'Assholes' and the 2020 'East' are the same division under two names.
--
-- This mirrors `league_franchises`, which solved the identical problem for
-- teams: identity in its own table, a nullable pointer on the season row, and
-- the carry-forward path threading it through. Nothing reads it yet — that is
-- the point. It is what makes a division-history view possible later without a
-- backfill nobody can do once the display orders have drifted.

create table if not exists public.league_divisions (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

comment on table public.league_divisions is
  'Cross-season division identity. `divisions` rows are per-season and point '
  'at one of these; the label is a human handle, not the season''s name.';

alter table public.league_divisions enable row level security;

-- The same shapes `divisions` carries: public read, admin write.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'league_divisions'
      and policyname = 'Allow public read access to league_divisions'
  ) then
    create policy "Allow public read access to league_divisions"
      on public.league_divisions for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'league_divisions'
      and policyname = 'Allow authenticated users to read league_divisions'
  ) then
    create policy "Allow authenticated users to read league_divisions"
      on public.league_divisions for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'league_divisions'
      and policyname = 'league_divisions admin write'
  ) then
    create policy "league_divisions admin write"
      on public.league_divisions
      using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

grant all on table public.league_divisions to anon;
grant all on table public.league_divisions to authenticated;
grant all on table public.league_divisions to service_role;

drop trigger if exists update_league_divisions_updated_at on public.league_divisions;
create trigger update_league_divisions_updated_at
  before update on public.league_divisions
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- The pointer
-- ---------------------------------------------------------------------------

alter table public.divisions
  add column if not exists division_identity_id uuid
  references public.league_divisions(id) on delete set null;

comment on column public.divisions.division_identity_id is
  'Which cross-season division this row is an instance of. Nullable: the '
  'create_default_divisions trigger seeds placeholder rows without one, and '
  'the app fills it in on carry-forward or on an explicit create.';

create index if not exists idx_divisions_division_identity_id
  on public.divisions using btree (division_identity_id);

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
--
-- By `display_order`, which is what continuity has actually meant here: every
-- season's order-1 division is the same division as every other season's, and
-- likewise order 2. The label is that order's name in the most recent season,
-- because that is the one anybody would recognise.
--
-- Idempotent: an order that already has an identity keeps it, and a row that
-- already points somewhere is left alone.

do $$
declare
  r     record;
  v_id  uuid;
begin
  for r in
    select distinct on (d.display_order) d.display_order, d.name
    from public.divisions d
    join public.seasons s on s.id = d.season_id
    order by d.display_order, s.year desc
  loop
    select dv.division_identity_id into v_id
    from public.divisions dv
    where dv.display_order = r.display_order
      and dv.division_identity_id is not null
    limit 1;

    if v_id is null then
      insert into public.league_divisions (label) values (r.name) returning id into v_id;
    end if;

    update public.divisions dv
       set division_identity_id = v_id
     where dv.display_order = r.display_order
       and dv.division_identity_id is null;
  end loop;
end $$;
