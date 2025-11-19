# League History Feature - Implementation Guide

## Overview

The League History feature provides comprehensive historical tracking and analysis for your fantasy football league across multiple seasons (2020-2025). It enables career statistics, head-to-head records, awards tracking, record books, and season-by-season comparisons.

## Architecture

### Database Layer (Hybrid Approach)

Historical data is stored in separate tables but can be queried alongside current season data:

- **Archive Tables**: Store historical data (2020-2024)
- **Current Tables**: Continue to store active season data (2025)
- **Unified Views**: Materialized views combine historical + current data
- **SQL Functions**: Helper functions for common cross-season queries

### Key Design Principles

1. **Owner Names as Stable Identifier**: Team names change yearly, but owner names remain consistent
2. **Franchise Concept**: Each owner = one franchise across all seasons
3. **Separation of Historical Data**: Historical tables keep data isolated but queryable
4. **Performance via Materialized Views**: Pre-calculated aggregates for expensive queries

## Database Schema

### Core Tables

#### 1. league_franchises
Tracks owners/managers across multiple seasons.

**Key Fields:**
- `owner_name` (TEXT, UNIQUE) - Stable identifier like "Humza Khalil"
- `joined_year` (INTEGER) - First season in league
- `left_year` (INTEGER, NULLABLE) - Year owner left (e.g., 2024 for "Sai Ravva")
- `is_active` (BOOLEAN) - Currently active in league
- Career aggregates: `total_championships`, `total_wins`, `career_win_percentage`, etc.

#### 2. historical_seasons
Archive of past seasons (2020-2024).

**Key Fields:**
- `year` (INTEGER, UNIQUE) - Season year
- `league_size`, `regular_season_weeks`, `playoff_weeks`
- `stats` (JSONB) - Season-wide statistics
- `imported_from_espn` (BOOLEAN) - Import tracking

#### 3. historical_teams
Team records for each franchise per season.

**Key Fields:**
- `franchise_id` (UUID) - Links to league_franchises
- `season_id` (UUID) - Links to historical_seasons
- `team_name` (TEXT) - Changes yearly
- `espn_team_id` (INTEGER) - ESPN integration
- Regular season: `regular_season_wins`, `points_for`, `win_percentage`
- Playoff: `playoff_finish` ('champion', '2nd', '3rd', 'quarterfinals', etc.)
- Stats: `final_rank`, `power_rating`, `season_stats` (JSONB)

#### 4. historical_games
Complete matchup history.

**Key Fields:**
- `season_id`, `week`, `type` ('regular', 'playoff', 'championship')
- `team1_id`, `team2_id` (Links to historical_teams)
- `team1_score`, `team2_score`
- Results: `winner_team_id`, `is_tie`, `point_differential`
- Flags: `is_blowout`, `is_close`, `is_upset`

#### 5. historical_rosters
Track roster moves, waiver acquisitions, draft picks.

**Key Fields:**
- `team_id`, `season_id`
- `player_name`, `espn_player_id`, `position`
- `acquisition_type` ('draft', 'waiver', 'trade', 'free_agent')
- `acquisition_week`, `acquisition_cost` (FAAB)
- `draft_round`, `draft_pick`

#### 6. head_to_head_records
All-time matchup records between franchises.

**Key Fields:**
- `franchise1_id`, `franchise2_id` (Ordered: franchise1_id < franchise2_id)
- All-time: `total_matchups`, `franchise1_wins`, `franchise2_wins`, `ties`
- Splits: `regular_season_matchups`, `playoff_matchups`
- Stats: `franchise1_avg_points`, `franchise2_avg_points`
- Notable: `highest_scoring_game_id`, `largest_margin_game_id`
- Streaks: `current_streak_franchise_id`, `longest_streak_length`

#### 7. season_awards
Track championships, achievements, honors.

**Award Categories:**
- **STANDARD**: champion, runner_up, third_place, fourth_place
- **REGULAR_SEASON**: best_record, highest_points, most_blowouts, highest_weekly_score
- **DUBIOUS**: worst_record, lowest_points, most_points_against, biggest_blowout_loss
- **ADVANCED**: highest_efficiency, most_consistent, best_playoff_run

**Key Fields:**
- `season_id`, `franchise_id`, `team_id`
- `award_category`, `award_type`, `award_name`
- `value`, `value_label` (e.g., "12-2 record", "1,847 points")

#### 8. franchise_records
Record book for achievements.

**Record Categories:**
- **SINGLE_GAME**: highest_score, lowest_score, largest_margin_win
- **SINGLE_SEASON**: most_wins, highest_points_for, most_waiver_pickups
- **CAREER**: most_total_wins, most_championships, best_win_percentage
- **STREAK**: longest_win_streak, most_consecutive_playoffs

