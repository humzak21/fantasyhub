# §7 — Automation & Deployment (P4)

All four sub-sections. **§7.1** (conflicting deploy definitions), **§7.2**
(manual weekly updates), **§7.3** (duplicated API layers) and **§7.4** (the
dormant ffAnalytics subsystem) are done.

- **Date:** 2026-08-06
- **Decisions taken by the user:** kill ffAnalytics; run the weekly job as a
  GitHub Actions cron
- **Migrations applied to production:** `20260806130000_sync_run_log`,
  `20260806140000_drop_ffanalytics`

---

## 1. ffAnalytics is gone (§7.4)

The analysis called this "the single largest simplification available", and it
was. The subsystem was ~15 services, 8 R scripts, an R executor, a config CLI,
a Vercel-style `api/` tree, and 9 committed test files — feeding two tables that
held **0 and 28 rows**.

It was not merely dormant. It was still wired into the running site:
`FantasyFootballApp.jsx` called `useAnalyticsData` on every render, which fetched
`/api/analytics/team/*`, which 500s in production because no Express server
reliably runs there (§7.1). The "only remaining console errors" noted at the end
of §6 were this.

**Deleted:** `services/ffAnalytics*` (12 modules), `analyticsCache`,
`rScriptExecutor`, `projectionCalculator`, `playerMatchingService`,
`schedulerIntegration`, `server/utils/rExecutor.js`, `api/` in its entirety,
`config/ffanalytics-*`, `scripts/ffanalytics/` (8 R scripts) and its 6 helper
scripts, `hooks/useAnalyticsData.js`, `utils/sampleAnalyticsData.js`,
`src/components/analytics/` (4 components), `src/components/projections/`,
`EnhancedPowerRankings` and `PowerRankingsDemo` (neither was reachable), 6
README files, and 9 npm scripts including the two `Rscript` ones.

`services/supabaseClient.server.js` went too — it existed only for the analytics
scripts, and nothing imported it once they were gone.

### The ranking calculator

`powerRankingCalculator.js` had an analytics integration threaded through it:
an optional `analyticsService` constructor argument, a multiplier applied to
every player's base value, a ±5 point team bonus, a projection blend, and four
supporting methods.

Both live call sites — `services/db/rankings.js` and `RankingsMovementChart` —
passed **`null`** for that argument, and nothing anywhere read the
`analyticsBonus` / `analyticsMetrics` it put in the components object. Every
branch was provably dead, so removing it cannot move a number. The file drops
1,210 → 909 lines.

The constructor argument was removed rather than left as a null placeholder,
which means both call sites had to be updated: `divisions` and
`regularSeasonWeeks` are positional and would otherwise have shifted one slot
left. That is the kind of silent breakage this pass exists to avoid, so it is
called out here.

### Database

`weekly_player_stats` (0 rows) and `team_analytics_summary` (28 rows) are
dropped, with the two SECURITY DEFINER views over them
(`current_player_analytics`, `latest_team_analytics`).

This is the one deliberate departure from the refactor's "additive, never
destructive" rule, and the reason is security rather than tidiness:
`team_analytics_summary` is the **highest-severity finding in the whole project**
(§2.3) — RLS disabled, so it was readable *and writable* by any anonymous
visitor. Dropping it resolves the finding outright instead of writing policies
for a table nothing reads.

`roster_stats`, the third SECURITY DEFINER view, is **kept**: it reads real
roster data. Retrofitting it with `security_invoker` belongs to the P0 pass.

**Advisor delta:** the `rls_disabled_in_public` ERROR is gone. One ERROR remains
(`roster_stats`, above), where there were two.

## 2. One deploy topology (§7.1)

`railway.json` said `npm run server:prod` (Express + node-cron); `nixpacks.toml`
said `npm start`, which was `vite preview`. They disagreed, and if the nixpacks
start won — which is the likelier reading — then **the automation scheduler was
never running in production at all**, and neither was the analytics API the
frontend was calling. That is consistent with the 500s in §7.4.

Resolved toward static hosting, which the GitHub Actions decision makes the
right end of the fork:

- `server.js`, `services/automationScheduler.js`, `services/automationLogger.js`
  and `scripts/weeklyDataUpdate.js` are deleted.
- `express`, `cors`, `helmet`, `morgan`, `node-cron`, `commander` and
  `node-fetch` are removed from `dependencies` — seven packages that existed
  only for that server.
- `npm start` is now `serve -s dist`. `vite preview` is documented by Vite as a
  local preview tool, not a production server, so it was not the right thing to
  standardise on even though it was already the nixpacks default.
