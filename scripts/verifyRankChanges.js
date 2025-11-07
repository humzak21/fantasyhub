/**
 * Script to verify rank changes are calculated correctly
 * This script tests the live rank change calculation across multiple weeks
 * 
 * Usage: node scripts/verifyRankChanges.js [seasonId] [startWeek] [endWeek]
 * Examples:
 *   node scripts/verifyRankChanges.js auto 1 auto  (checks all completed weeks)
 *   node scripts/verifyRankChanges.js auto 1 9     (checks weeks 1-9)
 *   node scripts/verifyRankChanges.js              (defaults: auto 1 auto)
 */

import { SupabaseDataManager } from '../services/supabaseDataManager.js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const dataManager = new SupabaseDataManager();

async function verifyRankChanges(seasonId, startWeek, endWeek) {
  try {
    await dataManager.initialize();
    console.log('✓ DataManager initialized\n');

    // If no season ID provided or 'auto', get the active season
    if (!seasonId || seasonId === 'auto') {
      console.log('Fetching active season...');
      const activeSeason = await dataManager.getActiveSeason();

      if (!activeSeason) {
        console.error('No active season found. Please create a season first.');
        process.exit(1);
      }

      seasonId = activeSeason.id;
      console.log(`Using season: ${activeSeason.name || activeSeason.year} (${seasonId.substring(0, 8)}...)\n`);
    }

    // If endWeek is 'auto', detect the last completed week
    if (endWeek === 'auto' || !endWeek) {
      const lastCompleted = await dataManager.getLastCompletedWeek(seasonId);
      endWeek = lastCompleted;
      console.log(`Auto-detected last completed week: ${lastCompleted}\n`);
    }

    console.log(`🔍 Verifying Rank Changes for Weeks ${startWeek}-${endWeek}`);
    console.log('='.repeat(70));

    let previousWeekRankings = null;

    for (let week = startWeek; week <= endWeek; week++) {
      console.log(`\n📊 Week ${week}:`);
      console.log('─'.repeat(70));

      try {
        // Get rankings for this week (calculated live)
        const rankings = await dataManager.getPowerRankingsForWeek(seasonId, week);

        if (!rankings || rankings.length === 0) {
          console.log(`   ⚠️  No rankings data for week ${week} (possibly no games yet)`);
          continue;
        }

        console.log(`   Teams: ${rankings.length}`);
        
        // Display top 5 teams with rank changes
        console.log('\n   Top 5 Teams:');
        rankings.slice(0, 5).forEach(team => {
          const rankChangeDisplay = team.rankChange === 0 ? '─' :
                                   team.rankChange > 0 ? `↑${team.rankChange}` :
                                   `↓${Math.abs(team.rankChange)}`;
          
          const rankChangeColor = team.rankChange > 0 ? '\x1b[32m' : // Green
                                 team.rankChange < 0 ? '\x1b[31m' : // Red
                                 '\x1b[90m'; // Gray
          const resetColor = '\x1b[0m';

          console.log(
            `   ${team.rank}. ${team.name.padEnd(25)} ` +
            `${rankChangeColor}${rankChangeDisplay.padStart(4)}${resetColor} ` +
            `(Rating: ${team.powerRating.toFixed(2)})`
          );
        });

        // Verify rank changes are correct if we have previous week data
        if (week > startWeek && previousWeekRankings) {
          console.log('\n   Verification:');
          let errors = 0;
          
          rankings.forEach(team => {
            const prevTeam = previousWeekRankings.find(p => 
              p.teamId === team.teamId || p.id === team.id
            );
            
            if (prevTeam) {
              const expectedChange = prevTeam.rank - team.rank;
              const actualChange = team.rankChange;
              
              if (expectedChange !== actualChange) {
                errors++;
                console.log(
                  `   ❌ ${team.name}: Expected change ${expectedChange}, ` +
                  `got ${actualChange} (Prev: ${prevTeam.rank}, Current: ${team.rank})`
                );
              }
            }
          });
          
          if (errors === 0) {
            console.log(`   ✅ All rank changes verified correctly!`);
          } else {
            console.log(`   ❌ Found ${errors} rank change error(s)`);
          }
        } else if (week === startWeek || week === 1) {
          // Verify week 1 has no rank changes
          const nonZeroChanges = rankings.filter(t => t.rankChange !== 0);
          if (nonZeroChanges.length === 0) {
            console.log('\n   ✅ Week 1: All rank changes are 0 (correct)');
          } else {
            console.log(`\n   ❌ Week 1 should have no rank changes, but found ${nonZeroChanges.length} non-zero`);
          }
        }

        previousWeekRankings = rankings;

      } catch (err) {
        console.error(`   ❌ Error processing week ${week}:`, err.message);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✓ Verification complete!');

  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
const seasonId = args[0] || 'auto';
const startWeek = parseInt(args[1]) || 1;
const endWeek = args[2] === 'auto' || !args[2] ? 'auto' : parseInt(args[2]);

console.log('🔍 Rank Change Verification Tool');
console.log('='.repeat(70));
console.log(`Season ID: ${seasonId === 'auto' ? 'auto-detect' : seasonId}`);
console.log(`Week Range: ${startWeek} - ${endWeek === 'auto' ? 'auto-detect' : endWeek}`);
console.log('='.repeat(70));

verifyRankChanges(seasonId, startWeek, endWeek)
  .then(() => {
    console.log('\n✓ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Script failed:', err);
    process.exit(1);
  });

