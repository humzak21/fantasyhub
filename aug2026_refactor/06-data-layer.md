# Data access layer

Implementation record for section **5 (Data Access Layer, P2)** of
[`REFACTOR_ANALYSIS.md`](../REFACTOR_ANALYSIS.md).

- **Date:** 2026-08-05
- **Scope:** §5.1 god class, §5.2 client factories, §5.3 case conversion, §5.4 errors and logging

| | Before | After |
|---|---|---|
| `services/supabaseDataManager.js` | 4,132 lines, 102 methods | 691 lines, pure delegation |
| Domain code | one file | `services/db/` — 14 domain modules, 8 infrastructure modules |
| `createClient()` call sites | 3 | 1 |
| Case-conversion implementations | 2 generic + hand-written per-field maps in the hook | 1 |
| `console.*` in the data layer | 34 | 0 (a dev-gated logger) |
| Tests over the data layer | 0 | 35 |

---

## 1. Splitting the god class (§5.1)

`services/db/` now holds one module per domain: `seasons`, `teams`, `divisions`,
`rosters`, `players`, `espnMapping`, `games`, `rankings`, `schedule`, `users`,
`pickems`, `transactions`, `awards`, `playoffs`.

Every function takes a shared context as its first argument:

```js
export async function getGamesForWeek(ctx, seasonId, weekNumber) { … }
```

`ctx` is `{ client, seasonsCache, activeSeasonId }` — the three things that were
genuinely instance state on the class. Keeping them on one object is what lets
`seasons.getSeason()` and `teams.updateTeam()` still agree about which cached
season objects are stale, exactly as they did when they were siblings on `this`.

Two entry points, in [`services/db/index.js`](../services/db/index.js):

```js
import { games } from './services/db/index.js';   // ctx explicit — modules, tests
games.getGamesForWeek(ctx, seasonId, 3);

const db = getDb();                               // ctx bound — app code
db.games.getGamesForWeek(seasonId, 3);
```

### The method bodies were moved, not rewritten

The extraction was done by script: slice each method's line range out of the
original file, rewrite `this.client` → `ctx.client`, `this.foo(a)` → `foo(ctx, a)`,
drop the per-method `await this.initialize()`, dedent. Nothing was retyped, so
the split cannot have quietly paraphrased any logic.

One case needed care, and is the reason the rewrite order in the script is
commented. Four names — `createSeason`, `createDivision`, `createAward`,
`createPickEmWeek` — are **both** a factory imported from `types/index.js` and a
method on the class. Inside the class the receiver told them apart: bare meant
the import, `this.` meant the method. Qualifying the imports as `models.X` has to
happen *before* `this.` is stripped, or `this.createPickEmWeek(…)` silently
becomes a call to the type factory. The first run of the script did exactly
that, in `createPickEmWeeksForSeason`.

### The class is now a facade

`SupabaseDataManager` keeps its exact public API — verified mechanically: 102
methods before, 102 after, byte-identical parameter lists apart from one
deliberate change (below). The 16 components, 8 scripts and 3 services that
construct one were not touched.

It is expected to disappear in §6, when the UI stops holding a data-manager
instance. It is a shim, not a design.

## 2. One client (§5.2)

[`services/db/client.js`](../services/db/client.js) is the only place
`createClient()` is called. It memoises two clients and no more:

- `getAnonClient()` — public anon key, RLS applies
- `getAdminClient()` — service-role key, bypasses RLS, `null` in the browser
- `resolveClient()` — admin if available, else anon. This is the rule
  `SupabaseDataManager.initialize()` used to implement inline.

`services/supabaseClient.js` and `services/supabaseClient.server.js` remain as
compatibility surfaces for their ~20 importers, delegating here. The
memoisation is the point: every extra anon client is a second GoTrue instance
racing the first over the same `localStorage` session.

### Environment lookup is not keyed on `typeof window`

The first version branched on `isBrowser()`, which broke under test: jsdom
defines `window`, so `supabaseClient.server.js` took the browser path and Node
code lost its service-role key. Three `ffAnalyticsScheduler` tests failed with
`Cannot read properties of null (reading 'from')`.

The question that actually matters is "does this runtime have `process.env`", so
that is the question [`env.js`](../services/db/env.js) asks — `process.env`
first, `import.meta.env` second. The service-role key is still unreachable from
the browser: `process` is undefined there, and Vite only inlines `VITE_`-prefixed
variables, which the service-key getter never consults.

## 3. Case conversion (§5.3)

One implementation, in [`caseMap.js`](../services/db/caseMap.js), plus a
`COLUMN_OVERRIDES` map for columns the regex cannot round-trip. The map is
currently empty — and there is a test that proves it should be.

