# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Environment

This is a React-based fantasy football power rankings application built with
Vite, Tailwind CSS, and Supabase. It deploys as a **static bundle** — there is
no application server. The weekly ESPN sync runs as a GitHub Actions cron
(`.github/workflows/sync-week.yml`), not as an in-process scheduler.

## Available Commands

### Development
- `npm run dev` - Start development server (opens on localhost:3000)
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm start` - Serve the built `dist/` statically (Railway/Docker entry point)

### Code Quality
- `npm run lint` - Run ESLint to check for code issues
- `npm run lint:fix` - Automatically fix ESLint errors
- `npm run type-check` - Run TypeScript checking without emitting files
- `npm run test:e2e` - Playwright smoke: every route at 375x667 and 1280x800,
  asserting no horizontal overflow. Needs a build first.
- `npm run check-css-tokens` - Assert the Tailwind theme layer reached the
  built CSS. Run after `npm run build`.
- `npm run check-mobile` - Grep guards for the mobile mistakes this codebase
  has actually made; each rule names the bug it prevents.
- `npm run capture-screens <dir>` - Shoot every tab at 375/768/1280 against a
  running preview server. For before/after comparison on CSS changes.

### Database
- `npm run db:push` / `db:push:dry` - Apply migrations in `supabase/migrations/`
- `npm run db:diff` - Diff the local schema against the remote
- `npm run db:types` - Regenerate `types/supabase.ts` from the live schema

### Sync
- `npm run sync-week` - Sync the current week of the active season from ESPN.
  Zero arguments; pass `--dry-run` to resolve the target without writing.
- `npm run sync-schedule` - Import a whole season from ESPN (teams + games),
  then refresh the NFL calendar for the same year.
  The start-of-season job; zero arguments, `--dry-run` to plan without writing.
- `npm run sync-nfl-schedule` - Import the NFL calendar (`nfl_schedule`) from
  ESPN's public `proTeamSchedules_wl`. `[year]`, `--backfill` for 2020 onward,
  `--dry-run`. The weekly sync re-runs it for the active season, so this is for
  a first import or a repair.
- `npm run sync-nfl-ratings` - Snapshot ESPN's Football Power Index into
  `nfl_team_ratings` for the current week. `[week]`, `--dry-run`. No
  `--backfill` — ESPN serves current FPI only, which is why the weekly
  snapshots exist. The weekly sync runs it as its `nflRatings` step.

### Utilities
- `npm run clean` - Clean build artifacts and cache
- `npm run check-bundle` - Assert no circular static imports between eager chunks

## Architecture Overview

### Core Structure
- **Main App**: `FantasyFootballApp.jsx` - Primary application component with tab-based navigation
- **Data Layer**: `services/db/` - one module per domain (`seasons`, `teams`,
  `divisions`, `rosters`, `players`, `playerWeekStats`, `games`, `rankings`,
  `schedule`, `nflSchedule`, `pickems`, `parlay`, `awards`, `playoffs`,
  `transactions`, `takes`, `history`, `users`, `espnMapping`).
  **Write new data access here.**
  - `services/powerRankingCalculator.js` - Advanced ranking algorithms with configurable weights
  - `services/espnScheduleFetcher.js` - ESPN integration for schedule data
  - `services/espnRosterUpdater.js` - ESPN integration for roster updates
- **State Management**: `hooks/queries/` - TanStack Query hooks, one per domain.
  **Components read and write data through these, not through a shared
  instance.**
- **Components**: `src/components/` — **one tree**. The root-level
  `components/ui/` shadcn tree was deleted; `@/components/ui/*` resolves here.
- **One shell, one tree.** `src/components/mobile/` is gone, along with the
  user-agent sniffing that used to pick between two whole applications. Every
  component is responsive. See "Mobile is not a separate app" below.
- **Layout**: `src/components/layout/PageContainer.jsx` is the page gutter.
- **Tabs are routes** (`/rankings`, `/statistics`, …), not `useState`.
- **Viewer identity**: `user`, `isAdmin` and `teamOwnerNames` come from
  `useViewer()` (`src/contexts/ViewerContext.jsx`), not from props.

### Key Data Flow
1. Components call a hook from `hooks/queries/` (`useLeagueData`,
   `useViewedWeekRankings`, `usePickEmWeek`, …)
2. Those hooks call `getDb().<domain>.<method>()` from `services/db/`
3. `PowerRankingCalculator` processes team/game data using weighted algorithms
4. Mutations invalidate only the keys they changed — never refetch the league

### Working in `hooks/queries/`
- **Every query key lives in `keys.js`.** Never build one inline; the
  invalidation side has to be able to find it.
- Keys run general → specific (`['games', seasonId, 'week', 3]`) so a mutation
  can invalidate a whole domain by prefix.
- A mutation's `onSuccess` names the domains it actually changed. If you find
  yourself invalidating everything, the key design is wrong.
- **Week state:** `useActualWeek()` is derived from the season row and is
  read-only. `useViewedWeek()` is UI state the user owns. Neither writes to the
  other; do not add an effect that syncs them.

### Working in `services/db/`
- Every domain function takes a shared `ctx` (`{ client, seasonsCache, activeSeasonId }`) as its first argument. `getDb()` returns the same modules with `ctx` pre-applied for app code.
- `createClient()` is called in exactly one place, `services/db/client.js`. Never call it anywhere else — a second anon client is a second GoTrue instance fighting over the same session.
- Throw `DbError` (via `throwDbError`/`unwrap` from `services/db/errors.js`). Never swallow an error into `return []`; callers cannot tell that apart from an empty league.
- Log through `createLogger('db:<module>')`, not `console.*`. `debug`/`info` are silent in production.
- camelCase ⇄ snake_case conversion lives only in `services/db/caseMap.js`. Do not hand-write per-field maps; a test asserts every schema column round-trips.

### Critical Files
- `types/index.js` - Contains all data models, validation functions, and configuration constants including `POWER_RANKING_WEIGHTS` and `THRESHOLDS`
- `types/supabase.ts` - Generated from the live schema; regenerate with `npm run db:types`
- `FantasyFootballApp.jsx` - Main component with auth integration and navigation
- `services/db/index.js` - Data layer entry point (`getDb()`, `getContext()`)
- `hooks/queries/index.js` - Query layer entry point; all data hooks
- `hooks/queries/keys.js` - Every query key
- `utils/seasonConfig.js` - Single source for season dates, week math and deadlines

**Note:** `services/supabaseDataManager.js` and `hooks/useSupabaseFantasyData.js`
were deleted on 2026-08-06. Nothing should reference them.
`services/leagueHistoryManager.js` and `src/hooks/useLeagueHistory.js` were
deleted on 2026-08-18; see "League History reads the live schema" below.

### package-lock.json conflicts resolve themselves

The lockfile is generated, not written, and git merges it line by line like
prose. Any two branches that both touched dependencies conflict textually even
when they do not disagree — which is how a 150-file PR merges clean everywhere
except `package.json` and `package-lock.json`, repeatedly.

`.gitattributes` routes the lockfile to `scripts/git-merge-lockfile.sh`, which
discards both sides and regenerates from the merged `package.json`. That is the
only resolution that yields a graph npm would actually produce: hand-stitching
two resolved dependency trees can describe a tree npm would never generate, and
it installs fine right up until it doesn't. If `package.json` is *also*
conflicted the driver refuses and says so — the intent has to be settled by a
person before any generated file can be right.

The driver is defined in `.git/config`, which is not committed, so
`scripts/setup-git-merge-driver.sh` registers it from npm's `prepare` hook —
it runs on `npm install` and nobody has to know it exists. **Without that
registration the attribute points at nothing and git silently line-merges
anyway**, so if lockfile conflicts come back, check `git config --get
merge.npm-lockfile.driver` first.

`.github/dependabot.yml` is the other half: grouped, weekly updates so `main`'s
lockfile moves a few times a month instead of daily. Majors are neither grouped
nor ignored — they arrive as their own PR, which is what react-router 6→7
needed and did not get.

To resolve one by hand:

```bash
# settle package.json first, then
npm install --package-lock-only && git add package-lock.json
```

### Scripts write to production
Every script in `scripts/` guards its entry point (`import.meta.url ===
\`file://${process.argv[1]}\``), so importing one is safe — this was **not**
true before 2026-08-06 and an unguarded import ran a full production sync.
**Keep the guard when adding a script.**

`scripts/sync-week.js` is the weekly job. It takes no arguments: the active
season row supplies the season, week, playoff boundary and ESPN league. Every
step is an idempotent upsert against ESPN, so re-running a failed sync is the
fix. Each run writes a `sync_runs` row.

Its steps are **pickEmWeek** → rosters → scores → playerStats →
**finalizePrev** → nflSchedule → nflRatings → **parlayGrades** → transactions
→ snapshot. Scores
and playerStats read **one** ESPN fetch between them, so do not re-fetch inside
a step. The nflSchedule and nflRatings steps fetch separately and need no
cookies; nflRatings runs before snapshot on purpose, so the week's snapshot
ranks on fresh FPI. playerStats, finalizePrev, nflSchedule, nflRatings,
parlayGrades and transactions are non-fatal: a failure is recorded in
`sync_runs.steps` and the run continues, because losing the week's snapshot to
a player-data hiccup costs more than the missing rows.
Skip flags:
`--skip-pick-em-week --skip-rosters --skip-scores --skip-player-stats
--skip-finalize-prev --skip-nfl-schedule --skip-nfl-ratings
--skip-parlay-grades --skip-transactions --skip-snapshot`, plus `--dry-run`.

**`pickEmWeek` opens the week's pick'ems.** It is the first step and needs no
ESPN call: `pickems.ensurePickEmWeek` creates the `pick_em_weeks` row for the
target week if none exists, through the same `create_pick_em_week` RPC the
admin button uses, sending no timestamps so the database derives the window
from the season's `pickem_*` columns. It runs first so an ESPN outage cannot
cost the league its pick'ems, is a no-op when the row exists (so the Wednesday
and Thursday roster refreshes double as a retry), and skips playoff weeks like
the roster step. Before 2026-09-03 this was an admin pressing a button every
Tuesday morning. Note the window still *opens* at `pickem_open_time`
(04:00 by default) while the row appears at the 05:00 run; nothing reads the
row in that hour, but a season that wants the two to coincide sets the open
time to 05:00.

**`finalizePrev` is why the week's real numbers exist at all.** The cron runs
Tuesday 05:00 ET (10:00 UTC, so 06:00 during daylight time — GitHub cron has
no zones, and this is the hour that is never earlier than 05:00 ET) and
`deriveCurrentWeek` rolls over at Tuesday 00:00 ET, so
every scheduled run targets the week that has just *begun* — and `getSingleWeek`
filters ESPN's matchups strictly to that scoring period. Week N-1's actual
points, stat breakdowns and final scores were therefore never fetched by any
scheduled run: the lineups would have gone on showing seven-day-old projections
all season, and the parlay grader would have had nothing to grade. This step
re-fetches week N-1 and re-runs scores + playerStats over it, one extra ESPN
call on Tuesdays, through the same idempotent upserts. It sits *before* the
snapshot, because the ranking snapshot must see the finished week. It runs only
when the week was derived — an explicit `node sync-week.js 5` means week 5, and
quietly rewriting week 4 too would be a surprise.

`reasonToSkip` reports; it does not decide. **`--force` proceeds past a
returned reason** and logs it — for the days before week 1 when ESPN already
has rosters, projections and the NFL calendar but the season row still says
"not started". The missing-`start_date` case stays a throw and is *not*
overridable: forcing past it would not sync early, it would sync an arbitrary
week. Never set `--force` on the cron; the quiet out-of-season exit is the
whole point there.

### One path from ESPN into `games`
`services/db/games.js::upsertEspnGames` is the only writer of ESPN schedule
data, used by both `sync-schedule` (whole season) and `sync-week` (one week).
The planning is pure and lives in `services/espnGameMapper.js`. Two rules it
enforces, both load-bearing:

- **`type` is written on insert and never on update**, so the hand-corrected
  2025 postseason types survive every sync.
- **Derived columns are never written.** The `before_game_update` trigger
  computes `winner_team_id`, `loser_team_id`, `is_tie`, `point_differential`,
  `is_blowout`, `is_close` and `completed_at`; `is_completed` is generated.
  Sending `completed_at: null` would make the trigger re-stamp it with the
  import time.

**`teams.owner` follows the same insert-only rule**, in
`services/db/teams.js::upsertTeamsFromESPN`. ESPN owns a team's *name* and
abbreviation, which change most years and mean nothing to anything else here;
it does not own the owner past the insert. `teams.owner` is this league's
cross-season identity key — `getTeamOwnerNames` / `isUserATeamOwner` decide from
it whether to unmask the league for a viewer, and `utils/parlayDivisions.js`
seats a member's TD parlay pick by it — so an overwrite is not a cosmetic
respelling, it drops that member out of both. ESPN's copy is a display name its
manager types however they like: on 2026-09-01 it carried "Aashish Gatmaneni"
against the league's corrected "Aashish Gatamaneni", and the annual run would
have put the misspelling back with nothing in the log to say so.

A *blank* stored owner is still filled — a gap, not a disagreement, the same
rule as the `espn_team_id` backfill beside it. A real divergence comes back as
`ownerConflicts` and `sync-schedule` prints both spellings, exactly as it does
`gameResult.conflicts`: a manager who respelled themselves needs nothing done, a
franchise that genuinely changed hands needs `teams.owner` edited, and only a
person can tell those apart. Note the interaction with the matcher below — the
owner fallback compares against the *league's* spelling, so a diverged team with
no `espn_team_id` would be inserted twice rather than found. Every team carries
an ESPN id today and the backfill keeps it that way.

Rows are matched to ESPN by `espn_matchup_id`, falling back to the same week
plus the same pair of teams in either order — that fallback is what adopts rows
created before ESPN ids were stored instead of duplicating them. The ESPN
staging tables (`espn_teams`, `espn_matchups`) and `assign_schedule_to_season`
were deleted on 2026-08-08; `espn_schedule_imports` remains as the import log.
The browser cannot start an import — ESPN needs cookies only the scripts have.

### The power ranking is roster-aware
`services/powerRankingCalculator.js` scores ten components, each normalized
0–100 **across the league**, combined with `POWER_RANKING_WEIGHTS`. Rules that
are load-bearing:

- **A component that cannot be computed is `null`, never 0.**
  `combineWeightedComponents` drops nulls and divides by the surviving weight,
  so a 2025 season (no player data) ranks on its five team components instead of
  being dragged toward zero by the four it cannot compute. Returning 0 for
  "unknown" is the bug this design exists to prevent.
- **Everything is synchronous.** The old `calculateTeamStrength` was `async` and
  was summed synchronously, so strength of schedule was adding Promises.
- **`week < viewingWeek` everywhere**, including the all-play pool. A historical
  view must not see a week the user has not navigated to.
- Roster components (`rosterStrength`, `lineupEfficiency`) come from
  `player_week_stats`, which starts with the 2026 season. `futureStrength` is
  live-view only — nobody archived last month's projections, so producing one
  for a past week would be fabrication.
- **All three schedule adjustments point the same way: tougher opponents score
  higher.** That is the opponent multiplier inside `record` (past opponents),
  `leagueSos` (remaining fantasy opponents) and `nflSos` (the starters'
  remaining real-NFL opponents, by FPI). The first two used to disagree, which
  made the same schedule simultaneously an excuse and a penalty, and let an
  easy run-in flatter a mid-table team. Do not invert one without inverting
  all three.
- **`nflSos` reads `nfl_schedule` + `nfl_team_ratings`** and is live-view-only,
  like `futureStrength`. A missing calendar row is *unknown* and a bye row is
  skipped, never scored — a bye's output loss is already priced into ESPN's
  projections, which is also why `byeExposure` rides along at zero weight as a
  diagnostic instead of being a penalty.

**`player_week_stats`** is one row per player per week: team, lineup slot,
whether they started, actual and projected points. It is the grain neither
`players` (a global last-write-wins snapshot) nor `rosters` (wiped every sync)
can express. `services/db/playerWeekStats.js` is the only writer, fed by the
pure `services/espnPlayerStatsMapper.js`, and the unique key
`(season_id, week, player_id)` is what makes a re-run idempotent. The data costs
no extra ESPN request: the sync's scores step already fetches
`rosterForCurrentScoringPeriod` and used to discard it.

**`player_week_stats` answers past-tense questions only.** It is a historical
fact table the weekly cron writes once, so between two syncs it describes a
roster that has since taken waivers, made trades and changed its lineup. "Who
started in week 6" is its question; "who is starting this week" is not. The
pick'ems research panel asked it the second one and, measured on 2026-08-31,
named 122 of its 125 starters wrongly — its newest rows were from 2026-08-18,
before the draft, while `rosters` had been rewritten that same day.

Anything present-tense reads `rosters`, which is deleted and reinserted per
team on every sync and so is a true snapshot of now.
`services/db/rosters.js::getCurrentLineupsForWeek` is that read: roster
membership and lineup slot from `rosters`, then points layered on in order of
what they know — this week's actual, this week's projection, then
`players.projected_points`, which the same roster sync refreshes and is what a
player added since the last week-stats write has instead of nothing. A starter
with no figure still renders, with a dash; hiding them is how the stale view
managed to look complete while being wrong.

`.github/workflows/refresh-rosters.yml` is the other half. The weekly sync
writes `rosters` once, Tuesday 05:00 ET, and waivers clear on Wednesday — in
the middle of the pick'ems window — so a roster-only run goes out Wednesday and
Thursday morning. It passes `--skip-scores --skip-player-stats
--skip-nfl-schedule --skip-nfl-ratings --skip-transactions --skip-snapshot`,
which skips the matchup fetch entirely, and shares the `espn-write`
concurrency group because the weekly sync's own roster step writes exactly
what it writes. `pickEmWeek`, `finalizePrev` and `parlayGrades` are left
running on purpose: all three are idempotent no-ops once Tuesday's run
succeeded, and each is the retry if it did not.

Verified against the live league: this league starts QB/2RB/2WR/TE/FLEX/D/ST/K,
which is what `OPTIMAL_LINEUP_TEMPLATE` encodes, and summing a team's starters
reproduces ESPN's own matchup score exactly.

### Takes are enforced by the database, not the UI

`takes` + `take_participants` are the predictions board. Every rule about who
may do what lives in RLS and two triggers, because the anon key reaches
PostgREST directly and a rule that only exists in a component is not a rule:

- **The author may edit the body and nothing else, for 72 hours, while
  ungraded.** The window is the `takes author edit` policy; "body only" is
  `takes_guard_author_update()`, which exists because a `WITH CHECK` clause
  sees `NEW` and cannot compare it to `OLD`. It guards on
  `can_write_league()`, not `is_admin()` — the service role bypasses RLS but
  *not* triggers.
- **`edited_at` is stamped by `set_take_edited_at()`**, not sent by the client.
  `updated_at` cannot stand in: admin resolution touches it too.
- **`takes_resolution_check` ties `status <> 'pending'` to a non-null
  `resolved_at`**, so grading and reopening must move both columns in one
  statement or be rejected.
- **`removePlusOne` filters on `user_id` as well as `take_id`.** That is not a
  duplicate of RLS: the admin holds a `FOR ALL` policy, so without the filter
  their own withdrawal would delete every co-sign on the take.
- `src/components/takes/milestones.js` mirrors those windows for the UI's
  benefit — showing a button whose only outcome is an error is the bug it
  prevents. Changing a policy means changing the mirror.

**Sort order is app-side on purpose.** `milestoneSortKey` is a pure function
over a league-sized board, so a future `nfl_game` take can sort by kickoff
without a generated column to migrate — which is also why
`takes_target_type_check` is named and DO-guarded.

**Takes are members-only, and that is enforced in both halves.** The board
shipped public-read and was closed in `20260831140000_takes_members_only.sql`;
`Members read takes` / `Members read take_participants` are
`FOR SELECT TO authenticated`, so a signed-out caller reads zero rows straight
from PostgREST. The shell half is `customAccess: isAuthenticated` on the takes
tab — note `requiresAuth` is *not* the flag for that: despite the name it means
admin-only (`requiresAuth && !isAdmin`). The nav gate alone would have been
decoration, since the anon key ships in the client bundle.

**The route guard waits on `isAuthLoading`.** `isAuthenticated` reads false
while a stored session is still being read back, which is indistinguishable
from signed out — gating on the flag alone bounces a member's bookmarked
`/takes` on every cold load. `ViewerContext` exposes it for the same reason it
exposes `isParlayCommissionerLoading`.

**Every act on a take is logged by the database.** `take_events` is
append-only and written *only* by `log_take_event()` (INSERT/UPDATE on `takes`)
and `log_take_participant_event()` (INSERT/DELETE on `take_participants`).
There is no INSERT/UPDATE/DELETE policy on the table and the `anon` /
`authenticated` grants stop at SELECT — the triggers are SECURITY DEFINER owned
by `postgres`, so they write and nobody else does. That is what makes the log
the database's account rather than the client's: a hand-rolled POST straight to
`/rest/v1/takes` is logged exactly like an edit made in the app, and no caller
can forget to log or choose what to log.

- **One act, one row.** A statement that rewords *and* grades a take emits both
  an `edited` and a `graded`. Within `edited`, every field that moved arrives in
  one `changes` object, because one save is one act.
- **`changes` records `from` as well as `to`.** Old values exist only inside the
  trigger. "Edited" is not information; "the stake went from $20 to $50" is the
  whole point, and it is the reason `edited_at` alone was not enough.
- **`seq` is the sort's tiebreaker, not decoration.** `now()` is transaction
  time, so two events from one statement carry identical `created_at`, and the
  ids are random uuids. Sort `(created_at DESC, seq DESC)` — `getTakeActivity`
  and `sortEventsNewestFirst` both do.
- **The `edited` / `graded` timestamps are read from the row only when they
  moved.** `set_take_edited_at()` watches the body and the wager, so a
  milestone-only change leaves `edited_at` stale; reading it blindly would date
  the new event to the previous reword.
- **Backfilled rows carry `{"backfilled": true}` and no diff.** They predate the
  log and their old values were never recorded; rendering the take's *current*
  wording as what was "posted" would be a fabrication the reader cannot detect.
  `describeTakeEvent` shows a note instead.
- The participant trigger **skips the `unfaded` row when the parent take is
  already gone** — that is the cascade from deleting a take, not a withdrawal,
  and inserting it would violate the FK and make deleting a faded take
  impossible.
- The log is fetched per take (`qk.takes.activity`), not embedded on the board:
  it appears nowhere but the open detail sheet. Its key sits under
  `['takes', seasonId, …]` so the mutations' shared `invalidate()` reaches it.

**Times are `hour: 'numeric'`, never `'2-digit'`.** The latter renders 8:42 PM
as "08:42 PM", which is not a clock face anybody writes. `formatDateTime` in
`src/lib/utils.js` is the single definition; minutes stay 2-digit.

**The `take_participants` write policies subquery `takes`,** and an RLS
subquery runs as the calling user — so restricting who may SELECT `takes` can
silently break the +1. It does not here (both are `authenticated`), and there
is a probe asserting it, but a future narrowing of the read policy has to
re-check it.

### Seasons end explicitly
`public.finalize_season(season_id, dry_run)` derives a season's final placements
from its games and writes `teams.made_playoffs/playoff_seed/playoff_wins/
playoff_losses/playoff_finish/final_rank` plus `seasons.is_completed/
completed_at`. `public.compute_season_awards(season_id)` then upserts the eleven
computed awards. Both are idempotent, both guarded by `can_write_league()`.
Rules that are load-bearing:

- **It raises rather than guessing.** An incomplete game, no championship game,
  or a bracket that is not six teams stops the run — and from 2026, a season
  without exactly two `bye` rows. A wrong champion is worse than no champion,
  and every downstream view keys off `playoff_finish`.
- **Seeding changed in 2026 and the function branches on the year.** Through
  2025 seeds 1-6 went to the bracket by overall standing and byes were not
  represented; from 2026 the two bye teams are seeds 1-2 and the other four
  bracket teams are 3-6, all by the canonical sort — win% desc, points for desc,
  points against asc. Re-running a 2025 finalise is byte-identical to what is
  stored, and there is a probe that asserts it. `utils/playoffSeeding.js` is the
  client-side mirror of the same rule, and `get_standings_by_division` its
  live-standings mirror; changing one means changing all three.
- **`teams.playoff_finish` is the fact; the award is a description of it.**
  `getChampionships` and `v_franchise_career` read the placement, not the award,
  so a season with no awards still has a champion.
- The vocabulary is `champion/2nd/3rd/4th/5th/6th/none`, matching 2020-24.
  Consolation finishers get `none` and a `final_rank` of 7..N.
- **`setActiveSeason` finalizes the season it replaces**, non-fatally, in the
  style of `carryTeamsForward` — it reports `finalizedPrevious`/`finalizeError`
  on the returned season. A season with games still to play is skipped silently;
  setting next year up early is normal.
- `createSeason` carries `timezone`, `espn_league_id` and the six `pickem_*`
  columns forward and sets `espn_season_year = year`. It never inherits
  `start_date` (a different Tuesday every year) or `awards_release_at` (an act,
  not a setting); `start_date` comes from the admin's create form.
- `scripts/sync-week.js::reasonToSkip` exits 0 for a completed season or one
  that has not started, and **throws** when `start_date` is NULL — every week
  number is derived from it, so silence there means syncing the wrong week.

### League History reads the live schema
`services/db/history.js` + `hooks/queries/useLeagueHistory.js` are the whole of
the History tab. They read the unified views — `v_team_standings`,
`v_game_results`, `v_head_to_head`, `v_franchise_career`, `v_record_book` — so a
season becomes history the moment `finalize_season` runs, with no import step.

The `historical_seasons/_teams/_games`, `season_awards`, `head_to_head_records`,
`franchise_records` tables and the `mv_*` views are the **dead** pre-2026 path:
filled once in Nov 2025 by scripts deleted in the Aug 2026 refactor, so 2025
could never appear in them. `src/components/history/__tests__/historySources.test.js`
fails if anything references them again. Reading both at once is what
double-counted every 2020-24 matchup.

`transactions` is season-keyed; read it directly. `transactions_2025` is a view
over the *active* season, not over 2025 — it is what labelled 2026's numbers
"2025".

### The TD parlay is one row per member per week

Each member names one NFL player they think scores a touchdown. It lives at the
foot of the pick'ems form (`src/components/pickems/ParlayPickSection.jsx`) and
has **no deadline of its own**: `pick_em_weeks` supplies the window, the row's
existence supplies the activation, and PickEmsSubmission passes its own
`getPickEmStatus()` result down rather than letting the section recompute one.
No pick'em week, no parlay — the section renders `null`.

Three rules are the database's, not the UI's, and that is what makes them true:

- **Visibility is RLS, and as of
  `20260902150000_parlay_picks_visible_as_submitted` it is `USING (true)`.**
  The board shows a pick the moment it is submitted; it used to withhold the
  week until `submission_closes_at`, and that policy is gone. The change had to
  happen there and only there — "show them in the component" would have shown
  an empty list, exactly as "hide them in the component" would have hidden
  nothing, because the anon key reaches PostgREST directly. The own-row and
  privileged policies are left in place, subsumed but standing, so a future
  narrowing has something to fall back to. Shape matches
  `pick_em_submissions`, which has been public-read since the baseline: one
  form, one window, one visibility rule.
- **The deadline is `submit_td_parlay_pick`.** It raises outside
  `[submission_opens_at, submission_closes_at)`. There is **no user INSERT or
  UPDATE policy** on the table, so the RPC is the only write path.
  `submit_pick_em_picks` now carries the same guard, word for word
  (`20260902140000_pick_em_deadline_guard.sql`) — the two forms submit
  together, and a window meaning one thing for the parlay and another for the
  picks would be its own bug. Change one and change the other.
- **The canonical name comes from `players`.** Pass `p_player_id` and the
  function looks the name up itself; pass only `p_player_name` and it stores the
  trimmed text. `player_name_raw` is NOT NULL either way, because the FK is
  `ON DELETE SET NULL` and a pick has to stay readable without the join.

A free-text pick is not a fallback for bad input. `players` only holds people
ESPN has rostered in this league, so the fringe goal-line back this parlay
invites may genuinely not be there.

**The board is one column per division, and the column is derived.** The league
runs a parlay per division, so `ParlayPickSection` splits the week's picks with
`utils/parlayDivisions.js` — a pure function over the league's existing identity
join, display name → `teams.owner` → `teams.division_id`. Nothing on
`td_parlay_picks` records a division and nothing should: the pick belongs to a
person, and which parlay that person is in is a fact about the season's teams.
The name comparison goes through `normalizeOwnerName`, shared with
`matchesTeamOwner`, because two spellings of "trim and lowercase" would seat
somebody in the wrong division rather than fail. A pick that matches no owner
lands in `unassigned` and renders under its own heading — a member's display
name is theirs to type, and filing them under a guessed division would
misreport who is competing with whom. Empty divisions still render, so the
board's shape does not change as picks arrive. Display names come attached to
the rows: `getParlayPicksForWeek` resolves them through `getUserDisplayNames`,
the way `getTakes` and the pick'ems submissions do, because a component
fetching them separately would paint once with every pick in the wrong column.

`scored_td` is nullable and **NULL means ungraded, not "no touchdown"** —
re-picking resets it to NULL, and the weekly sync's grader deliberately leaves
it NULL for every case it is not certain of. See "`scored_td` is written by the
sync's `parlayGrades` step" under the NFL-data notes below.

**The commissioner is a role, not an admin.** `league_roles` +
`is_parlay_commissioner()` exist because `is_admin()` is a single hardcoded
email and the parlay needs people who can *read* everyone's picks without
gaining the league's write paths. Grants are keyed on `user_id`, so they survive
an email change, and the admin assigns them in **Settings → Roles**
(`src/components/admin/LeagueRolesManager.jsx`) — the role changes hands and
more than one person can hold it, so it is a UI, not a migration. The picker's
member list comes from `list_league_members()`, whose `is_admin()` guard is in
its `WHERE` clause: a non-admin gets an empty list, not an error.
`isParlayCommissioner` on `useViewer()` folds the admin in; **never fold the
commissioner into `isAdmin`** — the dashboard passes the flag into `getMasked*`
locally, and that substitution stays local.

Their league-wide view (`src/components/parlay/ParlayCommissionerDashboard.jsx`)
is a **tab inside Pick'ems, next to Submissions**, not a top-level nav
destination: two people can open it, which is thin grounds for a nav item every
other layout has to make room for, and it belongs beside the form the picks it
reports on are entered in. PickEmsManager lazy-loads it and passes `embedded`,
which drops its `PageHeader` so the page is not titled twice.

`player_week_stats.pro_team_id` is the join key into `nfl_schedule`, and the
"vs BUF / @ KC / BYE" chips those slots were reserved for are now wired — see
"The NFL schedule is team-perspective, and a bye is a row" below.

### The NFL schedule is team-perspective, and a bye is a row

`nfl_schedule` is who each NFL team plays in each week. It exists because
nothing here could answer that, which left the parlay unable to say a pick was
on a bye and the research panel unable to say it either. Fed from ESPN's
`proTeamSchedules_wl` view by `services/espnNflScheduleFetcher.js` (public —
no cookies, unlike every other ESPN call here) through the pure
`services/espnNflScheduleMapper.js`, and written only by
`services/db/nflSchedule.js`.

- **Two rows per game and an explicit row per bye.** Every consumer asks the
  team-keyed question "who does team T play in week W", so the table answers it
  with one lookup. `opponent_pro_team_id IS NULL` is an *assertion* that the
  team is off; a missing row means the calendar does not cover them. Those must
  stay distinguishable — a bye inferred from a gap is indistinguishable from a
  fetch that dropped half the league, and the chip would tell a manager their
  starter has the week off when he is playing. `formatOpponent`
  (`utils/nflOpponent.js`) returns `null` for an absent entry and the chips
  render nothing, which is the whole point.
- **Both perspectives are emitted from one game object,** in one iteration of
  the mapper. ESPN lists every game twice, once under each team, and mapping
  those independently would let a payload where the copies disagree produce a
  schedule in which BUF plays KC but KC plays nobody. A unit test asserts the
  symmetry exhaustively, and `nfl_schedule_not_self` catches the rest at write
  time.
- **Keyed by `season_year`, not `season_id`.** The only key in `keys.js` that
  is. The NFL's calendar is league-independent, is the same for everybody, and
  exists for years we have no season row for — so there is no FK to `seasons`
  and no re-import per fantasy season.
- **The week span is derived, never assumed.** 2020 ran to 17 scoring periods
  and every season since has run to 18. `deriveWeekSpan` reads the highest
  period anybody plays in; hardcoding 18 would fabricate 32 bye rows for 2020.
- **No scores, by design.** That payload carries none — verified against the
  completed 2025 season. `stats_official` is the only completion signal it has,
  and it is the gate a future auto-grader waits on.
- **The domain is `nflSchedule`, not `schedule`,** because `schedule` is
  already the ESPN *import log* and a prefix meaning two things would let an
  invalidation reach the wrong one.
- **One fetch per season, everything else a `select` projection.** A season is
  ~576 rows. `useNflWeekSchedule` and `useNflOpponentMap` share
  `useNflSeasonSchedule`'s single cache entry so two chips on one page cannot
  disagree about the same week. There are no mutations — the cron writes it.
- The weekly sync re-imports the **whole** active season, non-fatally. The NFL
  flexes late-season kickoffs, so a calendar imported once in September would
  have the wrong times by December.

**`nfl_team_ratings` is the calendar's companion: how good each NFL team is.**
ESPN's Football Power Index, snapshotted per fantasy week because ESPN serves
current FPI only — the snapshots are what make past rankings reproducible.
Keyed by `season_year` like `nfl_schedule`, and for the same reason. The FPI
payload's team ids are ESPN's **NFL-side id space, not the fantasy
`proTeamId`** — `services/espnFpiMapper.js` joins by abbreviation (`WSH`→`WAS`
is the one live alias). Fed by `scripts/sync-nfl-ratings.js` /
the weekly sync's `nflRatings` step through `services/espnFpiFetcher.js`
(public, no cookies); written only by `services/db/nflTeamRatings.js`. The
documented fallback if the endpoint disappears is nflverse's `nfldata`
standings CSVs. The domain is `nflTeamRatings`; there is no query key — the
rankings queryFn consumes it inside the db layer, like player stats.

**Three surfaces render the chips**, all through `ui/opponent-chip.jsx`: the
pick'ems research lineups and parlay picker, the Schedule tab's lineup
disclosure, and the Teams tab. Each reads `useNflOpponentMap(nflSeasonYear,
week)` — note the *year*, derived as
`season.espnSeasonYear ?? season.espn_season_year ?? season.year`, never the
season id.

**A team's total is a projection until every starter in it is a result.**
`starterTotal` (`utils/lineupTotals.js`) sums the scoring starters and reports
`isProjected`, which stays true while *any* counted starter is still on a
projection — a mid-week mixture of settled Thursday actuals and pending Sunday
projections is not a result, and calling it one is the error a reader cannot
detect, since 118.4 looks identical either way. Rows with no figure at all are
skipped rather than counted as zero; the per-row dash is what shows the gap.
Two surfaces render it and both go through `totalAsPoints` — the pick'ems
research header (collapsed by default, so that total is often the only number
a reader sees) and the Schedule card's score line.

**On Schedule the imported score always wins.** The projected total renders
only where `games.team1Score`/`team2Score` is null, so the moment the sync
writes a real result the projection is gone rather than sitting beside it. An
upcoming fixture used to read "— vs —", which is the least useful thing a
schedule can say about a game nobody has played.

**Which lineup table a surface reads is decided by the week, not by
convenience.** `useLineupsForWeek` owns that choice — `useWeekPlayerStats` for a
week that is over (who actually started, with what they actually scored),
`useCurrentLineups` for the week in progress — and both the Schedule card's
score line and the lineup disclosure under it read it, so a card's total cannot
come from one table while its rows come from the other. The comparison is
against `useActualWeek()`, never the viewed week: navigating to week 3 in
November must still read week 3 as history.

**`actualWeek: null` means "not known yet", and nothing fetches.**
`useActualWeek()` answers `1` while the season is still loading, and a `1` is
indistinguishable from a real week 1 — the same trap as gating on
`isAuthenticated` before `isAuthLoading` clears. Collapsed to a number, every
historical week looks live for one render, fires the wrong query, and briefly
totals a finished week off the *current* roster. Callers pass `null` until
`useSeasonConfig()` has a `startDate`. Teams has no week navigation at all — it is
present-tense, keys on the actual week, and every figure on it is a projection
and is labelled as one. Getting this backwards is invisible on screen, because
the wrong table's names are all plausible; it is the mistake that had the
research panel naming 122 of 125 starters wrongly.

**`player_week_stats.stat_breakdown` is the single copy of the category data.**
The sync has always downloaded ESPN's raw per-category stat map alongside the
fantasy total and thrown it away; it is now stored as jsonb at the grain that
already exists. Derive touchdown counts from it with the helpers in
`services/db/espnMapping.js` — **never add a TD column**, which would be a
second copy to fall out of step.

- **`ESPN_STAT_IDS` are `'4'` / `'25'` / `'43'`,** verified arithmetically
  rather than copied from a community list: Gibbs' 2025 line reproduces his
  366.9 `appliedTotal` exactly under PPR, and Hurts' his 299.06.
- **Thrown is not scored.** `getScoredTouchdownCount` counts rushing and
  receiving only and is the one the TD parlay's question ("will this player
  score a touchdown") means; `getTouchdownCount` adds passing and answers a
  different question. A quarterback who throws four has scored none. They are
  two functions rather than a flag so a future auto-grader has to say which.
- **Both return `null`, not 0, without a breakdown.** Every row written before
  2026-09 has none, and 0 would report the whole of league history as having
  scored nothing — the same rule as the power ranking's components.
- **jsonb keys must not contain underscores or capitals.** `caseMap`'s
  `convertKeys` recurses into plain objects, so a key like `rush_td` would be
  rewritten in transit. ESPN's numeric-string ids round-trip untouched, which
  is why the raw map can be stored verbatim.

**`scored_td` is written by the sync's `parlayGrades` step,** through the pure
`services/parlayGrader.js` — the same decide/execute split as
`espnGameMapper.js`. It is JavaScript rather than a SQL RPC so that
`getScoredTouchdownCount` stays the single definition of "scored": a PL/pgSQL
grader would have to restate `ESPN_STAT_IDS` and the thrown-versus-scored rule,
and two definitions of a touchdown is how a quarterback ends up credited with
four. No migration was needed — the cron holds the service-role key, which
bypasses RLS exactly as every other step does, and the `is_admin()` policy
stays as the browser's manual-override path.

**Every uncertain case skips; only an explicit bye grades false without a stat
line.** A skipped pick stays NULL, reads as "Pending", and is retried on the
next run. That asymmetry is the whole design: a wrong `false` is invisible
(nobody audits "no TD" — it is the common outcome), while a pending pick is
conspicuous. So a *missing* `nfl_schedule` row skips where an explicit bye row
grades false, `stats_official <> true` skips, and a null `stat_breakdown`
skips. A quarterback who threw four grades **false**.

- **It grades every elapsed ungraded week, not just N-1.**
  `getUngradedMatchedPicks` selects `scored_td IS NULL` only, so re-runs are
  idempotent, a week that failed to grade catches up on its own, and a grade a
  human set by hand is never overwritten. `applyParlayGrades` repeats the
  `IS NULL` filter on the write so a second writer cannot win silently.
- **A dropped player is recovered, not guessed at.** `player_week_stats` only
  holds players who were rostered when the sync ran, and the fringe goal-line
  backs this parlay invites are exactly who gets dropped. A targeted
  `kona_player_info` fetch (`services/espnPlayerInfoFetcher.js`) asks ESPN
  about just those ids, reusing `findStatBreakdown`'s predicates rather than
  restating them. It is league-scoped and therefore cookied — the opposite of
  `espnNflScheduleFetcher.js`. If it fails, those picks stay pending.
- **A free-text pick stays manual by construction** — there is no id to look a
  stat line up by. `getUngradedMatchedPicks` filters them out at the query.
- The dashboard is unchanged: `GradeCell`/`GradeMark`/`GradeBadge` already
  render true/false/ungraded, and an auto-versus-manual provenance marker would
  need a column nobody asked for.

### No analytics subsystem
The `ffAnalytics` pipeline (R scripts, `services/ffAnalytics*`, `api/`,
`server.js`, `useAnalyticsData`) was **deleted on 2026-08-06**, along with the
`weekly_player_stats` and `team_analytics_summary` tables. Do not reintroduce
references to it. `PowerRankingCalculator` takes no `analyticsService`.

### Mobile is not a separate app

There used to be two applications here, picked by sniffing the user agent: a
desktop shell and a phone shell that was missing the playoffs tab, the history
tab and the standings drawer entirely, and that never received `isAdmin`, so no
admin control could render on a phone. Every new feature started at 0% mobile
coverage by construction. That fork is deleted. These rules are what keep it
deleted.

**Never create a `Mobile*` twin of a feature.** A phone-specific copy drifts
from the desktop one immediately — that is not a prediction, it is what
happened. Make the component responsive.

**Prefer CSS breakpoints to JS branching.** `useIsMobile()`
(`src/hooks/use-mobile.jsx`, matchMedia at 768px) is the *only* sanctioned
render-branching hook, and it is for cases where the two presentations are
structurally different components — a popover versus a bottom sheet — not two
skins of one tree. Anything that is one tree uses `sm:`/`md:`, which costs no
render and cannot flash the wrong layout on first paint.

**768px (`md`) is the structural boundary, everywhere.** Table vs card stack,
popover vs sheet, tab bar vs header nav. Two "mobile" widths used to coexist —
`useIsMobile()`/`useMobileAxis()` at 768 and every responsive class at 640 — so
a landscape phone at 700px got one component's mobile behaviour and another's
desktop behaviour at the same time. `sm:` remains fine for cosmetic shifts:
padding, wrapping, a grid gaining a column.

**Navigation is a bottom tab bar below `lg`, labelled header items above it.**
Every destination is in the bar; it scrolls horizontally and scrolls the active
tab into view. There is no icon-only tier at any width — the one that covered
640-1535px delivered labels through the `title` attribute, which is delayed on
a desktop and does not exist on touch. **Render `MobileTabBar` at the app root,
never inside the header:** the header has `backdrop-blur`, and `backdrop-filter`
(like `transform`) makes an element the containing block for `position: fixed`
descendants, which pins the bar directly under the header. Pages must keep the
bottom padding that clears it.

**Pages use `PageContainer`.** Not a hand-written `container mx-auto px-4
sm:px-6 lg:px-8`; that string had already drifted across the four places it
was pasted.

**Tables wider than about four columns use `ResponsiveDataTable`**
(`ui/responsive-table.jsx`). Columns declare a `priority` and the component
renders a real table at `md:`+ and a card stack below it, from one set of
column definitions. Do not solve a wide table by scrolling it sideways: the
reader loses their row the moment the first column leaves the viewport.

**Charts use `ChartContainer` and `useMobileAxis()`** (`ui/chart.jsx`). Never
an inline pixel height — 520px is 139% of an iPhone SE viewport, and an inline
style cannot be overridden by a breakpoint. `useMobileAxis()` returns
*overrides*, empty on desktop, so spread it **after** your own axis props.
Its main job is replacing `interval={0}`, which forces every tick to render
and smears fourteen angled team names together at 375px.

**Touch sizing lives on the `ui/` primitives, behind `pointer-coarse:`.**
Never as a blanket rule in a stylesheet: `button { min-height: 44px }` in
globals.css inflated icon buttons, chips and table controls equally, no
component could opt out, and it was a large part of why the app felt zoomed in.

**Content that is legitimately wide scrolls in its own container**, via
`ui/scroll-hint.jsx`, which also shows a hint — but only when the content
actually overflows. Never `justify-center` on a scrolling flex container:
centring an overflowing line pushes its start to a negative scroll offset that
cannot be reached, which is how round 1 of the playoff bracket became
unviewable.

**Sizes that must fit the screen use `dvh`, not `vh`.** On iOS Safari `100vh`
is the *expanded* viewport, so a `vh`-sized panel runs under the address bar
and its last row is unreachable.

**Never put a `transform` on `<body>` or the app root**, and never set
`touch-action: none` on `<body>`. A transformed element becomes the containing
block for every `position: fixed` descendant; `touch-action: none` on an
ancestor cannot be re-enabled by a descendant's `pan-y`. Those two lines
produced most of the original bug reports.

`scripts/check-mobile-conventions.sh` enforces the mechanical half of this in
CI, and each rule names the bug it prevents.

### Styling: one stylesheet, one theme

`globals.css` is the whole stylesheet: the Tailwind v4 `@theme`, the palette,
the status-colour remap, and a shrinking set of legacy utilities. There is
**no `tailwind.config.js`** — Tailwind v4 reads the theme from CSS — and there
is no second stylesheet. `styles/fantasy-utilities.css` was deleted in the
design overhaul: all 49 of its `.ff-*` classes were unreferenced, and its
first 300 lines were unscoped element selectors (`button:active`,
`button[class*="bg-blue"]`, `input[type=checkbox]`, and an `a:not(...)` rule
that coloured every link `--primary`) fighting the `ui/` primitives. That link
rule was overriding the nav's own colours, so every inactive tab in the bottom
bar rendered as though it were active.

### The look

Black first. The field is a near-black neutral (`oklch(0.145 0.004 265)`) and
every surface above it is a step of *perceptual lightness*, not a different
hue: page → card → popover, each step about what a 3% white overlay would
give. Small steps, because on black small steps read clearly and large ones
look like unrelated panels. The app used to sit on a blue-slate with slate
cards, which is the default dashboard look and the reason it read as "a
dashboard" rather than as this league's.

**The palette is oklch, and that is load-bearing.** Its L is perceptual
lightness, so accents declared at the same L and C genuinely look like one
family whatever their hue — where equal-L HSL yellows blaze and blues sink.
Every accent is L 0.72; the chart and team wheels are that same lightness
swept around the hue circle. Declaring a new colour means picking a hue at
that lightness, not eyeballing a hex.

**Colour cascades from one hue.** The brand is orange at 45°, and the
secondary pole is its complement at 240°. Warm means *yours* and *act* — the
viewer's own row, the primary button, the selected week. Cool means *told*.
Success and danger sit either side.

**Colour on a number means the number has a direction.** A gain, a loss, a
deviation from an expectation. A total is just a total: "111 games played" in
the info blue and "132.2 points per game" in the success green said those
figures were *informational* and *good*, which is neither true nor useful, and
it spent the palette's meaning so that it read as nothing where it genuinely
applied. Accent tints the icon; the figure stays `text-foreground`.

**Surfaces are lit, not outlined.** Every card, filled button and table
container carries `shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]`
— a near-black drop shadow (a grey one on black is a smudge) and a one-pixel
highlight along the top edge. That inset line is most of why a surface reads
as an object rather than a rectangle drawn on the page.

**Hairlines are suggestions.** `--border` is about a 7% white overlay. On a
near-black ground a full-strength rule between every table row draws harder
than the values it separates, and the eye ends up reading the grid.

**One thing per view is big.** Hierarchy comes from a single element being
larger — the power rating, the score, the stat figure — not from six things
being bold. Large type is set tight (`tracking-[-0.01em]`); small labels are
uppercase at 10-11px with `tracking-[0.06em]`.

**Restraint with identity colour.** A team's hue appears at full strength in
charts, where hue *is* the data. In tables it is a low tint and a faint ring
with neutral initials — fourteen full-strength chips turn a table into a paint
chart.

**The app is dark-only, by design.** `src/contexts/DarkModeContext.jsx` states
that in about forty lines; it used to be 251, most of them a light-mode
implementation commented out behind `DISABLED_LIGHT_MODE` markers. The `dark`
class stays on `<html>` because the status remap and any residual `dark:`
variant compile against it. The `:root` palette is a fallback so tokens always
resolve — not a designed second theme. Adding light mode is new work, not a
flag to flip.

This was four layers as recently as this refactor, and the reason is worth
knowing: `globals.css` had a bare `@import "tailwindcss"` and no `@config`, so
the config was never loaded and **every semantic token generated no CSS at
all** — `bg-card`, `text-muted-foreground`, the `xs` breakpoint, the ff-*
ramps, every `animate-*`. Nothing failed. It type-checked, tested and built
clean while rendering unstyled in a thousand small places, and
`styles/dark-mode.css` grew to 1,128 lines and 72 `!important`s compensating
for it. `scripts/check-css-tokens.js` asserts the theme layer reaches the built
CSS so that cannot recur silently.

Consequences for writing components:

- **Use semantic tokens** — `bg-card`, `bg-muted`, `text-foreground`,
  `text-muted-foreground`, `border-border` — not `bg-white` or `text-gray-600`.
- **Status is `success` / `warning` / `info` / `destructive`**, as real tokens:
  `bg-success/15 text-success`, `<Badge variant="warning">`. Prefer these over
  `bg-green-50 text-green-700`. The `.dark` remap block at the end of
  globals.css still rewrites those light tints and is **still load-bearing** —
  about 320 usages across ~30 feature components depend on it. Migrate a file's
  tints to tokens when you touch it; the block can be deleted when that count
  reaches zero, and not before.
- **Never add a `!important` colour override.** If a colour is not applying,
  the token is missing or an inline style is winning; fix that.
- **A team's colour comes from `src/utils/teamColors.js`**, keyed on
  `franchise_id` (owner name as fallback — team names change between seasons,
  owners do not). One franchise is one colour in every table, chart, avatar and
  bracket slot. Never colour a team by its index in an array: that is why the
  same team used to be a different colour on every chart.
- **`@theme inline` does not emit custom properties.** It inlines a token's
  value into each utility, which is right for `bg-card` and wrong for anything
  JavaScript reads — recharts takes a colour string, so `var(--color-chart-1)`
  would resolve to nothing. Chart and team hues are declared as HSL triplets in
  `:root` and referenced from `@theme`, giving both a utility and a live
  custom property.
- **A class name built at runtime is a class that does not exist.** Tailwind
  scans source text, so `bg-${color}-50` and `bg-team-${slot}` generate no CSS.
  Either use literal class names, or name the full set in `@source inline(...)`
  as the team and chart utilities do. StatisticsPanel shipped interpolated
  cards for months that only looked styled because the dark remap happened to
  catch the same selectors.

### The shared vocabulary

Before writing a header, a number, a stat tile or an empty state, use these —
each replaced four or five hand-rolled variants:

- `layout/PageHeader.jsx` — the one page header. Every tab uses it.
- `utils/format.js` + `ui/number-text.jsx` — one precision policy (points and
  percentages to one decimal, missing values as an em dash, never `0`) and one
  numeric face. Use `.tabular`, never `font-mono`: Inter has tabular figures,
  and a system mono at 14px mismatches its x-height.
- `ui/team-identity.jsx` — a team's chip, name, owner, record.
- `ui/rank-badge.jsx`, `ui/streak-chip.jsx`, `ui/stat-card.jsx`,
  `ui/empty-state.jsx`.
- `ui/skeleton.jsx` — `SkeletonTable` / `SkeletonCards`. **Loading is a
  skeleton, never `return null`** (which renders a blank tab) and never a bare
  spinner.
- `utils/positionColors.js` — lineup-slot chips, shared by Schedule and Teams.
- `ui/opponent-chip.jsx` — a player's NFL opponent ("vs BUF" / "@ KC" / "BYE"),
  over `utils/nflOpponent.js`. **It renders nothing when the calendar has no
  entry**, and callers give the column a fixed-width wrapper rather than asking
  for a placeholder — see the bye-versus-unknown rule under "The NFL schedule
  is team-perspective".
- `ui/player-points.jsx` — a player's points for a week, or a team's total. An
  actual is bare; a projection is **labelled "proj"**, not merely dimmed,
  because a guess and a result are different claims and a shade cannot carry
  that. Missing is the em dash, unlabelled. `display` sets it in the scoreboard
  face for the one place it stands in for a matchup score.
- `utils/lineupTotals.js` — `starterTotal(rows)` → `{ total, isProjected }`,
  and `totalAsPoints` to hand that pair to `PlayerPoints`. See "A team's total
  is a projection until every starter in it is a result" below.

Typography: `font-display` (Barlow Condensed) is the scoreboard voice — page
titles, scores, hero numbers, nothing else. Inter carries the interface.

### Verifying a visual change

`npm run test:e2e` loads every route at 375x667 and 1280x800 and asserts the
page does not scroll horizontally. That single assertion would have caught most
of the mobile backlog — including a 632px Pick'Ems row whose second team button
was off-screen and unclickable, so nobody could pick team 2 on a phone.

It is only meaningful because the root `overflow-x: hidden` is gone. Do not
reintroduce it: it hid every one of those bugs from measurement and from the
reader alike.

For a change to shared CSS, `scripts/capture-screens.mjs` shoots every tab at
375/768/1280 into a directory. Capture, change, capture again, `cmp` the two.
That is how the dark-mode consolidation was verified.

### Tests and CI
Tests are tracked (the blanket `**/__tests__/` ignore is gone) and live beside
their subject. Components that consume `ViewerContext`, `ViewedWeekProvider` or
TanStack Query must be rendered through `src/test/renderWithProviders.jsx`, not
bare `render`. CI (`.github/workflows/ci.yml`) gates type-check, tests and
build, the CSS token check, the mobile-convention greps, and a Playwright
smoke job. Lint is advisory repo-wide until its pre-existing backlog is cleared
(6 errors and 258 warnings as of the ESLint 9 migration; the "~800" this file
used to claim predates the refactor and was never re-counted), **except** in
`src/components/ui/**` and `src/components/layout/**`, where `rules-of-hooks`,
`exhaustive-deps` and `no-unused-vars` are errors — those files are the
foundation everything else is built on, they are new, and a hook-ordering
mistake in one breaks every consumer at once.

**ESLint is flat config (`eslint.config.js`), on 9 and not 10.**
`eslint-plugin-react` peers on `^9.7` at its current release, so 10 would mean
giving up the react rules. `--ext` no longer exists as a CLI flag — the
`files: ['**/*.{js,jsx}']` key is what makes `.jsx` get linted, and dropping it
silently narrows the run to `.js` while still exiting clean. The strict
`ui/`/`layout/` block is the second config object; flat config has no
`overrides`, and order decides precedence, so it must stay last.
`eslint-plugin-react-hooks` 7 ships sixteen rules in `recommended` — the two
classic ones plus fourteen React Compiler rules. Only the classic two are
enabled; turning on the rest is a decision about how this code should be
written, not a config migration.

