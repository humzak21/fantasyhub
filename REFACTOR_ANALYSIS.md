# FantasyHub Platform Analysis & Refactor Plan

**Date:** August 3, 2026
**Scope:** Full codebase (~100,800 lines JS/JSX) + live Supabase project (`kvcnijyyfylxfarrlxkv`, 40 tables)
**Goal:** Prepare the platform for the 2026 season and beyond — easy season rollover, automated weekly updates, maintainable code, secure database.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Critical Security Issues (P0)](#2-critical-security-issues-p0)
3. [Database Architecture (P1)](#3-database-architecture-p1)
4. [The Hardcoded-Year Problem](#4-the-hardcoded-year-problem)
5. [Data Access Layer (P2)](#5-data-access-layer-p2)
6. [Frontend Architecture (P3)](#6-frontend-architecture-p3)
7. [Automation & Deployment (P4)](#7-automation--deployment-p4)
8. [Repo Hygiene & Tooling (P5)](#8-repo-hygiene--tooling-p5)
9. [Phased Roadmap](#9-phased-roadmap)
10. [Appendix A: Database Inventory](#appendix-a-database-inventory)
11. [Appendix B: Code Size Hotspots](#appendix-b-code-size-hotspots)

---

## 1. Executive Summary

The platform works, but it is built as a stack of one-season snapshots rather than a multi-season system. The three root problems, in order of severity:

1. **Security**: live ESPN credentials are committed to git, and the database exposes 46 privileged RPC functions (including trade execution and roster drops) to anonymous visitors. The admin-only rule exists solely in client-side JavaScript.
2. **Schema**: the same domain (seasons, teams, games, awards, playoffs, transactions) is modeled three different ways — live tables, `historical_*` archive tables, and year-suffixed one-offs (`awards_2025`, `playoffs_2025`, `transactions_2025`). Every season rollover requires new tables and code edits; every cross-era feature requires merge code.
3. **Code structure**: a 4,106-line data-manager god class, a 1,003-line React hook, a complete 10,500-line parallel fork of the UI for mobile, and ~91 hardcoded year/date references.

Expected outcome of the refactor: season rollover becomes a single row insert; weekly updates run unattended; the codebase shrinks from ~100k lines to an estimated 40–50k while gaining type safety, tests, and CI.

---

## 2. Critical Security Issues (P0)

These are live exposures. Fix them before (and independently of) the structural refactor.

### 2.1 ESPN account cookies committed to git — CRITICAL

`config/espn-config.js:5-6` contains a live `espn_s2` and `SWID` cookie pair, and the file is tracked by git. Anyone with repo access can act as the ESPN account holder (view/modify the league, act as the account).

**Remediation:**
1. Rotate the cookies (log out of ESPN everywhere / re-login to invalidate the session).
2. Move values to environment variables (`ESPN_S2`, `ESPN_SWID`) read via `process.env`, with `config/espn-config.js` reduced to a loader.
3. Purge the secret from git history (`git filter-repo --path config/espn-config.js --invert-paths` or replace contents historically), then force-push.
4. Add `config/espn-config.js` to `.gitignore` and commit an `espn-config.example.js`.

### 2.2 46 SECURITY DEFINER functions executable by `anon` — CRITICAL

Any anonymous visitor holding the public anon key (i.e., anyone who opens the site) can call these via `POST /rest/v1/rpc/<name>`. Because they are `SECURITY DEFINER`, they run with the owner's privileges and **bypass RLS entirely**. The list includes destructive/mutating operations:

- `execute_trade`, `add_player_to_roster`, `drop_player_from_roster`
- `submit_pick_em_picks`, `submit_playoff_picks`
- `save_power_rankings_snapshot`, `save_weekly_power_rankings_snapshot`, `save_enhanced_power_rankings_snapshot`
- `disable_roster_trigger`, `enable_roster_trigger`
- `debug_refresh_season_data`, `refresh_season_stats`, `refresh_team_stats`
- `create_pick_em_week`, `assign_schedule_to_season`, `calculate_pick_em_results`, `calculate_weekly_pick_em_scores`
- plus ~30 read functions

The same 46 functions are also all executable by any `authenticated` user — violating the league rule that only the admin (humzak2001@gmail.com) may mutate data.

**Remediation pattern:**

```sql
-- 1. Remove default PUBLIC execute grants on privileged functions
REVOKE EXECUTE ON FUNCTION public.execute_trade(uuid, uuid, uuid, uuid[], uuid[], integer)
  FROM anon, authenticated;
-- ...repeat for every mutating/admin function...

-- 2. For functions legitimately called by logged-in users (e.g. submitting picks),
--    keep the authenticated grant but enforce identity INSIDE the function:
--    picks must be written as auth.uid(), not an arbitrary parameter.

-- 3. For admin-only functions, add an internal guard:
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (auth.jwt() ->> 'email') = 'humzak2001@gmail.com'
$$;
-- then at the top of each admin function:
-- IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
```

### 2.3 RLS disabled on `public.team_analytics_summary` — CRITICAL

Supabase's advisor flags this at its highest severity: the table is fully readable **and writable** by both `anon` and `authenticated` roles.

```sql
ALTER TABLE public.team_analytics_summary ENABLE ROW LEVEL SECURITY;
-- Enabling RLS with no policies blocks ALL access, so pair it with:
CREATE POLICY "public read" ON public.team_analytics_summary
  FOR SELECT USING (true);
CREATE POLICY "admin write" ON public.team_analytics_summary
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
```

Reference: [Supabase Row Level Security docs](https://supabase.com/docs/guides/database/postgres/row-level-security).

### 2.4 Always-true RLS policies — HIGH

Three tables have policies granting unrestricted access to any authenticated user, violating the admin-only-writes rule:

| Table | Policy | Problem |
|---|---|---|
| `divisions` | "Allow authenticated users to manage divisions" (`ALL`, `USING true`) | Any logged-in user can rewrite divisions |
| `transactions_2025` | "Allow authenticated write" (`ALL`, `USING true`) | Any logged-in user can falsify transaction counts |
| `pick_em_submissions_backup` | "Allow trigger to insert backup records" (`INSERT`, `WITH CHECK true`) | Anyone can insert arbitrary rows into the "backup" |

Replace with public-read / admin-write policies keyed on `public.is_admin()` (JWT email check, per CLAUDE.md convention).

### 2.5 Remaining advisor findings — MEDIUM

From the 169 total security lints:

- **3 SECURITY DEFINER views** (`roster_stats`, `current_player_analytics`, `latest_team_analytics`) — evaluate with the *creator's* permissions, not the caller's. Recreate with `security_invoker = true` (Postgres 15+).
- **3 materialized views exposed via the API** (`mv_franchise_career_stats`, `mv_season_leaderboards`, `mv_transaction_leaderboards`) — selectable by `anon`. Fine if intentionally public; otherwise revoke.
- **66 functions with mutable `search_path`** — add `SET search_path = public` to each definition (search-path hijack hardening).
- **Auth leaked-password protection disabled** — enable in Dashboard → Auth → Passwords.

### 2.6 Admin enforcement is client-side only — HIGH (design flaw)

`src/utils/adminUtils.js` determines admin status by comparing `user.id` to `VITE_ADMIN_USER_ID` — a value compiled into the public JS bundle. It only hides UI. Combined with 2.2/2.4, the UI is effectively the only authorization layer.

**Principle for the refactor:** the client may *hint* (hide buttons), but Postgres RLS + `is_admin()` must be the only *enforcement*. Nothing the browser sends should be trusted.

---

## 3. Database Architecture (P1)

### 3.1 The three-schema problem

The same domain is modeled three ways:

| Universe | Tables | Used by |
|---|---|---|
| **Live** | `seasons`, `teams`, `games`, `weeks`, `players`, `rosters` | Current-season UI, weekly updates |
| **Historical** | `historical_seasons`, `historical_teams`, `historical_games`, `historical_rosters`, `league_franchises`, `head_to_head_records`, `season_awards`, `franchise_records` | History tab |
| **Year-suffixed** | `awards_2025`, `playoffs_2025`, `playoffs_2025_config`, `transactions_2025` | Awards, playoffs, transactions features |

Consequences:

- **Merge code everywhere.** `services/leagueHistoryManager.js` (1,888 lines) exists largely to stitch current + historical data (`getFranchiseCareerStatsWithCurrentSeason`, `getAllFranchisesWithCurrentSeason`, ...). Every all-time stat is implemented twice and merged.
- **Rollover requires DDL + code edits.** The `*_2025` table names are string literals in ~30 places in `supabaseDataManager.js` and `leagueHistoryManager.js`. A 2026 season means creating `*_2026` tables and editing source.
- **Duplicate representations already exist.** Transactions live in *both* `team_transactions` (generic, franchise-keyed) and `transactions_2025` (current season, team-keyed) with different shapes. Awards live in both `season_awards` (historical) and `awards_2025` (current).
- **End-of-season "archiving" is a copy job** from live tables into `historical_*`, executed by one-off scripts (`scripts/importHistoricalSeason.js`, `scripts/fixHistoricalPlayoffs.js`). Data has already drifted (repo contains `recalculate_2024_team_stats.sql`, `fix_wk1_2024_games.sql`, `find_missing_2024_game.sql` — all symptoms of copies going stale).

### 3.2 Derived data stored as columns

`teams` has **40 columns**, of which ~25 are computed from `games`/`rosters`: `wins`, `losses`, `ties`, `points_for`, `points_against`, `win_percentage`, `point_differential`, `average_points_for`, `strength_of_schedule`, `opponent_win_percentage`, `quality_wins`, `bad_losses`, `blowout_wins`, `close_wins`, `close_losses`, `recent_form`, `current_streak`, `power_rating`, `previous_rank`, `rank_change`, `roster_total_projected_points`, `starter_actual_points`, `position_strengths`, etc.

Similarly `games` stores `winner_team_id`, `loser_team_id`, `is_tie`, `point_differential`, `is_blowout`, `is_close` — all derivable from the two scores.

Stored derivations require refresh functions (`refresh_team_stats`, `refresh_season_stats`) that must be remembered after every score edit, and they *have* been forgotten (see the fix scripts above). **Recommendation:** scores in `games` are the single source of truth; standings/stats become views (or generated columns for trivial cases like winner).

### 3.3 Redundant and dead storage

| Data | Locations today | Should be |
|---|---|---|
| Rosters | `teams.roster` JSON column, `rosters` table, `roster_history` (empty), `weekly_lineups` (empty) | One `rosters` table (optionally with `week` for history) |
| Power ranking snapshots | `weeks.power_rankings` JSONB **and** `power_rankings_history` table | `power_rankings_history` only |
| Pick'em scoring | `pick_em_results`, `pick_em_weekly_scores`, `pick_em_season_standings` all **empty** — computed in JS instead | Drop the tables (and their trigger functions), or use them; not both |
| Backups | `pick_em_submissions_backup` trigger-shadow table (368 rows, open INSERT policy) | Supabase PITR / scheduled backups; drop the table |
| ESPN staging | `espn_schedule_imports`, `espn_teams`, `espn_matchups` kept forever | Transient staging or direct import |
| Empty tables | `weekly_player_stats`, `historical_rosters`, `franchise_records`, `roster_history`, `weekly_lineups` | Drop or populate — currently dead schema |

### 3.4 Multi-tenant leftovers

`user_id` columns exist on `seasons`, `teams`, `games`, `weeks`, `power_rankings_history` — scaffolding from a multi-tenant design that never happened. In a single-league app they are meaningless, complicate every RLS policy, and confuse queries. Drop them (auth identity matters only on user-owned rows: pick'em submissions, award votes, playoff picks).

### 3.5 No migration system

Schema SQL is scattered across `database/*.sql`, `scripts/*.sql`, and `dump/*.sql`, applied by pasting into the Supabase SQL editor (`npm run db:setup` literally prints instructions to do so). There is no authoritative, versioned record of the production schema.

**Recommendation:** adopt the Supabase CLI. `supabase db pull` to capture the current remote schema as a baseline migration, then all future changes as files in `supabase/migrations/`, applied via `supabase db push` (or CI). The schema becomes reviewable, diffable, and reproducible.

### 3.6 Target schema

```
franchises            -- rename of league_franchises; owner_name is the stable human key
  id, owner_name, display_name, joined_year, left_year, is_active, notes

seasons               -- one row per year, 2020..2026+
  id, year, name, league_size, regular_season_weeks, playoff_weeks,
  start_date, status ('active' | 'archived'), espn_league_id, espn_season_year

teams                 -- (franchise_id, season_id); identity only, NO stored stats
  id, franchise_id, season_id, name, espn_team_id, division_id

divisions             -- season-scoped, as today
games                 -- ALL seasons in one table (backfilled from historical_games)
  id, season_id, week, team1_id, team2_id, team1_score, team2_score,
  type ('regular'|'playoff'|'championship'|'consolation'), slot, completed_at

players               -- ESPN player registry
rosters               -- (team_id, player_id, week?, slot, acquisition_type)

power_rankings_history  -- keep as-is (it's a genuine snapshot log)

-- Generic season-keyed feature tables (absorb the *_2025 tables):
awards                -- from awards_2025; keyed by season_id
award_votes           -- keep
playoff_config        -- from playoffs_2025_config; keyed by season_id
playoff_picks         -- from playoffs_2025; keyed by season_id
transactions          -- merge transactions_2025 + team_transactions; (franchise_id, season_id)

pick_em_weeks / pick_em_submissions   -- keep; drop the empty scoring tables

-- Everything derived becomes a VIEW (or matview refreshed by the weekly job):
v_team_standings      -- wins/losses/PF/PA/streaks per (team, as-of-week) from games
v_franchise_career    -- replaces mv_franchise_career_stats + merge code
v_head_to_head        -- replaces head_to_head_records table + maintenance script
v_record_book         -- replaces franchise_records
```

**Migration order:** create new tables → backfill `historical_*` data → backfill/merge `*_2025` data → repoint code (Phase P2) → drop old tables. Keep the old tables until the new read paths are verified against them.

**The payoff:** starting the 2027 season = `INSERT INTO seasons (year, start_date, ...) VALUES (2027, ...)`. No DDL, no code edits, no archive-copy step (a season is "archived" by flipping `status`).

---

## 4. The Hardcoded-Year Problem

**91 hardcoded 2024/2025 references** in application code (excluding tests). The load-bearing ones:

| Location | What's hardcoded | Impact |
|---|---|---|
| `utils/weekCalculator.js:8` | `SEASON_START_DATE = '2025-09-02T00:00:00-04:00'` | **All week math** for the entire UI flows from this constant |
| `types/index.js:391` | A *second* season start: `'2025-09-02T03:00:00-05:00'` | Conflicts with the above (3AM EST vs 12AM EDT) — two sources of truth that already disagree |
| `scripts/weeklyUpdate.js:15` | `DEFAULT_SEASON_ID = '96925672-...'` (a UUID) | Weekly automation is bound to one season row |
| `config/espn-config.js:3` | `seasonYear: 2025` | ESPN fetches pin to 2025 |
| `services/supabaseDataManager.js:1896,1914,1932` | `seasonYear = 2025` defaults | Snapshot logic defaults to 2025 forever |
| `FantasyFootballApp.jsx:317` | Awards release date `2025-12-09` | Awards gate breaks yearly |
| `FantasyFootballApp.jsx:322-341` | Pick'em close: Thursday 8:10 PM, hardcoded in UI | Third copy of a rule that also lives in `types/index.js` (`calculatePickEmSchedule`) and in `pick_em_weeks` DB columns |
| `src/components/history/*` (3 files) | `season.year === 2025` to detect "current season" | History tab misclassifies seasons every year |
| ~30 call sites | `awards_2025` / `playoffs_2025` / `transactions_2025` table names | See §3.1 |

**Fix:** the active `seasons` row (plus the existing-but-unused `nfl_week_calendar` table) becomes the single source for start date, week count, current-week derivation, and all deadlines. One `useActiveSeason()` / `getSeasonConfig()` accessor; every consumer derives from it. "Current season" in the history tab = `status = 'active'`, never a year literal.

---

## 5. Data Access Layer (P2)

### 5.1 The god class

`services/supabaseDataManager.js`: **4,106 lines, ~100 methods**, covering seasons, teams, rosters, ESPN sync, player mapping, divisions, games, weeks, power rankings, snapshots, schedule imports, pick'ems, transactions, awards, and playoffs. Every feature change touches this file; nothing about it is independently testable.

**Split by domain**, each module owning its queries and types:

```
services/db/
  client.js          -- THE single browser client (+ a separate server client for scripts)
  seasons.js         -- season CRUD, active-season config
  teams.js           -- teams + divisions
  games.js           -- games, weeks, schedule
  rankings.js        -- power ranking calc inputs + snapshot history
  rosters.js         -- rosters, players, ESPN roster sync
  pickems.js
  awards.js
  playoffs.js
  transactions.js
  history.js         -- franchise/career queries (mostly views after P1)
```

### 5.2 Three competing Supabase client factories

`services/supabaseClient.js`, `services/supabaseClient.server.js`, and `SupabaseDataManager.initialize()` each call `createClient()` with their own env-var detection (`typeof window` branching). Multiple GoTrue instances risk inconsistent auth state, and the env logic is triplicated. Keep exactly two: one browser client (anon key), one server/script client (service-role key, never imported by browser code).

### 5.3 Case-conversion chaos

Generic regex converters (`formatForDatabase`/`formatFromDatabase` in `supabaseClient.js`) coexist with ad-hoc manual mapping (`team1_id → team1Id`) repeated in `useSupabaseFantasyData.js:89-97`, `useSupabaseFantasyData.js:522-529`, components, and scripts. Any missed mapping is a silent `undefined`.

**Fix:** run `supabase gen types typescript` (MCP tool or CLI) and use the database's snake_case shapes end-to-end, or centralize one *typed* mapping layer. Either eliminates the entire bug class; both give autocomplete on every query.

### 5.4 Error handling

- `handleSupabaseError` converts errors to generic strings, losing codes/context; several methods then return `undefined` or `[]` on failure so callers can't distinguish "empty" from "broken".
- **395 `console.log/warn/error` calls** across services/hooks/components serve as the logging strategy — including render-path logs in production.
- Standardize: domain modules throw typed errors; the UI layer maps them to toasts; a tiny logger gates debug output on `import.meta.env.DEV`.

---

## 6. Frontend Architecture (P3)

### 6.1 The mobile fork — biggest win available

`src/App.jsx` user-agent-sniffs and renders either `FantasyFootballApp` or `MobileFantasyFootballApp`. `src/components/mobile/` is a **10,497-line parallel implementation** of the entire product: `MobilePickEms`, `MobilePickEmsResults`, `MobilePowerRankings`, `MobileStatistics`, `MobileAwards`, `MobileSchedule`, `MobileTeamManager`, `MobileSeasonManager`, ... Pick'ems alone is 3,270 lines across the two trees.

Every feature is built twice, fixed twice, and drifts. The app already uses Tailwind with responsive prefixes (the desktop header alone renders the week navigator three ways by breakpoint).

**Recommendation:** converge on one responsive component per feature. Migrate one tab at a time (pick'ems first — it's the largest duplicate), deleting the `Mobile*` twin as each converges. Keep genuinely mobile-only primitives (touch/drawer utilities) as shared building blocks.

### 6.2 Duplicate shadcn/ui trees

`components/ui/` (55 components) **and** `src/components/ui/` (21 components) both contain button, card, tabs, badge, etc. Imports mix both. Keep one tree (`src/components/ui/`), fix imports, delete the other.

### 6.3 The mega-hook

`hooks/useSupabaseFantasyData.js` (1,003 lines) returns **60+ callbacks** and all app state. Structural issues:

- **Every mutation calls `refreshData()`**, refetching seasons, active season, current week, all games, all teams, all rosters, divisions, and standings — then a full-screen `Loading...` overlay blocks the UI.
- **Side effects in the data path:** loading data auto-creates divisions named "Donkeys" and "Ninjas" if none exist (`useSupabaseFantasyData.js:106-118`). League-specific business data seeded from a hook.
- Raw `dataManager.client.from(...)` queries inline in the hook, bypassing the manager it wraps.
- The hook exposes `dataManager` itself, which components (`PickEmsManager`, `AwardsManager`, `PlayoffsBracketManager`) use to run their own queries — so data access is scattered across three layers.

**Recommendation:** TanStack Query. Per-domain hooks (`useStandings(seasonId)`, `usePickEmWeek(seasonId, week)`), cache keys per entity, targeted invalidation instead of refetch-the-world, optimistic updates for admin edits, and built-in loading/error states per widget instead of one global overlay.

### 6.4 Week state has three owners

The "current week" is set by (a) calendar calculation in `utils/weekCalculator.js`, (b) the DB via `getCurrentWeek()`, and (c) user navigation — with two effects in `FantasyFootballApp.jsx` (lines 205-234) fighting to override each other (one exists to "force calendar week after data loads (override database value)"). Define one derivation: *actual* current week comes from season config (server-derivable), *viewed* week is pure UI state. They never write to each other.

### 6.5 Other frontend issues

- **Prop drilling:** `user`, `isAdmin`, `teamOwnerNames` are threaded into every tab component; `teamOwnerNames`-based access control (History tab) is computed inline in the shell. Move to context/selectors.
- **Business rules in the view layer:** pick'em close time (`arePickemsOpen`, `FantasyFootballApp.jsx:322`), awards release date (line 317). These belong to season config + `pick_em_weeks` rows.
- **Debug logs in render paths:** `isAwardsAccessible` logs on every render (lines 302-307, 346).
- **No code splitting:** all nine tabs, both app forks, and recharts ship as one bundle. `React.lazy` per tab + manual chunks for recharts.
- **Dead UI:** `handleGameDelete` shows `alert('Game deletion not yet implemented')`; the Projections tab is commented out of nav but still fully wired.
- The pick'ems preloader in the app shell (lines 132-202) hand-rolls a cache with sequential awaits — exactly what TanStack Query replaces.

---

## 7. Automation & Deployment (P4)

### 7.1 Conflicting deploy definitions — automation may not run at all

- `railway.json` → `startCommand: npm run server:prod` (Express server + node-cron `automationScheduler`)
- `nixpacks.toml` → `[start] cmd = "npm start"` = **`vite preview`** (a static preview server; no API, no cron)

These disagree; if the nixpacks start wins, the Express API and the automation scheduler are simply not running in production — and `vite preview` is not a production server in any case. **Decide one topology:** Express serves `dist/` (delete the nixpacks start block), or fully static hosting + scheduled jobs elsewhere (§7.2 makes this the better option).

### 7.2 Weekly updates are manual

`scripts/weeklyUpdate.js` requires a human to pass the week number, uses the hardcoded `DEFAULT_SEASON_ID`, and writes to `transactions_2025` by name. Roster updates are skipped for week ≥ 15 via a hardcoded playoff boundary (should come from season config).

**Target: one idempotent sync job, zero arguments.**

```
sync-week job (cron: Tue morning, during season):
  1. active season  = SELECT * FROM seasons WHERE status = 'active'
  2. current week   = derived from season.start_date (or nfl_week_calendar)
  3. pull ESPN rosters, scores, transactions for that week
  4. upsert games / rosters / transactions (idempotent upserts, season-keyed)
  5. snapshot power rankings for the completed week
  6. write a run log row (replaces ad-hoc console output)
```

Host it as a **Supabase Edge Function triggered by `pg_cron`** or a **GitHub Actions cron** running the Node script with secrets. Either removes the need for a long-lived Express process entirely. Idempotency means a failed run is fixed by re-running; stats-as-views (§3.2) means there is no "refresh stats" step to forget.

### 7.3 Duplicated API layers

`api/analytics/*` (Vercel-style handlers) duplicates routes in `server.js` (Express). Two half-architectures for one analytics API that (per §7.4) may not be needed at all.

### 7.4 The dormant ffAnalytics subsystem

~15 services (`ffAnalyticsService`, `ffAnalyticsScheduler`, `ffAnalyticsErrorHandler`, `ffAnalyticsQualityMonitor`, retry/degradation/logger/validator/corrector...), 25+ test files, 8 R scripts, a config CLI, an R executor, and README docs — yet `weekly_player_stats` has **0 rows** and `team_analytics_summary` has 28. The pipeline appears aspirational/abandoned.

**Decide: keep or kill.** If kill (recommended unless projections are a 2026 priority), this deletes roughly 15–20k lines, the R runtime dependency, `server/utils/rExecutor.js`, most of `api/`, and several tables/views — the single largest simplification available. If keep, it needs to actually run on the schedule and feed the power-ranking `projectionWeight`.

---

## 8. Repo Hygiene & Tooling (P5)

### 8.1 Tracked junk

`.gitignore` lists `dump/`, `docs/`, `examples/`, `.kiro/` — but they were committed **before** being ignored, so they remain tracked. Also tracked: `globals.css.backup`, `styles/fantasy-football.css.backup`, `hooks/useFantasyData.js.bak`, multiple `.DS_Store`, `config/.Rhistory`, `services/.Rhistory`, `dump/OG JITS S5 (2024).xlsx`, `fix_wk1_2024_games.txt`, `awards_list.txt`, `navigate-columns.avif`, and one-off fix journals in `docs/` (`DROPDOWN_TRANSPARENCY_FIX.md`, `BUTTON_RESTORATION_SUMMARY.md`, ...). `git rm -r --cached` the ignored dirs; delete the backups (git is the backup).

### 8.2 Scripts sprawl

40+ files in `scripts/` mixing living automation (`weeklyUpdate.js`), one-time completed migrations (`migratePlayerPoints.js`, `backfillTransactions2025.js`, `fixHistoricalPlayoffs.js`), applied SQL, and debugging utilities. After P1, most SQL moves to `supabase/migrations/`; completed one-offs get deleted (they're in git history); what remains should be `scripts/sync-week.js` and a handful of genuinely reusable tools.

### 8.3 Types, tests, CI

- `npm run type-check` runs `tsc --noEmit` but the codebase is untyped `.js`/`.jsx` — the script is theater. Adopt TypeScript incrementally, starting with the new `services/db/` layer using generated Supabase types (biggest payoff: query/column typos become compile errors).
- Tests exist only for the mobile fringe and the dormant ffAnalytics code. The things that silently corrupt data when wrong have none: `powerRankingCalculator` (1,210 lines of weighted math), week derivation, ESPN→DB matching in the sync job. Test those first.
- No CI. Add a GitHub Action: lint + type-check + `vitest run` on PRs, plus `supabase db push --dry-run` to validate migrations.

---

## 9. Phased Roadmap

| Phase | Work | Exit criteria |
|---|---|---|
| **P0 — Security** (do immediately) | Rotate + purge ESPN cookies; revoke `anon`/`authenticated` EXECUTE on privileged RPCs; add `is_admin()` guards; enable RLS on `team_analytics_summary`; replace always-true policies; `security_invoker` views; pin `search_path`; enable leaked-password protection | Supabase security advisor: 0 errors; anonymous RPC mutation attempts fail; ESPN cookies absent from git history |
| **P1 — Schema unification** (before 2026 season) | Baseline schema into Supabase CLI migrations; build unified franchise/season-keyed schema (§3.6); backfill `historical_*` and `*_2025` data; standings/career/H2H/records become views; drop dead tables | 2026 season startable via a single `seasons` insert; old + new read paths return identical numbers for 2020-2025; `historical_*` and `*_2025` tables dropped |
| **P2 — Data layer** | Split `SupabaseDataManager` into domain modules over one shared client; generate TS types from the DB; replace `useSupabaseFantasyData` with TanStack Query hooks; typed errors + dev-gated logging | `supabaseDataManager.js` deleted; no regex case-conversion; mutations invalidate only their own cache keys |
| **P3 — UI consolidation** | Merge mobile fork into responsive components (one tab at a time, pick'ems first); single `src/components/ui/` tree; `React.lazy` per tab; business rules moved to season config; auth/owner context instead of prop drilling | `src/components/mobile/` deleted; one component per feature; initial bundle materially smaller |
| **P4 — Automation** | One idempotent zero-argument sync job (Edge Function + `pg_cron`, or GitHub Actions cron) driven by the active season row; run-log table; resolve Railway/nixpacks conflict (prefer static hosting + scheduled jobs, retiring `server.js`) | A full NFL week (rosters, scores, transactions, snapshot) processes with no human action; deploy config has one start path |
| **P5 — Cleanup & CI** | Kill-or-commit ffAnalytics; untrack ignored dirs; delete backups/one-off scripts; CI pipeline (lint, type-check, tests, migration dry-run); tests on ranking calculator + sync matching | CI green on PRs; repo free of dead subsystems; codebase ~40-50k lines |

**Sequencing notes:** P0 is independent — start today. P1 must land before the 2026 season starts (rollover is its acceptance test). P2 depends on P1 (modules target the new schema — don't write the new data layer against tables scheduled for deletion). P3 depends on P2 (responsive components consume the new hooks). P4 can start in parallel with P2 once P1's schema is stable.

---

## Appendix A: Database Inventory

40 tables in `public` (row counts as of 2026-08-03):

| Table | Rows | Verdict |
|---|---|---|
| `historical_games` | 583 | Merge into unified `games` |
| `pick_em_submissions_backup` | 368 | Drop (use PITR); has open INSERT policy |
| `pick_em_submissions` | 312 | Keep |
| `players` | 301 | Keep |
| `award_votes` | 242 | Keep |
| `rosters` | 188 | Keep (single roster representation) |
| `playoffs_2025` | 140 | → generic `playoff_picks` |
| `games` | 120 | Keep (absorbs historical_games) |
| `head_to_head_records` | 102 | → view over unified `games` |
| `espn_matchups` | 98 | Transient staging |
| `power_rankings_history` | 84 | Keep |
| `team_transactions` | 70 | Merge with transactions_2025 → `transactions` |
| `historical_teams` | 70 | Merge into unified `teams` |
| `season_awards` | 55 | Merge with awards_2025 → `awards` |
| `awards_2025` | 48 | → generic `awards` |
| `espn_teams` | 28 | Transient staging |
| `team_analytics_summary` | 28 | **RLS DISABLED**; keep-or-kill with ffAnalytics |
| `nfl_week_calendar` | 22 | Keep — make it the week-derivation source |
| `weeks` | 17 | Fold into games/season config; `power_rankings` JSONB duplicates history table |
| `league_franchises` | 15 | Keep (→ `franchises`); drop stored career totals (view instead) |
| `teams` | 14 | Keep; strip ~25 derived-stat columns |
| `transactions_2025` | 14 | → generic `transactions` |
| `pick_em_weeks` | 13 | Keep |
| `historical_seasons` | 5 | Merge into unified `seasons` |
| `divisions` | 2 | Keep; fix always-true policy |
| `espn_schedule_imports` | 2 | Transient staging |
| `seasons` | 1 | Keep — becomes the config backbone |
| `awards_metadata` | 1 | Fold into `awards` |
| `playoffs_2025_config` | 1 | → generic `playoff_config` |
| `franchise_records` | 0 | Dead → view |
| `pick_em_weekly_scores` | 0 | Dead → drop |
| `pick_em_results` | 0 | Dead → drop |
| `weekly_player_stats` | 0 | Dead (ffAnalytics) |
| `weekly_lineups` | 0 | Dead → drop |
| `roster_history` | 0 | Dead → drop |
| `historical_rosters` | 0 | Dead → drop |
| `pick_em_season_standings` | 0 | Dead → drop |

Plus 3 materialized views (`mv_franchise_career_stats`, `mv_season_leaderboards`, `mv_transaction_leaderboards`) and 3 SECURITY DEFINER views (`roster_stats`, `current_player_analytics`, `latest_team_analytics`).

## Appendix B: Code Size Hotspots

| File / area | Lines | Note |
|---|---|---|
| Total JS/JSX (excl. node_modules/dist) | ~100,800 | |
| `services/supabaseDataManager.js` | 4,106 | God class, ~100 methods |
| `services/leagueHistoryManager.js` | 1,888 | Mostly live+historical merge code |
| `services/powerRankingCalculator.js` | 1,210 | Core algorithm — needs tests, worth keeping |
| `hooks/useSupabaseFantasyData.js` | 1,003 | Mega-hook, 60+ returned callbacks |
| `src/components/mobile/` | 10,497 | Full parallel fork of the UI |
| `src/components/` (total) | ~1.8 MB | Includes both ui trees + mobile fork |
| `services/` (total) | ~1.1 MB | ~half is dormant ffAnalytics |
| Hardcoded 2024/2025 refs (non-test) | 91 | See §4 |
| `console.*` calls (non-test app code) | 395 | |
| Duplicate shadcn trees | 55 + 21 files | `components/ui` vs `src/components/ui` |
