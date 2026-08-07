#!/usr/bin/env node

// Load environment variables for Node.js
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createRosterUpdateScript } from '../services/espnRosterUpdater.js';

import { ESPN_CONFIG } from '../config/espn-config.js';
const config = ESPN_CONFIG;

function printUsage() {
  console.log(`
🏈 ESPN Fantasy Football Roster Updater
======================================

Usage: node scripts/updateRosters.js [options]

Required Configuration:
You need to set up your ESPN league details in one of these ways:

1. Edit this file and set the config object:
   leagueId: Your ESPN league ID (found in ESPN URL)
   seasonYear: Current season year (e.g., 2025)
   
2. For private leagues, also set:
   espnS2: ESPN S2 cookie value
   swid: ESPN SWID cookie value

To find your cookies (for private leagues):
1. Go to your ESPN fantasy league in browser
2. Open Developer Tools (F12)
3. Go to Application/Storage > Cookies > espn.com
4. Find 'espn_s2' and 'SWID' values

Commands:
  test     - Test connection to ESPN league
  update   - Update all team rosters
  report   - Show team matching analysis
  weekly   - Run complete weekly update process

Examples:
  node scripts/updateRosters.js test
  node scripts/updateRosters.js update
  node scripts/updateRosters.js weekly
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help') {
    printUsage();
    return;
  }

  if (!config.leagueId) {
    console.error('❌ Error: League ID not configured');
    console.error('Run: node scripts/setupESPN.js');
    console.error('Then edit config/espn-config.js with your league details');
    process.exit(1);
  }

  try {
    console.log(`🔧 Initializing ESPN roster updater...`);
    console.log(`   League ID: ${config.leagueId}`);
    console.log(`   Season: ${config.seasonYear}`);
    console.log(`   Private League: ${config.espnS2 ? 'Yes' : 'No'}`);
    console.log('');

    const rosterScript = await createRosterUpdateScript(
      config.leagueId,
      config.seasonYear,
      config.espnS2,
      config.swid
    );

    switch (command) {
      case 'test':
        console.log('🧪 Testing ESPN league connection...');
        const testResult = await rosterScript.testConnection();
        if (testResult.success) {
          console.log('✅ Connection successful!');
        } else {
          console.log('❌ Connection failed!');
          process.exit(1);
        }
        break;

      case 'update':
        console.log('🔄 Updating team rosters...');
        await rosterScript.updateRosters();
        break;

      case 'report':
        console.log('📊 Generating team matching report...');
        await rosterScript.showMatchingReport();
        break;

      case 'weekly':
        console.log('📅 Running weekly update process...');
        await rosterScript.runWeeklyUpdate();
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }

  } catch (error) {
    console.error('❌ Script failed:', error.message);
    
    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('\n💡 This might be a private league. You need to set espnS2 and swid cookies.');
      console.error('   Check the help text above for instructions on finding these cookies.');
    }
    
    process.exit(1);
  }
}


// Only run when executed directly. Importing this module must not touch
// production — see aug2026_refactor/07-frontend.md §7.
const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) main().catch(console.error);