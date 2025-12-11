#!/usr/bin/env node

// Load environment variables for Node.js
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createScheduleFetcher } from '../services/espnScheduleFetcher.js';
import { SupabaseDataManager } from '../services/supabaseDataManager.js';
import { ESPN_CONFIG } from '../config/espn-config.js';

// ====== CONFIGURATION ======
// Set your default season ID here if you want to skip the argument
const DEFAULT_SEASON_ID = '96925672-2fd4-4cf6-a86b-eec9b9303e89'; // currently season 6, 2025 NFL season
// ====== END CONFIGURATION ======

const config = ESPN_CONFIG;

function printUsage() {
  console.log(`
🏈 Playoff Games Sync
=====================

Usage: node scripts/syncPlayoffGames.js <week-number> [season-id]

This script pulls playoff game matchups from ESPN and inserts them into the games table.
Run this at the beginning of each playoff week before the games start.

Arguments:
  week-number    - The playoff week number to sync (e.g., 15, 16, 17)
  season-id      - Your Supabase season ID (optional, uses DEFAULT_SEASON_ID if omitted)

Examples:
  # Sync playoff games for week 15 using default season ID
  node scripts/syncPlayoffGames.js 15

  # Sync playoff games for week 16 with specific season ID
  node scripts/syncPlayoffGames.js 16 abc123-def4-5678-9012-34567890abcd
`);
}

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  return {
    weekNumber: parseInt(args[0]),
    seasonId: args[1] || DEFAULT_SEASON_ID
  };
}

