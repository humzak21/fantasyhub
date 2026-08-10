#!/usr/bin/env node

/**
 * Read-only ESPN inspection.
 *
 * This used to be the front half of the import pipeline: `full` and `export`
 * staged a season into `espn_schedule_imports` / `espn_teams` / `espn_matchups`
 * for an admin to approve in the browser, `teams` wrote teams directly, and
 * `update-scores` was a second copy of the weekly score sync. All four are gone
 * — `npm run sync-schedule` imports a season and `npm run sync-week` keeps it
 * current, both through the same upsert.
 *
 * What is left is what this was always most useful for: checking that the
 * credentials work and seeing what ESPN is actually returning, without writing
 * anything.
 *
 * Usage:
 *   node scripts/fetchSchedule.js test              # check the connection
 *   node scripts/fetchSchedule.js week 5            # one week's matchups
 *   node scripts/fetchSchedule.js range 1 4         # a span of weeks
 *
 * Options: --season <year>  override the configured season
 *          --pretty         print the parsed payload
 */

import 'dotenv/config';

import { createScheduleFetcher } from '../services/espnScheduleFetcher.js';
import { ESPN_CONFIG as config } from '../config/espn-config.js';

function printUsage() {
  console.log(`
🏈 ESPN schedule inspector (read-only)

  node scripts/fetchSchedule.js test           Verify league access
  node scripts/fetchSchedule.js week <n>       Fetch one week
  node scripts/fetchSchedule.js range <a> <b>  Fetch a span of weeks

Options
  --season <year>   Override the configured season year
  --pretty          Print the parsed matchups as indented JSON

To write to the database use the sync jobs instead:
  npm run sync-schedule    Import a whole season (teams + games)
  npm run sync-week        Sync the current week's scores
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { command: args[0], params: [], options: {} };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const option = arg.substring(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        parsed.options[option] = args[i + 1];
        i++;
      } else {
        parsed.options[option] = true;
      }
    } else {
      parsed.params.push(arg);
    }
  }

  return parsed;
}

async function main() {
  const { command, params, options } = parseArgs();

  if (!command || command === 'help' || command === '--help') {
    printUsage();
    return;
  }

  const seasonYear = options.season ? parseInt(options.season, 10) : config.seasonYear;

  if (!config.leagueId) {
    console.error('❌ No ESPN league id. Set ESPN_LEAGUE_ID, or seasons.espn_league_id for the season.');
    process.exit(1);
  }
  if (!seasonYear) {
    console.error('❌ No season year. Set ESPN_SEASON_YEAR or pass --season <year>.');
    process.exit(1);
  }

  console.log(`🔧 ESPN league ${config.leagueId} · season ${seasonYear} · private: ${config.espnS2 ? 'yes' : 'no'}\n`);

  const scheduleFetcher = await createScheduleFetcher(
    config.leagueId, seasonYear, config.espnS2, config.swid
  );

  switch (command) {
    case 'test': {
      const result = await scheduleFetcher.testConnection();
      if (!result.success) {
        console.error(`❌ Connection failed: ${result.error}`);
        process.exit(1);
      }
      console.log('✅ Connection successful');
      console.log(`   League: ${result.leagueName}`);
      console.log(`   Teams: ${result.teamCount}`);
      console.log(`   Matchups: ${result.matchupCount}`);
      break;
    }

    case 'week': {
      const weekNumber = parseInt(params[0], 10);
      if (!weekNumber) {
        console.error('❌ Week number required: node scripts/fetchSchedule.js week <n>');
        process.exit(1);
      }

      const weekSchedule = await scheduleFetcher.getSingleWeek(weekNumber);
      if (!weekSchedule) {
        console.log(`❌ ESPN returned no schedule for week ${weekNumber}`);
        break;
      }

      console.log(`✅ Week ${weekSchedule.week}: ${weekSchedule.matchups.length} matchups`);
      for (const matchup of weekSchedule.matchups) {
        console.log(
          `   ${matchup.homeTeam.teamName} ${matchup.homeTeam.score} — ` +
          `${matchup.awayTeam.score} ${matchup.awayTeam.teamName}` +
          `  [${matchup.espnWinner}${matchup.isPlayoff ? `, ${matchup.playoffTierType}` : ''}]`
        );
      }
      if (options.pretty) console.log('\n' + JSON.stringify(weekSchedule, null, 2));
      break;
    }

    case 'range': {
      const startWeek = parseInt(params[0], 10);
      const endWeek = parseInt(params[1], 10);
      if (!startWeek || !endWeek) {
        console.error('❌ Start and end weeks required: node scripts/fetchSchedule.js range <a> <b>');
        process.exit(1);
      }

      const rangeSchedule = await scheduleFetcher.getWeekRange(startWeek, endWeek);
      const total = rangeSchedule.reduce((sum, week) => sum + week.matchups.length, 0);
      console.log(`✅ Weeks ${startWeek}-${endWeek}: ${rangeSchedule.length} fetched, ${total} matchups`);
      if (options.pretty) console.log('\n' + JSON.stringify(rangeSchedule, null, 2));
      break;
    }

    default:
      console.error(`❌ Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

/**
 * Only run when executed directly. Importing this module must not reach out to
 * ESPN — the mistake recorded in aug2026_refactor/07-frontend.md §7.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`);
    if (/401|403/.test(error.message)) {
      console.error('   Private league — check ESPN_S2 / ESPN_SWID.');
    }
    process.exit(1);
  });
}
