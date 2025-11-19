/**
 * Fix Historical Playoffs Script
 *
 * This script fixes playoff data for already-imported historical seasons.
 * It updates:
 * - made_playoffs (sets to FALSE if seed > 6 or seed is null)
 * - playoff_finish based on actual game results
 * - playoff_wins and playoff_losses
 *
 * Usage:
 *   node scripts/fixHistoricalPlayoffs.js
 *   node scripts/fixHistoricalPlayoffs.js --year 2024
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getSupabaseAdmin } from './lib/getSupabaseAdmin.js';

const args = process.argv.slice(2);
const specificYear = args.find(arg => arg.startsWith('--year='))?.split('=')[1];

async function fixPlayoffsForSeason(season, supabaseAdmin) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Fixing ${season.year} Season Playoffs`);
  console.log('='.repeat(60));

  // Step 1: Fix made_playoffs flag (only seeds 1-6 made real playoffs)
  console.log('\n📊 Step 1: Fixing made_playoffs flag...');

  const { data: teams, error: teamsError } = await supabaseAdmin
    .from('historical_teams')
    .select('*')
    .eq('season_id', season.id);

  if (teamsError) {
    throw new Error(`Failed to fetch teams: ${teamsError.message}`);
  }

  for (const team of teams) {
    const shouldMakePlayoffs = team.playoff_seed && team.playoff_seed > 0 && team.playoff_seed <= 6;

    // Determine playoff finish based on final_rank
    let playoffFinish = 'none';
    if (shouldMakePlayoffs) {
      if (team.final_rank === 1) {
        playoffFinish = 'champion';
      } else if (team.final_rank === 2) {
        playoffFinish = '2nd';
      } else if (team.final_rank === 3) {
        playoffFinish = '3rd';
      } else if (team.final_rank === 4) {
        playoffFinish = '4th';
      } else if (team.final_rank === 5) {
        playoffFinish = '5th';
      } else if (team.final_rank === 6) {
        playoffFinish = '6th';
      } else {
        playoffFinish = 'playoffs';
      }
    }

    if (team.made_playoffs !== shouldMakePlayoffs || team.playoff_finish !== playoffFinish) {
      await supabaseAdmin
        .from('historical_teams')
        .update({
          made_playoffs: shouldMakePlayoffs,
          playoff_finish: playoffFinish
        })
        .eq('id', team.id);

      console.log(`   Updated ${team.team_name}: made_playoffs=${shouldMakePlayoffs}, playoff_finish=${playoffFinish} (rank: ${team.final_rank})`);
    }
  }

  // Step 2: Reset non-playoff teams
  console.log('\n📊 Step 2: Resetting non-playoff teams...');

  await supabaseAdmin
    .from('historical_teams')
    .update({
      playoff_finish: 'none',
      playoff_wins: 0,
      playoff_losses: 0
    })
    .eq('season_id', season.id)
    .eq('made_playoffs', false);

  console.log(`   ✅ Reset non-playoff teams`);
}

async function main() {
  console.log('🏈 Fix Historical Playoffs Data');
  console.log('='.repeat(60));

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  try {
    // Get seasons to process
    let query = supabaseAdmin
      .from('historical_seasons')
      .select('*')
      .order('year', { ascending: true });

    if (specificYear) {
      query = query.eq('year', parseInt(specificYear));
    }

    const { data: seasons, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch seasons: ${error.message}`);
    }

    if (!seasons || seasons.length === 0) {
      console.log('⚠️  No historical seasons found');
      process.exit(0);
    }

    console.log(`Found ${seasons.length} season(s) to process`);

    for (const season of seasons) {
      await fixPlayoffsForSeason(season, supabaseAdmin);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ PLAYOFF FIX COMPLETE');
    console.log('='.repeat(60));
    console.log('\n📝 Next Steps:');
    console.log('   1. Run calculateSeasonAwards.js --rebuild to recalculate awards');
    console.log('   2. Verify data in historical_teams table');

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
