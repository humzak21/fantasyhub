# Verification

Every claim below was checked against the live database or a real build.

## Backfill integrity

After unifying `historical_*` into the live tables:

| Check | Result |
|---|---|
| Row counts | 6 seasons (1+5), 84 teams (14+70), 703 games (120+583), 12 divisions (2+10) |
| `historical_teams` → `teams` field-by-field | 0 mismatches across name, W/L, PF/PA, franchise, ESPN id, playoff finish |
| `historical_games` → `games` field-by-field | 0 mismatches across scores, week, type, winner, season |
| Missing rows | 0 in either direction |
| Teams without a division | 0 |

## Derived views vs stored columns

The strongest available check: do the views reproduce numbers that were computed
independently, years ago, by a different code path?

**Before the 2025 fix** — 2020–2024 matched exactly; 2025 differed for all 14
teams by exactly one game. That discrepancy is what surfaced the mistyped
postseason games.

**After the fix:**

```sql
select … from v_team_standings v join teams t on t.id = v.team_id
where t.wins is distinct from v.wins
   or t.losses is distinct from v.losses
   or round(coalesce(t.points_for,0),2) is distinct from round(v.points_for,2);
-- → []   (all six seasons)
```

`v_franchise_career` differs from `mv_franchise_career_stats` exactly as
intended — 6 seasons instead of 5, because the current season is now included
rather than merged in JavaScript. `v_head_to_head` likewise differs from the
stored `head_to_head_records` by the 2025 matchups.

## Compat shims through PostgREST

The app talks to Postgres through PostgREST, so the views were tested the way
the app uses them — not just in SQL. **The embed queries were the likeliest
breakage**, since PostgREST has to infer foreign-key relationships *through* a
view:

| Request | Status |
|---|---|
| `award_votes?select=id,awards_2025!inner(season_id)` | 200 |
| `award_votes?select=id,awards!inner(season_id)` | 200 |
| `playoffs_2025?select=id,predicted_winner:teams!playoffs_2025_predicted_winner_fkey(...)` | 200 |
| `playoff_picks?select=…` (same hint) | 200 |
| `transactions_2025?select=owner_name,faab_spent` | 200 |
| `v_active_season`, `v_team_standings`, `v_franchise_career`, `v_head_to_head`, `v_record_book` | 200 |
| `rpc/team_standings_as_of` | 200 |

Row counts through the shims match their backing tables: `awards_2025` 48,
`playoffs_2025` 140, `team_transactions` 84, `transactions_2025` 14.

## Season rollover

Tested end-to-end against production, then removed:

```sql
insert into public.seasons (year, name, league_size, regular_season_weeks,
                            playoff_weeks, start_date, espn_league_id,
                            espn_season_year, is_active, is_completed)
values (2026, 'Season 7', 14, 14, 3, date '2026-09-08', '67674700', 2026, false, false);
```

| Field | Value |
|---|---|
| `status` | `upcoming` (generated) |
| `total_weeks` | 17 (generated) |
| `season_week_start(id, 1)` | `2026-09-08 04:00:00+00` — midnight EDT |
| `season_week_start(id, 15)` | `2026-12-15 05:00:00+00` — midnight EST, DST handled |

Row counts returned to 6 / 84 / 703 / 12 after cleanup.

## Application

| Check | Result |
|---|---|
| `npx eslint` on changed files | No new errors. 5 pre-existing `no-empty` errors in `supabaseDataManager.js`, confirmed present on the stashed baseline. |
| `npx vite build` | Succeeds, 2383 modules |
| `npx vitest run utils/` | 69 passed (23 new) |

Two `seasonConfig` tests reproduce the actual stored `pick_em_weeks` rows for
week 4 (EDT) and week 12 (EST):

```
week  4 → opens 2025-09-23T08:00Z, closes 2025-09-26T00:00Z, reveals 2025-09-30T16:00Z
week 12 → opens 2025-11-18T09:00Z, closes 2025-11-21T01:00Z, reveals 2025-11-25T17:00Z
```

The one-hour shift between them is the DST transition, derived correctly from
`start_date` + `timezone` alone.

## 2025 postseason fix

| Check | Result |
|---|---|
| Postseason games still typed `regular` | 0 (asserted inside the migration) |
| Week 16 | 2 semifinal, 1 playoff, 4 consolation-semifinal |
| Week 17 | 1 championship, 2 playoff, 4 consolation-championship |
| Regular-season games per team | 14 for all 14 teams |
| Total regular-season wins | 98 = 7 games × 14 weeks |
