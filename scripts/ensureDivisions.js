/**
 * Ensure Divisions Script
 * 
 * This script checks if divisions exist for the active season and creates them if they don't.
 * Run this to set up divisions for playoff odds calculation.
 */

import dotenv from 'dotenv';

import { getDb, getContext } from '../services/db/index.js';

// This script never loaded its environment, so it failed on the first client
// call with "Missing SUPABASE_URL" regardless of the data layer under it.
dotenv.config({ path: '.env.local' });

async function ensureDivisions() {
  const dataManager = getDb();
  
  try {
    console.log('✓ Connected to database');

    // Get active season
    const activeSeason = await dataManager.seasons.getActiveSeason();
    if (!activeSeason) {
      console.error('✗ No active season found');
      process.exit(1);
    }

    console.log(`✓ Active season: ${activeSeason.name} (${activeSeason.year})`);
    console.log(`  Season ID: ${activeSeason.id}`);

    // Check for existing divisions
    const { data: existingDivisions, error } = await getContext().client
      .from('divisions')
      .select('*')
      .eq('season_id', activeSeason.id)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('✗ Error fetching divisions:', error);
      process.exit(1);
    }

    console.log(`\n📊 Current Divisions: ${existingDivisions?.length || 0}`);
    if (existingDivisions && existingDivisions.length > 0) {
      existingDivisions.forEach(div => {
        console.log(`  - ${div.name} (ID: ${div.id}, Display Order: ${div.display_order})`);
      });

      // Count teams per division
      const { data: teams } = await getContext().client
        .from('teams')
        .select('id, name, division_id')
        .eq('season_id', activeSeason.id);

      console.log(`\n👥 Teams Assignment:`);
      existingDivisions.forEach(div => {
        const divTeams = teams?.filter(t => t.division_id === div.id) || [];
        console.log(`  ${div.name}: ${divTeams.length} teams`);
        divTeams.forEach(t => console.log(`    - ${t.name}`));
      });

      const unassigned = teams?.filter(t => !t.division_id) || [];
      if (unassigned.length > 0) {
        console.log(`  Unassigned: ${unassigned.length} teams`);
        unassigned.forEach(t => console.log(`    - ${t.name}`));
      }

      console.log('\n✓ Divisions already exist');
      return;
    }

    // Create default divisions if none exist
    console.log('\n⚠️  No divisions found. Creating default divisions...');
    
    const divisionsToCreate = [
      { name: 'Division 1', display_order: 1 },
      { name: 'Division 2', display_order: 2 }
    ];

    for (const divData of divisionsToCreate) {
      const { data: newDivision, error: createError } = await getContext().client
        .from('divisions')
        .insert({
          season_id: activeSeason.id,
          name: divData.name,
          display_order: divData.display_order
        })
        .select()
        .single();

      if (createError) {
        console.error(`✗ Error creating ${divData.name}:`, createError);
      } else {
        console.log(`✓ Created ${divData.name} (ID: ${newDivision.id})`);
      }
    }

    console.log('\n✓ Divisions created successfully!');
    console.log('\n📝 Next Steps:');
    console.log('  1. Assign teams to divisions using the Standings Manager');
    console.log('  2. Playoff odds will calculate automatically once teams are assigned');

  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
ensureDivisions()
  .then(() => {
    console.log('\n✓ Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n✗ Script failed:', error);
    process.exit(1);
  });


