/**
 * Import Historical Season Script
 *
 * This script imports historical ESPN fantasy football data into the
 * historical database tables. It fetches data from ESPN API and populates:
 * - historical_seasons
 * - historical_teams (linked to franchises)
 * - historical_games
 * - historical_rosters (draft picks and transactions)
 *
 * Usage:
 *   node scripts/importHistoricalSeason.js <year>
 *   node scripts/importHistoricalSeason.js 2024
 *   node scripts/importHistoricalSeason.js 2024 --force  (overwrite existing)
 *
 * Prerequisites:
 *   - league_history_schema.sql must be run first
 *   - buildFranchiseRegistry.js should be run first to create franchises
 *   - ESPN_S2 and SWID environment variables must be set
 *   - SUPABASE_SERVICE_ROLE_KEY environment variable must be set
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import axios from 'axios';
import { getSupabaseAdmin } from './lib/getSupabaseAdmin.js';

const LEAGUE_ID = 67674700;

// Get ESPN auth from environment or use defaults from fetch_full_history.js
const ESPN_S2 = process.env.ESPN_S2 || 'AEC3%2FPztAlMbmNt8WTKIXFMiByC4lA3noGSUAQRDKEQlcB%2FSBXH3iovX7bEyLV%2FkxXMWiFE7BERZDzZiuSNO9QZBlduSaOZK8ZPxt8egsTAThWBZjCgWZCA02bBwtzrcuKfGdAz3G%2BA1fGEcOivJ1zXoLUKiv0uI%2FR7otMYC4hDMEIG5d8fvBdhg%2BmhLDkkUn%2B5ojL5MpdtqX2FwDheNAC0b5fTH4HcLgYXqFc3OhuNCfRdxf3MCygjFNpDDgUijbYT89vZUBzDh4CQD44Yux80FkA8ADnExCM2izaevNtpK62%2BUN1oxZvtmjHSgR6krK6HwmlQ5XEkzZPYSfr42aATk';
const SWID = process.env.SWID || '{F87751DE-01E7-4DEE-A904-FCD7DDA1948A}';

// Parse command line arguments
const args = process.argv.slice(2);
const year = parseInt(args[0]);
const forceOverwrite = args.includes('--force');

if (!year || isNaN(year) || year < 2020 || year > 2024) {
  console.error('❌ Error: Please provide a valid year (2020-2024)');
  console.error('   Usage: node scripts/importHistoricalSeason.js <year>');
  console.error('   Example: node scripts/importHistoricalSeason.js 2024');
  process.exit(1);
}

// Create authenticated axios instance
const createAuthenticatedRequest = () => {
  return axios.create({
    withCredentials: true,
    headers: {
      'Cookie': `espn_s2=${ESPN_S2}; SWID=${SWID};`
    }
  });
};

/**
 * Fetch season data from ESPN API
 */
async function fetchESPNSeasonData(seasonYear, authenticatedAxios) {
  console.log(`\n📡 Fetching ESPN data for ${seasonYear}...`);

  try {
    const baseUrl = seasonYear >= 2018
      ? `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${seasonYear}/segments/0/leagues/${LEAGUE_ID}`
      : `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${LEAGUE_ID}`;

    const isHistorical = seasonYear < 2018;
    const seasonParam = isHistorical ? `?seasonId=${seasonYear}` : '';
    const connector = isHistorical ? (seasonParam ? '&' : '?') : '?';

    // Fetch settings and teams
    const settingsUrl = `${baseUrl}${seasonParam}${connector}view=mSettings&view=mTeam&view=mMembers`;
    console.log(`   Fetching settings...`);
    const settingsResponse = await authenticatedAxios.get(settingsUrl);

    // Fetch schedule
    const scheduleUrl = `${baseUrl}${seasonParam}${connector}view=mMatchupScore&view=mSchedule`;
    console.log(`   Fetching schedule...`);
    const scheduleResponse = await authenticatedAxios.get(scheduleUrl);

    const data = isHistorical ? settingsResponse.data[0] : settingsResponse.data;
    const schedule = isHistorical ? data.schedule : scheduleResponse.data.schedule;

    console.log(`   ✅ Fetched ${data.teams?.length || 0} teams, ${schedule?.length || 0} matchups`);

    return {
      settings: data.settings,
      teams: data.teams || [],
      schedule: schedule || [],
      members: data.members || [],
      status: data.status
    };

  } catch (error) {
    console.error(`   ❌ Error fetching ESPN data: ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.statusText}`);
    }
    throw error;
  }
}

/**
 * Create or update historical_seasons record
 */
