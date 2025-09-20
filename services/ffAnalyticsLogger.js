/**
 * FFAnalytics Logging System
 * 
 * Provides comprehensive logging capabilities for the ffanalytics integration.
 * Supports different log levels, structured logging, and error tracking.
 */

import { getErrorSeverity, shouldAlert } from './ffAnalyticsErrors.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Log levels
 */
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

/**
 * Log level names
 */
const LOG_LEVEL_NAMES = {
  0: 'ERROR',
  1: 'WARN',
  2: 'INFO',
  3: 'DEBUG',
  4: 'TRACE'
};

/**
 * FFAnalytics Logger class
 */
class FFAnalyticsLogger {
  constructor(options = {}) {
    this.level = options.level || LOG_LEVELS.INFO;
    this.component = options.component || 'FFAnalytics';
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile || false;
    this.filePath = options.filePath || './logs/ffanalytics.log';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    this.enableStructured = options.enableStructured !== false;
    
    // Performance tracking
    this.performanceMetrics = new Map();
    
    // Error tracking
    this.errorCounts = new Map();
    this.lastErrors = [];
    this.maxLastErrors = 100;
  }

  /**
   * Create a child logger with additional context
   */
  child(context = {}) {
    const childLogger = new FFAnalyticsLogger({
      level: this.level,
      component: this.component,
      enableConsole: this.enableConsole,
      enableFile: this.enableFile,
      filePath: this.filePath,
      enableStructured: this.enableStructured
    });
    
    childLogger.context = { ...this.context, ...context };
    return childLogger;
  }

  /**
   * Log an error
   */
  error(message, error = null, context = {}) {
    if (this.level < LOG_LEVELS.ERROR) return;
    
    const logEntry = this._createLogEntry('ERROR', message, { error, ...context });
    
    // Track error for monitoring
    if (error && error.type) {
      this._trackError(error);
    }
    
    this._writeLog(logEntry);
    
    // Alert for critical errors
    if (error && shouldAlert(error)) {
      this._sendAlert(logEntry);
    }
  }

  /**
   * Log a warning
   */
  warn(message, context = {}) {
    if (this.level < LOG_LEVELS.WARN) return;
    
    const logEntry = this._createLogEntry('WARN', message, context);
    this._writeLog(logEntry);
  }

  /**
   * Log an info message
   */
  info(message, context = {}) {
    if (this.level < LOG_LEVELS.INFO) return;
    
    const logEntry = this._createLogEntry('INFO', message, context);
    this._writeLog(logEntry);
  }

  /**
   * Log a debug message
   */
  debug(message, context = {}) {
    if (this.level < LOG_LEVELS.DEBUG) return;
    
    const logEntry = this._createLogEntry('DEBUG', message, context);
    this._writeLog(logEntry);
  }

  /**
   * Log a trace message
   */
  trace(message, context = {}) {
    if (this.level < LOG_LEVELS.TRACE) return;
    
    const logEntry = this._createLogEntry('TRACE', message, context);
    this._writeLog(logEntry);
  }

  /**
   * Start performance timing
   */
  startTimer(operation) {
    const startTime = Date.now();
    this.performanceMetrics.set(operation, { startTime });
    
    this.debug(`Started operation: ${operation}`, { operation, startTime });
    
    return {
      end: (context = {}) => this.endTimer(operation, context)
    };
  }

  /**
   * End performance timing
   */
  endTimer(operation, context = {}) {
    const metric = this.performanceMetrics.get(operation);
    if (!metric) {
      this.warn(`Timer not found for operation: ${operation}`, { operation });
      return null;
    }
    
    const endTime = Date.now();
    const duration = endTime - metric.startTime;
    
    this.performanceMetrics.delete(operation);
    
    this.info(`Completed operation: ${operation}`, {
      operation,
      duration,
      startTime: metric.startTime,
      endTime,
      ...context
    });
    
    return { duration, startTime: metric.startTime, endTime };
  }

  /**
   * Log R script execution
   */
  logRScriptExecution(scriptPath, args = [], context = {}) {
    this.info('Executing R script', {
      scriptPath,
      args,
      operation: 'r_script_execution',
      ...context
    });
  }

  /**
   * Log R script completion
   */
  logRScriptCompletion(scriptPath, exitCode, stdout, stderr, duration, context = {}) {
    const level = exitCode === 0 ? 'info' : 'error';
    
    this[level](`R script ${exitCode === 0 ? 'completed' : 'failed'}`, {
      scriptPath,
      exitCode,
      duration,
      stdoutLength: stdout ? stdout.length : 0,
      stderrLength: stderr ? stderr.length : 0,
      operation: 'r_script_completion',
      ...context
    });
    
    // Log stderr if present
    if (stderr && stderr.trim()) {
      this.warn('R script stderr output', {
        scriptPath,
        stderr: stderr.substring(0, 1000), // Limit stderr output
        operation: 'r_script_stderr'
      });
    }
  }

