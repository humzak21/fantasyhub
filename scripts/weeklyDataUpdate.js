#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createRosterUpdateScript } from '../services/espnRosterUpdater.js';
import { createScheduleFetcher } from '../services/espnScheduleFetcher.js';
import { ESPN_CONFIG } from '../config/espn-config.js';
import { automationLogger } from '../services/automationLogger.js';

const config = ESPN_CONFIG;

class WeeklyDataUpdater {
  constructor() {
    this.rosterScript = null;
    this.scheduleFetcher = null;
  }

  async initialize() {
    if (!config.leagueId) {
      throw new Error('League ID not configured in ESPN_CONFIG');
    }

    await automationLogger.logStart('weekly_update', {
      leagueId: config.leagueId,
      seasonYear: config.seasonYear,
      hasPrivateAccess: !!config.espnS2
    });

    console.log(`🔧 Initializing weekly data update...`);
    console.log(`   League ID: ${config.leagueId}`);
    console.log(`   Season: ${config.seasonYear}`);
    console.log(`   Private League: ${config.espnS2 ? 'Yes' : 'No'}`);

    try {
      this.rosterScript = await createRosterUpdateScript(
        config.leagueId,
        config.seasonYear,
        config.espnS2,
        config.swid
      );

      this.scheduleFetcher = await createScheduleFetcher(
        config.leagueId,
        config.seasonYear,
        config.espnS2,
        config.swid
      );

      console.log('✅ Services initialized successfully');
    } catch (error) {
      await automationLogger.logFailure('weekly_update', error, {
        step: 'initialization',
        leagueId: config.leagueId
      });
      throw error;
    }
  }

  async testConnection() {
    console.log('🧪 Testing ESPN connection...');

    try {
      const testResult = await this.rosterScript.testConnection();

      if (!testResult.success) {
        throw new Error(`Connection test failed: ${testResult.error || 'Unknown error'}`);
      }

      console.log('✅ Connection test successful');
      return testResult;
    } catch (error) {
      await automationLogger.logFailure('connection_test', error, {
        leagueId: config.leagueId
      });
      throw error;
    }
  }

  async updateRosters() {
    console.log('🔄 Starting roster update...');

    try {
      await automationLogger.logStart('roster_update', {
        leagueId: config.leagueId,
        seasonYear: config.seasonYear
      });

      const rosterResult = await this.rosterScript.runWeeklyUpdate();

      await automationLogger.logSuccess('roster_update', {
        result: rosterResult,
        leagueId: config.leagueId
      });

      console.log('✅ Roster update completed successfully');
      return rosterResult;
    } catch (error) {
      await automationLogger.logFailure('roster_update', error, {
        leagueId: config.leagueId
      });
      throw error;
    }
  }

  async updateSchedule() {
    console.log('📅 Starting schedule update...');

    try {
      await automationLogger.logStart('schedule_update', {
        leagueId: config.leagueId,
        seasonYear: config.seasonYear
      });

      const scheduleResult = await this.scheduleFetcher.getFullSeason(true);

      await automationLogger.logSuccess('schedule_update', {
        totalMatchups: scheduleResult.totalMatchups,
        weekCount: scheduleResult.weekNumbers.length,
        dbImportId: scheduleResult.dbImport?.importId,
        leagueId: config.leagueId
      });

      console.log('✅ Schedule update completed successfully');
      console.log(`   Total Matchups: ${scheduleResult.totalMatchups}`);
      console.log(`   Weeks: ${scheduleResult.weekNumbers.join(', ')}`);

      return scheduleResult;
    } catch (error) {
      await automationLogger.logFailure('schedule_update', error, {
        leagueId: config.leagueId
      });
      throw error;
    }
  }

  async runFullUpdate() {
    const startTime = Date.now();

    try {
      console.log('🚀 Starting weekly data update process...');

      await this.initialize();

      // Test connection first
      await this.testConnection();

      // Update rosters
      const rosterResult = await this.updateRosters();

      // Update schedule
      const scheduleResult = await this.updateSchedule();

      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);

      const summary = {
        success: true,
        duration: `${duration}s`,
        rosterUpdates: rosterResult,
        scheduleUpdates: {
          totalMatchups: scheduleResult.totalMatchups,
          weekCount: scheduleResult.weekNumbers.length,
          dbImportId: scheduleResult.dbImport?.importId
        }
      };

      await automationLogger.logSuccess('weekly_update', summary);

      console.log('🎉 Weekly update completed successfully!');
      console.log(`   Duration: ${duration} seconds`);

      return summary;
    } catch (error) {
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);

      await automationLogger.logFailure('weekly_update', error, {
        duration: `${duration}s`,
        leagueId: config.leagueId
      });

      console.error('❌ Weekly update failed:', error.message);
      throw error;
    }
  }

  async runWithRetry(maxRetries = 3, retryDelay = 30000) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📡 Attempt ${attempt}/${maxRetries}`);
        const result = await this.runFullUpdate();

        if (attempt > 1) {
          await automationLogger.logSuccess('retry_success', {
            attempt,
            maxRetries,
            leagueId: config.leagueId
          });
        }

        return result;
      } catch (error) {
        lastError = error;

        await automationLogger.logFailure('weekly_update_attempt', error, {
          attempt,
          maxRetries,
          leagueId: config.leagueId
        });

        if (attempt < maxRetries) {
          console.log(`⏳ Waiting ${retryDelay / 1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw lastError;
  }
}

// Export for use in automation scheduler
export { WeeklyDataUpdater };

// CLI usage
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'full';

  const updater = new WeeklyDataUpdater();

  try {
    switch (command) {
      case 'test':
        await updater.initialize();
        await updater.testConnection();
        console.log('✅ Connection test passed');
        break;

      case 'rosters':
        await updater.initialize();
        await updater.updateRosters();
        break;

      case 'schedule':
        await updater.initialize();
        await updater.updateSchedule();
        break;

      case 'full':
        await updater.runWithRetry();
        break;

      case 'no-retry':
        await updater.runFullUpdate();
        break;

      default:
        console.log(`
🏈 Weekly Data Update Script
===========================

Usage: node scripts/weeklyDataUpdate.js [command]

Commands:
  test       - Test ESPN connection only
  rosters    - Update rosters only
  schedule   - Update schedule only
  full       - Run complete update with retry logic (default)
  no-retry   - Run complete update without retry

Examples:
  node scripts/weeklyDataUpdate.js test
  node scripts/weeklyDataUpdate.js full
        `);
        process.exit(0);
    }

    console.log('✨ Operation completed successfully');
  } catch (error) {
    console.error('❌ Operation failed:', error.message);

    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('💡 This might be a private league authentication issue.');
      console.error('   Check your espnS2 and swid cookies in config/espn-config.js');
    }

    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}