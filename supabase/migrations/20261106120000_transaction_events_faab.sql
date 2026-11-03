-- The FAAB a trade moved.
--
-- ESPN lets managers trade FAAB from the 2026 season on. A trade's own
-- transaction row carries an ACQUISITION_BUDGET_TRADE item saying who sent
-- budget to whom, and no amount; the amount is a message (type 290) in the
-- league activity feed, in the same topic as the trade, whose `targetId` is the
-- trade's transaction id. The sync already reads that feed for the FAAB ledger
-- (`utils/faabLedger.js`), so each trade can carry what it moved.
--
-- Three columns rather than an item in `espn_player_ids`: the budget item has
-- player id 0, and listing it there made a trade read "Unknown player".
-- `faab_amount` NULL with a from/to set is a trade known to have moved budget
-- by an amount nobody recorded (the feed exists for the active season only).
-- All three NULL is a trade that moved none, or a row written before this.
--
-- Written by `services/db/transactionEvents.js`. The active season gets it on
-- the next sync; no earlier season could trade FAAB, so there is nothing to
-- backfill.

alter table public.transaction_events
  add column if not exists faab_amount integer,
  add column if not exists faab_from_franchise_id uuid references public.league_franchises(id) on delete set null,
  add column if not exists faab_to_franchise_id uuid references public.league_franchises(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transaction_events_faab_amount_check'
  ) then
    alter table public.transaction_events
      add constraint transaction_events_faab_amount_check check (faab_amount is null or faab_amount >= 0);
  end if;
end $$;

comment on column public.transaction_events.faab_amount is
  'Dollars of FAAB the trade moved, from the league activity feed (message 290). NULL when unknown, never 0 for "unknown".';
comment on column public.transaction_events.faab_from_franchise_id is
  'The franchise whose FAAB the trade moved. NULL when the trade moved none.';
comment on column public.transaction_events.faab_to_franchise_id is
  'The franchise the FAAB went to. NULL when the trade moved none.';
