-- What each team has left of its FAAB budget.
--
-- Nothing here could answer that. `transactions.faab_spent` sums the winning
-- bids, which is what the record book wants, but it is not the budget: on
-- 2026-11-02 it had the first team at $114 of a $100 budget while ESPN, which
-- enforces the budget, had them at $87. ESPN's `transactionCounter` nets out
-- something the transaction feed does not show. So this is ESPN's own answer,
-- `settings.acquisitionSettings.acquisitionBudget` minus the team's
-- `transactionCounter.acquisitionBudgetSpent`, written by the rosters step, so
-- the daily refresh keeps it current after each waiver run.
--
-- Nullable, and NULL means unknown: a season the rosters step has not reached,
-- or one with no budget. 0 is a real answer, a team with nothing left.

ALTER TABLE "public"."teams" ADD COLUMN IF NOT EXISTS "faab_remaining" integer;

COMMENT ON COLUMN "public"."teams"."faab_remaining" IS
  'FAAB budget left, as ESPN reports it (acquisitionBudget - transactionCounter.acquisitionBudgetSpent). Written by the rosters step. NULL is unknown, never 0. Not transactions.faab_spent subtracted from the budget: see 20261103140000_faab_ledger.sql.';
