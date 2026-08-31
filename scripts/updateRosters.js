#!/usr/bin/env node

// `client.server.js` loads the .env files as a side effect of being imported,
// and it has to be the FIRST import. This file used to call `dotenv.config()`
// in its module body, which reads as though it runs first but does not: ES
// imports are hoisted above every statement, so `config/espn-config.js` was
// evaluated — and read `process.env` — before dotenv ever ran. The cookies in
// `.env.local` were never seen, and the script silently authenticated as a
// public-league reader, printing "Private League: No". `sync-week.js` and
// `sync-schedule.js` order it this way for the same reason.
//
// `espn-config.js` now resolves env lazily too, so this is belt and braces
// rather than the only thing holding it up.
import '../services/db/client.server.js';

import { createRosterUpdateScript } from '../services/espnRosterUpdater.js';
import { getContext } from '../services/db/index.js';
import { ESPN_CONFIG } from '../config/espn-config.js';
import { toSeasonConfig } from '../utils/seasonConfig.js';

/**
 * The ESPN league and season to talk to.
 *
 * The active season row owns both, exactly as it does for `sync-week.js` and
 * `sync-schedule.js`; `ESPN_CONFIG` is only the fallback. This script used to
 * read `ESPN_SEASON_YEAR` and nothing else, so with that variable unset — which
 * is its normal state, it is in neither `.env.local` nor `.env.example` — the
 * fetch URL was built with `undefined` where the year belongs.
 */
async function resolveEspnTarget() {
  const { data, error } = await getContext()
    .client.from('v_active_season')
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `No active season found. Mark one with seasons.is_active = true. (${error?.message ?? 'no row'})`
    );
  }

  const season = toSeasonConfig(data);

  return {
    leagueId: season.espnLeagueId || ESPN_CONFIG.leagueId,
    seasonYear: season.espnSeasonYear || season.year || ESPN_CONFIG.seasonYear,
    espnS2: ESPN_CONFIG.espnS2,
    swid: ESPN_CONFIG.swid,
    seasonLabel: season.year
  };
}

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

  try {
    const config = await resolveEspnTarget();

    if (!config.leagueId) {
      console.error('❌ Error: no ESPN league id.');
      console.error('   Set seasons.espn_league_id for the active season, or ESPN_LEAGUE_ID.');
      process.exit(1);
    }
    if (!config.seasonYear) {
      console.error('❌ Error: no ESPN season year.');
      console.error('   Set seasons.espn_season_year (or seasons.year) for the active season.');
      process.exit(1);
    }

    console.log(`🔧 Initializing ESPN roster updater...`);
    console.log(`   League ID: ${config.leagueId}`);
    console.log(`   Season: ${config.seasonYear} (active season ${config.seasonLabel})`);
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