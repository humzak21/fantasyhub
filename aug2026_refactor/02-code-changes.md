# Code changes

## The new single source: `utils/seasonConfig.js`

One module owns every date the app derives. It is set once when the active
season loads and read synchronously afterwards, so the existing synchronous call
sites keep working unchanged.

```js
setSeasonConfig(seasonRow)   // called from useSupabaseFantasyData.refreshData
getSeasonConfig()            // → SeasonConfig | null
toSeasonConfig(row)          // normalises snake_case or camelCase rows

deriveWeekStart(config, week)          deriveWeekEnd(config, week)
deriveCurrentWeek(config, now?)        derivePickEmSchedule(config, week)
arePickEmsOpen(config, week, storedWeek?, now?)
areAwardsReleased(config, now?)        isPlayoffWeek(config, week)
isCurrentSeason(season)                listWeeks(config)
zonedWallClockToInstant(date, time, tz)
```

Everything below `deriveX(config, …)` is pure and testable — the module
singleton is only a convenience for call sites that cannot easily thread config
through.

### Time zones

`date-fns-tz` is not a dependency, so zone handling is hand-rolled on `Intl`:
`zoneOffsetMs()` formats an instant in the target zone and diffs it against UTC;
`zonedWallClockToInstant()` applies that twice so the offset is looked up at
approximately the right instant. That two-pass approach is what makes DST
transitions come out right, and it is directly covered by tests.

`deriveCurrentWeek` deliberately mirrors the SQL function
`public.season_current_week` so the UI and the sync job cannot disagree about
what week it is.

## Files repointed

| File | Was | Now |
|---|---|---|
| `utils/weekCalculator.js` | `SEASON_START_DATE`, `TOTAL_WEEKS = 18` | Delegates to `seasonConfig`; exports unchanged |
| `types/index.js` | A **second**, conflicting season start (3 AM EST vs midnight EDT) | `derivePickEmSchedule` |
| `services/pickEmTimeService.js` | A **fourth** copy of the same constant | `calculatePickEmSchedule` |
| `FantasyFootballApp.jsx` | `new Date('2025-12-09T00:00:00')`; pick'ems closed by weekday/hour | `areAwardsReleased`, `arePickEmsOpen` |
| `hooks/useSupabaseFantasyData.js` | `activeSeason?.year \|\| 2025` ×3 | Publishes config; passes year through |
| `services/supabaseDataManager.js` | `seasonYear = 2025` ×3; a `2025-12-12` playoff deadline; `year: 2025` in results | `resolveSeasonYear()`; deadline from `playoff_config` |
| `scripts/weeklyUpdate.js` | `DEFAULT_SEASON_ID` UUID; week 15 playoff boundary; writes `transactions_2025` | Resolves the active season; boundary from config; writes `transactions` |
| `config/espn-config.js` | `seasonYear: 2025` | `process.env` with the season row taking precedence |
| `src/components/history/{SeasonDetail,SeasonArchive,HistoryTimeline}` | `season.year === 2025` | `isCurrentSeason(season)` |
| `src/components/playoffs/PlayoffsBracket{Manager,Admin}` | `2025 Playoff Bracket Challenge`; `'December 12, 2025 at 8:15 PM EST'` fallbacks | Season year; `'Not set'` |

### `weeklyUpdate.js` is now zero-argument

```bash
node scripts/weeklyUpdate.js          # current week of the active season
node scripts/weeklyUpdate.js 5        # re-sync a specific week
```

A new `resolveTarget()` reads `v_active_season` and returns the season id,
derived current week, and ESPN league/season. Week bounds validate against
`season.weekCount` instead of a literal `17`; roster syncing stops at
`season.playoffStartWeek` instead of a literal week 15.

### `getPlayoffBracketStatus` no longer invents a deadline

It previously fell back to `new Date('2025-12-12T20:15:00-05:00')` when
`playoff_config` had no row. There is no fallback date that would still be
correct next season, so with no configured deadline the bracket now reports
closed (`deadline: null`, `canSubmit: false`) rather than inventing one.

## Tests

`utils/__tests__/seasonConfig.test.js` — 23 tests, all passing.

The two that matter most reproduce the **actual stored `pick_em_weeks` rows**
for week 4 (EDT) and week 12 (EST). Matching real production data on both sides
of the DST boundary is what makes the derivation demonstrably faithful rather
than merely plausible. Others pin the rollover boundary to the minute, confirm
`deriveWeekStart(config, 1)` equals the constant it replaced, and cover the
`isCurrentSeason` fallback chain.

> `.gitignore` had a blanket `**/__tests__/` rule, which is why only 3 of ~30
> test files in this repo were ever tracked. It is now negated for `utils/`
> so these tests can actually be committed. The blanket rule is left otherwise
> intact to avoid dumping the dormant ffAnalytics suites into the tree.

## Verification

- `npm run lint` — no new errors (5 pre-existing `no-empty` errors in
  `supabaseDataManager.js`, confirmed present on the unmodified baseline)
- `npx vite build` — succeeds
- `npx vitest run utils/` — 69 tests pass
