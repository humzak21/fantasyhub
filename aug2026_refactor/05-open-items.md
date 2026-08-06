# Open items

Things deliberately left undone, and why. Ordered by urgency.

> Updated 2026-08-06 after **all of §6** (query layer, week state, god-class
> deletion, mobile fork, ui trees, code splitting). Items 1, 2, 3 and 5 are
> unchanged by that work. **Items 4 and 6 are resolved**; see
> [`07-frontend.md`](07-frontend.md).

## 1. ESPN credentials are still live in git — §2.1

`config/espn-config.js` still contains a working `espn_s2` / `SWID` pair for the
ESPN account, and it is in git history.

**This was left in place on purpose.** Deleting it from the working tree would
break the sync scripts while fixing nothing, because the credential is already
in every clone of the history. The fix has an order:

1. **Rotate first** — log out of ESPN everywhere to invalidate the session
2. Move the new values to `ESPN_S2` / `ESPN_SWID` environment variables
   (`leagueId` and `seasonYear` already read from `process.env`)
3. Purge from history (`git filter-repo --path config/espn-config.js
   --invert-paths`), then force-push
4. Add the file to `.gitignore` with a committed `espn-config.example.js`

Until step 1 happens, the exposure is unchanged by anything in this refactor.

## 2. The rest of §2 (P0 security)

Untouched. `is_admin()` now exists but nothing has been retrofitted onto it:

- 46 `SECURITY DEFINER` functions still executable by `anon`, including
  `execute_trade`, `drop_player_from_roster`, `disable_roster_trigger`
- RLS still disabled on `team_analytics_summary`
- Always-true policies still on `divisions` and `pick_em_submissions_backup`
- `seasons` / `teams` / `games` / `weeks` still allow writes from **any**
  authenticated user (`auth.uid() IS NOT NULL`), not just the admin

Two migrations here did add `search_path` pinning to the functions they touched
(`refresh_team_stats`, `update_playoff_pick_results`), chipping at the 66
flagged for mutable search paths.

## 3. Nothing has been dropped yet

By design — the new read paths should run in production first. Still present and
now redundant:

| Object | Superseded by |
|---|---|
| `historical_seasons`, `historical_teams`, `historical_games` | unified `seasons`/`teams`/`games` |
| `season_awards` | `awards` where `source = 'computed'` |
| `transactions_2025_legacy` | `transactions` |
| `awards_2025`, `playoffs_2025`, `playoffs_2025_config`, `team_transactions`, `transactions_2025` views | the generic tables |
| `head_to_head_records`, `franchise_records` | `v_head_to_head`, `v_record_book` |
| `nfl_week_calendar` | `season_week_start()` — every row is exactly `start_date + 7×(week−1)` |
| ~25 derived columns on `teams` | `v_team_standings` |
| `user_id` on `seasons`/`teams`/`games`/`weeks` | nothing; it is dead scaffolding |
| Empty tables: `pick_em_results`, `pick_em_weekly_scores`, `pick_em_season_standings`, `weekly_lineups`, `roster_history`, `historical_rosters` | — |

**The drop migration should come after P2 repoints the code**, not before.
Callers still read the compat views.

§5 moved those callers into `services/db/` but did not change what they select:
`awards.js` still reads `awards_2025`, `transactions.js` still reads
`transactions_2025`, `playoffs.js` still reads `playoffs_2025`. That was
deliberate — the split was verified by diffing its output against the pre-split
class against production, and changing the queries in the same pass would have
made that comparison meaningless. Repointing them onto the generic tables is now
a small, contained edit in one module each.

## 4. ~~`trigger_create_default_divisions` fabricates divisions~~ — RESOLVED

Both halves moved together, as this item required. The client side effect went
with `useSupabaseFantasyData`; the trigger was kept (a season with zero
divisions breaks standings, playoff odds and the ranking inputs) but its names
are now `Division 1` / `Division 2` instead of one past season's lore —
`20260806120000_neutral_default_divisions.sql`.

## 5. No baseline schema dump

Migration `00000000000000_baseline_placeholder.sql` is a no-op marker. The
pre-existing schema (40 tables, ~66 functions) has no captured definition. Run
`npx supabase db pull baseline_schema` once the CLI is linked:

