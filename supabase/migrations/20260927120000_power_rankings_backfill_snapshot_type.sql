-- A snapshot reconstructed after the fact is its own kind of row.
--
-- 2025 was snapshotted by hand for weeks 1-6 (`manual`, 2025-10-07) and never
-- again: the weekly cron that writes `weekly` rows arrived with the 2026
-- refactor. `scripts/backfill-power-rankings.js` fills the missing weeks from
-- the historical calculator, and those rows are neither `weekly` (nothing ran
-- that Tuesday) nor `manual` (nobody pressed a button in 2025). `backfill`
-- says what they are, so a reader can always tell a ranking the league saw at
-- the time from one computed later.

alter table public.power_rankings_history
  drop constraint if exists power_rankings_history_snapshot_type_check;

alter table public.power_rankings_history
  add constraint power_rankings_history_snapshot_type_check
  check (snapshot_type = any (array['weekly', 'manual', 'season_end', 'backfill']));