### Materialized Views

#### mv_franchise_career_stats
Pre-calculated career statistics for each franchise.

Fields: `total_wins`, `total_losses`, `championships`, `playoff_appearances`, `avg_win_percentage`, etc.

#### mv_season_leaderboards
Pre-calculated leaderboards for each season.

Fields: `best_record`, `highest_scorer`, `champion` (as JSONB objects)

### SQL Functions

- `get_franchise_career_stats(franchise_id)` - Get career stats for a franchise
- `get_h2h_record(franchise1_id, franchise2_id)` - Get head-to-head record
- `get_franchise_awards(franchise_id)` - Get all awards for a franchise
- `refresh_league_history_views()` - Refresh all materialized views

## Scripts

### 1. buildFranchiseRegistry.js

**Purpose**: Initialize franchise table from existing team data.

**Usage**:
```bash
node scripts/buildFranchiseRegistry.js
```

**What it does**:
- Scans `teams` table for unique owner names
- Creates `league_franchises` records
- Handles special cases (Sai Ravva left after 2024, Anish Madala joined 2025)
- Links existing teams to franchises (if `franchise_id` column exists)

**Run this**: Once initially, after creating schema.

---

### 2. importHistoricalSeason.js

**Purpose**: Import ESPN historical data for a specific year.

**Usage**:
```bash
# Import 2024 season
node scripts/importHistoricalSeason.js 2024

# Overwrite existing import
node scripts/importHistoricalSeason.js 2024 --force
```

**What it does**:
1. Fetches data from ESPN API for specified year
2. Creates `historical_seasons` record
3. Maps ESPN owners → franchises (by name)
4. Creates `historical_teams` records
5. Creates `historical_games` records
6. Analyzes playoff results and updates team records

**Prerequisites**:
- `ESPN_S2` and `SWID` environment variables (or uses defaults)
- Franchises must exist in `league_franchises` table

**Run this**: Once per historical season (2020, 2021, 2022, 2023, 2024).

---

### 3. calculateHeadToHeadHistory.js

**Purpose**: Build all-time head-to-head records between franchises.

**Usage**:
```bash
# Calculate/update H2H records
node scripts/calculateHeadToHeadHistory.js

# Clear and rebuild from scratch
node scripts/calculateHeadToHeadHistory.js --rebuild
```

**What it does**:
1. Queries all `historical_games`
2. Groups games by franchise matchups
3. Calculates wins, losses, points, streaks
4. Identifies notable games (highest scoring, largest margin)
5. Saves to `head_to_head_records` table

**Run this**: After importing historical seasons, or when games are updated.

---

### 4. calculateSeasonAwards.js

**Purpose**: Assign awards retroactively for historical seasons.

**Usage**:
```bash
# Calculate awards for all seasons
node scripts/calculateSeasonAwards.js

# Calculate for specific season
node scripts/calculateSeasonAwards.js --season=2024

# Clear and rebuild all awards
node scripts/calculateSeasonAwards.js --rebuild
```

**What it does**:
1. Analyzes team and game data for each season
2. Calculates awards across 4 categories (standard, regular season, dubious, advanced)
3. Saves to `season_awards` table
4. Updates franchise career stats (`total_championships`, etc.)

**Awards Calculated**:
- **Standard**: Champion, Runner-up, 3rd/4th place
- **Regular Season**: Best record, highest points, most blowouts, highest weekly score
- **Dubious**: Worst record, lowest points, most points against, biggest loss, lowest weekly score
- **Advanced**: Most efficient, most consistent (lowest std dev)

**Run this**: After importing seasons, or when recalculating awards.

---

## Implementation Workflow

### Phase 1: Setup Database

1. **Run SQL Schema**:
   ```bash
   # In Supabase SQL Editor
   # Copy contents of scripts/league_history_schema.sql
   # Execute the entire script
   ```

