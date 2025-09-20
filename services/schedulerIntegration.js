/**
 * FFAnalytics Scheduler Integration
 * 
 * Provides easy integration of the scheduler into the main application
 * Handles initialization, configuration, and lifecycle management
 */

import { getSchedulerInstance } from './ffAnalyticsScheduler.js';
import { getEnvironmentConfig } from '../config/scheduler-config.js';

// Global scheduler instance
let globalScheduler = null;
let isInitialized = false;

/**
 * Initialize the scheduler with environment-specific configuration
 */
export async function initializeScheduler(environment = null, customConfig = {}) {
  if (isInitialized && globalScheduler) {
    console.log('FFAnalytics Scheduler already initialized');
    return globalScheduler;
  }

  try {
    // Determine environment
    const env = environment || process.env.NODE_ENV || 'production';
    
    // Get environment-specific configuration
    const config = getEnvironmentConfig(env);
    
    // Apply custom configuration overrides
    const finalConfig = {
      ...config,
      ...customConfig,
      ffAnalyticsConfig: {
        ...config.ffAnalyticsConfig,
        ...customConfig.ffAnalyticsConfig
      }
    };

    console.log(`Initializing FFAnalytics Scheduler for ${env} environment...`);
    
    // Create scheduler instance
    globalScheduler = getSchedulerInstance(finalConfig);
    
    // Start scheduler if enabled
    if (finalConfig.enabled && finalConfig.frequency !== 'manual') {
      globalScheduler.start();
      console.log('FFAnalytics Scheduler started successfully');
    } else {
      console.log('FFAnalytics Scheduler initialized but not started (disabled or manual mode)');
    }

    isInitialized = true;
    return globalScheduler;

  } catch (error) {
    console.error('Failed to initialize FFAnalytics Scheduler:', error);
    throw error;
  }
}

/**
 * Get the current scheduler instance
 */
export function getScheduler() {
  if (!isInitialized || !globalScheduler) {
    throw new Error('Scheduler not initialized. Call initializeScheduler() first.');
  }
  return globalScheduler;
}

/**
 * Check if scheduler is initialized
 */
export function isSchedulerInitialized() {
  return isInitialized && globalScheduler !== null;
}

/**
 * Manually trigger a data update
 */
export async function triggerDataUpdate(options = {}) {
  const scheduler = getScheduler();
  return await scheduler.triggerManualUpdate(options);
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  const scheduler = getScheduler();
  return scheduler.getStatus();
}

/**
 * Perform health check
 */
export async function performHealthCheck() {
  const scheduler = getScheduler();
  return await scheduler.performHealthCheck();
}

/**
 * Start the scheduler (if not already running)
 */
export function startScheduler() {
  const scheduler = getScheduler();
  scheduler.start();
  console.log('FFAnalytics Scheduler started');
}

/**
 * Stop the scheduler
 */
export function stopScheduler() {
  const scheduler = getScheduler();
  scheduler.stop();
  console.log('FFAnalytics Scheduler stopped');
}

/**
 * Gracefully shutdown the scheduler
 */
export async function shutdownScheduler(timeout = 30000) {
  if (!isInitialized || !globalScheduler) {
    console.log('Scheduler not initialized, nothing to shutdown');
    return;
  }

  console.log('Shutting down FFAnalytics Scheduler...');
  await globalScheduler.shutdown(timeout);
  
  globalScheduler = null;
  isInitialized = false;
  
  console.log('FFAnalytics Scheduler shutdown complete');
}

/**
 * Express.js middleware for scheduler status endpoint
 */
export function createSchedulerStatusMiddleware() {
  return (req, res, next) => {
    try {
      if (!isSchedulerInitialized()) {
        return res.status(503).json({
          error: 'Scheduler not initialized',
          status: 'unavailable'
        });
      }

      const status = getSchedulerStatus();
      res.json({
        status: 'ok',
        scheduler: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        status: 'error'
      });
    }
  };
}

/**
 * Express.js middleware for manual trigger endpoint
 */
export function createSchedulerTriggerMiddleware() {
  return async (req, res, next) => {
    try {
      if (!isSchedulerInitialized()) {
        return res.status(503).json({
          error: 'Scheduler not initialized',
          status: 'unavailable'
        });
      }

      const options = {
        week: req.body.week ? parseInt(req.body.week) : null,
        force: req.body.force === true,
        includeWeekly: req.body.includeWeekly !== false,
        includeSeasonal: req.body.includeSeasonal !== false
      };

      console.log('Manual trigger requested via API:', options);
      
      const result = await triggerDataUpdate(options);
      
      res.json({
        status: 'success',
        message: 'Update triggered successfully',
        result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Manual trigger failed:', error);
      res.status(500).json({
        error: error.message,
        status: 'error',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Express.js middleware for health check endpoint
 */
export function createSchedulerHealthMiddleware() {
  return async (req, res, next) => {
    try {
      if (!isSchedulerInitialized()) {
        return res.status(503).json({
          error: 'Scheduler not initialized',
          status: 'unavailable'
        });
      }

      const healthCheck = await performHealthCheck();
      
      const statusCode = healthCheck.overall === 'healthy' ? 200 : 
                        healthCheck.overall === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json(healthCheck);

    } catch (error) {
      res.status(500).json({
        overall: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Setup process handlers for graceful shutdown
 */
export function setupProcessHandlers() {
  // Handle graceful shutdown
  const gracefulShutdown = async (signal) => {
    console.log(`Received ${signal}, initiating graceful shutdown...`);
    
    try {
      await shutdownScheduler();
      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
  });
}

/**
 * Auto-initialize scheduler based on environment variables
 */
export async function autoInitialize() {
  const autoInit = process.env.ANALYTICS_AUTO_INITIALIZE !== 'false';
  
  if (autoInit && !isInitialized) {
    try {
      await initializeScheduler();
      setupProcessHandlers();
    } catch (error) {
      console.error('Auto-initialization failed:', error);
      // Don't throw - let the application continue without scheduler
    }
  }
}

// Auto-initialize if this module is imported and auto-init is enabled
if (typeof process !== 'undefined' && process.env.ANALYTICS_AUTO_INITIALIZE !== 'false') {
  // Use setImmediate to avoid blocking module loading
  setImmediate(() => {
    autoInitialize().catch(error => {
      console.error('Failed to auto-initialize scheduler:', error);
    });
  });
}