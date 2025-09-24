import cron from 'node-cron';
import { WeeklyDataUpdater } from '../scripts/weeklyDataUpdate.js';
import { automationLogger } from './automationLogger.js';

export class AutomationScheduler {
  constructor() {
    this.tasks = new Map();
    this.isRunning = false;
    this.lastRunTime = null;
    this.nextRunTime = null;
  }

  init() {
    // Only initialize in production or if explicitly enabled
    const enableAutomation = process.env.ENABLE_AUTOMATION === 'true' ||
                           process.env.NODE_ENV === 'production';

    if (!enableAutomation) {
      console.log('🚫 Automation disabled (ENABLE_AUTOMATION=false or development mode)');
      return false;
    }

    try {
      this.scheduleWeeklyUpdate();
      console.log('✅ Automation scheduler initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize automation scheduler:', error.message);
      return false;
    }
  }

  scheduleWeeklyUpdate() {
    // Default: Tuesday at 5 AM (0 5 * * 2)
    // Allow override via environment variable
    const schedule = process.env.AUTOMATION_SCHEDULE || '0 5 * * 2';

    console.log(`📅 Scheduling weekly data update: ${schedule}`);

    // Validate cron expression
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron schedule: ${schedule}`);
    }

    const task = cron.schedule(schedule, async () => {
      await this.runWeeklyUpdate();
    }, {
      scheduled: true,
      timezone: process.env.AUTOMATION_TIMEZONE || 'America/New_York'
    });

    this.tasks.set('weekly_update', task);

    // Calculate next run time for display
    this.updateNextRunTime(schedule);

    console.log(`⏰ Next weekly update scheduled for: ${this.nextRunTime}`);
  }

  updateNextRunTime(schedule) {
    try {
      // This is a simplified calculation - in production you might want to use a library like 'cron-parser'
      const now = new Date();
      const parts = schedule.split(' ');

      if (parts.length === 5) {
        const [minute, hour, , , dayOfWeek] = parts;

        const nextRun = new Date(now);
        nextRun.setHours(parseInt(hour), parseInt(minute), 0, 0);

        // If it's Tuesday and the time hasn't passed, use today
        // Otherwise, find next Tuesday
        const currentDay = now.getDay();
        const targetDay = parseInt(dayOfWeek); // 2 = Tuesday

        if (currentDay === targetDay && now.getTime() < nextRun.getTime()) {
          // Today, but time hasn't passed yet
        } else {
          // Find next occurrence
          const daysUntilNext = (targetDay + 7 - currentDay) % 7 || 7;
          nextRun.setDate(nextRun.getDate() + daysUntilNext);
        }

        this.nextRunTime = nextRun.toLocaleString();
      }
    } catch (error) {
      this.nextRunTime = 'Unable to calculate';
    }
  }

  async runWeeklyUpdate() {
    if (this.isRunning) {
      console.log('⚠️  Weekly update already in progress, skipping...');
      await automationLogger.logFailure('weekly_update_scheduled',
        new Error('Update already in progress'),
        { trigger: 'scheduled' }
      );
      return;
    }

    this.isRunning = true;
    this.lastRunTime = new Date().toISOString();

    try {
      console.log('🔄 Starting scheduled weekly data update...');

      await automationLogger.logStart('weekly_update_scheduled', {
        trigger: 'scheduled',
        timestamp: this.lastRunTime
      });

      const updater = new WeeklyDataUpdater();
      const result = await updater.runWithRetry(3, 60000); // 3 retries, 1 minute delay

      await automationLogger.logSuccess('weekly_update_scheduled', {
        ...result,
        trigger: 'scheduled',
        timestamp: this.lastRunTime
      });

      console.log('✅ Scheduled weekly update completed successfully');
    } catch (error) {
      console.error('❌ Scheduled weekly update failed:', error.message);

      await automationLogger.logFailure('weekly_update_scheduled', error, {
        trigger: 'scheduled',
        timestamp: this.lastRunTime
      });

      // In a production environment, you might want to:
      // 1. Send email notifications
      // 2. Post to Slack/Discord
      // 3. Create alerts in monitoring systems
    } finally {
      this.isRunning = false;

      // Update next run time
      const schedule = process.env.AUTOMATION_SCHEDULE || '0 5 * * 2';
      this.updateNextRunTime(schedule);
    }
  }

  async runManualUpdate() {
    if (this.isRunning) {
      throw new Error('Weekly update already in progress');
    }

    this.isRunning = true;

    try {
      console.log('🔄 Starting manual weekly data update...');

      await automationLogger.logStart('weekly_update_manual', {
        trigger: 'manual',
        timestamp: new Date().toISOString()
      });

      const updater = new WeeklyDataUpdater();
      const result = await updater.runWithRetry(2, 30000); // 2 retries, 30 second delay

      await automationLogger.logSuccess('weekly_update_manual', {
        ...result,
        trigger: 'manual'
      });

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      nextRunTime: this.nextRunTime,
      activeTasks: Array.from(this.tasks.keys()),
      schedule: process.env.AUTOMATION_SCHEDULE || '0 5 * * 2',
      timezone: process.env.AUTOMATION_TIMEZONE || 'America/New_York',
      enabled: this.tasks.size > 0
    };
  }

  async getLogs(limit = 20) {
    return await automationLogger.getRecentLogs(limit);
  }

  async getStats(days = 7) {
    return await automationLogger.getLogStats(days);
  }

  stop() {
    this.tasks.forEach((task, name) => {
      task.stop();
      console.log(`🛑 Stopped task: ${name}`);
    });
    this.tasks.clear();
    console.log('🛑 Automation scheduler stopped');
  }

  restart() {
    this.stop();
    return this.init();
  }
}

// Singleton instance
export const automationScheduler = new AutomationScheduler();