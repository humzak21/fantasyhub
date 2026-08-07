# Database changes

All schema changes are versioned in [`supabase/migrations/`](../supabase/migrations/)
and applied to `kvcnijyyfylxfarrlxkv`. Before this work the project had **no
migration history at all** — the schema had been built by pasting SQL into the
Supabase editor.

| # | Migration | Purpose |
|---|---|---|
| 0 | `00000000000000_baseline_placeholder.sql` | Marks the start of migration history. Deliberately a no-op. |
| 1 | `20260803120000_admin_helper.sql` | `is_admin()` |
| 2 | `20260803120100_season_config_backbone.sql` | Season config columns, week derivation |
| 3 | `20260803120200_unify_historical_seasons.sql` | Fold `historical_*` into the live tables |
| 4 | `20260803120300_generic_feature_tables.sql` | Retire the `*_2025` names |
| 5 | `20260803120400_derived_views.sql` | Standings/career/H2H/records as views |
| 6 | `20260805100000_fix_2025_playoff_game_types.sql` | 2025 postseason correction |

## Tooling

`supabase` CLI added as a devDependency, with `supabase/config.toml` pinned to
Postgres 17 to match production. New scripts, replacing the two `db:setup` /
`db:reset` commands that only printed instructions:

```
npm run db:push       npm run db:push:dry
npm run db:pull       npm run db:diff
npm run db:types      # generates types/supabase.ts from the live schema
```

> **No baseline dump yet.** Migration 0 is a placeholder. Run
> `npx supabase db pull baseline_schema` once the CLI is linked to capture the
> pre-existing schema; see [`supabase/migrations/README.md`](../supabase/migrations/README.md).

---

## 1. `is_admin()`

```sql
select coalesce((auth.jwt() ->> 'email') = 'humzak2001@gmail.com', false)
```

`STABLE SECURITY DEFINER` with `search_path` pinned. Until now the admin rule
lived only in `VITE_ADMIN_USER_ID`, compiled into the public bundle, where it
hid buttons but enforced nothing. Every policy written from here on keys off
this function. *(Retrofitting it onto the existing always-true policies is §2
work and has not been done.)*

## 2. Season config backbone

New columns on `seasons`:

| Column | Purpose |
|---|---|
| `start_date` | First day of week 1 (a Tuesday). Sole source for all week math. |
| `timezone` | IANA zone all wall-clock times resolve in (`America/New_York`). |
| `espn_league_id`, `espn_season_year` | Replace `config/espn-config.js` literals |
| `awards_release_at` | Replaces the `2025-12-09` literal in the UI |
| `pickem_{open,close,reveal}_{offset_days,time}` | Replace the pick'em rules that lived in three places |
| `status` | **Generated** from `is_completed`/`is_active` → `archived`/`active`/`upcoming` |

`status` is a generated column rather than a new writable field specifically so
it can never drift from the legacy booleans while code is being repointed.

**The pick'em offsets were not invented.** They were reverse-engineered from the
13 existing `pick_em_weeks` rows, which resolve consistently across both the EDT
and EST halves of 2025 to: opens Tuesday 04:00, closes Thursday 20:00, reveals
the following Tuesday 12:00 (all `America/New_York`).

Constraints and helpers added:

- `seasons_year_key` — unique year
- `seasons_one_active_idx` — partial unique index; the database now enforces
  at most one active season rather than trusting `setActiveSeason()` to
  deactivate the others first
- `season_week_start(season_id, week)`, `season_current_week(season_id)`
- `v_active_season` — the active row plus `week_count`, `playoff_start_week`,
  `current_week`

## 3. Unifying the historical universe

`historical_seasons` (5) → `seasons`, `historical_teams` (70) → `teams`,
`historical_games` (583) → `games`.

**Rows were copied with their original UUIDs**, so `historical_teams.season_id`
and `historical_games.team1_id/team2_id/winner_team_id` resolve against the live
tables with no id remapping anywhere. Verified beforehand: no id collisions, no
duplicate `(season, team_name)` pairs.

Supporting changes:

- `user_id` made nullable on `seasons`/`teams`/`games`/`weeks`. It is
  multi-tenant scaffolding for a design that never happened; `NOT NULL DEFAULT
  auth.uid()` would have attributed archived seasons to whoever ran the
  migration. Dropped entirely in P2.
- Dropped `seasons_year_user_unique` (meaningless once `user_id` goes).
- `teams` gains the facts that genuinely are not derivable from scores:
  `made_playoffs`, `playoff_seed`, `playoff_wins`, `playoff_losses`,
  `playoff_finish`, `final_rank`, `season_stats`, `draft_picks`.