async function createHistoricalSeason(year, espnData, supabaseAdmin) {
  console.log(`\n📊 Creating historical season record for ${year}...`);

  const settings = espnData.settings;
  const seasonData = {
    year: year,
    name: `${year} Season`,
    league_size: settings?.size || 14,
    regular_season_weeks: settings?.scheduleSettings?.matchupPeriodCount || 14,
    playoff_weeks: settings?.scheduleSettings?.playoffMatchupPeriodCount || 3,
    espn_league_id: LEAGUE_ID.toString(),
    scoring_type: settings?.scoringSettings?.scoringType === 0 ? 'standard' : 'ppr',
    stats: {}, // Will be calculated later
    playoff_bracket: null, // Will be populated from schedule data
    imported_from_espn: true,
    espn_import_date: new Date().toISOString()
  };

  // Check if season already exists
  const { data: existing, error: checkError } = await supabaseAdmin
    .from('historical_seasons')
    .select('id')
    .eq('year', year)
    .single();

  if (checkError && checkError.code !== 'PGRST116') {
    throw new Error(`Error checking for existing season: ${checkError.message}`);
  }

  if (existing && !forceOverwrite) {
    console.log(`   ⚠️  Season ${year} already exists (ID: ${existing.id})`);
    console.log(`   Use --force to overwrite`);
    return existing.id;
  }

  if (existing && forceOverwrite) {
    console.log(`   🔄 Overwriting existing season ${year}...`);
    const { error: deleteError } = await supabaseAdmin
      .from('historical_seasons')
      .delete()
      .eq('id', existing.id);

    if (deleteError) {
      throw new Error(`Error deleting existing season: ${deleteError.message}`);
    }
  }

  const { data: newSeason, error: insertError } = await supabaseAdmin
    .from('historical_seasons')
    .insert(seasonData)
    .select()
    .single();

  if (insertError) {
    throw new Error(`Error creating season: ${insertError.message}`);
  }

  console.log(`   ✅ Created season record (ID: ${newSeason.id})`);
  return newSeason.id;
}

/**
 * Map ESPN owner info to franchise
 */
async function getFranchiseByOwnerName(ownerName, franchiseCache, supabaseAdmin) {
  if (franchiseCache.has(ownerName)) {
    return franchiseCache.get(ownerName);
  }

  const { data, error } = await supabaseAdmin
    .from('league_franchises')
    .select('id, owner_name')
    .eq('owner_name', ownerName)
    .single();

  if (error || !data) {
    console.warn(`   ⚠️  No franchise found for owner "${ownerName}"`);
    return null;
  }

  franchiseCache.set(ownerName, data.id);
  return data.id;
}

/**
 * Extract owner name from ESPN team/member data
 */
function getOwnerName(team, members) {
  // Try to find owner in members data
  const primaryOwner = team.primaryOwner || team.owners?.[0];
  if (primaryOwner && members.length > 0) {
    const member = members.find(m => m.id === primaryOwner);
    if (member) {
      return `${member.firstName} ${member.lastName}`;
    }
  }

  // Fallback to location + nickname if available
  if (team.location && team.nickname) {
    console.warn(`   ⚠️  Could not find member data for team, using team name: ${team.location} ${team.nickname}`);
  }

  return null;
}

/**
 * Create historical_teams records
 */