Two things jsdom cannot do, so do not write tests that pretend otherwise:
it has **no layout engine**, so assigning `window.innerWidth` re-evaluates no
media query and a "375px viewport" test asserts nothing (six such files existed
and passed at every width, including widths where the page was broken); and it
applies **no CSS**, so `ResponsiveDataTable`'s two branches are both visible to
Testing Library even though exactly one is `display: none` in a browser —
scope those assertions with `within(screen.getByRole('table'))`. Real viewport
coverage is `npm run test:e2e`.

## Data Models

### Key Entities
- **Season**: Contains teams, schedule, weeks with league configuration
- **Team**: Team data with calculated statistics (wins, losses, points, etc.) and ESPN roster integration
- **Game**: Individual matchups with scores and completion status
- **Week**: Container for games within a specific week
- **Player**: Detailed player data with projected/actual points, injury status, ownership

### Configuration
Ranking algorithm weights and thresholds are defined in `types/index.js`:
- `POWER_RANKING_WEIGHTS` — the nine component weights, which **must sum to 1**
  (a test asserts it). This is the single definition: the calculator imports it
  and so does the UI, via `POWER_RANKING_COMPONENT_META` for labels and
  descriptions. Never hardcode a weight or a component label anywhere else.
- Game thresholds (blowout margins, quality win/loss criteria)