  /**
   * Log player matching results
   */
  logPlayerMatching(results, context = {}) {
    this.info('Player matching completed', {
      totalPlayers: results.total || 0,
      matchedPlayers: results.matched || 0,
      unmatchedPlayers: results.unmatched || 0,
      matchRate: results.total > 0 ? (results.matched / results.total * 100).toFixed(2) + '%' : '0%',
      operation: 'player_matching',
      ...context
    });
  }

  /**
   * Log cache operations
   */
  logCacheOperation(operation, key, hit = null, context = {}) {
    this.debug(`Cache ${operation}`, {
      operation: `cache_${operation}`,
      key,
      hit,
      ...context
    });
  }

  /**
   * Log database operations
   */
  logDatabaseOperation(operation, table, rowCount = null, duration = null, context = {}) {
    this.debug(`Database ${operation}`, {
      operation: `db_${operation}`,
      table,
      rowCount,
      duration,
      ...context
    });
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const stats = {};
    for (const [errorType, count] of this.errorCounts.entries()) {
      stats[errorType] = count;
    }
    return {
      errorCounts: stats,
      recentErrors: this.lastErrors.slice(-10),
      totalErrors: this.lastErrors.length
    };
  }

  /**
   * Clear error statistics
   */
  clearErrorStats() {
    this.errorCounts.clear();
    this.lastErrors = [];
  }

  /**
   * Create a structured log entry
   */
  _createLogEntry(level, message, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      ...this.context,
      ...context
    };

    // Add process information
    entry.pid = process.pid;
    entry.hostname = os.hostname();

    // Add memory usage for performance monitoring
    if (level === 'ERROR' || level === 'WARN') {
      const memUsage = process.memoryUsage();
      entry.memoryUsage = {
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
      };
    }

    return entry;
  }

  /**
   * Write log entry to configured outputs
   */
  _writeLog(entry) {
    if (this.enableConsole) {
      this._writeToConsole(entry);
    }
    
    if (this.enableFile) {
      this._writeToFile(entry);
    }
  }

  /**
   * Write to console with appropriate formatting
   */
  _writeToConsole(entry) {
    const timestamp = entry.timestamp;
    const level = entry.level.padEnd(5);
    const component = entry.component.padEnd(12);
    const message = entry.message;
    
    let logLine;
    if (this.enableStructured) {
      logLine = JSON.stringify(entry);
    } else {
      logLine = `${timestamp} [${level}] ${component}: ${message}`;
      
      // Add context for errors and warnings
      if ((entry.level === 'ERROR' || entry.level === 'WARN') && Object.keys(entry).length > 6) {
        const context = { ...entry };
        delete context.timestamp;
        delete context.level;
        delete context.component;
        delete context.message;
        delete context.pid;
        delete context.hostname;
        
        if (Object.keys(context).length > 0) {
          logLine += '\n  Context: ' + JSON.stringify(context, null, 2);
        }
      }
    }
    
    // Use appropriate console method
    switch (entry.level) {
      case 'ERROR':
        console.error(logLine);
        break;
      case 'WARN':
        console.warn(logLine);
        break;
      case 'DEBUG':
      case 'TRACE':
        console.debug(logLine);
        break;
      default:
        console.log(logLine);
    }
  }

  /**
   * Write to file (basic implementation - in production, use a proper logging library)
   */
  _writeToFile(entry) {
    // This is a basic implementation
    // In production, consider using winston, pino, or similar logging library
    try {
      // Ensure log directory exists
      const logDir = path.dirname(this.filePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.filePath, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Track error for monitoring
   */
  _trackError(error) {
    // Count errors by type
    const errorType = error.type || 'UNKNOWN';
    const currentCount = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, currentCount + 1);
    
    // Store recent errors
    this.lastErrors.push({
      timestamp: new Date().toISOString(),
      type: error.type,
      message: error.message,
      severity: getErrorSeverity(error.type)
    });
    
    // Limit stored errors
    if (this.lastErrors.length > this.maxLastErrors) {
      this.lastErrors = this.lastErrors.slice(-this.maxLastErrors);
    }
  }

  /**
   * Send alert for critical errors (placeholder implementation)
   */
  _sendAlert(logEntry) {
    // This is a placeholder - implement actual alerting mechanism
    // Could integrate with services like PagerDuty, Slack, email, etc.
    console.error('🚨 CRITICAL ERROR ALERT:', logEntry.message);
  }
}

/**
 * Create a default logger instance
 */
const defaultLogger = new FFAnalyticsLogger({
  component: 'FFAnalytics',
  level: process.env.NODE_ENV === 'development' ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO
});

export {
  FFAnalyticsLogger,
  LOG_LEVELS,
  LOG_LEVEL_NAMES,
  defaultLogger
};