/**
 * FFAnalyticsScheduler - Handles scheduled data updates and automation for ffanalytics integration
 * 
 * Features:
 * - Scheduled daily/weekly data updates
 * - Retry logic with exponential backoff
 * - Error handling and monitoring
 * - Manual trigger capabilities
 * - Health checks and alerting
 */

import cron from 'node-cron';
import { FFAnalyticsService } from './ffAnalyticsService.js';
import { supabaseAdmin as supabaseClient } from './supabaseClient.server.js';

export class FFAnalyticsScheduler {
  constructor(config = {}) {
    this.config = {
      // Default configuration
      enabled: config.enabled ?? true,
      frequency: config.frequency ?? 'daily', // daily, weekly, manual
      time: config.time ?? '06:00', // UTC time for daily updates
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 300000, // 5 minutes
      maxConcurrentJobs: config.maxConcurrentJobs ?? 1,
      healthCheckInterval: config.healthCheckInterval ?? 3600000, // 1 hour
      alertingEnabled: config.alertingEnabled ?? true,
      ...config
    };

    this.ffAnalyticsService = new FFAnalyticsService(supabaseClient, config.ffAnalyticsConfig);
    this.scheduledJobs = new Map();
    this.runningJobs = new Set();
    this.jobHistory = [];
    this.maxHistorySize = 100;
    this.isShuttingDown = false;

    this.initializeScheduler();
  }

  /**
   * Initialize the scheduler with configured jobs
   */
  initializeScheduler() {
    if (!this.config.enabled) {
      console.log('FFAnalyticsScheduler: Scheduler is disabled');
      return;
    }

    // Schedule main data update job
    this.scheduleDataUpdates();

    // Schedule health check job
    this.scheduleHealthChecks();

    console.log('FFAnalyticsScheduler: Scheduler initialized successfully');
  }