## Integration Context

This fantasy football module integrates with:
- **Supabase**: Database persistence with RLS (Row Level Security)
- **ESPN API**: Schedule and roster data fetching
- **Authentication**: Uses `useAuth` context for user management
- **React Router**: Navigation
- **UI components**: From `src/components/ui/` (button, card, tabs, badge) using shadcn/ui
- **Tailwind CSS v4**: theme in `globals.css`; there is no `tailwind.config.js`

### Magic-link sign-in

The login popover offers **"Email me a login link"** beneath the password
form. `AuthContext.signInWithMagicLink` calls `supabase.auth.signInWithOtp`;
the emailed link carries the session in its `#` fragment and
`detectSessionInUrl` in `services/db/client.js` consumes it. No server, no
route, no migration. Rules that are load-bearing:

- **The flow is implicit, not PKCE, and the comment in `client.js` says why.**
  A magic link is requested in one browser and opened in another — Safari
  asks, Gmail's in-app browser opens — and PKCE's code verifier lives only in
  the first. Setting `flowType: 'pkce'` would make the common case fail.
- **`shouldCreateUser: false`.** The league is a fixed set of people, so an
  unknown address is a typo or a stranger. Supabase answers `otp_disabled`
  ("Signups not allowed for otp") and `describeMagicLinkError` turns it into
  "No account uses that email".