```bash
npx supabase login
npx supabase link --project-ref kvcnijyyfylxfarrlxkv
npx supabase db pull baseline_schema
```

Do this before authoring further migrations.

## 6. ~~`SupabaseDataManager` still exists, as a facade~~ — RESOLVED

Deleted, along with the 16 components, 7 scripts and 3 services that held one.
TanStack Query is in and `useSupabaseFantasyData` is gone. Details in
[`07-frontend.md`](07-frontend.md).

`pickEmTimeService` is the one remaining holder of a raw client; it takes the
client directly rather than a data manager, so it was out of scope for the
deletion. Still a candidate for a domain function.

§6 is now complete. What it left behind is listed in
[`07-frontend.md`](07-frontend.md) §11.

## 7. TypeScript types are generated but nothing type-checks them — §5.3

`types/supabase.ts` is committed and regenerable with `npm run db:types`. It is
already load-bearing: the case-mapping test reads it as data and asserts every
column in the schema round-trips.

But `npm run type-check` still does nothing — there is no `tsconfig.json`, only
`tsconfig.node.json`, so `tsc --noEmit` prints its help text and exits 0. This
is the §8.3 "type-check is theater" finding, unchanged.

Adding a `tsconfig.json` was deliberately not done here: the repo has a
`jsconfig.json`, and TypeScript ignores it entirely once a `tsconfig.json`
exists, which would change editor behaviour across ~100k lines of untyped JS as
a side effect of a data-layer change. Do it as its own step, scoped to `.ts`
files with `checkJs: false`.

## 8. Smaller loose ends

- **`awards_metadata` not folded in.** §3.6 suggests merging it into `awards`.
  It is already season-keyed and not year-suffixed, so the churn/risk did not
  pay. `awards_release_at` did move onto `seasons`.
- **Third/fifth-place games use the generic `playoff` type.**
  `games_type_check` has no dedicated placement type.
- **Week-16/17 games are not linked to `playoff_picks.game_id`.** Those
  matchups (`div1_semi`, `championship`, `con_r2_*`, …) still have a null
  `game_id`, so `update_playoff_pick_results` has nothing to update. Scoring
  those picks needs the games linked.
- **`**/__tests__/` is still broadly gitignored**, now negated for `utils/` and
  `services/db/`. Roughly 25 test files remain untracked and failing. **Five of
  them now import `Mobile*` components deleted in §6.1** and cannot pass. They
  are untracked, so removing them is the user's call — resolve alongside the
  ffAnalytics keep-or-kill decision (§7.4).
- **`ffAnalyticsRetry.calculateDelay` is flaky by construction.** It clamps to
  `maxDelay` and *then* adds ±10% jitter, so `should respect max delay` fails
  whenever `Math.random() > 0.5`. Apply the jitter before the clamp.
- **`services/leagueHistoryManager.js` (1,888 lines) was not split.** §5.1 names
  only the data manager, and most of that file is the live+historical merge code
  that §3's views already made redundant — it should be deleted against
  `v_franchise_career` / `v_head_to_head`, not reorganised.
- ~~**`espnScheduleFetcher` and `pickEmTimeService` still take a data
  manager**~~ — `espnScheduleFetcher` and `espnRosterUpdater` now take a `ctx` /
  `db`; `espnTransactionFetcher` held one it never used and no longer builds it.
  `pickEmTimeService` takes a raw client, not a data manager, and is unchanged.
- **`scripts/backfillTransactions2025.js` is broken and should be deleted.** It
  still writes to the `transactions_2025` compatibility *view* and fails with
  "cannot insert into view". It is a completed one-off; §8.2 says delete.
- **Scripts run on import.** None of `scripts/*.js` guard their top-level
  invocation, so `import('./scripts/weeklyUpdate.js')` performs a full
  production sync. Add an `import.meta.main`-style guard before anything
  imports them programmatically. See [`07-frontend.md`](07-frontend.md) §7.
- **`refresh_team_stats` computes win% as `wins / games`**, ignoring ties as
  half-wins the way `v_team_standings` does. No ties exist in any season on
  record, so the two agree today.
- **The duelling week effects in `FantasyFootballApp.jsx` remain** (§6.4).
  Week derivation now has one source, but *viewed* week and *actual* week are
  still not cleanly separated.
