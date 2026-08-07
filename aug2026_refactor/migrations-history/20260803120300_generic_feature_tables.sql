-- Retire the year-suffixed tables (REFACTOR_ANALYSIS.md §3.1, §3.6).
--
-- awards_2025, playoffs_2025, playoffs_2025_config and transactions_2025 all
-- already carry (or can carry) a season_id -- the "2025" in the name was never
-- load-bearing, it just guaranteed that every rollover needed new DDL and ~30
-- source edits.
--
-- Each table is RENAMED rather than copied, so primary keys, foreign keys from
-- award_votes, RLS policies and PostgREST embed hints all follow the table and
-- no data is duplicated. A view under the old name keeps existing callers
-- working until they are repointed in P2; the views are auto-updatable, so
-- writes through the old names still land in the new tables.

-- ===========================================================================
-- A. awards  (awards_2025 + season_awards)
-- ===========================================================================

alter table public.awards_2025 rename to awards;

alter table public.awards
  add column if not exists source text not null default 'ballot',
  add column if not exists award_type text,
  add column if not exists winner_franchise_id uuid references public.league_franchises(id) on delete set null,
  add column if not exists winner_team_id uuid references public.teams(id) on delete set null,
  add column if not exists value numeric,
  add column if not exists value_label text,
  add column if not exists awarded_at timestamptz;

comment on column public.awards.source is
  'ballot = a league voting award (the old awards_2025 rows); computed = derived from game data by scripts/calculateSeasonAwards.js (the old season_awards rows).';
comment on column public.awards.winner_id is
  'Legacy free-text winner (an owner name). Prefer winner_franchise_id / winner_team_id.';

-- The old check allowed only the two ballot categories; computed awards bring
-- their own vocabulary.
alter table public.awards drop constraint if exists awards_2025_category_check;
alter table public.awards add constraint awards_category_check
  check (category is null or category in (
    'voted', 'non-voted',                                 -- ballot
    'standard', 'regular_season', 'dubious', 'advanced'   -- computed
  ));
alter table public.awards add constraint awards_source_check
  check (source in ('ballot', 'computed'));

-- Backfill the five archived seasons' computed awards. Ids are preserved, so
-- anything already holding a season_awards id keeps resolving.
insert into public.awards (
  id, season_id, title, description, category, source, award_type,
  winner_id, winner_franchise_id, winner_team_id, value, value_label,
  display_order, awarded_at, created_at
)
select
  sa.id,
  sa.season_id,
  sa.award_name,
  nullif(concat_ws(' ', sa.description, sa.notes), ''),
  sa.award_category,
  'computed',
  sa.award_type,
  f.owner_name,
  sa.franchise_id,
  sa.team_id,
  sa.value,
  sa.value_label,
  row_number() over (partition by sa.season_id order by sa.award_type),
  sa.awarded_date,
  sa.created_at
from public.season_awards sa
left join public.league_franchises f on f.id = sa.franchise_id
on conflict (id) do nothing;

create index if not exists awards_season_source_idx on public.awards (season_id, source);

-- Compat: existing callers still say awards_2025.
create view public.awards_2025
with (security_invoker = true) as
select id, season_id, title, description, icon, category, winner_id,
       winner_info, voting_options, display_order, created_at, updated_at
from public.awards
where source = 'ballot';

comment on view public.awards_2025 is
  'DEPRECATED compat shim over public.awards (source = ballot). Repoint callers to awards and drop this.';

grant select on public.awards_2025 to anon, authenticated;
grant insert, update, delete on public.awards_2025 to authenticated;

-- ===========================================================================
-- B. playoffs  (playoffs_2025 -> playoff_picks, playoffs_2025_config -> playoff_config)
-- ===========================================================================

alter table public.playoffs_2025        rename to playoff_picks;
alter table public.playoffs_2025_config rename to playoff_config;

-- The submission deadline was frozen into the RLS policy as a timestamp
-- literal, so 2026 picks would have been rejected by the database itself.
-- Read it from playoff_config instead.
drop policy if exists "Users can insert own picks" on public.playoff_picks;
drop policy if exists "Users can update own picks" on public.playoff_picks;

create policy "Users can insert own picks"
  on public.playoff_picks for insert to public
  with check (
    auth.uid() = user_id
    and now() < coalesce(
      (select c.submission_deadline from public.playoff_config c
        where c.season_id = playoff_picks.season_id),
      'infinity'::timestamptz
    )
  );

create policy "Users can update own picks"
  on public.playoff_picks for update to public
  using (
    auth.uid() = user_id
    and now() < coalesce(
      (select c.submission_deadline from public.playoff_config c
        where c.season_id = playoff_picks.season_id),
      'infinity'::timestamptz
    )
  );

-- playoff picks are per (user, matchup) *within a season*; the old constraint
-- would have collided the moment a 2026 bracket reused a matchup_id.
alter table public.playoff_picks drop constraint if exists playoffs_2025_user_matchup_unique;
alter table public.playoff_picks add constraint playoff_picks_season_user_matchup_key
  unique (season_id, user_id, matchup_id);

