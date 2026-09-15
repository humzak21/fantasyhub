-- Which way each player in a transaction went.
--
-- `transaction_events` stored a trade's players and the franchises it touched,
-- but not who received whom, so a trade could be counted and not read: "these
-- three players moved between A and B" is not a trade anybody recognises.
-- ESPN's items carry a from and a to team per player, and the parser dropped
-- them. History → Records now opens a trade record to the trades behind it,
-- and that needs the direction.
--
-- Two arrays aligned index for index with `espn_player_ids` — arrays because
-- this table already uses them (`caseMap` rewrites jsonb keys in transit).
-- A NULL column means the row was written before direction was stored, and a
-- reader must not guess a side. A NULL element means that end was not a league
-- team: the free-agent pool, where the drop that made room for a trade goes.
--
-- Written by `services/db/transactionEvents.js`. Rows for 2020-25 get their
-- direction by re-running `scripts/backfill-transactions.js`, which upserts on
-- (season_id, espn_transaction_id); the active season gets it on the next sync.

alter table public.transaction_events
  add column if not exists player_from_franchise_ids uuid[],
  add column if not exists player_to_franchise_ids uuid[];

comment on column public.transaction_events.player_from_franchise_ids is
  'Aligned with espn_player_ids: the franchise each player left. NULL element for the free-agent pool; NULL column for a row written before direction was stored.';
comment on column public.transaction_events.player_to_franchise_ids is
  'Aligned with espn_player_ids: the franchise each player joined. NULL element for the free-agent pool (a drop); NULL column for a row written before direction was stored.';
