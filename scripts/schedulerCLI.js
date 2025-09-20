#!/usr/bin/env node

/**
 * FFAnalytics Scheduler CLI Tool
 * 
 * Command-line interface for managing the FFAnalytics scheduler
 * 
 * Usage:
 *   node scripts/schedulerCLI.js status
 *   node scripts/schedulerCLI.js trigger [options]
 *   node scripts/schedulerCLI.js start
 *   node scripts/schedulerCLI.js stop
 *   node scripts/schedulerCLI.js health
 *   node scripts/schedulerCLI.js logs [count]
 *   node scripts/schedulerCLI.js alerts [acknowledged]
 */

import { program } from 'commander';
import { getSchedulerInstance } from '../services/ffAnalyticsScheduler.js';
import { getSchedulerConfig, validateSchedulerConfig } from '../config/scheduler-config.js';
import { supabaseClient } from '../services/supabaseClient.js';

// Global scheduler instance
let scheduler = null;

/**
 * Initialize scheduler with configuration
 */
async function initializeScheduler(options = {}) {
  try {
    const config = getSchedulerConfig(options);
    validateSchedulerConfig(config);
    
    scheduler = getSchedulerInstance(config);
    return scheduler;
  } catch (error) {
    console.error('Failed to initialize scheduler:', error.message);
    process.exit(1);
  }
}

/**
 * Display scheduler status
 */
async function showStatus() {
  const scheduler = await initializeScheduler();
  const status = scheduler.getStatus();
  
  console.log('\n=== FFAnalytics Scheduler Status ===');
  console.log(`Enabled: ${status.enabled}`);
  console.log(`Frequency: ${status.frequency}`);
  console.log(`Time: ${status.time} UTC`);
  console.log(`Running Jobs: ${status.runningJobs.length}`);
  console.log(`Scheduled Jobs: ${status.scheduledJobs.length}`);
  console.log(`Recent Failures (24h): ${status.recentFailures}`);
  
  if (status.runningJobs.length > 0) {
    console.log('\nRunning Jobs:');
    status.runningJobs.forEach(jobId => {
      console.log(`  - ${jobId}`);
    });
  }
  
  if (status.recentJobs.length > 0) {
    console.log('\nRecent Jobs:');
    status.recentJobs.forEach(job => {
      const timestamp = new Date(job.timestamp).toISOString();
      console.log(`  ${timestamp} - ${job.status} (${job.trigger}) - ${job.jobId}`);
    });
  }
}

/**
 * Trigger manual update
 */
