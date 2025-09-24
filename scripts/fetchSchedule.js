#!/usr/bin/env node

// Load environment variables for Node.js
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createScheduleFetcher } from '../services/espnScheduleFetcher.js';
import { ESPN_CONFIG } from '../config/espn-config.js';
import { SupabaseDataManager } from '../services/supabaseDataManager.js';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const config = ESPN_CONFIG;

function printUsage() {
  console.log(`
🏈 ESPN Fantasy Football Schedule Fetcher
========================================

Usage: node scripts/fetchSchedule.js [command] [options]

WORKFLOWS:
1. Admin Import Flow (Recommended):
   - Use 'full' command to import schedule + teams for admin approval
   - Admin uses ScheduleImportManager to assign to season

2. Direct Import Flow:
   - Use 'teams' or --import-teams to import directly to existing season

Required Configuration:
You need to set up your ESPN league details in one of these ways:

1. Edit config/espn-config.js and set:
   leagueId: Your ESPN league ID (found in ESPN URL)
   seasonYear: Season year to fetch (e.g., 2024, 2023, 2022)

2. For private leagues, also set:
   espnS2: ESPN S2 cookie value
   swid: ESPN SWID cookie value

To find your cookies (for private leagues):
1. Go to your ESPN fantasy league in browser
2. Open Developer Tools (F12)
3. Go to Application/Storage > Cookies > espn.com
4. Find 'espn_s2' and 'SWID' values

Commands:
  test                    - Test connection to ESPN league
  full                    - Fetch complete season schedule and teams (for admin import)
  week <number>           - Fetch single week schedule
  range <start> <end>     - Fetch schedule for week range
  export                  - Fetch and export to JSON file
  teams <season-id>       - Import teams directly to existing season
  teams-only <season-id>  - Fetch and import only teams (no schedule)

Options:
  --season <year>         - Override season year from config
  --output <filename>     - Specify output filename (for export)
  --pretty                - Pretty print JSON output
  --import-teams <season-id> - Import teams directly to existing season (for full/export)

Examples:
  # Admin Import Flow (Recommended)
  node scripts/fetchSchedule.js full

  # Direct Import Flow
  node scripts/fetchSchedule.js teams abc123-def4-5678-9012-34567890abcd
  node scripts/fetchSchedule.js full --import-teams abc123-def4-5678-9012-34567890abcd

  # Other Commands
  node scripts/fetchSchedule.js test
  node scripts/fetchSchedule.js week 5
  node scripts/fetchSchedule.js range 1 14
  node scripts/fetchSchedule.js export --output schedule-2024.json
  node scripts/fetchSchedule.js teams-only abc123-def4-5678-9012-34567890abcd
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    command: args[0],
    params: [],
    options: {}
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const option = arg.substring(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        parsed.options[option] = args[i + 1];
        i++; // Skip the next arg since it's the value
      } else {
        parsed.options[option] = true;
      }
    } else {
      parsed.params.push(arg);
    }
  }

  return parsed;
}

function formatScheduleOutput(data, pretty = false) {
  if (pretty) {
    return JSON.stringify(data, null, 2);
  }
  return JSON.stringify(data);
}

async function importTeamsToSeason(seasonId, teamsData) {
  console.log(`\n🏈 Importing ${teamsData.length} teams to season ${seasonId}...`);

  let dataManager;
  try {
    dataManager = new SupabaseDataManager();
    await dataManager.initialize();
  } catch (error) {
    console.error(`❌ Failed to initialize database connection: ${error.message}`);
    console.error(`\n💡 Make sure your .env.local file contains the required Supabase configuration:`);
    console.error(`   VITE_SUPABASE_URL=your-supabase-url`);
    console.error(`   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key`);
    console.error(`   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (for Node.js scripts)`);
    throw new Error('Database initialization failed');
  }

  const importedTeams = [];
  const errors = [];

  for (const team of teamsData) {
    try {
      console.log(`   Adding: ${team.teamName} (Owner: ${team.ownerName || 'Unknown'})`);

      const addedTeam = await dataManager.addTeamToSeason(
        seasonId,
        team.teamName,
        team.ownerName || team.abbreviation || ''
      );

      // Update the team with ESPN team ID for future reference
      if (addedTeam && team.teamId) {
        await dataManager.updateTeam(seasonId, addedTeam.id, {
          espnTeamId: team.teamId
        });
      }

      importedTeams.push({
        ...addedTeam,
        espnTeamId: team.teamId,
        originalData: team
      });

    } catch (error) {
      console.error(`   ❌ Failed to add ${team.teamName}: ${error.message}`);
      errors.push({ team: team.teamName, error: error.message });
    }
  }

  console.log(`\n✅ Teams import completed!`);
  console.log(`   Successfully imported: ${importedTeams.length}`);
  console.log(`   Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log(`\n❌ Import Errors:`);
    errors.forEach(err => {
      console.log(`   - ${err.team}: ${err.error}`);
    });
  }

  return {
    imported: importedTeams,
    errors,
    success: errors.length === 0
  };
}

