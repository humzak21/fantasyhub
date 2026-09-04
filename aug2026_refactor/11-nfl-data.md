# §11 — NFL data: pro schedules and player stat categories

The subsystem the parlay migration's "Future work" note asked for. Nothing here
knew who an NFL player's team played in a given week, and the weekly sync was
downloading per-category stat data and discarding it. Both are now stored, and
the three reserved UI chip slots are wired.

- **Date:** 2026-09-02
- **Migrations applied to production:** 1 (`20260902120000_nfl_schedule.sql`)
- **Rows backfilled:** 4,000 team-weeks across 2020-2026

| | Before | After |
|---|---|---|
| Can name a player's weekly opponent | no | yes |
| Can identify a bye | no | yes, asserted by a row |
| Per-category stat data | downloaded, discarded | stored as jsonb |
| Touchdown counts | none | derived, never stored |

---

## 1. Provider: ESPN, and why

Four candidates were compared. The decision came down to id spaces.

| Provider | Verdict |
|---|---|
| **ESPN fantasy v3 `proTeamSchedules_wl`** | **Chosen.** Same `proTeamId` space `player_week_stats.pro_team_id` already stores, so zero crosswalk. Verified auth-free 2026-09-01 for 2020-2026. |
| nflverse | Excellent, free, nightly stats, 5-minute schedule refresh — but a different player-id space needing a crosswalk table. **The documented fallback.** |
| Sleeper | Own id space, same crosswalk cost, less data. |
| `site.api.espn.com` scoreboard | A *different* ESPN team-id space from the fantasy API. Same vendor, no shared ids. |
| Paid providers | Unjustifiable for a fourteen-person league. |

An id space is the whole cost of a provider. Everything else — coverage,
cadence, licence — was comparable or better elsewhere; nflverse in particular is
the better dataset. It loses on the one axis that would have added a
crosswalk table nobody would maintain.

The endpoint:

```
GET https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}?view=proTeamSchedules_wl
```

`settings.proTeams[]`, 33 entries — the 33rd is `id: 0` ("FA"), the free-agent
pseudo-team, with no games. Each real team carries `byeWeek` and
`proGamesByScoringPeriod: { [week]: [game] }` (an array, though a team plays at
most one game a week). Each game: `{ id, date (unix ms), homeProTeamId,
awayProTeamId, scoringPeriodId, startTimeTBD, statsOfficial, validForLocking }`.

**There are no scores in the payload.** Checked against the completed 2025
season, not assumed. `statsOfficial` is the only completion signal it carries,
which is why the table stores that flag and nothing about results.

### Stat ids, verified rather than looked up

`ESPN_STAT_IDS` are `'4'` passing / `'25'` rushing / `'43'` receiving. These
were confirmed arithmetically against completed 2025 totals rather than taken
from a community id catalogue:

- Jahmyr Gibbs — 1223 rushing yards, **13 of id 25**, 616 receiving yards,
  **5 of id 43**, 77 receptions, 1 fumble lost. Under PPR:
  `122.3 + 78 + 61.6 + 30 + 77 − 2 = 366.9`, matching his stored `appliedTotal`
  exactly.
- Jalen Hurts — 3224 passing yards, **25 of id 4**, 6 INT, 421 rushing yards,
  8 rushing TD → `299.06`, again exact.

A mislabelled id does not reconcile. This is worth more than the two minutes it
cost: a wrong stat id produces plausible numbers, and the parlay grading it
would eventually feed has no second source to disagree with it.

---

## 2. Shape: team-perspective rows, and a bye is a row

`nfl_schedule` stores **two rows per game** — one from each team's side — plus
**an explicit row per bye**, keyed `UNIQUE (season_year, week, pro_team_id)`.
~576 rows a season.

Every consumer asks the same question: *given this player's `proTeamId`, who do
they play in week W?* Team-perspective rows answer it with one lookup. A
game-per-row table would need an OR across two columns at every call site.

**The bye row is the load-bearing decision.** `opponent_pro_team_id IS NULL` is
an assertion that the team is off. The alternative — inferring a bye from a
missing row — is indistinguishable from a fetch that dropped half the league,
and the failure mode is specific and bad: a chip reading "BYE" beside a starter
who is, in fact, playing. With explicit rows, an absent entry means "the
calendar does not cover this", `formatOpponent` returns `null`, and the chip
renders nothing. Silence is the honest answer; a placeholder would be a claim.

