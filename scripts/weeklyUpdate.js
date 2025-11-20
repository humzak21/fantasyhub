#!/usr/bin/env node

// Load environment variables for Node.js
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createRosterUpdateScript } from '../services/espnRosterUpdater.js';
import { createScheduleFetcher } from '../services/espnScheduleFetcher.js';
import { SupabaseDataManager } from '../services/supabaseDataManager.js';
import { ESPNTransactionFetcher } from '../services/espnTransactionFetcher.js';
import { ESPN_CONFIG } from '../config/espn-config.js';

// ====== CONFIGURATION ======
// Set your default season ID here if you want to skip the argument
const DEFAULT_SEASON_ID = '96925672-2fd4-4cf6-a86b-eec9b9303e89'; // currently season 6, 2025 NFL season
// ====== END CONFIGURATION ======

const config = ESPN_CONFIG;

function printUsage() {
  console.log(`
🏈 Weekly Fantasy Football Update
==================================

Usage: node scripts/weeklyUpdate.js <week-number> [season-id] [options]

This script combines roster updates and score updates in one process.

Arguments:
  week-number    - The week number to update scores for (1-17)
  season-id      - Your Supabase season ID (optional, uses DEFAULT_SEASON_ID if omitted)

Options:
  --skip-rosters      - Skip the ESPN roster update
  --skip-scores       - Skip the score update
  --skip-transactions - Skip the transaction count update

Examples:
  # Full weekly update using default season ID
  node scripts/weeklyUpdate.js 5

  # Full weekly update with specific season ID
  node scripts/weeklyUpdate.js 5 abc123-def4-5678-9012-34567890abcd

  # Skip roster updates, only update scores
  node scripts/weeklyUpdate.js 5 abc123-def4-5678-9012-34567890abcd --skip-rosters

  # Skip score updates, only update rosters
  node scripts/weeklyUpdate.js 5 abc123-def4-5678-9012-34567890abcd --skip-scores
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    weekNumber: parseInt(args[0]),
    seasonId: args[1] || DEFAULT_SEASON_ID,
    options: {}
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      parsed.options[arg.substring(2)] = true;
    }
  }

  return parsed;
}

async function updateWeeklyScores(seasonId, weekNumber, espnMatchups) {
  console.log(`\n🔄 Updating scores for Week ${weekNumber}...`);

  let dataManager;
  try {
    dataManager = new SupabaseDataManager();
    await dataManager.initialize();
  } catch (error) {
    console.error(`❌ Failed to initialize database: ${error.message}`);
    throw new Error('Database initialization failed');
  }

  // Get season and teams
  const season = await dataManager.getSeason(seasonId);
  if (!season) {
    throw new Error(`Season ${seasonId} not found`);
  }

  // Get games for this week
  const games = await dataManager.getGamesForWeek(seasonId, weekNumber);
  if (!games || games.length === 0) {
    throw new Error(`No games found for week ${weekNumber}`);
  }

  console.log(`   Found ${games.length} games and ${espnMatchups.length} ESPN matchups`);

  // Create ESPN team ID to database team mapping
  const espnIdToTeam = {};
  season.teams.forEach(team => {
    if (team.espnTeamId) {
      espnIdToTeam[team.espnTeamId] = team;
    }
  });

  const updated = [];
  const errors = [];

  for (const espnMatchup of espnMatchups) {
    try {
      // Skip if not this week
      if (espnMatchup.week !== weekNumber && espnMatchup.scoringPeriodId !== weekNumber) {
        continue;
      }

      // Match teams by ESPN ID
      const homeTeam = espnIdToTeam[espnMatchup.homeTeam.teamId];
      const awayTeam = espnIdToTeam[espnMatchup.awayTeam.teamId];

      if (!homeTeam || !awayTeam) {
        continue; // Skip if can't match teams
      }

      // Find the game
      const game = games.find(g =>
        (g.team1Id === homeTeam.id && g.team2Id === awayTeam.id) ||
        (g.team1Id === awayTeam.id && g.team2Id === homeTeam.id)
      );

      if (!game) {
        continue; // Skip if no matching game found
      }

      // Assign scores based on which team is team1 vs team2 in the database
      let team1Score, team2Score;
      if (game.team1Id === homeTeam.id) {
        team1Score = espnMatchup.homeTeam.score;
        team2Score = espnMatchup.awayTeam.score;
      } else {
        team1Score = espnMatchup.awayTeam.score;
        team2Score = espnMatchup.homeTeam.score;
      }

      // Update the game
      const { error: updateError } = await dataManager.client
        .from('games')
        .update({
          team1_score: team1Score,
          team2_score: team2Score
        })
        .eq('id', game.id);

      if (updateError) throw updateError;

      updated.push({
        team1: season.teams.find(t => t.id === game.team1Id)?.name,
        team2: season.teams.find(t => t.id === game.team2Id)?.name,
        team1Score,
        team2Score
      });

    } catch (error) {
      errors.push({
        matchup: `${espnMatchup.homeTeam.teamName} vs ${espnMatchup.awayTeam.teamName}`,
        error: error.message
      });
    }
  }

  console.log(`\n✅ Updated ${updated.length} games`);

  if (updated.length > 0) {
    updated.forEach(u => {
      console.log(`   ${u.team1} ${u.team1Score} - ${u.team2Score} ${u.team2}`);
    });
  }

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} errors:`);
    errors.forEach(err => {
      console.log(`   ${err.matchup}: ${err.error}`);
    });
  }

  return {
    updated,
    errors,
    success: errors.length === 0
  };
}

