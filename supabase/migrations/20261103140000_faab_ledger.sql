-- What each team has had of its FAAB, what it spent, and what is left.
--
-- Nothing here could answer that. `transactions.faab_spent` sums the winning
-- bids, and bids do not add up to the budget: teams trade FAAB, and the
-- commissioner awards it for pick'ems, takes and the like. On 2026-11-02 the
-- bids put one team at $114 of a $100 budget while ESPN had them at $87 and was
-- still accepting their bids. Three sources make it add up (utils/faabLedger.js):
--
--   spent    the winning bids, `transactions.faab_spent`, as before
--   traded   ESPN's league activity feed, the only place with the amounts
--   awarded  what is left of ESPN's `transactionCounter.acquisitionBudgetSpent`
--            once bids and trades are taken out, because the commissioner's
--            edit lands there and the feed logs it with no amount. A net figure
--            per team, not a list of prizes.
--
-- All four are NULL until the sync has read them, and NULL is unknown, never 0.
-- They sit beside `faab_spent`, in the row the transactions step already writes.

ALTER TABLE "public"."transactions"
  ADD COLUMN IF NOT EXISTS "faab_budget" integer,
  ADD COLUMN IF NOT EXISTS "faab_traded_in" integer,
  ADD COLUMN IF NOT EXISTS "faab_traded_out" integer,
  ADD COLUMN IF NOT EXISTS "faab_awarded" integer;

COMMENT ON COLUMN "public"."transactions"."faab_budget" IS
  'The season''s FAAB budget, from ESPN''s league settings.';
COMMENT ON COLUMN "public"."transactions"."faab_traded_in" IS
  'FAAB received in processed trades, from ESPN''s league activity feed.';
COMMENT ON COLUMN "public"."transactions"."faab_traded_out" IS
  'FAAB sent in processed trades, from ESPN''s league activity feed.';
COMMENT ON COLUMN "public"."transactions"."faab_awarded" IS
  'FAAB the commissioner added, net of anything taken away: bids minus ESPN''s acquisitionBudgetSpent, minus net FAAB traded. Derived, because ESPN does not record the amounts. See utils/faabLedger.js.';

-- The tables read this one, so a page need not join the ledger to show a number.

ALTER TABLE "public"."teams" ADD COLUMN IF NOT EXISTS "faab_remaining" integer;

COMMENT ON COLUMN "public"."teams"."faab_remaining" IS
  'FAAB left, as ESPN reports it (acquisitionBudget - transactionCounter.acquisitionBudgetSpent). Written by the transactions step. NULL is unknown, never 0. Equal to the ledger on `transactions` by construction: see utils/faabLedger.js.';