2. **Verify Tables Created**:
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   AND (table_name LIKE '%franchise%' OR table_name LIKE '%historical%');
   ```

### Phase 2: Initialize Franchises

```bash
node scripts/buildFranchiseRegistry.js
```

**Expected Output**:
- Creates 15 franchise records (14 active + Sai Ravva as inactive)
- Links current teams to franchises

### Phase 3: Import Historical Data (Incremental)

**Start with 2024 as test**:
```bash
node scripts/importHistoricalSeason.js 2024
```

**Validate 2024 Import**:
- Check `historical_seasons` table for 2024 record
- Verify 14 teams in `historical_teams`
- Verify games in `historical_games` match ESPN schedule
- Verify playoff_finish is set correctly for champion/runner-up

**If 2024 looks good, import remaining years**:
```bash
node scripts/importHistoricalSeason.js 2023
node scripts/importHistoricalSeason.js 2022
node scripts/importHistoricalSeason.js 2021
node scripts/importHistoricalSeason.js 2020
```

### Phase 4: Calculate Analytics

**Head-to-Head Records**:
```bash
node scripts/calculateHeadToHeadHistory.js
```

**Season Awards**:
```bash
node scripts/calculateSeasonAwards.js
```

**Refresh Materialized Views** (in Supabase SQL Editor):
```sql
SELECT refresh_league_history_views();
```

### Phase 5: Verify Data

**Check franchise career stats**:
```sql
SELECT * FROM mv_franchise_career_stats
ORDER BY championships DESC, total_wins DESC;
```

**Check head-to-head records**:
```sql
SELECT
  f1.owner_name AS franchise1,
  f2.owner_name AS franchise2,
  total_matchups,
  franchise1_wins,
  franchise2_wins
FROM head_to_head_records h2h
JOIN league_franchises f1 ON h2h.franchise1_id = f1.id
JOIN league_franchises f2 ON h2h.franchise2_id = f2.id
ORDER BY total_matchups DESC
LIMIT 10;
```

**Check awards**:
```sql
SELECT
  hs.year,
  lf.owner_name,
  sa.award_name,
  sa.value_label
FROM season_awards sa
JOIN historical_seasons hs ON sa.season_id = hs.id
JOIN league_franchises lf ON sa.franchise_id = lf.id
WHERE sa.award_type = 'champion'
ORDER BY hs.year DESC;
```

## Service Layer (leagueHistoryManager.js)

The `LeagueHistoryManager` service provides clean APIs for querying historical data.

### Usage Examples

```javascript
import { leagueHistoryManager } from './services/leagueHistoryManager.js';

// Get all franchises
const franchises = await leagueHistoryManager.getAllFranchises();

// Get franchise career stats
const careerStats = await leagueHistoryManager.getFranchiseCareerStats(franchiseId);

// Get head-to-head record
const h2hRecord = await leagueHistoryManager.getHeadToHeadRecord(franchise1Id, franchise2Id);

// Get franchise awards
const awards = await leagueHistoryManager.getFranchiseAwards(franchiseId);

// Get all championships
const champions = await leagueHistoryManager.getAllChampionships();

// Compare two seasons
const comparison = await leagueHistoryManager.compareSeasons(2024, 2023);

// Get franchise year-over-year performance
const yoyPerformance = await leagueHistoryManager.getFranchiseYearOverYear(franchiseId);
```

### Available Methods

**Franchise Queries**:
- `getAllFranchises()` - List all franchises
- `getFranchiseById(id)` - Get specific franchise
- `getFranchiseByOwner(ownerName)` - Get franchise by owner name
- `getFranchiseCareerStats(id)` - Get career statistics
- `getAllFranchiseCareerStats(options)` - Get career stats leaderboard

**Season Queries**:
- `getHistoricalSeasons()` - List all historical seasons
- `getSeasonByYear(year)` - Get specific season
- `getSeasonTeams(seasonId)` - Get teams for a season
- `getFranchiseSeasonPerformance(franchiseId, seasonId)` - Get franchise's season
- `getFranchiseSeasonHistory(franchiseId)` - Get all seasons for franchise

**Head-to-Head Queries**:
- `getHeadToHeadRecord(franchise1Id, franchise2Id)` - Get H2H record
- `getFranchiseHeadToHeadRecords(franchiseId)` - Get all H2H for franchise
- `getMatchupHistory(franchise1Id, franchise2Id)` - Get all games between franchises

**Awards Queries**:
- `getFranchiseAwards(franchiseId)` - Get all awards for franchise
- `getSeasonAwards(seasonId, category?)` - Get awards for season
- `getAllChampionships()` - Get all championship awards

**Records Queries**:
- `getFranchiseRecords(franchiseId?, category?)` - Get franchise records
- `getLeagueRecord(recordType)` - Get league-wide record

**Leaderboards & Comparisons**:
- `getSeasonLeaderboard(year?)` - Get season leaderboard
- `compareSeasons(year1, year2)` - Compare two seasons
- `getFranchiseYearOverYear(franchiseId)` - Year-over-year analysis

## Data Flow Diagram

```
ESPN API (2020-2024)
         ↓
importHistoricalSeason.js
         ↓
┌────────────────────────────────────────┐
│  historical_seasons                    │
│  historical_teams (linked to franchises)│
│  historical_games                      │
└────────────────────────────────────────┘
         ↓
