/**
 * Analytics Performance Metrics API Endpoint
 * Provides performance metrics for the FFAnalytics integration
 */

import fs from 'fs';
import path from 'path';

/**
 * Get R Script execution metrics
 */
function getRScriptMetrics() {
  try {
    const metricsPath = path.join(process.cwd(), 'logs', 'analytics', 'r-script-metrics.json');
    
    if (!fs.existsSync(metricsPath)) {
      return {
        totalExecutions: 0,
        successRate: 100,
        avgExecutionTime: 0,
        failedExecutions: 0,
        lastExecution: null
      };
    }

    const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    return metrics;
  } catch (error) {
    console.error('Error reading R script metrics:', error);
    return {
      totalExecutions: 0,
      successRate: 0,
      avgExecutionTime: 0,
      failedExecutions: 0,
      error: error.message
    };
  }
}

/**
 * Get cache performance metrics
 */
function getCacheMetrics() {
  try {
    const metricsPath = path.join(process.cwd(), 'logs', 'analytics', 'cache-metrics.json');
    
    if (!fs.existsSync(metricsPath)) {
      return {
        hitRate: 0,
        totalRequests: 0,
        avgResponseTime: 0,
        cacheSize: 0,
        lastCleanup: null
      };
    }

    const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    return metrics;
  } catch (error) {
    console.error('Error reading cache metrics:', error);
    return {
      hitRate: 0,
      totalRequests: 0,
      avgResponseTime: 0,
      cacheSize: 0,
      error: error.message
    };
  }
}

/**
 * Get data quality metrics
 */
function getDataQualityMetrics() {
  try {
    const metricsPath = path.join(process.cwd(), 'logs', 'analytics', 'data-quality-metrics.json');
    
    if (!fs.existsSync(metricsPath)) {
      return {
        playerMatchRate: 0,
        dataFreshness: 0,
        validationErrors: 0,
        lastDataSync: null
      };
    }

    const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    return metrics;
  } catch (error) {
    console.error('Error reading data quality metrics:', error);
    return {
      playerMatchRate: 0,
      dataFreshness: 0,
      validationErrors: 0,
      error: error.message
    };
  }
}

/**
 * Get system resource metrics
 */
function getSystemResourceMetrics() {
  try {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    return {
      memoryUsage: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024) // MB
      },
      uptime: Math.round(uptime), // seconds
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };
  } catch (error) {
    console.error('Error getting system metrics:', error);
    return {
      error: error.message
    };
  }
}

/**
 * Generate sample metrics for demonstration
 */
function generateSampleMetrics() {
  return {
    rScriptExecutions: {
      totalExecutions: Math.floor(Math.random() * 1000) + 100,
      successRate: Math.floor(Math.random() * 20) + 80, // 80-100%
      avgExecutionTime: Math.floor(Math.random() * 5000) + 1000, // 1-6 seconds
      failedExecutions: Math.floor(Math.random() * 10),
      lastExecution: new Date(Date.now() - Math.random() * 3600000).toISOString()
    },
    cachePerformance: {
      hitRate: Math.floor(Math.random() * 30) + 70, // 70-100%
      totalRequests: Math.floor(Math.random() * 10000) + 1000,
      avgResponseTime: Math.floor(Math.random() * 100) + 10, // 10-110ms
      cacheSize: Math.floor(Math.random() * 1000) + 100,
      lastCleanup: new Date(Date.now() - Math.random() * 86400000).toISOString()
    },
    dataQuality: {
      playerMatchRate: Math.floor(Math.random() * 15) + 85, // 85-100%
      dataFreshness: Math.floor(Math.random() * 24) + 1, // 1-24 hours
      validationErrors: Math.floor(Math.random() * 5),
      lastDataSync: new Date(Date.now() - Math.random() * 3600000).toISOString()
    },
    systemResources: getSystemResourceMetrics()
  };
}

/**
 * API Handler
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if we're in development mode and should use sample data
    const useSampleData = process.env.NODE_ENV === 'development' || req.query.sample === 'true';
    
    let metrics;
    
    if (useSampleData) {
      metrics = generateSampleMetrics();
    } else {
      metrics = {
        rScriptExecutions: getRScriptMetrics(),
        cachePerformance: getCacheMetrics(),
        dataQuality: getDataQualityMetrics(),
        systemResources: getSystemResourceMetrics()
      };
    }

    res.status(200).json({
      timestamp: new Date().toISOString(),
      ...metrics
    });
  } catch (error) {
    console.error('Metrics API error:', error);
    res.status(500).json({
      error: 'Failed to fetch metrics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}