**Symmetry is structural, not checked afterwards.** ESPN lists every game twice,
once under each participant. `mapProTeamSchedules` emits both perspectives from
one game object in one iteration, keyed into a `Map` by `(week, proTeamId)`, so
the second listing lands on the same two rows rather than beside them. A payload
whose two copies disagreed cannot produce a schedule where BUF plays KC but KC
plays nobody. Asserted exhaustively in the unit tests and verified in SQL after
the backfill: **0 unmirrored rows in all seven seasons.**

**Keyed by `season_year`, not `season_id`** — the only key in `keys.js` that is.
The NFL's calendar is league-independent, identical for everybody, and exists
for years we have no fantasy season row for. No FK to `seasons`, no re-import
per season.

**The week span is derived.** 2020 ran to 17 scoring periods (256 games); every
season since has run to 18 (272). `deriveWeekSpan` takes the highest period
anybody plays in. Hardcoding 18 would have fabricated 32 bye rows for 2020.

CHECK constraints carry the rest: `nfl_schedule_bye_shape` (a bye is all-null or
none), `nfl_schedule_real_team` (proTeamId 0 stays filtered),
`nfl_schedule_not_self`.

---

## 3. `stat_breakdown`, and why touchdowns are derived

A `jsonb` column on `player_week_stats` rather than TD columns or a new table.
The `(season, week, player)` grain already existed; the data was already being
downloaded and thrown away by `espnPlayerStatsMapper.js`; and the whole category
surface is worth keeping, because nothing else in this system has player-level
category data at all.

`findStatBreakdown` uses the same three predicates as `findProjectedPoints` with
the source flipped — `statSourceId === 0 && statSplitTypeId === 1 &&
scoringPeriodId === week`. Matching on fewer picks up the season-to-date totals
riding in the same array, which would put a running total in a single week's row
— an error that grows all year rather than announcing itself.

Two distinctions in the derivation helpers:

- **Thrown is not scored.** `getScoredTouchdownCount` counts rushing and
  receiving; `getTouchdownCount` adds passing. The parlay asks "will this player
  score a touchdown", and a quarterback who throws four has scored none. Two
  functions rather than a flag, so a future auto-grader has to say which it
  means. *(The plan specified a single `getTouchdownCount` over all three ids;
  the split was added on finding that summing passing TDs would grade a QB pick
  wrong in the one direction nobody would check.)*
- **`null`, not `0`, without a breakdown.** Every row written before 2026-09 has
  none. Zero would report the whole of league history as having scored nothing —
  the same rule the power ranking's components already follow.

**jsonb keys must not contain underscores or capitals.** `caseMap`'s
`convertKeys` recurses into plain objects, so `rush_td` would be rewritten in
transit. ESPN's numeric-string ids round-trip untouched, which is what makes
storing the raw map verbatim safe.

---

## 4. Hook API, for feature work

One module, `hooks/queries/useNflSchedule.js`. One fetch per NFL season; every
view is a `select` projection of that same cache entry, so two chips on one page
cannot disagree about the same week. `staleTime` 60 minutes. No mutations — the
cron owns the table.

```js
import { useNflOpponentMap } from 'hooks/queries';
import { formatOpponent } from 'utils/nflOpponent.js';

// seasonYear = season.espnSeasonYear ?? season.year
const { data: opponents = {} } = useNflOpponentMap(seasonYear, week);

const entry = opponents[player.proTeamId];   // undefined if not covered
formatOpponent(entry);                        // 'vs BUF' | '@ KC' | 'BYE' | null
```

| Hook | Returns |
|---|---|
| `useNflSeasonSchedule(seasonYear)` | the season's rows, flat |
| `useNflWeekSchedule(seasonYear, week)` | one week's rows, flat |
| `useNflOpponentMap(seasonYear, week)` | `{ [proTeamId]: entry }` |
| `buildOpponentMap(rows, week)` | the same map, pure |