async function syncPlayoffGames(seasonId, weekNumber) {
  console.log(`\n🔄 Syncing playoff games for Week ${weekNumber}...`);

  let dataManager;
  try {
    dataManager = new SupabaseDataManager();
    await dataManager.initialize();
  } catch (error) {
    console.error(`❌ Failed to initialize database: ${error.message}`);
    throw new Error('Database initialization failed');
  }

  // Get admin user ID (required for games table)
  // Admin email is humzak2001@gmail.com per CLAUDE.md
  let adminUserId;

  const { data: adminUsers, error: adminError } = await dataManager.client
    .from('profiles')
    .select('id')
    .eq('email', 'humzak2001@gmail.com')
    .limit(1);

  if (adminError || !adminUsers || adminUsers.length === 0) {
    // Fallback: get the first user from the season's teams
    const { data: firstTeam, error: teamError } = await dataManager.client
      .from('teams')
      .select('user_id')
      .eq('season_id', seasonId)
      .limit(1)
      .single();

    if (teamError || !firstTeam || !firstTeam.user_id) {
      throw new Error('Could not determine admin user_id for creating games');
    }

    adminUserId = firstTeam.user_id;
    console.log(`   Using user_id from team: ${adminUserId}`);
  } else {
    adminUserId = adminUsers[0].id;
    console.log(`   Using admin user_id: ${adminUserId}`);
  }

  if (!adminUserId) {
    throw new Error('Failed to determine admin user_id');
  }

  // Get season and teams
  const season = await dataManager.getSeason(seasonId);
  if (!season) {
    throw new Error(`Season ${seasonId} not found`);
  }

  console.log(`   Season: ${season.name || season.year}`);
  console.log(`   Teams: ${season.teams.length}`);

  // Fetch the week's schedule from ESPN
  const scheduleFetcher = await createScheduleFetcher(
    config.leagueId,
    config.seasonYear,
    config.espnS2,
    config.swid
  );

  const weekData = await scheduleFetcher.getSingleWeek(weekNumber);

  if (!weekData || !weekData.matchups || weekData.matchups.length === 0) {
    throw new Error(`No matchups found for week ${weekNumber}`);
  }

  console.log(`   Found ${weekData.matchups.length} matchups from ESPN`);

  // Use all matchups, not just playoff games
  const matchups = weekData.matchups;

  if (matchups.length === 0) {
    console.warn(`⚠️  No matchups found for week ${weekNumber}`);
    return {
      inserted: [],
      errors: [],
      success: true
    };
  }

  // Count playoff vs regular games
  const playoffCount = matchups.filter(m => m.isPlayoff).length;
  const regularCount = matchups.length - playoffCount;

  if (playoffCount > 0 && regularCount > 0) {
    console.log(`   ${playoffCount} playoff matchups, ${regularCount} regular matchups`);
  } else if (playoffCount > 0) {
    console.log(`   All ${playoffCount} matchups are playoff games`);
  } else {
    console.log(`   All ${regularCount} matchups are regular season games`);
  }

  // Create ESPN team ID to database team mapping
  const espnIdToTeam = {};
  season.teams.forEach(team => {
    if (team.espnTeamId) {
      espnIdToTeam[team.espnTeamId] = team;
    }
  });

  const inserted = [];
  const errors = [];

  for (const espnMatchup of matchups) {
    try {
      // Check if this is a BYE week (missing opponent)
      const hasHomeTeam = espnMatchup.homeTeam && espnMatchup.homeTeam.teamId;
      const hasAwayTeam = espnMatchup.awayTeam && espnMatchup.awayTeam.teamId;

      // Skip if both teams are missing
      if (!hasHomeTeam && !hasAwayTeam) {
        errors.push({
          matchup: 'Unknown vs Unknown',
          error: 'Matchup has no team data from ESPN'
        });
        continue;
      }

      // Match teams by ESPN ID
      let homeTeam = null;
      let awayTeam = null;
      let isBye = false;

      if (hasHomeTeam) {
        homeTeam = espnIdToTeam[espnMatchup.homeTeam.teamId];
      }

      if (hasAwayTeam) {
        awayTeam = espnIdToTeam[espnMatchup.awayTeam.teamId];
      }

      // Handle BYE weeks - when one team exists but has no opponent
      if ((hasHomeTeam && !hasAwayTeam) || (hasAwayTeam && !hasHomeTeam)) {
        isBye = true;
        const teamWithBye = homeTeam || awayTeam;

        if (!teamWithBye) {
          errors.push({
            matchup: `${espnMatchup.homeTeam?.teamName || espnMatchup.awayTeam?.teamName || 'Unknown'} - BYE`,
            error: 'Could not match team to database for BYE week'
          });
          continue;
        }

        // For BYE weeks, we'll set both team1 and team2 to null for the opponent
        // The team on BYE is team1, team2 is null
        homeTeam = teamWithBye;
        awayTeam = null;
      } else if (!homeTeam || !awayTeam) {
        // Both teams should exist in database but don't
        const missingTeams = [];
        if (hasHomeTeam && !homeTeam) missingTeams.push(`${espnMatchup.homeTeam.teamName} (ESPN ID: ${espnMatchup.homeTeam.teamId})`);
        if (hasAwayTeam && !awayTeam) missingTeams.push(`${espnMatchup.awayTeam.teamName} (ESPN ID: ${espnMatchup.awayTeam.teamId})`);

        errors.push({
          matchup: `${espnMatchup.homeTeam?.teamName || '?'} vs ${espnMatchup.awayTeam?.teamName || '?'}`,
          error: `Could not match teams: ${missingTeams.join(', ')}`
        });
        continue;
      }

      // Determine game type based on whether it's a playoff game or BYE
      let gameType = 'regular';
      if (isBye) {
        gameType = 'bye';
      } else if (espnMatchup.isPlayoff && espnMatchup.playoffRound) {
        gameType = `playoff_${espnMatchup.playoffRound.toLowerCase()}`;
      } else if (espnMatchup.isPlayoff) {
        gameType = 'playoff';
      }

      // Validate we have all required data
      if (!adminUserId) {
        throw new Error('adminUserId is undefined');
      }
      if (!homeTeam || !homeTeam.id) {
        throw new Error(`Missing home team ID`);
      }

      // Insert the game directly with admin user_id
      // For BYE weeks, team2_id is null
      const gameData = {
        user_id: adminUserId,
        season_id: seasonId,
        week: weekNumber,
        team1_id: homeTeam.id,
        team2_id: awayTeam ? awayTeam.id : null,
        team1_score: null,
        team2_score: null,
        type: gameType
      };

      // For BYE weeks, we can't use the same upsert conflict resolution
      // since team2_id is null and the unique constraint won't work the same way
      let game;
      let insertError;

      if (isBye) {
        // Check if BYE already exists for this team/week
        const { data: existingBye, error: checkError } = await dataManager.client
          .from('games')
          .select('*')
          .eq('season_id', seasonId)
          .eq('week', weekNumber)
          .eq('team1_id', homeTeam.id)
          .is('team2_id', null)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError;
        }

        if (existingBye) {
          // Update existing BYE
          const { data: updated, error: updateErr } = await dataManager.client
            .from('games')
            .update(gameData)
            .eq('id', existingBye.id)
            .select()
            .single();
          game = updated;
          insertError = updateErr;
        } else {
          // Insert new BYE
          const { data: inserted, error: insertErr } = await dataManager.client
            .from('games')
            .insert(gameData)
            .select()
            .single();
          game = inserted;
          insertError = insertErr;
        }
      } else {
        // Normal game with two teams
        const { data: inserted, error: insertErr } = await dataManager.client
          .from('games')
          .upsert(gameData, {
            onConflict: 'season_id,week,team1_id,team2_id',
            ignoreDuplicates: false
          })
          .select()
          .single();
        game = inserted;
        insertError = insertErr;
      }

      if (insertError) {
        throw new Error(`Insert failed: ${insertError.message} (Data: ${JSON.stringify(gameData)})`);
      }

      inserted.push({
        team1: homeTeam.name || homeTeam.ownerName,
        team2: awayTeam ? (awayTeam.name || awayTeam.ownerName) : 'BYE',
        type: isBye ? 'BYE' : (espnMatchup.isPlayoff ? (espnMatchup.playoffRound || 'PLAYOFF') : 'REGULAR'),
        gameId: game.id
      });

    } catch (error) {
      errors.push({
        matchup: `${espnMatchup.homeTeam.teamName} vs ${espnMatchup.awayTeam.teamName}`,
        error: error.message
      });
    }
  }

  console.log(`\n✅ Inserted ${inserted.length} games`);

  if (inserted.length > 0) {
    inserted.forEach(g => {
      console.log(`   ${g.team1} vs ${g.team2} (${g.type})`);
    });
  }

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} errors:`);
    errors.forEach(err => {
      console.log(`   ${err.matchup}: ${err.error}`);
    });
  }

  return {
    inserted,
    errors,
    success: errors.length === 0
  };
}

async function main() {
  const { seasonId, weekNumber } = parseArgs();

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
    console.log(`🔧 Initializing Playoff Games Sync...`);
    console.log(`   Season ID: ${seasonId}`);
    console.log(`   Week: ${weekNumber}`);
    console.log(`   League ID: ${config.leagueId}`);
    console.log(`   Private League: ${config.espnS2 ? 'Yes' : 'No'}`);

    const result = await syncPlayoffGames(seasonId, weekNumber);

    if (!result.success) {
      console.warn('\n⚠️  Some games failed to sync. Check errors above.');
      process.exit(1);
    }

    console.log('\n✅ Playoff games sync completed successfully!');
    console.log('\n💡 Tip: Now you can run the weekly update script to pull scores:');
    console.log(`   node scripts/weeklyUpdate.js ${weekNumber}`);

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