create view public.playoffs_2025
with (security_invoker = true) as
select * from public.playoff_picks;

create view public.playoffs_2025_config
with (security_invoker = true) as
select * from public.playoff_config;

comment on view public.playoffs_2025 is
  'DEPRECATED compat shim over public.playoff_picks.';
comment on view public.playoffs_2025_config is
  'DEPRECATED compat shim over public.playoff_config.';

grant select on public.playoffs_2025, public.playoffs_2025_config to anon, authenticated;
grant insert, update, delete on public.playoffs_2025, public.playoffs_2025_config to authenticated;

-- ===========================================================================
-- C. transactions  (team_transactions + transactions_2025)
-- ===========================================================================

alter table public.team_transactions rename to transactions;

-- Was pointing at historical_seasons; every season now lives in seasons.
alter table public.transactions drop constraint if exists team_transactions_season_id_fkey;
alter table public.transactions add constraint transactions_season_id_fkey
  foreign key (season_id) references public.seasons(id) on delete cascade;

alter table public.transactions
  add column if not exists team_id uuid references public.teams(id) on delete set null;

-- total_transactions was a stored sum kept in step with its parts by hand.
-- Verified equal to the sum on all 70 existing rows before converting.
-- mv_transaction_leaderboards aggregates the column, so it has to stand aside
-- for the swap and is recreated verbatim (against the new table name) below.
drop materialized view if exists public.mv_transaction_leaderboards;

alter table public.transactions drop column if exists total_transactions;
alter table public.transactions
  add column total_transactions integer
  generated always as (
    coalesce(free_agent_adds, 0) + coalesce(waiver_claims, 0)
    + coalesce(trades, 0) + coalesce(drops, 0)
  ) stored;

update public.transactions t
set team_id = tm.id
from public.teams tm
where tm.franchise_id = t.franchise_id
  and tm.season_id = t.season_id
  and t.team_id is null;

-- Fold in the current season, which was keyed by team instead of franchise.
insert into public.transactions (
  season_id, franchise_id, team_id, owner_name, espn_team_id,
  free_agent_adds, waiver_claims, trades, drops, faab_spent,
  last_synced_at, created_at, updated_at
)
select
  tm.season_id, tm.franchise_id, t.team_id, t.owner_name, t.espn_team_id,
  t.free_agent_adds, t.waiver_claims, t.trades, t.drops, t.faab_spent,
  t.last_synced_at, t.created_at, t.updated_at
from public.transactions_2025 t
join public.teams tm on tm.id = t.team_id
on conflict (franchise_id, season_id) do nothing;

create index if not exists transactions_season_id_idx on public.transactions (season_id);

create materialized view public.mv_transaction_leaderboards as
select
  tt.franchise_id,
  lf.owner_name,
  lf.display_name,
  sum(tt.free_agent_adds)               as total_free_agent_adds,
  sum(tt.waiver_claims)                 as total_waiver_claims,
  sum(tt.trades)                        as total_trades,
  sum(tt.drops)                         as total_drops,
  sum(tt.total_transactions)            as total_all_transactions,
  sum(tt.faab_spent)                    as total_faab_spent,
  round(avg(tt.total_transactions), 1)  as avg_transactions_per_season,
  round(avg(tt.waiver_claims), 1)       as avg_waivers_per_season,
  count(tt.season_id)                   as seasons_tracked,
  max(tt.total_transactions)            as most_active_season_transactions,
  min(tt.total_transactions)            as least_active_season_transactions,
  now()                                 as calculated_at
from public.transactions tt
join public.league_franchises lf on tt.franchise_id = lf.id
group by tt.franchise_id, lf.owner_name, lf.display_name;

grant select on public.mv_transaction_leaderboards to anon, authenticated;

alter table public.transactions_2025 rename to transactions_2025_legacy;

create view public.team_transactions
with (security_invoker = true) as
select id, franchise_id, season_id, owner_name, espn_team_id,
       free_agent_adds, waiver_claims, trades, drops, total_transactions,
       faab_spent, last_synced_at, created_at, updated_at
from public.transactions;

-- Read-only on purpose: the only writer was scripts/weeklyUpdate.js, which is
-- repointed to public.transactions in the same change as this migration.
create view public.transactions_2025
with (security_invoker = true) as
select t.id, t.team_id, t.owner_name, t.espn_team_id,
       t.free_agent_adds, t.waiver_claims, t.trades, t.drops,
       t.faab_spent, t.last_synced_at, t.created_at, t.updated_at
from public.transactions t
join public.seasons s on s.id = t.season_id
where s.is_active;

comment on view public.team_transactions is
  'DEPRECATED compat shim over public.transactions.';
comment on view public.transactions_2025 is
  'DEPRECATED compat shim: transactions for whichever season is active. Read-only.';

grant select on public.team_transactions, public.transactions_2025 to anon, authenticated;
grant insert, update, delete on public.team_transactions to authenticated;