- **A failed link is reported, not swallowed.** An expired or reused link lands
  on `#error_code=otp_expired&error_description=…`; supabase-js parses that
  during `initialize()` but `getSession()` discards the result. `readAuthLinkError`
  reads the fragment at mount into `authLinkError`, the provider strips the
  fragment, and `LoginDropdown` opens on the magic-link face with the reason
  showing so the remedy is the form in front of them.
- **Nothing here touches the provider's `loading` flag.** `App.jsx` swaps the
  whole tree for a spinner while it is true, which would unmount the popover
  mid-request. The popover carries its own busy state.
- `emailRedirectTo` is the page the link was requested from. `serve -s` falls
  every path back to `index.html`, and the fragment is parsed at client init,
  before React Router's `/:tab` validation runs.
- **Every panel that follows an email send shows `EmailSentNote`** (spam
  folder, rate limits, wait a minute) — the login link, the password reset,
  and sign-up when a confirmation went out. `signUp` reports `emailSent` so
  the sign-up panel can tell a confirmation from an immediate session; a
  member with no email coming should not be sent to their spam folder. The
  three senders map the mailer's rate-limit error through
  `describeEmailRateLimit` to the same advice.

**The Supabase dashboard has to agree**, one-time, in project
`kvcnijyyfylxfarrlxkv`:

- **Authentication → URL Configuration.** Site URL = the production origin.
  Redirect URLs must include the production origin as `https://<host>/**`
  and `http://localhost:3000/**` for dev. A redirect not on this list is
  silently replaced with the Site URL, and a wrong Site URL fails outright.
- **Authentication → Email Templates → Magic Link.** Keep the default
  `{{ .ConfirmationURL }}`. Switching to `{{ .Token }}` turns this into a
  six-digit-code flow, which needs a code field the UI does not have.
- **Custom SMTP is not set up (as of 2026-09-02) and should be before the
  league leans on this.** Supabase's built-in mailer is rate-limited to a
  handful of emails per hour project-wide and is meant for development; once
  a few members request links in the same hour, sends are refused and the
  popover shows the rate-limit message. To fix: Authentication → Settings →
  SMTP Settings → enable, enter the host, port, user and password from a
  provider (Resend and Postmark both have free tiers), set the sender address
  on a domain you control, then raise Authentication → Rate Limits → "Rate
  limit for sending emails" above the built-in cap. Password-reset email goes
  through the same path and gains the same headroom.

Known gap, unchanged here: `resetPassword` redirects to `/reset-password`,
which has no route — it falls through `/:tab` and bounces to the default tab.
The session is still recovered from the fragment on the way past, which is
why nobody noticed. It is the same landing problem, and it wants its own page.

