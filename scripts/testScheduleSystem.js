#!/usr/bin/env node

// Test script for the ESPN Schedule Storage System
// This script demonstrates how to use the new schedule import and management features

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { SupabaseDataManager } from '../services/supabaseDataManager.js';

async function testScheduleSystem() {
  console.log('🧪 Testing ESPN Schedule Storage System');
  console.log('=====================================\n');

  try {
    // Initialize data manager
    const dataManager = new SupabaseDataManager();
    await dataManager.initialize();
    console.log('✅ Data manager initialized\n');

    // Test 1: Get pending schedule imports
    console.log('📋 Testing: Get pending schedule imports');
    const pendingImports = await dataManager.getPendingScheduleImports();
    console.log(`Found ${pendingImports.length} pending imports:`);
    
    pendingImports.forEach((importItem, index) => {
      console.log(`  ${index + 1}. ${importItem.league_name} (${importItem.season_year})`);
      console.log(`     ESPN League ID: ${importItem.espn_league_id}`);
      console.log(`     Teams: ${importItem.team_count}, Matchups: ${importItem.total_matchups}`);
      console.log(`     Status: ${importItem.assignment_status}`);
      console.log(`     Imported: ${new Date(importItem.imported_at).toLocaleString()}\n`);
    });

    // Test 2: Get available seasons
    console.log('🏆 Testing: Get available seasons');
    const seasons = await dataManager.getSeasons();
    console.log(`Found ${seasons.length} seasons:`);
    
    seasons.forEach((season, index) => {
      console.log(`  ${index + 1}. ${season.name} (${season.year}) - ID: ${season.id}`);
    });
    console.log('');

    // Test 3: Get import details (if we have pending imports)
    if (pendingImports.length > 0) {
      console.log('📊 Testing: Get import details for first pending import');
      const importDetails = await dataManager.getScheduleImportDetails(pendingImports[0].import_id);
      
      console.log(`Import: ${importDetails.import.league_name} (${importDetails.import.season_year})`);
      console.log(`Teams: ${importDetails.teams.length}`);
      console.log(`Matchups: ${importDetails.matchups.length}`);
      
      // Show team breakdown
      console.log('Teams:');
      importDetails.teams.forEach((team, index) => {
        console.log(`  ${index + 1}. ${team.team_name} (${team.abbreviation || 'N/A'})`);
      });
      
      // Show matchup breakdown by week
      const matchupsByWeek = {};
      importDetails.matchups.forEach(matchup => {
        if (!matchupsByWeek[matchup.week]) {
          matchupsByWeek[matchup.week] = [];
        }
        matchupsByWeek[matchup.week].push(matchup);
      });
      
      console.log('Matchups by week:');
      Object.keys(matchupsByWeek).sort((a, b) => parseInt(a) - parseInt(b)).forEach(week => {
        const weekMatchups = matchupsByWeek[week];
        const playoffCount = weekMatchups.filter(m => m.is_playoff).length;
        console.log(`  Week ${week}: ${weekMatchups.length} matchups${playoffCount > 0 ? ` (${playoffCount} playoff)` : ''}`);
      });
      console.log('');
    }

    // Test 4: Demonstrate assignment (commented out to avoid accidental assignments)
    console.log('⚠️  Assignment Test (Commented Out)');
    console.log('To test assignment, uncomment the code below and provide valid IDs:');
    console.log('');
    console.log('// Example assignment:');
    console.log('// const result = await dataManager.assignScheduleToSeason(');
    console.log('//   "import-id-here",');
    console.log('//   "season-id-here",');
    console.log('//   "Test assignment from script"');
    console.log('// );');
    console.log('// console.log("Assignment result:", result);');
    console.log('');

    /*
    // Uncomment this section to test actual assignment
    if (pendingImports.length > 0 && seasons.length > 0) {
      console.log('🔗 Testing: Assign schedule to season');
      const result = await dataManager.assignScheduleToSeason(
        pendingImports[0].import_id,
        seasons[0].id,
        'Test assignment from script'
      );
      console.log('Assignment result:', result);
    }
    */

    console.log('✅ All tests completed successfully!');
    console.log('\n📝 Next Steps:');
    console.log('1. Run: node scripts/fetchSchedule.js full');
    console.log('   This will fetch and save a schedule to the database');
    console.log('2. Use the ScheduleImportManager component in your app');
    console.log('   to assign pending imports to seasons');
    console.log('3. Check the database tables:');
    console.log('   - espn_schedule_imports');
    console.log('   - espn_teams');
    console.log('   - espn_matchups');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('\n💡 Common issues:');
    console.error('- Make sure the database migration has been run');
    console.error('- Check your .env.local file has correct Supabase credentials');
    console.error('- Ensure you have proper authentication set up');
  }
}

// Run the test
testScheduleSystem().catch(console.error);