An entry is `{ bye, proTeamId, opponentProTeamId, opponentAbbrev, isHome,
gameTime, startTimeTbd, statsOfficial }`.

**Render `null` as nothing.** Never substitute a placeholder — that is the bye /
unknown distinction the whole table shape exists to preserve.

---

## 5. Sync

| Caller | When | Scope |
|---|---|---|
| `scripts/sync-nfl-schedule.js` | manual | `[year]`, `--backfill` (2020→active), `--dry-run` |
| `scripts/sync-week.js` | weekly cron | the active season, whole; **non-fatal** |
| `scripts/sync-schedule.js` | start of season | the same year, after the games import; **non-fatal** |

All three share the mapper and the writer, so they cannot produce different
rows. The weekly step re-imports the **whole** season rather than one week,
because the NFL flexes late-season kickoffs — a calendar imported in September
and never revisited would carry the wrong times by December, and a full re-upsert
is one round trip that removes the question of which weeks are stale.

Non-fatal because the failure mode is a page with fewer chips, and failing the
run would cost the week's ranking snapshot. `daily-refresh.yml` (then `refresh-rosters.yml`) passes
`--skip-nfl-schedule`: the calendar does not change on a waiver day.

### Backfill verification

```sql
-- 32 teams, exactly one bye each, and every game row mirrored.
select season_year, count(*), count(distinct pro_team_id), max(week),
       count(*) filter (where opponent_pro_team_id is null) as byes
from public.nfl_schedule group by season_year order by season_year;
```

| Season | Rows | Teams | Max week | Byes | Unmirrored | Teams ≠ 1 bye |
|---|---:|---:|---:|---:|---:|---:|
| 2020 | 544 | 32 | 17 | 32 | 0 | 0 |
| 2021-2026 | 576 each | 32 | 18 | 32 | 0 | 0 |

The mapper emitted **zero warnings** across all seven seasons: ESPN's stated
`byeWeek` agreed with its own schedule for every team, every year.

One observation worth recording: 2021 has 478 `stats_official` rows against 544
game rows, where every other completed season has all of them. ESPN simply never
flipped the flag on ~33 of that season's games. It affects nothing today — the
flag is only a future grading gate — but an auto-grader that treats
`stats_official = false` as "not final" will stall on those games rather than
mis-grade them, which is the right direction to fail.

---

## 6. Deliberately not done

- **Auto-grading `scored_td`.** The data, the `stats_official` gate and the
  derivation helpers are in place; grading stays manual. The remaining piece is
  a targeted `kona_player_info` fetch for picks whose player was dropped
  mid-week, since `player_week_stats` only covers rostered players.
- **NFL game scores.** Not in the payload. A different endpoint, and nothing
  asks for them yet.
- **Bye-awareness in the power ranking.** A real idea — a team starting three
  players on bye is measurably weaker that week — but a ranking change, not a
  data change, and it belongs with the weights it would interact with.
- **nflverse ingestion.** Documented as the fallback; not built.

---

## 7. Files

**New:** `services/espnNflScheduleFetcher.js`,
`services/espnNflScheduleMapper.js`, `services/db/nflSchedule.js`,
`scripts/sync-nfl-schedule.js`, `hooks/queries/useNflSchedule.js`,
`utils/nflOpponent.js`, `supabase/migrations/20260902120000_nfl_schedule.sql`,
plus tests for each.

**Changed:** `espnPlayerStatsMapper.js` (`findStatBreakdown`),
`db/playerWeekStats.js` (write + read the column), `db/espnMapping.js`
(`ESPN_STAT_IDS`, the two TD helpers), `db/index.js`, `hooks/queries/keys.js`,
`hooks/queries/index.js`, `scripts/sync-week.js`, `scripts/sync-schedule.js`,
`.github/workflows/daily-refresh.yml` (then `refresh-rosters.yml`), `package.json`,
`MatchupResearchSection.jsx`, `ParlayPickSection.jsx`, `PickEmsSubmission.jsx`,
`espnRosterUpdater.js` (dropped a duplicate 32-team map), `types/supabase.ts`.

**Dropped:** `public.validate_nfl_calendar(integer)` — a leftover referencing an
`nfl_week_calendar` table deleted long ago, removed so it could not be mistaken
for part of this subsystem.
