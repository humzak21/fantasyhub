# §6 — Frontend architecture (P3)

Stages 1 and 2 of four. Sections **6.3 (the mega-hook)** and **6.4 (week state
has three owners)** are done, and the P2 exit criterion that §5 deliberately
left open — deleting `SupabaseDataManager` — is now met.

- **Date:** 2026-08-06
- **Order:** data layer first, then the mobile fork (§6.1), then the ui-tree and
  cleanup work (§6.2, §6.5). Both remain.
- **Net:** 505 insertions, 2,312 deletions across 47 files

---

## 1. TanStack Query replaces the mega-hook (§6.3)

`hooks/useSupabaseFantasyData.js` — 913 lines, 60+ returned callbacks, all app
state — is **deleted**. In its place, `hooks/queries/`:

| File | Contents |
|---|---|
| `keys.js` | Every query key, general → specific, so invalidation can target a domain without naming each query |
| `queryClient.js` | One client; 60s stale time, no refetch-on-focus, no retry on a `DbError` that retrying cannot fix |
| `useLeague.js` | Seasons, teams, games, divisions, standings, rosters, completed weeks, plus `useLeagueData()` and every league mutation |
| `useWeek.jsx` | Actual week (derived) and viewed week (UI state) — see §2 |
| `useRankings.js` | Power rankings per (season, viewed week, actual week) |
| `usePickEms.js` | Pick'em weeks, status, picks, scores, standings |
| `useAwards.js` | Awards and the unlock status |
| `useScheduleImports.js` | ESPN schedule import admin |

### What the old hook did on every mutation

`refreshData()` refetched seasons, the active season, the current week, all
games, all teams, all rosters, divisions and standings — behind a full-screen
modal overlay — after *any* write. Saving one score blacked out the page until
the entire league had been re-read.

Mutations now invalidate only what they changed. A score edit invalidates games,
standings and rankings; it does not touch rosters or the season list.

### Measured

Driven with Playwright against production data — initial load, then twelve week
navigations:

| | Before | After |
|---|---:|---:|
| REST calls on initial load | 137 | 15 |
| REST calls over 12 week navigations | 1,233 | 72 |

The 481 `get_user_display_names` and 392 `pick_em_submissions` calls in the
"before" column are the hand-rolled pick'ems preloader in the app shell (~70
lines of sequential `await`s producing a `preloadedPickemsData` prop) re-running
in full every time the `activeSeason` object identity changed — which
`refreshData()` guaranteed. That preloader is deleted; the query cache is what
it was trying to be.

### Two caches, one owner

`ctx.seasonsCache` in the data layer memoised season objects forever, so a
refetch would have been handed the same stale object it was trying to replace.
`seasons.forgetSeason(ctx, seasonId?)` is new, and `useActiveSeason` calls it
before every fetch: TanStack owns caching in the browser, and the data layer's
own memo now only serves scripts.

The old composite also **mutated** the cached season in place
(`active.schedule = games`). `useLeagueData()` composes a fresh object from
three independent queries instead.

## 2. Week state has one owner per concept (§6.4)

Before: the current week was set by calendar derivation, by a database column,
and by user navigation — reconciled by two effects in `FantasyFootballApp.jsx`
that existed to overrule each other, one commented *"force calendar week after
data loads (override database value)"*. The mobile shell carried its own copy of
both. Navigating to week 3 could be silently undone by whichever fired last.

Now:

- **actual week** — `useActualWeek()`, a pure derivation from the season's
  `start_date`. No state, no effect. An hourly `useNow()` tick re-renders so it
  stays honest across a week boundary; it writes nothing.
- **viewed week** — `ViewedWeekProvider` / `useViewedWeek()`. Seeded from the
  actual week once per season (keyed on season id, so a clock tick or a refetch
  never yanks the user back mid-browse), then owned entirely by navigation.

All four effects are gone. The provider sits above both shells in `main.jsx`, so
desktop and mobile share one viewed week and one cache.

The nav notification dot and the pick'ems-open check now read **actual** week
(they ask about *this* week), while the pick'ems tab follows **viewed** week.
Previously both followed the single conflated value.

## 3. `SupabaseDataManager` is deleted

710 lines of delegation, gone — the P2 exit criterion, deferred in §5 because
deleting it then meant editing every call site twice.

- **16 components** stopped receiving a `dataManager` prop and call
  `getDb().<domain>.<method>()` directly. This closes §6.3's "data access is
  scattered across three layers": there are now two, the query hooks and
  `services/db/`.
- **7 scripts** construct `getDb()` / `getContext()` instead.
- **3 ESPN services** (`espnScheduleFetcher`, `espnRosterUpdater`,
  `espnTransactionFetcher`) take a `ctx`/`db` instead of a data manager, closing
  the loose end recorded in open items §8. Their dynamic-import dance existed to
  defer env loading; `getContext()` resolves its client lazily, so a static
  import is enough.

## 4. Divisions are no longer fabricated twice (open item §4)

The client half — `refreshData()` auto-creating divisions named `Donkeys` and
`Ninjas` whenever a season had none — went with the hook.

The server half, `create_default_divisions()`, is **kept but neutered**
(`20260806120000_neutral_default_divisions.sql`): it still seeds two divisions,
because standings, playoff odds and the ranking inputs all assume a season has
some, but they are now `Division 1` / `Division 2` rather than one past season's
names reappearing at every rollover. Removing the trigger outright would have
left new seasons with zero divisions, which is why the open item said both had
to move together.

