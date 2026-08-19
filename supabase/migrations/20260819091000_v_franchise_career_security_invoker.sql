-- Restore `security_invoker` on `v_franchise_career`.
--
-- Migration 20260818120000 recreated the view to add `games_played > 0` to its
-- standings join, using a plain `create or replace view`. That resets the
-- view's reloptions, so it silently lost `security_invoker = true` — the
-- setting every other `v_*` view in this schema carries — and started
-- enforcing the view owner's permissions rather than the caller's. Supabase's
-- linter flags it as `security_definer_view`, at ERROR level.
--
-- Nothing was exposed by it: every league table is public-read. But a view
-- that ignores the caller's identity is not what the rest of the schema does,
-- and the next view added by copying this one would inherit the mistake.
--
-- 20260818120000 now spells the option out, so a replay from the baseline
-- never loses it and this is a no-op.

alter view public.v_franchise_career set (security_invoker = true);