- `railway.json`, `nixpacks.toml` and `Dockerfile` now describe the same thing.
  The Dockerfile is multi-stage: build the bundle, then ship `dist` plus a static
  server, nothing else.

§7.3's duplicated API layers resolve themselves — `api/analytics/*` and the
Express routes that shadowed it are both gone.

## 3. `scripts/sync-week.js` (§7.2)

`weeklyUpdate.js` is replaced. P1 had already moved it off the hardcoded
`DEFAULT_SEASON_ID` and onto the active season row; what was still missing was
everything that makes it a *job* rather than a command someone runs.

```
node scripts/sync-week.js            # current week of the active season
node scripts/sync-week.js 5          # re-sync a specific week
node scripts/sync-week.js --dry-run  # resolve the target, write nothing
```

What changed beyond the rename:

| | Before | After |
|---|---|---|
| Score writes | `UPDATE` per matched matchup, every run | skipped when ESPN already agrees; the run reports `updated` vs `unchanged` |
| Transactions | 14 sequential upserts | one upsert for the league |
| Team matching | ESPN id only | ESPN id, then **owner name** — the stable key per CLAUDE.md |
| Ranking snapshot | not done at all | `saveWeeklyPowerRankingsSnapshot`, itself idempotent (clears the week, then inserts) |
| Record of the run | console output into a log stream that scrolled away | a `sync_runs` row |
| Importing the file | performed a full production sync | guarded; see §5 |

The snapshot step is new. §7.2 lists it as step 5 of the target job and it was
simply never wired up, which is why `power_rankings_history` was being written
by hand.

Scores still write **only** `team1_score` / `team2_score`. The 2025 postseason
`type` values were corrected by hand in `20260805100000` and an ESPN sync must
never undo that; this is now stated at the write site.

### `sync_runs`

One row per run: season, week, status (`running` → `success` / `failed`),
trigger (`cron` / `manual`), per-step counts as `jsonb`, error text, and a
generated `duration_ms`. Public-read / admin-write, matching every other table.

`running` is written at the start, so a run that crashed is distinguishable from
one that never started. A failure to write the log never fails the sync — the
sync is the point, the log is the record of it.

### The schedule

`.github/workflows/sync-week.yml`, 09:00 UTC Tuesday (04:00 ET, after Monday
night football settles), plus a `workflow_dispatch` button that takes an
optional week and a dry-run toggle. `concurrency: sync-week` queues rather than
cancels, because two runs writing the same week's scores would race.

Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ESPN_S2`, `ESPN_SWID`.

## 4. ESPN config reads the environment

`config/espn-config.js` now takes `ESPN_S2` / `ESPN_SWID` from `process.env`,
falling back to the committed literals. This is **step 2 of the four-step
rotation plan** in open items §1, and it is what lets the Actions job supply
credentials at all.

**It does not fix the exposure.** The literals are still in the file and still
in git history. Step 1 — rotating the cookies in ESPN — has not happened and is
the only thing that closes the hole.

The file also called `console.log(USAGE_INSTRUCTIONS)` at module scope, so
merely reading a league id printed a 50-line setup banner into every script and
job. That is now `printUsage()`, exported and called by nobody automatically.

## 5. Scripts no longer run on import

The incident recorded in [`07-frontend.md`](07-frontend.md) §7 — importing
`weeklyUpdate.js` to check it resolved performed a full production sync — is
closed. Every surviving script guards its entry point:

```js
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main().catch(console.error);
```

Verified: `import('./scripts/syncPlayoffGames.js')` now loads and does nothing.

## 6. Verification

- **Build:** `vite build` succeeds. `desktop-bundle` 97.21 → **78.34 kB**.
- **Tests:** 482 passing, 28 skipped, 0 failing (see
  [`09-hygiene.md`](09-hygiene.md) for how that number was reached).
- **Type-check:** passes, and now actually checks something (§8.3).
- **The job, against production:** `node scripts/sync-week.js --dry-run`
  resolved the 2025 season and derived week 17 correctly, writing nothing.
- **Database:** `sync_runs` exists with RLS on and 2 policies; the analytics
  tables and their two views are gone; `roster_stats` is intact; 36 base tables
  remain.

A full live run was **not** performed. The 2025 season is over, the derived
week is 17, and firing a real sync would repeat the write documented in §6's
incident for no benefit. The first real exercise should be the scheduled run
once a 2026 season row is active — or `--dry-run` first.