calculateHeadToHeadHistory.js
         ↓
┌────────────────────────────────────────┐
│  head_to_head_records                  │
└────────────────────────────────────────┘
         ↓
calculateSeasonAwards.js
         ↓
┌────────────────────────────────────────┐
│  season_awards                         │
│  league_franchises (updated stats)     │
└────────────────────────────────────────┘
         ↓
refresh_league_history_views()
         ↓
┌────────────────────────────────────────┐
│  mv_franchise_career_stats             │
│  mv_season_leaderboards                │
└────────────────────────────────────────┘
         ↓
leagueHistoryManager.js (Service Layer)
         ↓
Frontend Components (Future)
```

## Frontend Integration (Future)

When building the League History frontend tab, you can use the service layer:

### Suggested Components

1. **Franchise Profile Page**
   - Career stats
   - Season-by-season records
   - Awards showcase
   - Head-to-head records vs all opponents

2. **All-Time Leaderboards**
   - Championships
   - Career wins
   - Total points
   - Best win percentage

3. **Season Archive**
   - List all seasons
   - Season-by-season standings
   - Awards for each season
   - Season comparison tool

4. **Head-to-Head Explorer**
   - Select two franchises
   - View all-time record
   - Game-by-game history
   - Scoring trends

5. **Record Book**
   - Single-game records
   - Single-season records
   - Career records
   - Streak records

6. **Awards Gallery**
   - Championships wall
   - Regular season honors
   - Dubious dishonors
   - Advanced analytics awards

## Troubleshooting

### ESPN Authentication Issues

**Problem**: `importHistoricalSeason.js` fails with 401 Unauthorized

**Solution**:
1. Get fresh ESPN S2 and SWID cookies from your browser
2. Update `.env` file or hardcode in script:
   ```bash
   ESPN_S2=your_espn_s2_cookie_here
   SWID=your_swid_here
   ```

### Missing Franchises

**Problem**: Teams being skipped during import with "no franchise found"

**Solution**:
1. Run `buildFranchiseRegistry.js` first
2. Check owner name spelling matches exactly between ESPN and database
3. Manually create missing franchise if needed:
   ```sql
   INSERT INTO league_franchises (owner_name, joined_year, is_active)
   VALUES ('Owner Name', 2020, true);
   ```

### Incorrect Playoff Results

**Problem**: Champion/runner-up not set correctly

**Solution**:
- ESPN data may not include playoff results for past seasons
- Manually update `historical_teams.playoff_finish`:
  ```sql
  UPDATE historical_teams
  SET playoff_finish = 'champion'
  WHERE season_id = (SELECT id FROM historical_seasons WHERE year = 2024)
  AND team_name = 'Championship Team Name';
  ```

### Materialized Views Out of Date

**Problem**: Leaderboards showing old data

**Solution**:
```sql
SELECT refresh_league_history_views();
```

Or programmatically:
```javascript
await leagueHistoryManager.refreshMaterializedViews();
```

## Performance Considerations

1. **Materialized Views**: Refresh after data changes, not on every query
2. **Indexes**: All foreign keys and common query fields are indexed
3. **JSONB Fields**: Use JSONB operators for efficient querying of `season_stats`, `season_awards.value`
4. **RLS Policies**: Public read access, admin-only write access

## Security (RLS Policies)

All historical tables have Row Level Security enabled:

- **Public Read Access**: Anyone can view historical data
- **Admin Write Access**: Only admin users (with `is_admin` metadata) can modify

This aligns with your architecture:
- General public can view league data
- Only admin can manipulate historical data
- Authenticated users still manage their own pick'ems (separate feature)

## Future Enhancements

### Planned Features
- **Historical rosters tracking**: Full draft and waiver history
- **Trade analyzer**: See all trades in league history
- **Matchup predictor**: ML model based on H2H history
- **Dynasty rankings**: Long-term success metrics
- **Era comparisons**: Pre-2022 vs Post-2022 rule changes
- **Interactive visualizations**: Charts for trends, records, awards

### Database Extensions
- `historical_trades` table for trade tracking
- `historical_drafts` table for draft analysis
- `weekly_snapshots` table for historical power rankings
- `playoff_bracket_history` for tournament progression

## Contact & Support

For questions or issues with the league history implementation:
1. Check this README
2. Review script output for error messages
3. Query database directly to verify data
4. Check Supabase logs for RLS/permission issues

---

**Implementation Status**: ✅ Backend Complete, 🔄 Testing Phase, ⏳ Frontend Pending

Last Updated: 2025-11-15
