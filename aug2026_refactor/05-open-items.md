# Open items

Things deliberately left undone, and why. Ordered by urgency.

> Updated 2026-08-06 after **§7 and §8** (ffAnalytics killed, one deploy
> topology, the scheduled sync job, scripts pruned, real type-checking, tests
> and CI). **Items 4, 6 and 7 are resolved**, and item 8 is largely cleared;
> see [`08-automation.md`](08-automation.md) and [`09-hygiene.md`](09-hygiene.md).
>
> Updated again 2026-08-06 after **§2 (P0 security)** — see
> [`10-security.md`](10-security.md). **Item 2 is resolved.** Every phase of
> `REFACTOR_ANALYSIS.md` is now complete; the one substantive thing outstanding
> is **rotating the ESPN credential** (item 1), which is the owner's to do.

## 1. ESPN credentials — code side done, rotation is the owner's

**`config/espn-config.js` no longer contains a credential.** It is a pure
environment loader: `ESPN_S2` and `ESPN_SWID` come from `process.env`, with no
literal fallback. `.env.local` (gitignored) holds them locally;
`.github/workflows/sync-week.yml` reads them from repository secrets.
`.env.example` documents both. The file stays tracked — there is nothing secret
in it any more, so gitignoring it would only mean every clone has to recreate a
loader.

`requireEspnCredentials()` is available for callers that should fail loudly
rather than silently fetching a public-league shape.

SWID is normalised to its brace-wrapped form. **Both forms were tested against
the live league and both authenticate**, so this is convenience, not a fix — the
stored value can be pasted with or without braces.

### Still outstanding, and deliberately not done here

1. **Rotation.** As of 2026-08-06 the value in `.env.local` is byte-identical to
   the one that was committed — the credential was relocated, not rotated. The
   owner is handling this.
2. **History purge.** Skipped by decision. The secret remains in 4 commits
   across `main`, `awards`, `movie_tracker` and this branch, plus their remotes.

Mitigating context for both: the repository is **private with 0 forks**, so the
exposure is bounded by repo access rather than public. Once the cookie is
rotated the committed one is worthless and the purge becomes cosmetic — which is
why the order matters and why purging first was declined.

## 2. ~~The rest of §2 (P0 security)~~ — RESOLVED

Done 2026-08-06 across nine migrations; see [`10-security.md`](10-security.md).
Supabase security lints **169 → 52, ERRORs 2 → 0**.

- 48 SECURITY DEFINER functions callable by `anon` → 21, all read-only
- 16 tables writable by any authenticated user → 0; all public-read /
  `is_admin()`-write
- `team_analytics_summary` (RLS disabled, the highest-severity finding) dropped
  with ffAnalytics in §7.4
- Always-true policies on `divisions`, `transactions_2025_legacy` and
  `pick_em_submissions_backup` replaced
- `roster_stats` recreated with `security_invoker`; the other two definer views
  went with ffAnalytics
- 62 functions with mutable `search_path` → 0

Two things this could not do:

- **Leaked-password protection** remains off. It is an Auth dashboard toggle
  (Authentication → Policies → Password protection), not settable from SQL or
  the management API.
- **The 3 materialised views selectable over the API** are left alone. §2.5
  says that is fine when intentionally public, and the History tab renders them.

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

## 7. ~~TypeScript types are generated but nothing type-checks them~~ — RESOLVED

Done in §8.3, exactly as scoped here: `tsconfig.json` includes `**/*.ts` only,
with `allowJs: false` and `checkJs: false`, so `jsconfig.json`'s editor
behaviour over the untyped JS is unaffected. It checks one file today
(`types/supabase.ts`) and grows as modules are renamed to `.ts` —
`services/db/` first. Verified non-vacuous with a planted type error.

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
- ~~**`**/__tests__/` is still broadly gitignored**~~ — resolved in §8.3. The
  ignore is gone, the surviving 23 files are tracked, and the suite is green.
  Most of the "broken" files turned out to be broken only by a stale import path
  or a missing provider; see [`09-hygiene.md`](09-hygiene.md) §4.
- ~~**`ffAnalyticsRetry.calculateDelay` is flaky by construction.**~~ — gone
  with the subsystem (§7.4). The suite is no longer flaky because it no longer
  exists.
- **`LEAGUE_HISTORY_README.md` is stale.** It documents `supabaseDataManager`,
  `useSupabaseFantasyData` and the `historical_*` tables — all deleted or
  superseded. Rewrite it alongside the `leagueHistoryManager` deletion below.
- **`services/leagueHistoryManager.js` (1,888 lines) was not split.** §5.1 names
  only the data manager, and most of that file is the live+historical merge code
  that §3's views already made redundant — it should be deleted against
  `v_franchise_career` / `v_head_to_head`, not reorganised.
- ~~**`espnScheduleFetcher` and `pickEmTimeService` still take a data
  manager**~~ — `espnScheduleFetcher` and `espnRosterUpdater` now take a `ctx` /
  `db`; `espnTransactionFetcher` held one it never used and no longer builds it.
  `pickEmTimeService` takes a raw client, not a data manager, and is unchanged.
- ~~**`scripts/backfillTransactions2025.js` is broken**~~ — deleted in §8.2
  along with 37 other completed one-offs and applied SQL files.
- ~~**Scripts run on import.**~~ — resolved in §7. All eight surviving scripts
  guard their entry point, and `config/espn-config.js` no longer prints its
  usage banner on import either.
- **`refresh_team_stats` computes win% as `wins / games`**, ignoring ties as
  half-wins the way `v_team_standings` does. No ties exist in any season on
  record, so the two agree today.
- ~~**The duelling week effects in `FantasyFootballApp.jsx` remain**~~ — this
  bullet was already stale when §6 shipped and is corrected here: the file
  contains **no `useEffect` at all**, and `useViewedWeek()` hands back
  `viewedWeek` (UI state) and `actualWeek` (derived) as separate values that
  never write to each other, exactly as §6.4 required.

## 9. Left open by §7 and §8

- **The scheduled sync has never fired.** `.github/workflows/sync-week.yml` is
  correct as far as a `--dry-run` against production can show, but the 2025
  season is over, so a real run was deliberately not triggered. Its first live
  exercise will be the 2026 season. The workflow needs four repository secrets
  set before then: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ESPN_S2`,
  `ESPN_SWID`.
- **Lint is not a gate.** 265 eslint errors predate this work, so CI runs lint
  with `continue-on-error: true`. Removing that flag is a backlog task, not a
  config change.
- **28 test cases are skipped**, each commented. They assert on exact Tailwind
  class strings and label text that changed in §6. Rewriting them against the
  current markup is a real (small) task.
- **`vendor-charts` (275 kB) is still eager**, unchanged from §6.
- **Pick'ems / awards / playoffs internals** still manage their own
  `useState` + `useEffect` load cycles rather than using the query hooks,
  unchanged from §6.
