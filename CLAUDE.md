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
- `npm run sync-playoff-games` - Create playoff matchups at the bracket boundary

### Utilities
- `npm run clean` - Clean build artifacts and cache

## Architecture Overview

### Core Structure
- **Main App**: `FantasyFootballApp.jsx` - Primary application component with tab-based navigation
- **Data Layer**: `services/db/` - one module per domain (`seasons`, `teams`,
  `divisions`, `rosters`, `players`, `games`, `rankings`, `schedule`, `pickems`,
  `awards`, `playoffs`, `transactions`, `users`, `espnMapping`). **Write new
  data access here.**
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
- Power ranking weights (win percentage, point differential, strength of schedule, roster strength, etc.)
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
- Admin user is humzak2001@gmail.com, use auth.jwt and specifically target this email when creating RLS policies for admin users. 