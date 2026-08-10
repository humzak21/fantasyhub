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

### Database
- `npm run db:push` / `db:push:dry` - Apply migrations in `supabase/migrations/`
- `npm run db:diff` - Diff the local schema against the remote
- `npm run db:types` - Regenerate `types/supabase.ts` from the live schema

### Sync
- `npm run sync-week` - Sync the current week of the active season from ESPN.
  Zero arguments; pass `--dry-run` to resolve the target without writing.
- `npm run sync-schedule` - Import a whole season from ESPN (teams + games).
  The start-of-season job; zero arguments, `--dry-run` to plan without writing.

### Utilities
- `npm run clean` - Clean build artifacts and cache

## Architecture Overview

### Core Structure
- **Main App**: `FantasyFootballApp.jsx` - Primary application component with tab-based navigation
- **Data Layer**: `services/db/` - one module per domain (`seasons`, `teams`,
  `divisions`, `rosters`, `players`, `playerWeekStats`, `games`, `rankings`,
  `schedule`, `pickems`, `awards`, `playoffs`, `transactions`, `users`,
  `espnMapping`). **Write new data access here.**
  - `services/powerRankingCalculator.js` - Advanced ranking algorithms with configurable weights
  - `services/espnScheduleFetcher.js` - ESPN integration for schedule data
  - `services/espnRosterUpdater.js` - ESPN integration for roster updates
- **State Management**: `hooks/queries/` - TanStack Query hooks, one per domain.
  **Components read and write data through these, not through a shared
  instance.**
- **Components**: `src/components/` — **one tree**. The root-level
  `components/ui/` shadcn tree was deleted; `@/components/ui/*` resolves here.
- **Mobile**: `src/components/mobile/` is the phone *shell* only (header,
  navigation, week selector, touch primitives). Feature components are shared
  with desktop and responsive — do not add a `Mobile*` twin of a feature.
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

### Scripts write to production
Every script in `scripts/` guards its entry point (`import.meta.url ===
\`file://${process.argv[1]}\``), so importing one is safe — this was **not**
true before 2026-08-06 and an unguarded import ran a full production sync.
**Keep the guard when adding a script.**

`scripts/sync-week.js` is the weekly job. It takes no arguments: the active
season row supplies the season, week, playoff boundary and ESPN league. Every
step is an idempotent upsert against ESPN, so re-running a failed sync is the
fix. Each run writes a `sync_runs` row.

Its steps are rosters → scores → playerStats → transactions → snapshot. Scores
and playerStats read **one** ESPN fetch between them, so do not re-fetch inside
a step. playerStats and transactions are non-fatal: a failure is recorded in
`sync_runs.steps` and the run continues, because losing the week's snapshot to a
player-data hiccup costs more than the missing rows. Skip flags:
`--skip-rosters --skip-scores --skip-player-stats --skip-transactions
--skip-snapshot`, plus `--dry-run`.

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

Rows are matched to ESPN by `espn_matchup_id`, falling back to the same week
plus the same pair of teams in either order — that fallback is what adopts rows
created before ESPN ids were stored instead of duplicating them. The ESPN
staging tables (`espn_teams`, `espn_matchups`) and `assign_schedule_to_season`
were deleted on 2026-08-08; `espn_schedule_imports` remains as the import log.
The browser cannot start an import — ESPN needs cookies only the scripts have.

### The power ranking is roster-aware
`services/powerRankingCalculator.js` scores nine components, each normalized
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
- **Both schedule adjustments point the same way: tougher opponents score
  higher.** That is the opponent multiplier inside `record` (past opponents) and
  `leagueSos` (remaining opponents). They used to disagree, which made the same
  schedule simultaneously an excuse and a penalty, and let an easy run-in
  flatter a mid-table team. Do not invert one without inverting the other.

**`player_week_stats`** is one row per player per week: team, lineup slot,
whether they started, actual and projected points. It is the grain neither
`players` (a global last-write-wins snapshot) nor `rosters` (wiped every sync)
can express. `services/db/playerWeekStats.js` is the only writer, fed by the
pure `services/espnPlayerStatsMapper.js`, and the unique key
`(season_id, week, player_id)` is what makes a re-run idempotent. The data costs
no extra ESPN request: the sync's scores step already fetches
`rosterForCurrentScoringPeriod` and used to discard it.

Verified against the live league: this league starts QB/2RB/2WR/TE/FLEX/D/ST/K,
which is what `OPTIMAL_LINEUP_TEMPLATE` encodes, and summing a team's starters
reproduces ESPN's own matchup score exactly.

### No analytics subsystem
The `ffAnalytics` pipeline (R scripts, `services/ffAnalytics*`, `api/`,
`server.js`, `useAnalyticsData`) was **deleted on 2026-08-06**, along with the
`weekly_player_stats` and `team_analytics_summary` tables. Do not reintroduce
references to it. `PowerRankingCalculator` takes no `analyticsService`.

### Tests and CI
Tests are tracked (the blanket `**/__tests__/` ignore is gone) and live beside
their subject. Components that consume `ViewerContext`, `ViewedWeekProvider` or
TanStack Query must be rendered through `src/test/renderWithProviders.jsx`, not
bare `render`. CI (`.github/workflows/ci.yml`) gates type-check, tests and
build; lint is advisory until its pre-existing error backlog is cleared.

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
- **Tailwind CSS**: Styling with custom design system

## Development Notes

- Built with Vite for fast development and optimized builds
- Uses TypeScript checking without compilation (JSDoc + .ts config)
- Supabase provides real-time data synchronization
- ESPN integration allows automatic data import
- Responsive design with mobile-first approach
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