async function main() {
  const { command, params, options } = parseArgs();

  if (!command || command === 'help' || command === '--help') {
    printUsage();
    return;
  }


  // Allow season override from command line
  const seasonYear = options.season ? parseInt(options.season) : config.seasonYear;
  
  if (!config.leagueId) {
    console.error('❌ Error: League ID not configured');
    console.error('Run: node scripts/setupESPN.js');
    console.error('Then edit config/espn-config.js with your league details');
    process.exit(1);
  }

  if (!seasonYear) {
    console.error('❌ Error: Season year not specified');
    console.error('Set seasonYear in config/espn-config.js or use --season option');
    process.exit(1);
  }

  try {
    console.log(`🔧 Initializing ESPN schedule fetcher...`);
    console.log(`   League ID: ${config.leagueId}`);
    console.log(`   Season: ${seasonYear}`);
    console.log(`   Private League: ${config.espnS2 ? 'Yes' : 'No'}`);
    console.log('');

    const scheduleFetcher = await createScheduleFetcher(
      config.leagueId,
      seasonYear,
      config.espnS2,
      config.swid
    );

    switch (command) {
      case 'test':
        console.log('🧪 Testing ESPN league connection...');
        const testResult = await scheduleFetcher.testConnection();
        if (testResult.success) {
          console.log('✅ Connection successful!');
          console.log(`   League: ${testResult.leagueName}`);
          console.log(`   Teams: ${testResult.teamCount}`);
          console.log(`   Total Matchups: ${testResult.matchupCount}`);
        } else {
          console.log('❌ Connection failed!');
          console.error(testResult.error);
          process.exit(1);
        }
        break;

      case 'full':
        console.log('📅 Fetching full season schedule...');
        const fullSchedule = await scheduleFetcher.getFullSeason(true); // Save to DB by default

        // Import teams if season ID provided
        let teamsImportResult = null;
        if (options['import-teams']) {
          console.log('\n🏈 Importing teams to existing season...');
          teamsImportResult = await importTeamsToSeason(options['import-teams'], fullSchedule.teams);
        }

        console.log('✅ Schedule fetched and saved to database!');
        console.log(`   League: ${fullSchedule.leagueInfo.leagueName}`);
        console.log(`   Teams: ${fullSchedule.leagueInfo.teamCount}`);
        console.log(`   Total Matchups: ${fullSchedule.totalMatchups}`);
        console.log(`   Regular Season: ${fullSchedule.regularSeasonMatchups}`);
        console.log(`   Playoff Matchups: ${fullSchedule.playoffMatchups}`);
        console.log(`   Weeks: ${fullSchedule.weekNumbers.join(', ')}`);
        
        if (fullSchedule.dbImport) {
          console.log(`   Database Import ID: ${fullSchedule.dbImport.importId}`);
          console.log(`   Status: PENDING (awaiting season assignment)`);
        }

        if (teamsImportResult) {
          console.log(`\n🏈 Teams Import Results:`);
          console.log(`   Successfully Imported: ${teamsImportResult.imported.length}`);
          console.log(`   Import Errors: ${teamsImportResult.errors.length}`);
        }

        if (options.pretty || options.output) {
          console.log('\n' + formatScheduleOutput(fullSchedule, options.pretty));
        }
        break;

      case 'week': {
        if (!params[0]) {
          console.error('❌ Error: Week number required');
          console.error('Usage: node scripts/fetchSchedule.js week <number>');
          process.exit(1);
        }

        const weekNumber = parseInt(params[0]);
        console.log(`📅 Fetching schedule for week ${weekNumber}...`);

        const weekSchedule = await scheduleFetcher.getSingleWeek(weekNumber);
        if (weekSchedule) {
          console.log('✅ Week schedule fetched successfully!');
          console.log(`   Week: ${weekSchedule.week}`);
          console.log(`   Matchups: ${weekSchedule.matchups.length}`);
          
          if (options.pretty || options.output) {
            console.log('\n' + formatScheduleOutput(weekSchedule, options.pretty));
          }
        } else {
          console.log(`❌ No schedule found for week ${weekNumber}`);
        }
        break;
      }

      case 'range': {
        if (!params[0] || !params[1]) {
          console.error('❌ Error: Start and end week numbers required');
          console.error('Usage: node scripts/fetchSchedule.js range <start> <end>');
          process.exit(1);
        }

        const startWeek = parseInt(params[0]);
        const endWeek = parseInt(params[1]);
        console.log(`📅 Fetching schedule for weeks ${startWeek}-${endWeek}...`);
        
        const rangeSchedule = await scheduleFetcher.getWeekRange(startWeek, endWeek);
        console.log('✅ Week range schedule fetched successfully!');
        console.log(`   Weeks: ${rangeSchedule.length}`);
        console.log(`   Total Matchups: ${rangeSchedule.reduce((sum, week) => sum + week.matchups.length, 0)}`);
        
        if (options.pretty || options.output) {
          console.log('\n' + formatScheduleOutput(rangeSchedule, options.pretty));
        }
        break;
      }

      case 'export': {
        console.log('📁 Fetching and exporting full season schedule...');
        const exportSchedule = await scheduleFetcher.getFullSeason(true); // Save to DB by default

        // Import teams if season ID provided
        let exportTeamsImportResult = null;
        if (options['import-teams']) {
          console.log('\n🏈 Importing teams to existing season...');
          exportTeamsImportResult = await importTeamsToSeason(options['import-teams'], exportSchedule.teams);
        }

        const filename = options.output || `espn-schedule-${config.leagueId}-${seasonYear}.json`;
        const filepath = resolve(process.cwd(), filename);
        
        const jsonOutput = formatScheduleOutput(exportSchedule, true); // Always pretty print exports
        writeFileSync(filepath, jsonOutput, 'utf8');
        
        console.log('✅ Schedule exported and saved to database!');
        console.log(`   File: ${filepath}`);
        console.log(`   Size: ${(jsonOutput.length / 1024).toFixed(1)} KB`);
        console.log(`   League: ${exportSchedule.leagueInfo.leagueName}`);
        console.log(`   Teams: ${exportSchedule.leagueInfo.teamCount}`);
        console.log(`   Total Matchups: ${exportSchedule.totalMatchups}`);
        
        if (exportSchedule.dbImport) {
          console.log(`   Database Import ID: ${exportSchedule.dbImport.importId}`);
          console.log(`   Status: PENDING (awaiting season assignment)`);
        }

        if (exportTeamsImportResult) {
          console.log(`\n🏈 Teams Import Results:`);
          console.log(`   Successfully Imported: ${exportTeamsImportResult.imported.length}`);
          console.log(`   Import Errors: ${exportTeamsImportResult.errors.length}`);
        }
        break;
      }

      case 'teams': {
        if (!params[0]) {
          console.error('❌ Error: Season ID required');
          console.error('Usage: node scripts/fetchSchedule.js teams <season-id>');
          process.exit(1);
        }

        const seasonId = params[0];
        console.log(`🏈 Fetching teams and importing to season ${seasonId}...`);

        const scheduleForTeams = await scheduleFetcher.getFullSeason(false); // Don't save schedule to DB
        const teamsResult = await importTeamsToSeason(seasonId, scheduleForTeams.teams);

        if (teamsResult.success) {
          console.log('✅ All teams imported successfully!');
        } else {
          console.log('⚠️ Some teams could not be imported. Check errors above.');
        }
        break;
      }

      case 'teams-only': {
        if (!params[0]) {
          console.error('❌ Error: Season ID required');
          console.error('Usage: node scripts/fetchSchedule.js teams-only <season-id>');
          process.exit(1);
        }

        const seasonIdOnly = params[0];
        console.log(`🏈 Fetching and importing teams only to season ${seasonIdOnly}...`);

        const scheduleForTeamsOnly = await scheduleFetcher.getFullSeason(false); // Don't save schedule to DB
        const teamsOnlyResult = await importTeamsToSeason(seasonIdOnly, scheduleForTeamsOnly.teams);

        console.log(`\n📊 Teams Import Summary:`);
        console.log(`   Season ID: ${seasonIdOnly}`);
        console.log(`   ESPN League: ${scheduleForTeamsOnly.leagueInfo.leagueName}`);
        console.log(`   Total Teams: ${scheduleForTeamsOnly.teams.length}`);
        console.log(`   Successfully Imported: ${teamsOnlyResult.imported.length}`);
        console.log(`   Import Errors: ${teamsOnlyResult.errors.length}`);

        if (teamsOnlyResult.success) {
          console.log('\n✅ All teams imported successfully!');
          console.log('\nImported Teams:');
          teamsOnlyResult.imported.forEach(team => {
            console.log(`   - ${team.name} (Owner: ${team.owner}) [ESPN ID: ${team.espnTeamId}]`);
          });
        } else {
          console.log('\n⚠️ Some teams could not be imported. Check errors above.');
          process.exit(1);
        }
        break;
      }

      default:
        console.error(`❌ Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }

  } catch (error) {
    console.error('❌ Script failed:', error.message);
    
    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('\\n💡 This might be a private league. You need to set espnS2 and swid cookies.');
      console.error('   Check the help text above for instructions on finding these cookies.');
    }
    
    if (error.message.includes('404')) {
      console.error('\\n💡 League or season not found. Check your league ID and season year.');
    }
    
    process.exit(1);
  }
}

main().catch(console.error);