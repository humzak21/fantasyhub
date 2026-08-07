# August 2026 Refactor — Sections 2 through 8

Implementation record for sections **2 (Critical Security)** through
**8 (Repo Hygiene & Tooling)** of
[`REFACTOR_ANALYSIS.md`](../REFACTOR_ANALYSIS.md), plus the 2025 postseason data
fix that fell out of §3.

- **Dates:** 2026-08-03 → 2026-08-06
- **Database:** Supabase project `kvcnijyyfylxfarrlxkv`
- **Status:** §§2–8 complete. Seventeen migrations applied to production and
  verified. Supabase security lints **169 → 52, errors 2 → 0**. The one
  substantive item left is **rotating the ESPN credential**, which is the
  owner's to do — see [`05-open-items.md`](05-open-items.md) item 1.

| Document | Contents |
|---|---|
| [`01-database-changes.md`](01-database-changes.md) | Every migration, table rename, view and function |
| [`02-code-changes.md`](02-code-changes.md) | Season config module and the files repointed onto it |
| [`03-2025-playoff-fix.md`](03-2025-playoff-fix.md) | The mistyped postseason games and the standings correction |
| [`04-verification.md`](04-verification.md) | What was checked, and the numbers it produced |
| [`05-open-items.md`](05-open-items.md) | What was deliberately left undone, and why |
| [`06-data-layer.md`](06-data-layer.md) | §5: the god-class split, one client, typed errors, generated types |
| [`07-frontend.md`](07-frontend.md) | §6: TanStack Query, week state, the mobile fork, one ui tree, code splitting |
| [`08-automation.md`](08-automation.md) | §7: killing ffAnalytics, one deploy topology, the scheduled sync job |
| [`09-hygiene.md`](09-hygiene.md) | §8: scripts pruned, real type-checking, tests rescued, CI |
| [`10-security.md`](10-security.md) | §2: RPC lockdown, admin-only RLS, definer views, search paths |
| [`migrations-history/`](migrations-history/) | The 18 migrations that built §§2–7, squashed into the baseline |

---

## What changed, in one page

**Before.** The same domain was modelled three ways — live tables, `historical_*`
archive tables, and year-suffixed one-offs (`awards_2025`, `playoffs_2025`,
`transactions_2025`). Every all-time statistic was implemented twice and merged
in JavaScript. Starting a season meant creating tables and editing ~30 string
literals. The season start date existed as **four** mutually inconsistent
constants, and a submission deadline was frozen inside an RLS policy, so the
database itself would have rejected 2026 playoff picks.

**After.** One `seasons` table spanning 2020–2025 with the season's dates,
week counts, ESPN identifiers and deadlines on the row. One `teams` table, one
`games` table. Derived statistics are views over `games`. The year-suffixed
tables are renamed to generic ones with backward-compatible views under the old
names, so nothing that was working stopped working.

Starting the 2027 season is now:

```sql
insert into public.seasons (year, name, league_size, regular_season_weeks,
                            playoff_weeks, start_date, espn_league_id,
                            espn_season_year)
values (2027, 'Season 8', 14, 14, 3, date '2027-09-07', '67674700', 2027);
```

No DDL, no code edits, no archive-copy step. This was tested end-to-end against
production with a throwaway 2026 row, which produced correct week boundaries
(`week 1 → 2026-09-08 04:00Z`, `week 15 → 2026-12-15 05:00Z`) and was then
deleted.

**Then the code that reads it.** `services/supabaseDataManager.js` was a
4,132-line class of about a hundred methods spanning every domain in the
product, with three competing Supabase client factories around it and two copies
of the camelCase ⇄ snake_case converters. It is now 691 lines of delegation over
`services/db/` — fourteen domain modules, one client, one case-mapping layer,
typed errors, and a dev-gated logger. See
[`06-data-layer.md`](06-data-layer.md).

## Guiding principle

**Additive, never destructive.** Every legacy table still exists and still
holds its data. Old table names resolve through auto-updatable views. The
stored derived columns on `teams` remain populated. Nothing is dropped until
the new read paths have run in production — that is a later, separate
migration, tracked in [`05-open-items.md`](05-open-items.md).

The one exception is deliberate and is documented in
[`03-2025-playoff-fix.md`](03-2025-playoff-fix.md): correcting the 2025
postseason game types changed the 2025 regular-season records that the site
displays, because those records had been counting playoff games.