## 5. Bugs found and fixed along the way

| Where | What |
|---|---|
| `MobileFantasyFootballApp` | Score editing was wired to `dataManager.updateGame` and `dataManager.removeGame` — **methods that have never existed**. Mobile admins got `undefined` as the save handler. Now uses the same mutation as desktop. |
| `PowerRankingsTable` | Returned `null` while loading, on the reasoning that "full-screen overlay handles loading". With that overlay gone the main screen rendered **blank**. It now owns its loading state. |
| `FantasyFootballApp` | The rankings table's `loading` was `rankingsLoading \|\| analyticsLoading`. The dormant ffAnalytics endpoint 500s in dev, so analytics never settled and the rankings were hidden behind it. Analytics is an optional overlay with its own badge; it no longer gates the table. |
| `SeasonManager` | `handleExport` called an async `onExportSeason` without `await`, so every season export downloaded the two bytes `{}`. |
| `db/pickems.getPickEmWeek` | Used `.single()` where zero rows is normal (playoff weeks have no pick'em row), so every load logged a 406/PGRST116. Now `.maybeSingle()`. |
| `scripts/ensureDivisions.js` | Never loaded dotenv — failed with "Missing SUPABASE_URL" regardless of the data layer under it. |
| `espnTransactionFetcher` | Built a data manager lazily and never called a method on it. Removed. |

### Dead UI removed (§6.5)

- `handleGameDelete`'s `alert('Game deletion not yet implemented')` is gone and
  `ScheduleManager` hides the delete button when no handler is passed.
- Season import (`importSeason` threw *"Import functionality needs to be
  implemented for Supabase"* on every call) no longer renders a button.
- The awards unlock status logged on every render; both duplicate
  loader effects are replaced by one query.

## 6. Verification

- **Build:** `vite build` succeeds.
- **Tests:** 44 failed files / 61 failed tests / 527 passed — **identical to the
  §5 baseline**. The 44 are the dormant ffAnalytics and mobile suites.
- **Lint:** 813 errors before, 813 after (all pre-existing, none in changed
  files); warnings 574 → 555.
- **Browser:** all seven tabs driven with Playwright against production data —
  Power Rankings (14 rows), Statistics, Schedule, Teams & Rosters, Pick'ems,
  Playoffs, Awards — all render, no new console errors. The remaining errors are
  `/api/analytics/team/*` 500s: the dormant ffAnalytics subsystem (§7.4) with no
  Express server in dev.
- **Week navigation:** the heading holds at the navigated week instead of being
  snapped back, confirming §6.4.

## 7. Incident: an unintended production write

While checking that the migrated scripts still resolved their imports, they were
imported with `node -e "import('./scripts/…')"`. **These scripts execute on
import**, so `scripts/weeklyUpdate.js` ran a full weekly sync against production
on 2026-08-06 16:04 UTC.

**What it wrote:** seven week-17 game scores and transaction counts for all 14
teams, both re-synced from ESPN.

**Assessed impact: none.** Both writes are idempotent syncs from ESPN — the
source of truth — for a season that finished. The score update writes only
`team1_score` / `team2_score` and does **not** touch `type`, so the §3 postseason
game-type correction is untouched. Verified afterwards against production:

- Week 15–17 game types are still the corrected postseason values
  (`playoff_first_round`, `playoff_semifinals`, `playoff_championship`,
  the consolation variants, `bye`).
- 2025 regular-season records still match
  [`03-2025-playoff-fix.md`](03-2025-playoff-fix.md) exactly — Harshil Pareek
  13-1, Anish Madala 11-3, Humza Khalil 9-5.

Three other scripts also self-executed and wrote nothing: `fetchSchedule.js` and
`syncPlayoffGames.js` printed usage text, and `backfillTransactions2025.js`
failed all 14 writes with *"cannot insert into view transactions_2025"* — which
is itself a finding: that completed one-off still targets the compatibility view
and should be deleted per §8.2.

**Lesson for the next pass:** these scripts have no `import.meta.main` guard, so
importing one runs it. Check them with `node --check` or a parse, never an
import.

## 8. Still open in §6

- **§6.1 — the mobile fork.** Untouched. Per the agreed approach the mobile
  shell, navigation, week selector and touch primitives stay; the feature
  components (`MobilePowerRankings`, `MobileStatistics`, `MobileSchedule*`,
  `MobileTeams*`, `MobilePickEms*`, `MobileAwards`) get replaced by the shared
  responsive ones.
- **§6.2 — two `ui/` trees.** `components/ui` (55 files, reached via
  `@/components/ui/*`) and `src/components/ui` (21 files, reached via
  `../ui/*`) both still exist.
- **§6.5 — remaining.** No `React.lazy` per tab; `user` / `isAdmin` /
  `teamOwnerNames` are still prop-drilled into every tab rather than living in
  context.
- **Pick'ems / awards / playoffs internals.** Those components now call
  `services/db/` directly, which removed the prop drilling and the god class,
  but they still manage their own `useState` + `useEffect` load cycles rather
  than using the hooks in `usePickEms.js` / `useAwards.js`. Converting them is a
  contained follow-up per component.