async function triggerUpdate(options) {
  const scheduler = await initializeScheduler();
  
  console.log('Triggering manual update...');
  console.log('Options:', options);
  
  try {
    const result = await scheduler.triggerManualUpdate({
      week: options.week ? parseInt(options.week) : null,
      force: options.force || false,
      includeWeekly: options.weekly !== false,
      includeSeasonal: options.seasonal !== false
    });
    
    console.log('\n=== Update Completed Successfully ===');
    console.log(`Players Updated: ${result.playersUpdated}`);
    console.log(`Teams Updated: ${result.teamsUpdated}`);
    
    if (result.errors && result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(error => console.log(`  - ${error}`));
    }
    
  } catch (error) {
    console.error('\n=== Update Failed ===');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Start scheduler
 */
async function startScheduler() {
  const scheduler = await initializeScheduler();
  
  console.log('Starting scheduler...');
  scheduler.start();
  console.log('Scheduler started successfully');
  
  // Keep process alive
  console.log('Press Ctrl+C to stop the scheduler');
  
  process.on('SIGINT', async () => {
    console.log('\nShutting down scheduler...');
    await scheduler.shutdown();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\nShutting down scheduler...');
    await scheduler.shutdown();
    process.exit(0);
  });
}

/**
 * Stop scheduler
 */
async function stopScheduler() {
  const scheduler = await initializeScheduler();
  
  console.log('Stopping scheduler...');
  scheduler.stop();
  console.log('Scheduler stopped successfully');
}

/**
 * Perform health check
 */
async function performHealthCheck() {
  const scheduler = await initializeScheduler();
  
  console.log('Performing health check...');
  
  try {
    const healthCheck = await scheduler.performHealthCheck();
    
    console.log('\n=== Health Check Results ===');
    console.log(`Overall Status: ${healthCheck.overall.toUpperCase()}`);
    console.log(`Timestamp: ${healthCheck.timestamp}`);
    
    console.log('\nScheduler:');
    console.log(`  Enabled: ${healthCheck.scheduler.enabled}`);
    console.log(`  Running Jobs: ${healthCheck.scheduler.runningJobs}`);
    console.log(`  Scheduled Jobs: ${healthCheck.scheduler.scheduledJobs}`);
    console.log(`  Recent Failures: ${healthCheck.scheduler.recentFailures}`);
    
    console.log('\nServices:');
    Object.entries(healthCheck.services).forEach(([service, status]) => {
      console.log(`  ${service}: ${status.status.toUpperCase()}`);
      if (status.error) {
        console.log(`    Error: ${status.error}`);
      }
    });
    
    if (healthCheck.error) {
      console.log(`\nError: ${healthCheck.error}`);
    }
    
  } catch (error) {
    console.error('\n=== Health Check Failed ===');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Show job logs
 */
async function showLogs(count = 20) {
  try {
    const { data: logs, error } = await supabaseClient
      .from('analytics_job_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(count));
    
    if (error) throw error;
    
    console.log(`\n=== Recent Job Logs (${logs.length}) ===`);
    
    if (logs.length === 0) {
      console.log('No job logs found');
      return;
    }
    
    logs.forEach(log => {
      const timestamp = new Date(log.created_at).toISOString();
      const duration = log.details?.duration ? `${Math.round(log.details.duration)}ms` : 'N/A';
      
      console.log(`${timestamp} - ${log.status.toUpperCase()} (${log.trigger}) - ${log.job_id}`);
      
      if (log.details?.playersUpdated !== undefined) {
        console.log(`  Players: ${log.details.playersUpdated}, Teams: ${log.details.teamsUpdated || 0}, Duration: ${duration}`);
      }
      
      if (log.details?.error) {
        console.log(`  Error: ${log.details.error}`);
      }
      
      console.log('');
    });
    
  } catch (error) {
    console.error('Failed to fetch logs:', error.message);
    process.exit(1);
  }
}

/**
 * Show alerts
 */
async function showAlerts(acknowledgedFilter = null) {
  try {
    let query = supabaseClient
      .from('analytics_alerts')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (acknowledgedFilter !== null) {
      query = query.eq('acknowledged', acknowledgedFilter === 'true');
    }
    
    const { data: alerts, error } = await query.limit(50);
    
    if (error) throw error;
    
    const filterText = acknowledgedFilter === null ? 'All' : 
                      acknowledgedFilter === 'true' ? 'Acknowledged' : 'Unacknowledged';
    
    console.log(`\n=== ${filterText} Alerts (${alerts.length}) ===`);
    
    if (alerts.length === 0) {
      console.log('No alerts found');
      return;
    }
    
    alerts.forEach(alert => {
      const timestamp = new Date(alert.created_at).toISOString();
      const ackStatus = alert.acknowledged ? 
        `ACK by ${alert.acknowledged_by} at ${new Date(alert.acknowledged_at).toISOString()}` : 
        'UNACKNOWLEDGED';
      
      console.log(`${timestamp} - ${alert.severity.toUpperCase()} - ${alert.type}`);
      console.log(`  Status: ${ackStatus}`);
      
      if (alert.data?.error) {
        console.log(`  Error: ${alert.data.error}`);
      }
      
      if (alert.data?.jobId) {
        console.log(`  Job ID: ${alert.data.jobId}`);
      }
      
      console.log('');
    });
    
  } catch (error) {
    console.error('Failed to fetch alerts:', error.message);
    process.exit(1);
  }
}

/**
 * Acknowledge alert
 */
async function acknowledgeAlert(alertId, acknowledgedBy = 'CLI') {
  try {
    const { error } = await supabaseClient
      .from('analytics_alerts')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: acknowledgedBy
      })
      .eq('id', alertId);
    
    if (error) throw error;
    
    console.log(`Alert ${alertId} acknowledged successfully`);
    
  } catch (error) {
    console.error('Failed to acknowledge alert:', error.message);
    process.exit(1);
  }
}

// CLI Command Setup
program
  .name('scheduler-cli')
  .description('FFAnalytics Scheduler CLI Tool')
  .version('1.0.0');

program
  .command('status')
  .description('Show scheduler status')
  .action(showStatus);

program
  .command('trigger')
  .description('Trigger manual update')
  .option('-w, --week <week>', 'Specific week to update')
  .option('-f, --force', 'Force update even if data exists')
  .option('--no-weekly', 'Skip weekly projections')
  .option('--no-seasonal', 'Skip seasonal projections')
  .action(triggerUpdate);

program
  .command('start')
  .description('Start the scheduler')
  .action(startScheduler);

program
  .command('stop')
  .description('Stop the scheduler')
  .action(stopScheduler);

program
  .command('health')
  .description('Perform health check')
  .action(performHealthCheck);

program
  .command('logs')
  .description('Show job logs')
  .argument('[count]', 'Number of logs to show', '20')
  .action(showLogs);

program
  .command('alerts')
  .description('Show alerts')
  .argument('[acknowledged]', 'Filter by acknowledged status (true/false)')
  .action(showAlerts);

program
  .command('ack')
  .description('Acknowledge alert')
  .argument('<alertId>', 'Alert ID to acknowledge')
  .option('-u, --user <user>', 'User acknowledging the alert', 'CLI')
  .action((alertId, options) => acknowledgeAlert(alertId, options.user));

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}