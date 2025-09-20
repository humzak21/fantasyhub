/**
 * Analytics System Logs API Endpoint
 * Provides system logs for the FFAnalytics integration
 */

import fs from 'fs';
import path from 'path';

/**
 * Read log files from the analytics logs directory
 */
function readLogFiles(limit = 100) {
  try {
    const logsDir = path.join(process.cwd(), 'logs', 'analytics');
    
    if (!fs.existsSync(logsDir)) {
      return [];
    }

    const logFiles = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.log') || file.endsWith('.json'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(logsDir, a));
        const statB = fs.statSync(path.join(logsDir, b));
        return statB.mtime - statA.mtime; // Most recent first
      });

    const logs = [];

    for (const logFile of logFiles.slice(0, 5)) { // Read up to 5 most recent files
      const logPath = path.join(logsDir, logFile);
      const content = fs.readFileSync(logPath, 'utf8');
      
      if (logFile.endsWith('.json')) {
        try {
          const jsonLogs = JSON.parse(content);
          if (Array.isArray(jsonLogs)) {
            logs.push(...jsonLogs);
          } else {
            logs.push(jsonLogs);
          }
        } catch (error) {
          logs.push({
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `Failed to parse log file ${logFile}: ${error.message}`,
            source: 'log-reader'
          });
        }
      } else {
        // Parse plain text logs
        const lines = content.split('\n').filter(line => line.trim());
        for (const line of lines) {
          const logEntry = parseLogLine(line);
          if (logEntry) {
            logs.push(logEntry);
          }
        }
      }

      if (logs.length >= limit) break;
    }

    // Sort by timestamp (most recent first) and limit
    return logs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

  } catch (error) {
    console.error('Error reading log files:', error);
    return [{
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `Failed to read log files: ${error.message}`,
      source: 'log-reader'
    }];
  }
}

/**
 * Parse a log line into structured format
 */
function parseLogLine(line) {
  try {
    // Try to parse as JSON first
    return JSON.parse(line);
  } catch {
    // Parse common log formats
    const patterns = [
      // ISO timestamp with level and message
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[(\w+)\]\s+(.+)$/,
      // Simple timestamp with level and message
      /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(\w+):\s+(.+)$/,
      // Just level and message
      /^\[(\w+)\]\s+(.+)$/
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        if (match.length === 4) {
          return {
            timestamp: match[1],
            level: match[2].toLowerCase(),
            message: match[3],
            source: 'analytics'
          };
        } else if (match.length === 3) {
          return {
            timestamp: new Date().toISOString(),
            level: match[1].toLowerCase(),
            message: match[2],
            source: 'analytics'
          };
        }
      }
    }

    // If no pattern matches, treat as info message
    return {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: line,
      source: 'analytics'
    };
  }
}

/**
 * Generate sample logs for demonstration
 */
function generateSampleLogs() {
  const levels = ['info', 'warn', 'error', 'debug'];
  const sources = ['r-script', 'cache', 'player-matching', 'data-sync', 'health-check'];
  const messages = [
    'R script execution completed successfully',
    'Player matching process started',
    'Cache hit rate: 85%',
    'Data validation completed with 2 warnings',
    'Weekly projections sync initiated',
    'FFAnalytics package loaded successfully',
    'Database connection established',
    'Analytics data refreshed',
    'Performance metrics updated',
    'System health check passed'
  ];

  const logs = [];
  const now = Date.now();

  for (let i = 0; i < 50; i++) {
    const timestamp = new Date(now - (i * 60000 * Math.random())).toISOString();
    const level = levels[Math.floor(Math.random() * levels.length)];
    const source = sources[Math.floor(Math.random() * sources.length)];
    const message = messages[Math.floor(Math.random() * messages.length)];

    logs.push({
      timestamp,
      level,
      message: `[${source}] ${message}`,
      source
    });
  }

  return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * API Handler
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const limit = parseInt(req.query.limit) || 100;
    const level = req.query.level; // Optional filter by log level
    const source = req.query.source; // Optional filter by source
    const useSampleData = process.env.NODE_ENV === 'development' || req.query.sample === 'true';

    let logs;

    if (useSampleData) {
      logs = generateSampleLogs();
    } else {
      logs = readLogFiles(limit);
    }

    // Apply filters
    if (level) {
      logs = logs.filter(log => log.level === level.toLowerCase());
    }

    if (source) {
      logs = logs.filter(log => log.source === source);
    }

    // Limit results
    logs = logs.slice(0, limit);

    res.status(200).json({
      timestamp: new Date().toISOString(),
      total: logs.length,
      logs: logs
    });
  } catch (error) {
    console.error('Logs API error:', error);
    res.status(500).json({
      error: 'Failed to fetch logs',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}