  /**
   * Schedule data update jobs based on configuration
   */
  scheduleDataUpdates() {
    const { frequency, time } = this.config;

    let cronExpression;
    switch (frequency) {
      case 'daily':
        // Daily at specified time (UTC)
        const [hour, minute] = time.split(':');
        cronExpression = `${minute} ${hour} * * *`;
        break;
      case 'weekly':
        // Weekly on Sunday at specified time (UTC)
        const [weeklyHour, weeklyMinute] = time.split(':');
        cronExpression = `${weeklyMinute} ${weeklyHour} * * 0`;
        break;
      case 'manual':
        console.log('FFAnalyticsScheduler: Manual mode - no automatic scheduling');
        return;
      default:
        throw new Error(`Invalid frequency: ${frequency}`);
    }

    const job = cron.schedule(cronExpression, async () => {
      await this.executeScheduledUpdate('automatic');
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.scheduledJobs.set('dataUpdate', job);
    job.start();

    console.log(`FFAnalyticsScheduler: Scheduled ${frequency} data updates at ${time} UTC`);
  }

  /**
   * Schedule health check jobs
   */
  scheduleHealthChecks() {
    // Health check every hour
    const healthCheckJob = cron.schedule('0 * * * *', async () => {
      await this.performHealthCheck();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.scheduledJobs.set('healthCheck', healthCheckJob);
    healthCheckJob.start();

    console.log('FFAnalyticsScheduler: Scheduled hourly health checks');
  }

  /**
   * Execute a scheduled data update with retry logic
   */
  async executeScheduledUpdate(trigger = 'manual', options = {}) {
    const jobId = `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (this.runningJobs.size >= this.config.maxConcurrentJobs) {
      const error = new Error('Maximum concurrent jobs limit reached');
      await this.logJobResult(jobId, 'failed', trigger, { error: error.message });
      throw error;
    }

    this.runningJobs.add(jobId);
    const startTime = Date.now();

    try {
      console.log(`FFAnalyticsScheduler: Starting scheduled update (${jobId}) - trigger: ${trigger}`);

      // Execute the update with retry logic
      const result = await this.executeWithRetry(async () => {
        return await this.performDataUpdate(options);
      }, this.config.retryAttempts);

      const duration = Date.now() - startTime;
      await this.logJobResult(jobId, 'success', trigger, { 
        duration,
        playersUpdated: result.playersUpdated,
        teamsUpdated: result.teamsUpdated
      });

      console.log(`FFAnalyticsScheduler: Update completed successfully (${jobId}) - ${duration}ms`);
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logJobResult(jobId, 'failed', trigger, { 
        duration,
        error: error.message,
        stack: error.stack
      });

      console.error(`FFAnalyticsScheduler: Update failed (${jobId}):`, error);
      
      if (this.config.alertingEnabled) {
        await this.sendAlert('update_failed', {
          jobId,
          trigger,
          error: error.message,
          duration
        });
      }

      throw error;
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  /**
   * Perform the actual data update
   */
  async performDataUpdate(options = {}) {
    const {
      week = null,
      force = false,
      includeWeekly = true,
      includeSeasonal = true
    } = options;

    const results = {
      playersUpdated: 0,
      teamsUpdated: 0,
      errors: []
    };

    try {
      // Update weekly projections if enabled
      if (includeWeekly) {
        console.log('FFAnalyticsScheduler: Updating weekly projections...');
        await this.ffAnalyticsService.syncWeeklyProjections(week);
        console.log('FFAnalyticsScheduler: Weekly projections updated');
      }

      // Update seasonal projections if enabled
      if (includeSeasonal) {
        console.log('FFAnalyticsScheduler: Updating seasonal projections...');
        await this.ffAnalyticsService.syncSeasonProjections();
        console.log('FFAnalyticsScheduler: Seasonal projections updated');
      }

      // Update all player analytics
      console.log('FFAnalyticsScheduler: Updating player analytics...');
      const updateResult = await this.ffAnalyticsService.updateAllPlayerAnalytics(week, force);
      results.playersUpdated = updateResult.playersUpdated || 0;

      // Update team analytics summaries
      console.log('FFAnalyticsScheduler: Updating team analytics...');
      const teamResult = await this.updateAllTeamAnalytics(week);
      results.teamsUpdated = teamResult.teamsUpdated || 0;

      return results;

    } catch (error) {
      results.errors.push(error.message);
      throw error;
    }
  }

  /**
   * Update analytics for all teams
   */
  async updateAllTeamAnalytics(week = null) {
    try {
      // Get all teams from database
      const { data: teams, error } = await supabaseClient
        .from('teams')
        .select('id, name');

      if (error) throw error;

      // Handle case where teams is null or undefined
      if (!teams || !Array.isArray(teams)) {
        console.warn('No teams found or invalid teams data');
        return { teamsUpdated: 0 };
      }

      let teamsUpdated = 0;
      for (const team of teams) {
        try {
          await this.ffAnalyticsService.getTeamAnalyticsScore(team.id, week);
          teamsUpdated++;
        } catch (error) {
          console.error(`Failed to update analytics for team ${team.name}:`, error);
        }
      }

      return { teamsUpdated };
    } catch (error) {
      console.error('Failed to update team analytics:', error);
      throw error;
    }
  }

  /**
   * Execute function with retry logic and exponential backoff
   */
  async executeWithRetry(fn, maxAttempts = 3, baseDelay = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`FFAnalyticsScheduler: Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`);
        
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Perform health check on the scheduler and services
   */
  async performHealthCheck() {
    const healthCheck = {
      timestamp: new Date().toISOString(),
      scheduler: {
        enabled: this.config.enabled,
        runningJobs: this.runningJobs.size,
        scheduledJobs: this.scheduledJobs.size,
        recentFailures: this.getRecentFailures()
      },
      services: {},
      overall: 'healthy'
    };

    try {
      // Check FFAnalyticsService health
      healthCheck.services.ffAnalytics = await this.checkServiceHealth();

      // Check database connectivity
      healthCheck.services.database = await this.checkDatabaseHealth();

      // Determine overall health
      const hasFailures = healthCheck.scheduler.recentFailures > 3;
      const servicesHealthy = Object.values(healthCheck.services).every(s => s.status === 'healthy');
      
      if (hasFailures || !servicesHealthy) {
        healthCheck.overall = 'degraded';
      }

      // Log health check results
      await this.logHealthCheck(healthCheck);

      // Send alert if unhealthy
      if (healthCheck.overall !== 'healthy' && this.config.alertingEnabled) {
        await this.sendAlert('health_check_failed', healthCheck);
      }

    } catch (error) {
      healthCheck.overall = 'unhealthy';
      healthCheck.error = error.message;
      
      console.error('FFAnalyticsScheduler: Health check failed:', error);
      
      if (this.config.alertingEnabled) {
        await this.sendAlert('health_check_error', { error: error.message });
      }
    }

    return healthCheck;
  }

  /**
   * Check FFAnalyticsService health
   */
  async checkServiceHealth() {
    try {
      // Simple health check - try to get configuration
      const config = this.ffAnalyticsService.config;
      return {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
        config: !!config
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Check database connectivity
   */
  async checkDatabaseHealth() {
    try {
      const { data, error } = await supabaseClient
        .from('players')
        .select('count')
        .limit(1);

      if (error) throw error;

      return {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
        connected: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Get count of recent failures (last 24 hours)
   */
  getRecentFailures() {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    return this.jobHistory.filter(job => 
      job.timestamp > oneDayAgo && job.status === 'failed'
    ).length;
  }

  /**
   * Manual trigger for immediate data refresh
   */
  async triggerManualUpdate(options = {}) {
    console.log('FFAnalyticsScheduler: Manual update triggered');
    return await this.executeScheduledUpdate('manual', options);
  }

  /**
   * Get scheduler status and statistics
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      frequency: this.config.frequency,
      time: this.config.time,
      runningJobs: Array.from(this.runningJobs),
      scheduledJobs: Array.from(this.scheduledJobs.keys()),
      recentJobs: this.jobHistory.slice(-10),
      recentFailures: this.getRecentFailures(),
      config: this.config
    };
  }

  /**
   * Log job execution result
   */
  async logJobResult(jobId, status, trigger, details = {}) {
    const jobResult = {
      jobId,
      status,
      trigger,
      timestamp: Date.now(),
      details
    };

    // Add to in-memory history
    this.jobHistory.push(jobResult);
    if (this.jobHistory.length > this.maxHistorySize) {
      this.jobHistory.shift();
    }

    // Log to database if available
    try {
      await supabaseClient
        .from('analytics_job_log')
        .insert({
          job_id: jobId,
          status,
          trigger,
          details,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Failed to log job result to database:', error);
    }

    console.log(`FFAnalyticsScheduler: Job ${jobId} ${status} (${trigger})`, details);
  }

  /**
   * Log health check results
   */
  async logHealthCheck(healthCheck) {
    try {
      await supabaseClient
        .from('analytics_health_log')
        .insert({
          status: healthCheck.overall,
          details: healthCheck,
          created_at: healthCheck.timestamp
        });
    } catch (error) {
      console.error('Failed to log health check to database:', error);
    }
  }

  /**
   * Send alert for critical issues
   */
  async sendAlert(type, data) {
    const alert = {
      type,
      timestamp: new Date().toISOString(),
      data,
      severity: this.getAlertSeverity(type)
    };

    console.warn(`FFAnalyticsScheduler ALERT [${alert.severity}]: ${type}`, data);

    // Here you could integrate with external alerting systems
    // Examples: email, Slack, PagerDuty, etc.
    
    try {
      await supabaseClient
        .from('analytics_alerts')
        .insert({
          type,
          severity: alert.severity,
          data,
          created_at: alert.timestamp
        });
    } catch (error) {
      console.error('Failed to log alert to database:', error);
    }
  }

  /**
   * Get alert severity based on type
   */
  getAlertSeverity(type) {
    const severityMap = {
      'update_failed': 'medium',
      'health_check_failed': 'medium',
      'health_check_error': 'high',
      'service_unavailable': 'high',
      'database_error': 'high'
    };

    return severityMap[type] || 'low';
  }

  /**
   * Start the scheduler
   */
  start() {
    if (!this.config.enabled) {
      console.log('FFAnalyticsScheduler: Cannot start - scheduler is disabled');
      return;
    }

    this.scheduledJobs.forEach((job, name) => {
      job.start();
      console.log(`FFAnalyticsScheduler: Started job: ${name}`);
    });

    console.log('FFAnalyticsScheduler: All jobs started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    this.isShuttingDown = true;

    this.scheduledJobs.forEach((job, name) => {
      job.stop();
      console.log(`FFAnalyticsScheduler: Stopped job: ${name}`);
    });

    console.log('FFAnalyticsScheduler: All jobs stopped');
  }

  /**
   * Graceful shutdown - wait for running jobs to complete
   */
  async shutdown(timeout = 30000) {
    console.log('FFAnalyticsScheduler: Initiating graceful shutdown...');
    
    this.stop();

    // Wait for running jobs to complete
    const startTime = Date.now();
    while (this.runningJobs.size > 0 && (Date.now() - startTime) < timeout) {
      console.log(`FFAnalyticsScheduler: Waiting for ${this.runningJobs.size} jobs to complete...`);
      await this.sleep(1000);
    }

    if (this.runningJobs.size > 0) {
      console.warn(`FFAnalyticsScheduler: Shutdown timeout - ${this.runningJobs.size} jobs still running`);
    } else {
      console.log('FFAnalyticsScheduler: Graceful shutdown completed');
    }
  }

  /**
   * Utility function for sleeping
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
let schedulerInstance = null;

export function getSchedulerInstance(config = {}) {
  if (!schedulerInstance) {
    schedulerInstance = new FFAnalyticsScheduler(config);
  }
  return schedulerInstance;
}

export function createScheduler(config = {}) {
  return new FFAnalyticsScheduler(config);
}