## Development Notes

- Built with Vite for fast development and optimized builds
- Uses TypeScript checking without compilation (JSDoc + .ts config)
- Supabase provides real-time data synchronization
- ESPN integration allows automatic data import
- Responsive design with mobile-first approach — see "Mobile is not a separate
  app" for the rules that make that true rather than aspirational
- This project has 1 admin user. All other users are authenticated to create pick'ems, but any user can visualize the data (without logging in). RLS policies should reflect this. Only authenticated users can change their own pickems, but the general public (anyone visiting the page) can view the data. Only the admin user can manipulate data. 
- Owner names eg: "Humza Khalil" are stored in the database and should be the first thing to check against when looking for data for a team. Team names often change but owner names are consistent.
- **Creating a season carries the previous season's teams forward.**
  `seasons.createSeason` copies the divisions and teams of the most recent
  earlier season unless the caller passes `copyTeamsFromSeasonId: null`. Only
  identity crosses over (name, owner, `espn_team_id`, `franchise_id`,
  division); every stat column is left to its database default. The copy is
  deliberately non-fatal — `seasons.year` is unique, so a season that exists
  without teams could not be recreated — and reports itself on the returned
  season via `teamsCopiedFrom` / `teamCopyError`.
- **Division membership is edited per season, in the standings drawer.**
  The header's list icon opens it; the admin sees a **Manage** button and,
  above the table, a **Season** picker. Picking a season other than the active
  one hands the table that season's teams, divisions and standings, with
  `useLeagueMutations(thatSeasonId)` behind the move/rename/create/delete
  controls — so both the writes and the cache invalidations land on the year
  being edited. `services/db/divisions.js::assignTeamToDivision` refuses a
  division from any season but the team's own and filters the update on the
  team's `season_id`: the FK only says the division exists, and a team pointed
  at another year's division vanishes from both years' standings without an
  error. There is no `/standings` route; the drawer is the standings surface.
- The `trigger_create_default_divisions` trigger seeds every new season with
  'Division 1' and 'Division 2'. Anything writing divisions for a fresh season
  must upsert on `(season_id, display_order)`; a plain insert hits the unique
  constraint.
- Admin user is humzak2001@gmail.com. **Do not inline that email in new
  policies** — use `public.is_admin()`, which is the single definition of who
  the admin is. All league tables are public-read / `is_admin()`-write.
- **In privileged SQL functions use `public.can_write_league()`, not
  `is_admin()`.** `is_admin()` reads the JWT email and the service role has
  none, so an `is_admin()` guard returns false for every script and would break
  the weekly sync. `can_write_league()` covers the admin, `service_role`, and
  direct backend connections. Never test `current_user` inside a SECURITY
  DEFINER function — it is the owner, not the caller.
- When revoking function grants, revoke from `public` as well as `anon` and
  `authenticated`. Postgres grants EXECUTE to PUBLIC by default and `anon`
  inherits it, so revoking only the named roles is a silent no-op. 