async function updateTransactionCounts(seasonId) {
  console.log(`\n🔄 Updating transaction counts...`);

  let dataManager;
  try {
    dataManager = new SupabaseDataManager();
    await dataManager.initialize();
  } catch (error) {
    console.error(`❌ Failed to initialize database: ${error.message}`);
    throw new Error('Database initialization failed');
  }

  // Get season and teams
  const season = await dataManager.getSeason(seasonId);
  if (!season) {
    throw new Error(`Season ${seasonId} not found`);
  }

  // Create transaction fetcher
  const fetcher = new ESPNTransactionFetcher(
    config.leagueId,
    config.seasonYear,
    config.espnS2,
    config.swid
  );

  // Fetch transaction summary for current season
  const transactionSummary = await fetcher.getSeasonTransactionSummary(config.seasonYear);

  if (!transactionSummary || transactionSummary.length === 0) {
    console.warn('⚠️ No transaction data found');
    return { updated: 0, errors: [] };
  }

  console.log(`   Found transactions for ${transactionSummary.length} teams`);

  // Create ESPN team ID to database team mapping
  const espnIdToTeam = {};
  season.teams.forEach(team => {
    if (team.espnTeamId) {
      espnIdToTeam[team.espnTeamId] = team;
    }
  });

  const updated = [];
  const errors = [];

  for (const teamData of transactionSummary) {
    try {
      // Match team by ESPN ID
      const team = espnIdToTeam[teamData.espnTeamId];

      if (!team) {
        // Try matching by owner name
        const teamByOwner = season.teams.find(t =>
          t.ownerName === teamData.ownerName ||
          t.name === teamData.teamName
        );
        if (!teamByOwner) {
          errors.push({
            team: teamData.ownerName,
            error: 'Could not match team to database'
          });
          continue;
        }
      }

      const teamId = team ? team.id : null;
      if (!teamId) continue;

      // Upsert transaction data
      const { error: upsertError } = await dataManager.client
        .from('transactions_2025')
        .upsert({
          team_id: teamId,
          owner_name: teamData.ownerName,
          espn_team_id: teamData.espnTeamId,
          free_agent_adds: teamData.free_agent_adds,
          waiver_claims: teamData.waiver_claims,
          trades: teamData.trades,
          drops: teamData.drops,
          faab_spent: teamData.faab_spent,
          last_synced_at: new Date().toISOString()
        }, {
          onConflict: 'team_id',
          ignoreDuplicates: false
        });

      if (upsertError) {
        throw upsertError;
      }

      updated.push({
        owner: teamData.ownerName,
        total: teamData.free_agent_adds + teamData.waiver_claims + teamData.trades + teamData.drops
      });

    } catch (error) {
      errors.push({
        team: teamData.ownerName,
        error: error.message
      });
    }
  }

  console.log(`\n✅ Updated transactions for ${updated.length} teams`);

  if (updated.length > 0) {
    updated.forEach(u => {
      console.log(`   ${u.owner}: ${u.total} total transactions`);
    });
  }

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} errors:`);
    errors.forEach(err => {
      console.log(`   ${err.team}: ${err.error}`);
    });
  }

  return {
    updated: updated.length,
    errors,
    success: errors.length === 0
  };
}

async function main() {
  const { seasonId, weekNumber, options } = parseArgs();

  if (!weekNumber) {
    console.error('❌ Error: Week number is required');
    console.error('');
    printUsage();
    process.exit(1);
  }

  if (isNaN(weekNumber) || weekNumber < 1 || weekNumber > 17) {
    console.error('❌ Error: Week number must be between 1 and 17');
    process.exit(1);
  }

  if (!seasonId) {
    console.error('❌ Error: Season ID is required (either pass as argument or set DEFAULT_SEASON_ID)');
    console.error('');
    printUsage();
    process.exit(1);
  }

  if (!config.leagueId) {
    console.error('❌ Error: League ID not configured');
    console.error('Run: node scripts/setupESPN.js');
    console.error('Then edit config/espn-config.js with your league details');
    process.exit(1);
  }

  try {
    console.log(`🔧 Initializing Weekly Update...`);
    console.log(`   Season ID: ${seasonId}`);
    console.log(`   Week: ${weekNumber}`);
    console.log(`   League ID: ${config.leagueId}`);
    console.log(`   Private League: ${config.espnS2 ? 'Yes' : 'No'}`);
    console.log('');

    // ===== UPDATE ROSTERS =====
    if (!options['skip-rosters']) {
      console.log('📋 Step 1: Updating ESPN rosters...');
      try {
        const rosterScript = await createRosterUpdateScript(
          config.leagueId,
          config.seasonYear,
          config.espnS2,
          config.swid
        );

        await rosterScript.runWeeklyUpdate();
        console.log('✅ Roster update completed!');
      } catch (error) {
        console.error('❌ Roster update failed:', error.message);
        throw error;
      }
    }

    // ===== UPDATE SCORES =====
    if (!options['skip-scores']) {
      console.log('\n📊 Step 2: Updating scores from ESPN...');
      try {
        const scheduleFetcher = await createScheduleFetcher(
          config.leagueId,
          config.seasonYear,
          config.espnS2,
          config.swid
        );

        // Fetch the week's schedule from ESPN
        const weekData = await scheduleFetcher.getSingleWeek(weekNumber);

        if (!weekData || !weekData.matchups || weekData.matchups.length === 0) {
          console.error(`❌ No matchups found for week ${weekNumber}`);
          process.exit(1);
        }

        console.log(`   Found ${weekData.matchups.length} matchups from ESPN`);

        // Update the scores in the database
        const updateResult = await updateWeeklyScores(seasonId, weekNumber, weekData.matchups);

        if (!updateResult.success) {
          console.warn('⚠️ Some score updates failed. Check errors above.');
        }
      } catch (error) {
        console.error('❌ Score update failed:', error.message);
        throw error;
      }
    }

    // ===== UPDATE TRANSACTIONS =====
    if (!options['skip-transactions']) {
      console.log('\n📊 Step 3: Updating transaction counts from ESPN...');
      try {
        const transactionResult = await updateTransactionCounts(seasonId);

        if (!transactionResult.success) {
          console.warn('⚠️ Some transaction updates failed. Check errors above.');
        }
      } catch (error) {
        console.error('❌ Transaction update failed:', error.message);
        // Don't throw - transactions are non-critical
        console.warn('⚠️ Continuing despite transaction update failure');
      }
    }

    console.log('\n✅ Weekly update completed successfully!');

  } catch (error) {
    console.error('❌ Script failed:', error.message);

    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('\n💡 This might be a private league. You need to set espnS2 and swid cookies.');
      console.error('   Check the help text above for instructions on finding these cookies.');
    }

    if (error.message.includes('404')) {
      console.error('\n💡 Season or league not found. Check your season ID and league configuration.');
    }

    process.exit(1);
  }
}

main().catch(console.error);
