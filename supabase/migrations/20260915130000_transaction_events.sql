-- One row per executed ESPN transaction.
--
-- `transactions` has always been one row per franchise per season: counts of
-- adds, waivers, trades and drops, and the FAAB total. Counts cannot answer
-- "who trades with whom" or "what was the biggest single bid", and those are
-- records the league wants. ESPN's `mTransactions2` view — which the weekly
-- sync already fetches to produce the counts — carries each transaction
-- individually, so this stores what the counting used to throw away.
--
-- Written only by `services/db/transactionEvents.js`, from the same fetch that
-- writes `transactions` (the sync's transactions step, and
-- `scripts/backfill-transactions.js` for 2020-25). Only EXECUTED transactions,
-- and only the three kinds the counts are made of.
--
-- Arrays rather than jsonb: `caseMap` rewrites jsonb keys in transit, and a
-- list of ids has no keys to rewrite.

create table if not exists public.transaction_events (
  id                  uuid primary key default gen_random_uuid(),
  season_id           uuid not null references public.seasons(id) on delete cascade,
  espn_transaction_id text not null,
  type                text not null,
  scoring_period      integer,
  processed_at        timestamptz,
  team_id             uuid references public.teams(id) on delete set null,
  franchise_id        uuid references public.league_franchises(id) on delete set null,
  bid_amount          numeric,
  franchise_ids       uuid[] not null default '{}',
  espn_player_ids     integer[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint transaction_events_season_espn_key unique (season_id, espn_transaction_id),
  constraint transaction_events_type_check check (type in ('FREEAGENT', 'WAIVER', 'TRADE_ACCEPT'))
);

-- Every read is "this kind of transaction, across seasons" — trades for the
-- partner record, waivers for the bid record.
create index if not exists transaction_events_type_season_idx
  on public.transaction_events (type, season_id);

comment on table public.transaction_events is
  'One row per executed ESPN transaction (free-agent add, waiver claim, accepted trade). The detail behind the per-season counts in transactions, from the same mTransactions2 fetch. Written by services/db/transactionEvents.js only.';
comment on column public.transaction_events.team_id is
  'The team that made the transaction: the claimant for a waiver or add, the proposer for a trade.';
comment on column public.transaction_events.bid_amount is
  'FAAB bid, waiver claims only. Null for anything without a bid.';
comment on column public.transaction_events.franchise_ids is
  'Every franchise the transaction moved a player to or from. One for an add or claim; two or more for a trade.';
comment on column public.transaction_events.espn_player_ids is
  'ESPN ids of the players acquired: the ADD for an add or claim, every player moved in a trade.';

alter table public.transaction_events enable row level security;

-- The standard league-table posture: anybody may read, only the league may
-- write. `can_write_league()` and not `is_admin()`, because the writer is the
-- GitHub Actions cron holding the service role.
drop policy if exists "transaction_events public read" on public.transaction_events;
create policy "transaction_events public read" on public.transaction_events
  for select using (true);

drop policy if exists "transaction_events league write" on public.transaction_events;
create policy "transaction_events league write" on public.transaction_events
  using (public.can_write_league()) with check (public.can_write_league());

grant all on table public.transaction_events to anon;
grant all on table public.transaction_events to authenticated;
grant all on table public.transaction_events to service_role;
