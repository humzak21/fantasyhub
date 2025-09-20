#!/usr/bin/env node

/**
 * Sync Analytics for Specific Week
 * 
 * Usage: node scripts/sync-week.js [week_number]
 * Example: node scripts/sync-week.js 2
 */

import { FFAnalyticsService } from '../services/ffAnalyticsService.js';
import { supabaseAdmin } from '../services/supabaseClient.server.js';

async function syncWeek() {
  const weekArg = process.argv[2];
  const week = weekArg ? parseInt(weekArg) : 2; // Default to week 2
  
  console.log(`🏈 Starting analytics sync for Week ${week}...\n`);

  try {
    // Create analytics service
    const analyticsService = new FFAnalyticsService(supabaseAdmin);
    
    // Initialize service
    console.log('🔧 Initializing analytics service...');
    await analyticsService.initialize();
    console.log('✅ Service initialized successfully\n');

    // Sync analytics for the specified week
    console.log(`📊 Syncing analytics data for Week ${week}...`);
    const results = await analyticsService.updateAllPlayerAnalytics(week, true);
    
    console.log('\n🎉 Sync completed successfully!');
    console.log('📈 Results:');
    console.log(`   Week: ${results.week}`);
    console.log(`   Season: ${results.season}`);
    console.log(`   Duration: ${Math.round(results.duration / 1000)}s`);
    console.log(`   Players Processed: ${results.playersProcessed}`);
    console.log(`   Players Matched: ${results.playersMatched}`);
    console.log(`   Players Updated: ${results.playersUpdated}`);
    console.log(`   Teams Updated: ${results.teamsUpdated}`);
    console.log(`   Timestamp: ${results.timestamp}`);

    // Get service stats
    const stats = analyticsService.getStats();
    console.log('\n📊 Service Statistics:');
    console.log(`   Total Syncs: ${stats.totalSyncs}`);
    console.log(`   Successful Syncs: ${stats.successfulSyncs}`);
    console.log(`   Failed Syncs: ${stats.failedSyncs}`);
    console.log(`   Success Rate: ${Math.round((stats.successfulSyncs / stats.totalSyncs) * 100)}%`);

  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    
    if (error.type) {
      console.error(`   Error Type: ${error.type}`);
    }
    
    if (error.retryable) {
      console.error('   This error is retryable - you can try running the sync again');
    }
    
    if (error.details) {
      console.error('   Details:', JSON.stringify(error.details, null, 2));
    }
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check your internet connection');
    console.log('2. Verify R and ffanalytics are properly installed');
    console.log('3. Ensure Supabase credentials are correct');
    console.log('4. Check if fantasy football data sources are available');
    
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncWeek();
}

export { syncWeek };