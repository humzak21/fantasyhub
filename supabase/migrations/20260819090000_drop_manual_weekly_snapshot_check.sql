-- One straggler from the legacy-history drop.
--
-- `manual_weekly_snapshot_check` was written as
-- `manual_weekly_snapshot_check(season_year integer default 2025)`, and
-- `drop function ... ()` names the zero-argument overload — of which there is
-- none — so `if exists` made the miss silent. It survived, and its body calls
-- `execute_weekly_snapshot_if_needed`, which did not: the function is now a
-- guaranteed runtime error for anyone who finds it.
--
-- The signature is corrected in 20260818130000 as well, so a replay from the
-- baseline drops it there and this is a no-op.

drop function if exists public.manual_weekly_snapshot_check(integer);
