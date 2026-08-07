-- Season config backbone.
--
-- Everything the app currently hardcodes per year -- week-1 start date, week
-- count, ESPN league/season, pick'em open/close/reveal times, awards release --
-- moves onto the `seasons` row. After this, rolling over to a new season is an
-- INSERT, not a code edit (REFACTOR_ANALYSIS.md §3.6, §4).
--
-- The offsets below are not invented: they were reverse-engineered from the 13
-- existing pick_em_weeks rows, which consistently resolve to
--   opens   Tuesday  04:00 America/New_York  (week start)
--   closes  Thursday 20:00 America/New_York  (start + 2 days)
--   reveals Tuesday  12:00 America/New_York  (start + 7 days)
-- across both the EDT and EST halves of the 2025 season.

-- ---------------------------------------------------------------------------
-- 1. Config columns
-- ---------------------------------------------------------------------------

alter table public.seasons
  add column if not exists start_date date,
  add column if not exists timezone text not null default 'America/New_York',
  add column if not exists espn_league_id text,
  add column if not exists espn_season_year integer,
  add column if not exists awards_release_at timestamptz,
  add column if not exists pickem_open_offset_days integer not null default 0,
  add column if not exists pickem_open_time time not null default '04:00',
  add column if not exists pickem_close_offset_days integer not null default 2,
  add column if not exists pickem_close_time time not null default '20:00',
  add column if not exists pickem_reveal_offset_days integer not null default 7,
  add column if not exists pickem_reveal_time time not null default '12:00';

comment on column public.seasons.start_date is
  'First day of fantasy week 1 (a Tuesday). Sole source for all week math.';
comment on column public.seasons.timezone is
  'IANA zone that all season-relative wall-clock times resolve in.';
comment on column public.seasons.pickem_close_offset_days is
  'Days after the week start that pick''ems close. 2 = Thursday.';

-- `status` is derived from the legacy booleans rather than duplicated, so the
-- two can never disagree while code is still being repointed off is_active.
alter table public.seasons
  drop column if exists status;

alter table public.seasons
  add column status text
  generated always as (
    case
      when coalesce(is_completed, false) then 'archived'
      when coalesce(is_active, false)    then 'active'
      else 'upcoming'
    end
  ) stored;

comment on column public.seasons.status is
  'archived | active | upcoming. Derived from is_completed/is_active; use this instead of comparing season.year to a literal.';

-- ---------------------------------------------------------------------------
-- 2. Integrity
-- ---------------------------------------------------------------------------

create unique index if not exists seasons_year_key
  on public.seasons (year);

-- At most one active season, enforced by the database rather than by
-- setActiveSeason() remembering to deactivate the others first.
create unique index if not exists seasons_one_active_idx
  on public.seasons ((is_active))
  where is_active;

-- ---------------------------------------------------------------------------
-- 3. Backfill the 2025 season from the values that were hardcoded in source
-- ---------------------------------------------------------------------------

update public.seasons
set start_date        = coalesce(start_date, date '2025-09-02'),  -- utils/weekCalculator.js:8
    espn_league_id    = coalesce(espn_league_id, '67674700'),     -- config/espn-config.js
    espn_season_year  = coalesce(espn_season_year, 2025),
    awards_release_at = coalesce(
      awards_release_at,
      (date '2025-12-09' + time '00:00') at time zone 'America/New_York'  -- FantasyFootballApp.jsx:317
    )
where year = 2025;

-- ---------------------------------------------------------------------------
-- 4. Week derivation, server-side
-- ---------------------------------------------------------------------------
-- The weekly sync job (§7.2) and the UI must agree on "what week is it". Both
-- now derive from the same expression instead of each keeping a constant.

create or replace function public.season_week_start(p_season_id uuid, p_week integer)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select ((s.start_date + ((p_week - 1) * 7)) + time '00:00') at time zone s.timezone
  from public.seasons s
  where s.id = p_season_id
$$;

comment on function public.season_week_start(uuid, integer) is
  'Instant at which the given fantasy week begins. Weeks roll over Tuesday midnight in the season timezone.';

create or replace function public.season_current_week(p_season_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(1, least(
    coalesce(s.total_weeks, s.regular_season_weeks + s.playoff_weeks),
    floor(
      extract(epoch from (
        now() - ((s.start_date + time '00:00') at time zone s.timezone)
      )) / 604800
    )::integer + 1
  ))
  from public.seasons s
  where s.id = p_season_id
$$;

comment on function public.season_current_week(uuid) is
  'Current fantasy week, clamped to [1, total_weeks]. Replaces the SEASON_START_DATE constant in utils/weekCalculator.js.';

-- ---------------------------------------------------------------------------
-- 5. One row the client can read to configure itself
-- ---------------------------------------------------------------------------

create or replace view public.v_active_season
with (security_invoker = true) as
select
  s.*,
  coalesce(s.total_weeks, s.regular_season_weeks + s.playoff_weeks) as week_count,
  s.regular_season_weeks + 1                                       as playoff_start_week,
  public.season_current_week(s.id)                                 as current_week
from public.seasons s
where s.is_active;

comment on view public.v_active_season is
  'The active season plus derived week bounds. Single source for client-side season config.';

grant select on public.v_active_season to anon, authenticated;

-- Note: public.nfl_week_calendar is now redundant -- every one of its 2025 rows
-- is exactly start_date + 7*(week-1). It is left in place until the code that
-- reads it is repointed, then dropped (§3.3).
