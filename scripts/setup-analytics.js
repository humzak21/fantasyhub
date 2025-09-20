#!/usr/bin/env node

/**
 * Analytics Setup Script
 * 
 * This script helps set up the analytics environment and test the connection.
 * 
 * Usage: node scripts/setup-analytics.js
 */

import { FFAnalyticsService } from '../services/ffAnalyticsService.js';
import { supabaseAdmin } from '../services/supabaseClient.server.js';
import { RScriptExecutor } from '../services/rScriptExecutor.js';

async function setupAnalytics() {
  console.log('🚀 Setting up FFAnalytics environment...\n');

  try {
    // Step 1: Test R environment
    console.log('1. Testing R environment...');
    const rExecutor = new RScriptExecutor();
    const rTest = await rExecutor.testEnvironment();
    
    if (rTest.success) {
      console.log(`✅ R environment ready: ${rTest.rVersion}`);
      console.log(`✅ ffanalytics available: ${rTest.ffanalyticsAvailable}`);
    } else {
      console.log(`❌ R environment test failed: ${rTest.error}`);
      console.log('\n📋 To fix this:');
      console.log('1. Install R: brew install r (macOS) or apt-get install r-base (Ubuntu)');
      console.log('2. Install ffanalytics: Rscript -e "install.packages(\'ffanalytics\')"');
      return;
    }

    // Step 2: Test database connection
    console.log('\n2. Testing database connection...');
    const analyticsService = new FFAnalyticsService(supabaseAdmin);
    await analyticsService.initialize();
    console.log('✅ Database connection successful');

    // Step 3: Test analytics data scraping
    console.log('\n3. Testing analytics data scraping...');
    try {
      const testResult = await analyticsService.syncWeeklyProjections(1);
      if (testResult.success) {
        console.log(`✅ Successfully scraped ${testResult.data?.length || 0} player records`);
      } else {
        console.log('❌ Analytics data scraping failed');
      }
    } catch (error) {
      console.log(`⚠️  Analytics scraping test failed: ${error.message}`);
      console.log('This is normal if ffanalytics sources are unavailable');
    }

    // Step 4: Check database tables
    console.log('\n4. Checking database tables...');
    const tables = [
      'players',
      'player_analytics_history', 
      'team_analytics_summary'
    ];

    for (const table of tables) {
      try {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select('*')
          .limit(1);
        
        if (error) {
          console.log(`❌ Table '${table}' not accessible: ${error.message}`);
        } else {
          console.log(`✅ Table '${table}' accessible`);
        }
      } catch (error) {
        console.log(`❌ Table '${table}' check failed: ${error.message}`);
      }
    }

    console.log('\n🎉 Analytics setup complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Run: npm run analytics:sync to sync weekly data');
    console.log('2. Check the UI for analytics indicators');
    console.log('3. Set up cron jobs for automatic updates');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check your .env file has correct Supabase credentials');
    console.log('2. Ensure R is installed and ffanalytics package is available');
    console.log('3. Verify database tables exist and are accessible');
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupAnalytics();
}

export { setupAnalytics };