- `games` gains `is_upset`, `espn_matchup_id`, `espn_scoring_period_id`,
  `created_at`.
- `divisions` rows created for the archived seasons from
  `historical_teams.division_name`, so both eras use one shape.
- Indexes on `teams(season_id)`, `teams(franchise_id)`, `games(season_id, week)`,
  `games(team1_id)`, `games(team2_id)`.

### Three triggers had to be disabled for the backfill

This is the part most likely to surprise someone re-running it:

| Trigger | Why it had to stand aside |
|---|---|
| `trigger_create_default_divisions` | Fabricates divisions named `Donkeys` and `Ninjas` on **every** `seasons` INSERT, colliding with the real division rows. Still live — it is the server-side twin of the hook side effect flagged in §6.3. |
| `before_game_update` | Recomputes team stats on every INSERT |
| `after_game_completion` | Same |

Letting the latter two fire would have overwritten the archived regular-season
splits with playoff-inclusive totals, silently changing every number the History
tab shows. All three are re-enabled at the end of the migration; the file is one
transaction, so a failure leaves them on.

Two columns turned out to already be generated and had to be omitted from the
INSERT lists: `seasons.total_weeks` and `games.is_completed`.

## 4. Retiring the year-suffixed tables

Tables were **renamed, not copied**, so primary keys, the `award_votes` foreign
key, RLS policies and PostgREST embed hints all followed the table. A view under
the old name keeps existing callers working.

| Was | Is now | Compat view |
|---|---|---|
| `awards_2025` | `awards` | `awards_2025` (updatable) |
| `season_awards` | merged into `awards` as `source = 'computed'` | source table left in place |
| `playoffs_2025` | `playoff_picks` | `playoffs_2025` (updatable) |
| `playoffs_2025_config` | `playoff_config` | `playoffs_2025_config` (updatable) |
| `team_transactions` | `transactions` | `team_transactions` (updatable) |
| `transactions_2025` | merged into `transactions` | `transactions_2025` (read-only) |

`awards` gains a `source` discriminator (`ballot` \| `computed`) plus
`award_type`, `winner_franchise_id`, `winner_team_id`, `value`, `value_label`,
`awarded_at` — enough to hold both the voting ballot and the computed
statistical awards without either pretending to be the other.

`transactions.total_transactions` became a **generated column**
(`adds + claims + trades + drops`), verified equal to the stored value on all 70
existing rows first. `mv_transaction_leaderboards` aggregates that column, so it
was dropped and recreated verbatim against the new table name.

### A hardcoded deadline inside an RLS policy

`playoffs_2025`'s insert/update policies contained the literal
`now() < '2025-12-13 01:15:00+00'`. **2026 playoff picks would have been rejected
by the database itself**, with no error the UI could explain. Both policies now
read the deadline from `playoff_config`:

```sql
now() < coalesce(
  (select c.submission_deadline from public.playoff_config c
    where c.season_id = playoff_picks.season_id),
  'infinity'::timestamptz)
```

The uniqueness constraint also moved from `(user_id, matchup_id)` to
`(season_id, user_id, matchup_id)`, which would have collided the moment a 2026
bracket reused a `matchup_id`.

## 5. Derived data as views

Scores in `games` are the single source of truth. These replace stored columns
and the JavaScript merge code in `leagueHistoryManager.js`:

| View | Replaces |
|---|---|
| `v_game_results` | — (base: one row per completed game per team) |
| `v_team_standings` | ~25 computed columns on `teams`, and `refresh_team_stats()` |
| `v_franchise_career` | `mv_franchise_career_stats` **and** the current-season merge in JS |
| `v_head_to_head` | `head_to_head_records` + `calculateHeadToHeadHistory.js` |
| `v_record_book` | the never-populated `franchise_records` table |
| `team_standings_as_of(season_id, week)` | the "standings entering week N" the ranking calculator needs |

All created `with (security_invoker = true)` so the base tables' RLS applies to
the caller, not the view owner.

`v_franchise_career` is the clearest illustration of the payoff:
`mv_franchise_career_stats` only ever saw `historical_teams`, which is precisely
why `getFranchiseCareerStatsWithCurrentSeason()` had to bolt the current season
on in JavaScript. Reading the unified tables, the active season is simply
included — and Anish Madala, who joined in 2025, goes from `seasons_played: 0`
to `1`.

Current-streak calculation uses gaps-and-islands: ordered newest-first, the
leading run is the only one whose `(overall rank − rank within result)` is zero.

## 6. The 2025 postseason fix

See [`03-2025-playoff-fix.md`](03-2025-playoff-fix.md).
