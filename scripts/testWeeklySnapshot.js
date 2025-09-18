/**
 * Test script for weekly snapshot functionality
 * Tests the fixed database functions for timezone and ambiguous column issues
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

async function testWeeklySnapshotFunctions() {
  console.log('Testing weekly snapshot functions...');
  
  try {
    // Test 1: Check if get_current_nfl_week function works
    console.log('\n1. Testing get_current_nfl_week function...');
    const { data: currentWeek, error: weekError } = await supabase
      .rpc('get_current_nfl_week', { season_year: 2025 });
    
    if (weekError) {
      console.error('❌ get_current_nfl_week failed:', weekError);
    } else {
      console.log('✅ get_current_nfl_week succeeded. Current week:', currentWeek);
    }
    
    // Test 2: Check if should_trigger_weekly_snapshot function works
    console.log('\n2. Testing should_trigger_weekly_snapshot function...');
    const { data: snapshotCheck, error: snapshotError } = await supabase
      .rpc('should_trigger_weekly_snapshot', { season_year: 2025 });
    
    if (snapshotError) {
      console.error('❌ should_trigger_weekly_snapshot failed:', snapshotError);
    } else {
      console.log('✅ should_trigger_weekly_snapshot succeeded.');
      console.log('Snapshot data:', snapshotCheck);
    }
    
    // Test 3: Check NFL calendar data exists
    console.log('\n3. Testing NFL calendar data...');
    const { data: calendarData, error: calendarError } = await supabase
      .from('nfl_week_calendar')
      .select('*')
      .eq('season_year', 2025)
      .limit(5);
    
    if (calendarError) {
      console.error('❌ NFL calendar query failed:', calendarError);
    } else {
      console.log('✅ NFL calendar data exists. Sample weeks:', calendarData?.length || 0);
      if (calendarData && calendarData.length > 0) {
        console.log('First week:', calendarData[0]);
      }
    }
    
    // Test 4: Check seasons table
    console.log('\n4. Testing seasons data...');
    const { data: seasonsData, error: seasonsError } = await supabase
      .from('seasons')
      .select('*')
      .eq('year', 2025)
      .eq('is_active', true);
    
    if (seasonsError) {
      console.error('❌ Seasons query failed:', seasonsError);
    } else {
      console.log('✅ Seasons query succeeded. Active seasons for 2025:', seasonsData?.length || 0);
      if (seasonsData && seasonsData.length > 0) {
        console.log('Active season:', seasonsData[0]);
      }
    }
    
  } catch (error) {
    console.error('❌ Test script failed with error:', error);
  }
}

// Run the tests
testWeeklySnapshotFunctions()
  .then(() => {
    console.log('\n🎉 Test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test script crashed:', error);
    process.exit(1);
  });