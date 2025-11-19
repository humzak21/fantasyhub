/**
 * Build Franchise Registry Script
 *
 * This script initializes the league_franchises table by scanning all existing
 * team data (current + historical) and creating franchise records for each
 * unique owner. Franchises are the stable identifier across multiple seasons.
 *
 * Usage:
 *   node scripts/buildFranchiseRegistry.js
 *
 * Prerequisites:
 *   - league_history_schema.sql must be run first to create tables
 *   - SUPABASE_SERVICE_ROLE_KEY environment variable must be set
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getSupabaseAdmin } from './lib/getSupabaseAdmin.js';

// Special owner handling
const OWNER_CHANGES = {
  left: [
    { name: 'Sai Ravva', leftYear: 2024 }
  ],
  joined: [
    { name: 'Anish Madala', joinedYear: 2025 }
  ]
};

async function buildFranchiseRegistry() {
  console.log('🏈 Building League Franchise Registry');
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
    // Step 1: Get all unique owners from teams table (current seasons)
    console.log('\n📊 Step 1: Scanning current teams table for owners...');
    const { data: currentTeams, error: teamsError } = await supabaseAdmin
      .from('teams')
      .select('owner, season_id, seasons!inner(year)')
      .not('owner', 'is', null);

    if (teamsError) {
      throw new Error(`Failed to fetch teams: ${teamsError.message}`);
    }

    // Sort by year in JavaScript
    if (currentTeams) {
      currentTeams.sort((a, b) => a.seasons.year - b.seasons.year);
    }

    console.log(`   Found ${currentTeams?.length || 0} team records`);

    // Step 2: Get all unique owners from historical_teams table (if it exists and has data)
    console.log('\n📊 Step 2: Scanning historical_teams table for owners...');
    const { data: historicalTeams, error: historicalError } = await supabaseAdmin
      .from('historical_teams')
      .select('franchise_id, historical_seasons!inner(year)')
      .not('franchise_id', 'is', null);

    // It's OK if historical_teams doesn't exist yet or is empty
    if (historicalError && !historicalError.message.includes('does not exist')) {
      console.warn(`   Warning: ${historicalError.message}`);
    }
    console.log(`   Found ${historicalTeams?.length || 0} historical team records`);

    // Step 3: Extract unique owners and their first season
    console.log('\n📊 Step 3: Identifying unique owners...');
    const ownerMap = new Map();

    // Process current teams
    if (currentTeams) {
      for (const team of currentTeams) {
        const owner = team.owner;
        const year = team.seasons.year;

        if (!ownerMap.has(owner)) {
          ownerMap.set(owner, {
            ownerName: owner,
            joinedYear: year,
            lastSeasonYear: year,
            seasonsPlayed: new Set([year])
          });
        } else {
          const ownerData = ownerMap.get(owner);
          ownerData.seasonsPlayed.add(year);
          if (year < ownerData.joinedYear) {
            ownerData.joinedYear = year;
          }
          if (year > ownerData.lastSeasonYear) {
            ownerData.lastSeasonYear = year;
          }
        }
      }
    }

    console.log(`   Identified ${ownerMap.size} unique owners`);
    console.log('\n   Owners found:');
    for (const [owner, data] of ownerMap.entries()) {
      console.log(`   - ${owner}: ${data.joinedYear}-${data.lastSeasonYear} (${data.seasonsPlayed.size} seasons)`);
    }

    // Step 4: Handle special cases (owners who left/joined)
    console.log('\n📊 Step 4: Applying owner change logic...');

    // Mark owners who left (or create them if not in current teams)
    for (const { name, leftYear } of OWNER_CHANGES.left) {
      if (ownerMap.has(name)) {
        const ownerData = ownerMap.get(name);
        ownerData.leftYear = leftYear;
        ownerData.isActive = false;
        console.log(`   ✓ Marked "${name}" as left after ${leftYear}`);
      } else {
        // Owner left before current DB was created - add them as historical franchise
        ownerMap.set(name, {
          ownerName: name,
          joinedYear: 2020, // Assuming they were in the league from the start
          lastSeasonYear: leftYear,
          seasonsPlayed: new Set([2020, 2021, 2022, 2023, 2024].filter(y => y <= leftYear)),
          leftYear: leftYear,
          isActive: false
        });
        console.log(`   ✓ Created historical franchise for "${name}" (2020-${leftYear}, left after ${leftYear})`);
      }
    }

    // Add owners who joined (if not already in map)
    for (const { name, joinedYear } of OWNER_CHANGES.joined) {
      if (!ownerMap.has(name)) {
        ownerMap.set(name, {
          ownerName: name,
          joinedYear: joinedYear,
          lastSeasonYear: joinedYear,
          seasonsPlayed: new Set([joinedYear]),
          isActive: true
        });
        console.log(`   ✓ Added new owner "${name}" (joined ${joinedYear})`);
      }
    }

    // Step 5: Create franchise records
    console.log('\n📊 Step 5: Creating franchise records...');

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const [owner, data] of ownerMap.entries()) {
      // Check if franchise already exists
      const { data: existing, error: checkError } = await supabaseAdmin
        .from('league_franchises')
        .select('id, owner_name')
        .eq('owner_name', owner)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error(`   ❌ Error checking for "${owner}": ${checkError.message}`);
        errors++;
        continue;
      }

      if (existing) {
        console.log(`   ⏭️  Skipped "${owner}" (already exists with ID: ${existing.id})`);
        skipped++;
        continue;
      }

      // Create new franchise
      const franchiseData = {
        owner_name: owner,
        display_name: owner,
        joined_year: data.joinedYear,
        left_year: data.leftYear || null,
        is_active: data.isActive !== false,
        total_seasons: data.seasonsPlayed.size,
        // Career stats will be calculated later by calculateSeasonAwards script
        total_championships: 0,
        total_playoff_appearances: 0,
        total_regular_season_wins: 0,
        total_regular_season_losses: 0,
        total_points_for: 0,
        total_points_against: 0,
        career_win_percentage: null
      };

      const { data: newFranchise, error: insertError } = await supabaseAdmin
        .from('league_franchises')
        .insert(franchiseData)
        .select()
        .single();

      if (insertError) {
        console.error(`   ❌ Error creating franchise for "${owner}": ${insertError.message}`);
        errors++;
        continue;
      }

      console.log(`   ✅ Created franchise for "${owner}" (ID: ${newFranchise.id})`);
      created++;
    }

    // Step 6: Link existing teams to franchises
    console.log('\n📊 Step 6: Linking current teams to franchises...');

    const { data: franchises, error: franchisesError } = await supabaseAdmin
      .from('league_franchises')
      .select('id, owner_name');

    if (franchisesError) {
      throw new Error(`Failed to fetch franchises: ${franchisesError.message}`);
    }

    const franchiseMap = new Map(franchises.map(f => [f.owner_name, f.id]));

    let linked = 0;
    let linkErrors = 0;

    if (currentTeams) {
      for (const team of currentTeams) {
        const franchiseId = franchiseMap.get(team.owner);

        if (!franchiseId) {
          console.warn(`   ⚠️  No franchise found for owner "${team.owner}"`);
          continue;
        }

        // Update team with franchise_id (if column exists)
        const { error: updateError } = await supabaseAdmin
          .from('teams')
          .update({ franchise_id: franchiseId })
          .eq('season_id', team.season_id)
          .eq('owner', team.owner);

        if (updateError) {
          // It's OK if franchise_id column doesn't exist yet in teams table
          if (!updateError.message.includes('column') && !updateError.message.includes('does not exist')) {
            console.error(`   ❌ Error linking team for "${team.owner}": ${updateError.message}`);
            linkErrors++;
          }
          continue;
        }

        linked++;
      }
    }

    if (linked > 0) {
      console.log(`   ✅ Linked ${linked} teams to franchises`);
    } else {
      console.log(`   ℹ️  Note: franchise_id column may not exist in teams table yet`);
      console.log(`      You can add it with: ALTER TABLE teams ADD COLUMN franchise_id UUID REFERENCES league_franchises(id);`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`   Total unique owners found: ${ownerMap.size}`);
    console.log(`   Franchises created: ${created}`);
    console.log(`   Franchises skipped (already exist): ${skipped}`);
    console.log(`   Errors: ${errors}`);
    if (linked > 0) {
      console.log(`   Teams linked: ${linked}`);
    }
    if (linkErrors > 0) {
      console.log(`   Link errors: ${linkErrors}`);
    }

    console.log('\n✅ Franchise registry build complete!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Run importHistoricalSeason.js to import historical data (2020-2024)');
    console.log('   2. Run calculateSeasonAwards.js to populate awards and update career stats');
    console.log('   3. Run calculateHeadToHeadHistory.js to build H2H records');

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
buildFranchiseRegistry()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