async function createHistoricalTeams(seasonId, espnData, year, supabaseAdmin) {
  console.log(`\n👥 Creating historical team records...`);

  const franchiseCache = new Map();
  const teamIdMap = new Map(); // Maps ESPN team ID to our historical_teams ID

  // Build division ID to name mapping
  const divisionMap = new Map();
  if (espnData.settings?.scheduleSettings?.divisions) {
    espnData.settings.scheduleSettings.divisions.forEach(div => {
      divisionMap.set(div.id, div.name);
    });
    console.log(`   Found ${divisionMap.size} divisions: ${Array.from(divisionMap.values()).join(', ')}`);
  }

  let created = 0;
  let skipped = 0;

  for (const espnTeam of espnData.teams) {
    const ownerName = getOwnerName(espnTeam, espnData.members);

    if (!ownerName) {
      console.warn(`   ⚠️  Skipping team ${espnTeam.id} - no owner name found`);
      skipped++;
      continue;
    }

    const franchiseId = await getFranchiseByOwnerName(ownerName, franchiseCache, supabaseAdmin);

    if (!franchiseId) {
      console.warn(`   ⚠️  Skipping team for "${ownerName}" - no franchise found`);
      console.warn(`      Run buildFranchiseRegistry.js first or create franchise manually`);
      skipped++;
      continue;
    }

    // Calculate team stats
    const record = espnTeam.record?.overall || {};
    const playoffSeed = espnTeam.playoffSeed;
    const finalStandingsPosition = espnTeam.rankCalculatedFinal || espnTeam.rankFinal;

    // Determine playoff finish based on final rank
    // Top 6 seeds make real playoffs, 7-14 are consolation bracket
    let playoffFinish = 'none';
    let madePlayoffs = false;

    if (playoffSeed && playoffSeed > 0 && playoffSeed <= 6) {
      madePlayoffs = true;

      // Set playoff finish based on final standing
      if (finalStandingsPosition === 1) {
        playoffFinish = 'champion';
      } else if (finalStandingsPosition === 2) {
        playoffFinish = '2nd';
      } else if (finalStandingsPosition === 3) {
        playoffFinish = '3rd';
      } else if (finalStandingsPosition === 4) {
        playoffFinish = '4th';
      } else if (finalStandingsPosition === 5) {
        playoffFinish = '5th';
      } else if (finalStandingsPosition === 6) {
        playoffFinish = '6th';
      } else {
        // Fallback if final position not available
        playoffFinish = 'playoffs';
      }
    }

    // Construct team name from available ESPN fields
    const teamName = espnTeam.name ||
                     espnTeam.abbrev ||
                     (espnTeam.location && espnTeam.nickname ? `${espnTeam.location} ${espnTeam.nickname}` : null) ||
                     espnTeam.location ||
                     `Team ${espnTeam.id}`;

    // Get actual division name from division map
    const divisionName = espnTeam.divisionId !== undefined && espnTeam.divisionId !== null
      ? (divisionMap.get(espnTeam.divisionId) || `Division ${espnTeam.divisionId}`)
      : null;

    const teamData = {
      franchise_id: franchiseId,
      season_id: seasonId,
      team_name: teamName,
      espn_team_id: espnTeam.id,
      division_name: divisionName,

      regular_season_wins: record.wins || 0,
      regular_season_losses: record.losses || 0,
      regular_season_ties: record.ties || 0,
      regular_season_win_percentage: record.percentage || 0,

      made_playoffs: madePlayoffs,
      playoff_seed: playoffSeed || null,
      playoff_wins: 0, // Will calculate from schedule
      playoff_losses: 0,
      playoff_finish: playoffFinish,

      points_for: record.pointsFor || 0,
      points_against: record.pointsAgainst || 0,
      point_differential: (record.pointsFor || 0) - (record.pointsAgainst || 0),
      average_points_per_game: record.pointsFor && record.gamesPlayed
        ? (record.pointsFor / record.gamesPlayed)
        : 0,

      strength_of_schedule: null, // Calculate later if needed
      power_rating: null,
      final_rank: finalStandingsPosition || null,

      season_stats: {
        streak_length: record.streakLength || 0,
        streak_type: record.streakType || null,
        division_wins: record.division?.wins || 0,
        division_losses: record.division?.losses || 0
      },
      draft_picks: null // Could populate from ESPN draft data if available
    };

    const { data: newTeam, error: insertError } = await supabaseAdmin
      .from('historical_teams')
      .insert(teamData)
      .select()
      .single();

    if (insertError) {
      console.error(`   ❌ Error creating team for "${ownerName}": ${insertError.message}`);
      skipped++;
      continue;
    }

    teamIdMap.set(espnTeam.id, newTeam.id);
    console.log(`   ✅ Created team for ${ownerName}: ${teamName} (${teamData.regular_season_wins}-${teamData.regular_season_losses})`);
    created++;
  }

  console.log(`\n   Summary: ${created} teams created, ${skipped} skipped`);
  return teamIdMap;
}

/**
 * Create historical_games records
 */
