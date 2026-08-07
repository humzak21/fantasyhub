# The 2025 postseason fix

Migration `20260805100000_fix_2025_playoff_game_types.sql`.

> **This changed the 2025 regular-season records the site displays.** Jump to
> [the table](#standings-before-and-after) if that is what you are here for.

## What was wrong

2025 is 14 regular-season weeks plus 3 playoff weeks (15–17). Week 15 was typed
correctly. **Every game in weeks 16 and 17 was still `type = 'regular'`.**

Two defects fell out of that:

1. Postseason games counted toward regular-season records. Stored 2025 records
   covered **16 games**, so 2025 used a different definition of "record" than
   2020–2024, which store regular-season splits. This is what made
   `v_team_standings` disagree with the stored columns for 2025 and *only* 2025.
2. `refresh_team_stats()` has **no `type` filter at all**. It counts every
   completed game in the season. Correcting the types alone would have been
   undone by the next score edit.

## How the bracket was determined

Not by inference from the pairings — those look wrong at first glance. It came
from two independent sources that agree:

**The `matchup_id` vocabulary already in `playoff_picks`:** `div1_r1`/`div2_r1`,
`div1_semi`/`div2_semi`, `championship`, `third_place`, `fifth_place_wk16`,
`fifth_place_wk17`, and `con_r1_0..3` / `con_r2_0..3` / `con_r3_0..3`.

**Week 15, whose types are correct:** the 8 teams in
`playoff_consolation_quarterfinals` are the consolation bracket; the 2 `bye`
teams plus the 4 in `playoff_first_round` are the championship bracket.

The key insight is that **`con_r*` has four games in every round** — the
consolation bracket is a full 8-team placement ladder where all eight teams play
every week, not a knockout. That is why round 2 pairs some week-15 winners
against week-15 losers, which is what made the pairings look wrong.

The migration derives membership structurally from week 15 rather than
hardcoding team names, and asserts at the end that no postseason game is still
typed `regular`.

## Resulting types

| Week | Games | Type | Matchup |
|---|---|---|---|
| 16 | 2 | `playoff_semifinals` | `div1_semi`, `div2_semi` (bye team vs first-round winner) |
| 16 | 1 | `playoff` | `fifth_place_wk16` (the two first-round losers) |
| 16 | 4 | `playoff_consolation_semifinals` | `con_r2_0..3` |
| 17 | 1 | `playoff_championship` | `championship` (the two semifinal winners) |
| 17 | 2 | `playoff` | `third_place`, `fifth_place_wk17` |
| 17 | 4 | `playoff_consolation_championship` | `con_r3_0..3` |

Third- and fifth-place games use the generic `playoff` type because
`games_type_check` has no dedicated placement type. Adding one would be a schema
change beyond this fix.

## The other two parts

**`refresh_team_stats()` gained `AND type = 'regular'`** in both of its
aggregate queries (the record/points query and the blowout/close query), plus a
pinned `search_path`. Without this the corruption returns on the next score
edit. Nothing else in the function body changed.

**2025 stored stats were resynced** by calling the corrected function for each
2025 team. 2020–2024 were left untouched: their stored values already carry
regular-season splits and re-running would be a no-op.

A fourth, incidental fix: `update_playoff_pick_results()` was still writing
through the deprecated `playoffs_2025` compat view (it worked, since the view is
auto-updatable) and now targets `playoff_picks` directly.

### Triggers

No triggers needed disabling. All three are no-ops for a type-only change:

- `trigger_update_team_stats` (BEFORE) recomputes game-level fields from
  scores; scores did not change, so it recomputes identical values
- `after_game_completion` requires `NOT OLD.is_completed`; these games were
  already complete
- `update_playoff_pick_results` requires the winner to have changed; it did not

## Standings before and after

Every team now has exactly 14 regular-season games. Wins sum to 98
(7 games × 14 weeks), as they must.

| Owner | Stored before | Corrected | Δ |
|---|---|---|---|
| Harshil Pareek | 13-2 | **13-1** | −1 L |
| Anish Madala | 11-4 | **11-3** | −1 L |
| Eshan Kaul | 11-5 | **9-5** | −2 W |
| Arya Shah | 10-6 | **9-5** | −1 W, −1 L |
| Humza Khalil | 10-6 | **9-5** | −1 W, −1 L |
| Aashish Gatmaneni | 7-9 | **7-7** | −2 L |
| Anand Kanumuru | 6-10 | **6-8** | −2 L |
| Rohit Ramki | 8-8 | **6-8** | −2 W |
| Nikhil Sharma | 7-9 | **6-8** | −1 W, −1 L |
| Aaron Wadhwa | 7-9 | **5-9** | −2 W |
| Pranav Simha | 7-9 | **5-9** | −2 W |
| Pranesh Anand | 6-10 | **5-9** | −1 W, −1 L |
| Aditya Penmesta | 5-11 | **4-10** | −1 W, −1 L |
| Rohith Mahesh | 3-13 | **3-11** | −2 L |

Playoff results are unaffected — this only changes what counts as a
*regular-season* record. Postseason outcomes still live in `games`, now
correctly typed, and in `teams.playoff_finish` / `final_rank`.

## The check that matters

Before this migration, `v_team_standings` matched the stored columns for
2020–2024 but not 2025. After it:

```
stored_vs_view_all_seasons → []
```

Stored statistics and derived views now agree for **all six seasons**, under one
consistent definition.