`npm run db:types` output is committed as
[`types/supabase.ts`](../types/supabase.ts) (54 table and view row types). The
case-mapping test reads that file, extracts every column name in the schema, and
asserts each one survives snake → camel → snake:

```js
const broken = [...columns].filter((column) => !roundTripsCleanly(column));
expect(broken, `add these to COLUMN_OVERRIDES: ${broken.join(', ')}`).toEqual([]);
```

A column that does not round-trip is precisely the silent-`undefined` bug §5.3
describes. It now fails a test instead of reaching a component. The reverse
check runs too, so an override left behind after a column is dropped is also a
failure.

The hand-written per-field maps are gone from application code. `toUiGame()` in
[`games.js`](../services/db/games.js) is the single definition of the game shape
the UI reads — the same eight lines had been written out four times.

## 4. Errors and logging (§5.4)

`handleSupabaseError` flattened every failure into a bare `Error` with a generic
string, discarding the Postgres code and the operation. Callers could not tell
"no rows" from "the request was rejected", so several returned `[]` and made an
outage look like an empty league.

[`DbError`](../services/db/errors.js) carries `kind`, `code`, `details`, `hint`,
`operation` and `cause`, while leaving `.message` byte-identical to what the UI
rendered before — every `catch (err) { setError(err.message) }` behaves the same.
`kind` is one of `not_found`, `duplicate`, `foreign_key`, `auth`, `permission`,
`missing_table`, `config`, `unknown`.

It paid for itself immediately: see §6 below.

Logging goes through [`logger.js`](../services/db/logger.js) — `debug` and `info`
silent in production, `warn` and `error` always on, every line scoped
(`[db:rankings] …`). The five empty `catch {}` and `if (error) {}` blocks that
came across in the extraction — the ones ESLint had been flagging on the
original file — are now logged. The most consequential is
`insertRosterOneByOne`, where skipping a rejected player is intentional but a
half-written roster used to look exactly like a complete one.

## 5. The hook stopped reaching around the manager

`useSupabaseFantasyData` ran seven `dataManager.client.from(…)` queries of its
own — the hook reaching past the manager it wraps, straight into the database.
They are gone: `getSeasonGames`, `getTeamsForSeason` and
`calculateRankingsForViewedWeek` are data-layer functions now.

## 6. Two bugs found on the way

### `getCurrentSeasonTransactions` was broken

It embedded `teams(owner_name)`; the column is `teams.owner`. Every call threw
`column teams_1.owner_name does not exist`. Fixed by aliasing
(`owner_name:owner`) so the returned shape is unchanged. The typed error is what
made it obvious — `code: 42703`, `operation: 'Get current season transactions'`.

### Past-week power rankings depended on row order

The hook's inline ranking queries had no `ORDER BY`. `refreshData` and
`calculateLivePowerRankings` both ordered the same tables, so the "view a past
week" screen was computing from arbitrary row order while the rest of the app
was not — and the calculator's output depends on it. The replacement orders
teams by `id` and games by `(week, id)`, matching everything else.

Measured against the old behaviour, across all 15 weeks of 2025:

| Week | Teams whose rank moved | Largest rank move | Largest rating change |
|---|---|---|---|
| 1 | 14 | 9 | 0 |
| 2 | 2 | 1 | 0.88 |
| 8 | 2 | 1 | 0.25 |
| all others | 0 | 0 | ≤ 1.0 |

Week 1 has no games played, so every team has an identical rating and the entire
order was a tie-break — arbitrary before, stable now. Elsewhere two teams swap
by one rank in two weeks. Ratings move by at most a point, shrinking as the
season fills in.

## 7. Verification

**Parity against production.** 43 read paths were run through the pre-split
class and the new facade against the live database and diffed:

```
all 43 call sites identical
```

after the `getCurrentSeasonTransactions` fix, that becomes 42 identical and 1
changed from "throws" to "returns 14 rows".

`calculateRankingsForViewedWeek` was compared separately against the old inline
hook code for weeks 1, 5, 9, 14 and 15: identical once the old queries are given
the `ORDER BY` they were missing.

**Suite.** Against the pre-change tree, run over the same files:

| | Before | After |
|---|---|---|
| Test files failing | 44 | 44 |
| Tests failing | 61 | 61 |
| Tests passing | 492 | 527 |

The 44 pre-existing failures are the dormant ffAnalytics and mobile suites
(§7.4, §8.3) and are untouched. The 35 new passes are the data-layer tests.

**Lint.** `services/db/` is clean — no errors, no warnings. The five `no-empty`
errors and eight warnings the original file carried were all fixed rather than
relocated.

**Build.** `npx vite build` succeeds.

`services/db/__tests__/` is negated in `.gitignore`, as `utils/__tests__/` was.