async function createHistoricalGames(seasonId, espnData, teamIdMap, supabaseAdmin) {
  console.log(`\n🏈 Creating historical game records...`);

  let created = 0;
  let skipped = 0;

  for (const matchup of espnData.schedule) {
    const week = matchup.matchupPeriodId;

    // Get teams
    const homeTeam = matchup.home;
    const awayTeam = matchup.away;

    if (!homeTeam || !awayTeam) {
      skipped++;
      continue;
    }

    const team1Id = teamIdMap.get(homeTeam.teamId);
    const team2Id = teamIdMap.get(awayTeam.teamId);

    if (!team1Id || !team2Id) {
      console.warn(`   ⚠️  Week ${week}: Could not map teams (ESPN IDs: ${homeTeam.teamId} vs ${awayTeam.teamId})`);
      skipped++;
      continue;
    }

    const team1Score = homeTeam.totalPoints || 0;
    const team2Score = awayTeam.totalPoints || 0;

    const isCompleted = team1Score > 0 || team2Score > 0;
    const isPlayoff = matchup.playoffTierType && matchup.playoffTierType !== 'NONE';
    const isChampionship = matchup.playoffTierType === 'WINNERS_BRACKET' && week === (espnData.settings?.scheduleSettings?.matchupPeriodCount || 17);

    let gameType = 'regular';
    if (isChampionship) {
      gameType = 'championship';
    } else if (isPlayoff) {
      gameType = 'playoff';
    }

    // Determine winner
    let winnerId = null;
    let loserId = null;
    let isTie = false;

    if (isCompleted) {
      if (team1Score > team2Score) {
        winnerId = team1Id;
        loserId = team2Id;
      } else if (team2Score > team1Score) {
        winnerId = team2Id;
        loserId = team1Id;
      } else {
        isTie = true;
      }
    }

    const pointDiff = Math.abs(team1Score - team2Score);
    const isBlowout = pointDiff >= 25;
    const isClose = pointDiff <= 7 && pointDiff > 0;

    const gameData = {
      season_id: seasonId,
      week: week,
      team1_id: team1Id,
      team2_id: team2Id,
      team1_score: team1Score,
      team2_score: team2Score,
      type: gameType,
      is_completed: isCompleted,
      winner_team_id: winnerId,
      loser_team_id: loserId,
      is_tie: isTie,
      point_differential: pointDiff,
      is_blowout: isBlowout,
      is_close: isClose,
      is_upset: false, // Would need seed data to determine
      espn_matchup_id: matchup.id,
      espn_scoring_period_id: matchup.matchupPeriodId,
      completed_at: isCompleted ? new Date().toISOString() : null
    };

    const { error: insertError } = await supabaseAdmin
      .from('historical_games')
      .insert(gameData);

    if (insertError) {
      console.error(`   ❌ Error creating game (Week ${week}): ${insertError.message}`);
      skipped++;
      continue;
    }

    created++;
  }

  console.log(`   ✅ Created ${created} games, ${skipped} skipped`);
}

/**
 * Update playoff wins/losses based on games
 */
async function updatePlayoffResults(seasonId, teamIdMap, supabaseAdmin) {
  console.log(`\n🏆 Calculating playoff wins/losses...`);

  // Get all playoff games (including championship)
  const { data: playoffGames, error } = await supabaseAdmin
    .from('historical_games')
    .select('*')
    .eq('season_id', seasonId)
    .in('type', ['playoff', 'championship'])
    .eq('is_completed', true);

  if (error) {
    console.error(`   ❌ Error fetching playoff games: ${error.message}`);
    return;
  }

  if (!playoffGames || playoffGames.length === 0) {
    console.log(`   ℹ️  No playoff games found`);
    return;
  }

  // Count playoff wins/losses for each team
  const playoffStats = new Map();

  for (const game of playoffGames) {
    if (game.winner_team_id) {
      const stats = playoffStats.get(game.winner_team_id) || { wins: 0, losses: 0 };
      stats.wins++;
      playoffStats.set(game.winner_team_id, stats);
    }

    if (game.loser_team_id) {
      const stats = playoffStats.get(game.loser_team_id) || { wins: 0, losses: 0 };
      stats.losses++;
      playoffStats.set(game.loser_team_id, stats);
    }
  }

  // Update playoff wins/losses
  for (const [teamId, stats] of playoffStats) {
    await supabaseAdmin
      .from('historical_teams')
      .update({
        playoff_wins: stats.wins,
        playoff_losses: stats.losses
      })
      .eq('id', teamId);
  }

  console.log(`   ✅ Updated playoff stats for ${playoffStats.size} teams`);
}

/**
 * Main import function
 */
async function importHistoricalSeason() {
  console.log('🏈 Import Historical Season');
  console.log('='.repeat(60));
  console.log(`   Year: ${year}`);
  console.log(`   League ID: ${LEAGUE_ID}`);
  console.log(`   Force overwrite: ${forceOverwrite}`);
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
    // Step 1: Fetch ESPN data
    const authenticatedAxios = createAuthenticatedRequest();
    const espnData = await fetchESPNSeasonData(year, authenticatedAxios);

    // Step 2: Create season record
    const seasonId = await createHistoricalSeason(year, espnData, supabaseAdmin);

    // Step 3: Create team records
    const teamIdMap = await createHistoricalTeams(seasonId, espnData, year, supabaseAdmin);

    // Step 4: Create game records
    await createHistoricalGames(seasonId, espnData, teamIdMap, supabaseAdmin);

    // Step 5: Update playoff results
    await updatePlayoffResults(seasonId, teamIdMap, supabaseAdmin);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ IMPORT COMPLETE');
    console.log('='.repeat(60));
    console.log(`   Season ${year} has been imported successfully!`);
    console.log('\n📝 Next Steps:');
    console.log('   1. Run calculateSeasonAwards.js to assign awards for this season');
    console.log('   2. Run calculateHeadToHeadHistory.js to update H2H records');
    console.log('   3. Run refresh_league_history_views() in SQL to update materialized views');

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
importHistoricalSeason()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
