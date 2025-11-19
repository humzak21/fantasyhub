/**
 * Calculate Head-to-Head History Script
 *
 * This script processes all historical games and builds the head_to_head_records
 * table with all-time matchup statistics between franchises across all seasons.
 *
 * It calculates:
 * - Total wins/losses/ties between each franchise pair
 * - Regular season vs playoff splits
 * - Points scored by each franchise in the matchup
 * - Notable games (highest scoring, largest margin)
 * - Win streaks
 *
 * Usage:
 *   node scripts/calculateHeadToHeadHistory.js
 *   node scripts/calculateHeadToHeadHistory.js --rebuild  (clear and rebuild all records)
 *
 * Prerequisites:
 *   - historical_games table must be populated with game data
 *   - historical_teams table must have franchise_id linked
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getSupabaseAdmin } from './lib/getSupabaseAdmin.js';

const args = process.argv.slice(2);
const rebuildAll = args.includes('--rebuild');

/**
 * Get all historical games with franchise info
 */
async function getAllHistoricalGames(supabaseAdmin) {
  console.log('\n📊 Fetching all historical games...');

  const { data: games, error } = await supabaseAdmin
    .from('historical_games')
    .select(`
      *,
      team1:historical_teams!historical_games_team1_id_fkey(id, franchise_id),
      team2:historical_teams!historical_games_team2_id_fkey(id, franchise_id)
    `)
    .eq('is_completed', true)
    .order('season_id', { ascending: true })
    .order('week', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch historical games: ${error.message}`);
  }

  console.log(`   ✅ Found ${games?.length || 0} completed historical games`);
  return games || [];
}

/**
 * Get current season games with franchise info
 */
async function getCurrentSeasonGames(supabaseAdmin) {
  console.log('\n📊 Fetching current season games...');

  // Get games from the current season (games table)
  const { data: games, error } = await supabaseAdmin
    .from('games')
    .select(`
      id,
      week,
      team1_id,
      team2_id,
      team1_score,
      team2_score,
      is_completed,
      season_id,
      team1:teams!games_team1_id_fkey(id, franchise_id, owner),
      team2:teams!games_team2_id_fkey(id, franchise_id, owner)
    `)
    .eq('is_completed', true)
    .order('season_id', { ascending: true })
    .order('week', { ascending: true });

  if (error) {
    // It's okay if games table doesn't exist or has issues
    console.warn(`   ⚠️  Could not fetch current season games: ${error.message}`);
    return [];
  }

  // Transform to match historical_games format
  const transformedGames = (games || []).map(game => {
    const team1Score = game.team1_score || 0;
    const team2Score = game.team2_score || 0;

    // Determine winner
    let winnerId = null;
    let loserId = null;
    let isTie = false;

    if (team1Score > team2Score) {
      winnerId = game.team1_id;
      loserId = game.team2_id;
    } else if (team2Score > team1Score) {
      winnerId = game.team2_id;
      loserId = game.team1_id;
    } else {
      isTie = true;
    }

    return {
      id: game.id,
      week: game.week,
      team1_id: game.team1_id,
      team2_id: game.team2_id,
      team1_score: team1Score,
      team2_score: team2Score,
      is_completed: game.is_completed,
      is_tie: isTie,
      winner_team_id: winnerId,
      loser_team_id: loserId,
      type: 'regular', // Current season games are regular season
      season_id: game.season_id,
      team1: game.team1,
      team2: game.team2,
      isCurrentSeason: true // Flag to identify current season games
    };
  });

  console.log(`   ✅ Found ${transformedGames.length} completed current season games`);
  return transformedGames;
}

/**
 * Build head-to-head records from games
 */
function buildH2HRecords(games) {
  console.log('\n📊 Building head-to-head records...');

  const h2hMap = new Map(); // Key: "franchise1_id|franchise2_id" (sorted)

  for (const game of games) {
    const franchise1 = game.team1?.franchise_id;
    const franchise2 = game.team2?.franchise_id;

    if (!franchise1 || !franchise2) {
      console.warn(`   ⚠️  Game ${game.id} missing franchise data, skipping`);
      continue;
    }

    // Ensure consistent ordering (smaller UUID first)
    const [minFranchise, maxFranchise] = franchise1 < franchise2
      ? [franchise1, franchise2]
      : [franchise2, franchise1];

    const key = `${minFranchise}|${maxFranchise}`;

    // Initialize record if doesn't exist
    if (!h2hMap.has(key)) {
      h2hMap.set(key, {
        franchise1_id: minFranchise,
        franchise2_id: maxFranchise,
        total_matchups: 0,
        franchise1_wins: 0,
        franchise2_wins: 0,
        ties: 0,
        regular_season_matchups: 0,
        regular_season_franchise1_wins: 0,
        regular_season_franchise2_wins: 0,
        playoff_matchups: 0,
        playoff_franchise1_wins: 0,
        playoff_franchise2_wins: 0,
        franchise1_total_points: 0,
        franchise2_total_points: 0,
        games: [], // Track all game IDs for streak/notable game calculation
        highestScoringGame: null,
        largestMarginGame: null
      });
    }

    const record = h2hMap.get(key);

    // Determine which franchise is franchise1 vs franchise2 in this game
    const isFranchise1Team1 = franchise1 === minFranchise;
    const franchise1Score = isFranchise1Team1 ? game.team1_score : game.team2_score;
    const franchise2Score = isFranchise1Team1 ? game.team2_score : game.team1_score;

    // Update totals
    record.total_matchups++;
    record.franchise1_total_points += franchise1Score || 0;
    record.franchise2_total_points += franchise2Score || 0;

    // Determine winner
    const isPlayoff = game.type === 'playoff' || game.type === 'championship';

    if (game.is_tie) {
      record.ties++;
    } else if (game.winner_team_id) {
      const franchise1Won = isFranchise1Team1
        ? game.winner_team_id === game.team1_id
        : game.winner_team_id === game.team2_id;

      if (franchise1Won) {
        record.franchise1_wins++;
        if (isPlayoff) {
          record.playoff_franchise1_wins++;
        } else {
          record.regular_season_franchise1_wins++;
        }
      } else {
        record.franchise2_wins++;
        if (isPlayoff) {
          record.playoff_franchise2_wins++;
        } else {
          record.regular_season_franchise2_wins++;
        }
      }
    }

    // Track regular vs playoff
    if (isPlayoff) {
      record.playoff_matchups++;
    } else {
      record.regular_season_matchups++;
    }

    // Track game for notable stats
    record.games.push({
      id: game.id,
      franchise1Score,
      franchise2Score,
      totalPoints: franchise1Score + franchise2Score,
      margin: Math.abs(franchise1Score - franchise2Score),
      franchise1Won: !game.is_tie && (isFranchise1Team1 ? game.winner_team_id === game.team1_id : game.winner_team_id === game.team2_id),
      week: game.week
    });

    // Update highest scoring game
    const totalPoints = franchise1Score + franchise2Score;
    if (!record.highestScoringGame || totalPoints > record.highestScoringGame.totalPoints) {
      record.highestScoringGame = {
        game_id: game.id,
        totalPoints,
        isCurrentSeason: game.isCurrentSeason || false
      };
    }

    // Update largest margin game
    const margin = Math.abs(franchise1Score - franchise2Score);
    if (!record.largestMarginGame || margin > record.largestMarginGame.margin) {
      record.largestMarginGame = {
        game_id: game.id,
        margin,
        isCurrentSeason: game.isCurrentSeason || false
      };
    }
  }

  // Calculate averages and streaks
  for (const [key, record] of h2hMap.entries()) {
    record.franchise1_avg_points = record.total_matchups > 0
      ? Math.round((record.franchise1_total_points / record.total_matchups) * 100) / 100
      : 0;

    record.franchise2_avg_points = record.total_matchups > 0
      ? Math.round((record.franchise2_total_points / record.total_matchups) * 100) / 100
      : 0;

    // Calculate current streak
    const sortedGames = record.games.sort((a, b) => a.week - b.week);
    let currentStreak = 0;
    let currentStreakFranchise = null;
    let longestStreak = 0;
    let longestStreakFranchise = null;
    let tempStreak = 0;
    let tempStreakFranchise = null;

    for (const game of sortedGames) {
      if (game.franchise1Won) {
        if (tempStreakFranchise === record.franchise1_id) {
          tempStreak++;
        } else {
          tempStreak = 1;
          tempStreakFranchise = record.franchise1_id;
        }
      } else if (!game.franchise1Won) { // franchise2 won
        if (tempStreakFranchise === record.franchise2_id) {
          tempStreak++;
        } else {
          tempStreak = 1;
          tempStreakFranchise = record.franchise2_id;
        }
      }

      // Update longest streak
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
        longestStreakFranchise = tempStreakFranchise;
      }
    }

    // Current streak is the temp streak at the end
    currentStreak = tempStreak;
    currentStreakFranchise = tempStreakFranchise;

    record.current_streak_franchise_id = currentStreakFranchise;
    record.current_streak_length = currentStreak;
    record.longest_streak_franchise_id = longestStreakFranchise;
    record.longest_streak_length = longestStreak;

    // Clean up temporary data
    delete record.games;
    delete record.highestScoringGame.totalPoints;
    delete record.largestMarginGame.margin;
  }

  console.log(`   ✅ Built ${h2hMap.size} head-to-head records`);
  return h2hMap;
}

/**
 * Save head-to-head records to database
 */
async function saveH2HRecords(h2hMap, supabaseAdmin) {
  console.log('\n💾 Saving head-to-head records to database...');

  if (rebuildAll) {
    console.log('   🔄 Clearing existing records...');
    const { error: deleteError } = await supabaseAdmin
      .from('head_to_head_records')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      throw new Error(`Failed to clear existing records: ${deleteError.message}`);
    }
    console.log('   ✅ Cleared existing records');
  }

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const [key, record] of h2hMap.entries()) {
    const recordData = {
      franchise1_id: record.franchise1_id,
      franchise2_id: record.franchise2_id,
      total_matchups: record.total_matchups,
      franchise1_wins: record.franchise1_wins,
      franchise2_wins: record.franchise2_wins,
      ties: record.ties,
      regular_season_matchups: record.regular_season_matchups,
      regular_season_franchise1_wins: record.regular_season_franchise1_wins,
      regular_season_franchise2_wins: record.regular_season_franchise2_wins,
      playoff_matchups: record.playoff_matchups,
      playoff_franchise1_wins: record.playoff_franchise1_wins,
      playoff_franchise2_wins: record.playoff_franchise2_wins,
      franchise1_total_points: record.franchise1_total_points,
      franchise2_total_points: record.franchise2_total_points,
      franchise1_avg_points: record.franchise1_avg_points,
      franchise2_avg_points: record.franchise2_avg_points,
      // Only set game_id if it's from historical_games (FK constraint)
      highest_scoring_game_id: record.highestScoringGame?.isCurrentSeason ? null : (record.highestScoringGame?.game_id || null),
      largest_margin_game_id: record.largestMarginGame?.isCurrentSeason ? null : (record.largestMarginGame?.game_id || null),
      current_streak_franchise_id: record.current_streak_franchise_id,
      current_streak_length: record.current_streak_length,
      longest_streak_franchise_id: record.longest_streak_franchise_id,
      longest_streak_length: record.longest_streak_length,
      last_calculated: new Date().toISOString()
    };

    // Use upsert to handle both insert and update
    const { error: upsertError } = await supabaseAdmin
      .from('head_to_head_records')
      .upsert(recordData, {
        onConflict: 'franchise1_id,franchise2_id'
      });

    if (upsertError) {
      console.error(`   ❌ Error saving record: ${upsertError.message}`);
      errors++;
      continue;
    }

    if (rebuildAll) {
      created++;
    } else {
      updated++;
    }
  }

  console.log(`   ✅ ${rebuildAll ? 'Created' : 'Updated'} ${rebuildAll ? created : updated} records`);
  if (errors > 0) {
    console.log(`   ⚠️  ${errors} errors`);
  }
}

/**
 * Display summary statistics
 */
async function displaySummary(supabaseAdmin) {
  console.log('\n📊 Head-to-Head Statistics Summary');
  console.log('='.repeat(60));

  // Get total records
  const { data: records, error } = await supabaseAdmin
    .from('head_to_head_records')
    .select(`
      *,
      franchise1:league_franchises!head_to_head_records_franchise1_id_fkey(owner_name),
      franchise2:league_franchises!head_to_head_records_franchise2_id_fkey(owner_name)
    `)
    .order('total_matchups', { ascending: false })
    .limit(10);

  if (error) {
    console.error(`   ❌ Error fetching summary: ${error.message}`);
    return;
  }

  console.log(`\nTop 10 Most Frequent Matchups:`);
  console.log('-'.repeat(60));

  for (const record of records) {
    const name1 = record.franchise1?.owner_name || 'Unknown';
    const name2 = record.franchise2?.owner_name || 'Unknown';
    const wins1 = record.franchise1_wins;
    const wins2 = record.franchise2_wins;
    const total = record.total_matchups;

    console.log(`   ${name1} vs ${name2}`);
    console.log(`      Total: ${total} games | Record: ${wins1}-${wins2}${record.ties > 0 ? `-${record.ties}` : ''}`);
    console.log(`      Avg Points: ${record.franchise1_avg_points} - ${record.franchise2_avg_points}`);
    if (record.playoff_matchups > 0) {
      console.log(`      Playoff: ${record.playoff_franchise1_wins}-${record.playoff_franchise2_wins}`);
    }
    console.log();
  }
}

/**
 * Main function
 */
async function calculateHeadToHeadHistory() {
  console.log('🏈 Calculate Head-to-Head History');
  console.log('='.repeat(60));
  console.log(`   Rebuild all: ${rebuildAll}`);
  console.log('='.repeat(60));

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Please set SUPABASE_SERVICE_ROLE_KEY in your .env.local file');
    process.exit(1);
  }

  try {
    // Step 1: Get all historical games
    const historicalGames = await getAllHistoricalGames(supabaseAdmin);

    // Step 2: Get current season games
    const currentSeasonGames = await getCurrentSeasonGames(supabaseAdmin);

    // Combine all games
    const allGames = [...historicalGames, ...currentSeasonGames];

    if (allGames.length === 0) {
      console.log('\n⚠️  No games found. Import historical seasons or play some games first.');
      process.exit(0);
    }

    console.log(`\n📊 Total games to process: ${allGames.length}`);

    // Step 3: Build H2H records
    const h2hMap = buildH2HRecords(allGames);

    // Step 3: Save to database
    await saveH2HRecords(h2hMap, supabaseAdmin);

    // Step 4: Display summary
    await displaySummary(supabaseAdmin);

    console.log('\n' + '='.repeat(60));
    console.log('✅ HEAD-TO-HEAD CALCULATION COMPLETE');
    console.log('='.repeat(60));
    console.log('\n📝 Next Steps:');
    console.log('   1. Query head_to_head_records table to see all-time matchup history');
    console.log('   2. Use get_h2h_record(franchise_id1, franchise_id2) function for lookups');

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
calculateHeadToHeadHistory()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
