#!/usr/bin/env node

/**
 * Analytics Sync Script
 * 
 * This script manually triggers analytics data synchronization.
 * Can be run via cron job for automated updates.
 * 
 * Usage: 
 *   node scripts/sync-analytics.js              # Sync current week
 *   node scripts/sync-analytics.js --week=10    # Sync specific week
 *   node scripts/sync-analytics.js --force      # Force update
 */

import { FFAnalyticsService } from '../services/ffAnalyticsService.js';
import { supabaseAdmin } from '../services/supabaseClient.js';

async function syncAnalytics() {
  const args = process.argv.slice(2);
  const week = args.find(arg => arg.startsWith('--week='))?.split('=')[1];
  const force = args.includes('--force');

  console.log('🔄 Starting analytics sync...');
  console.log(`Week: ${week || 'current'}`);
  console.log(`Force: ${force}`);
  console.log('');

  try {
    // Initialize analytics service
    const analyticsService = new FFAnalyticsService(supabaseAdmin);
    await analyticsService.initialize();

    // Run the sync
    const results = await analyticsService.updateAllPlayerAnalytics(
      week ? parseInt(week) : null,
      force
    );

    console.log('✅ Analytics sync completed successfully!');
    console.log('');
    console.log('📊 Results:');
    console.log(`- Week: ${results.week}`);
    console.log(`- Season: ${results.season}`);
    console.log(`- Duration: ${(results.duration / 1000).toFixed(2)}s`);
    console.log(`- Players processed: ${results.playersProcessed}`);
    console.log(`- Players matched: ${results.playersMatched}`);
    console.log(`- Players updated: ${results.playersUpdated}`);
    console.log(`- Teams updated: ${results.teamsUpdated}`);

  } catch (error) {
    console.error('❌ Analytics sync failed:', error.message);
    console.error('');
    console.error('🔧 Troubleshooting:');
    console.error('1. Check R environment: node scripts/setup-analytics.js');
    console.error('2. Verify database connection');
    console.error('3. Check ffanalytics data sources are available');
    
    process.exit(1);
  }
}

// Run sync if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncAnalytics();
}

export { syncAnalytics };