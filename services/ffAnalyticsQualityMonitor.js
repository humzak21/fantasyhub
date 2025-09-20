/**
 * FFAnalytics Quality Monitor
 * 
 * Provides comprehensive data quality monitoring and metrics tracking for ffanalytics integration.
 * Monitors data quality trends, generates alerts, and provides dashboards for data quality insights.
 * 
 * Requirements addressed:
 * - 2.4: Monitor data quality and provide alerts
 * - 4.1: Track data integrity metrics over time
 * - 1.2: Monitor player matching accuracy and consistency
 */

import { 
  ERROR_TYPES, 
  getErrorSeverity,
  shouldAlert 
} from './ffAnalyticsErrors.js';

/**
 * Quality metric types
 */
const METRIC_TYPES = {
  DATA_COMPLETENESS: 'DATA_COMPLETENESS',
  CONSISTENCY_SCORE: 'CONSISTENCY_SCORE',
  VALIDATION_ERROR_RATE: 'VALIDATION_ERROR_RATE',
  OUTLIER_RATE: 'OUTLIER_RATE',
  MATCH_ACCURACY: 'MATCH_ACCURACY',
  SYNC_SUCCESS_RATE: 'SYNC_SUCCESS_RATE',
  DATA_FRESHNESS: 'DATA_FRESHNESS',
  PROCESSING_TIME: 'PROCESSING_TIME'
};

/**
 * Alert severity levels
 */
const ALERT_SEVERITY = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};

/**
 * Quality thresholds for alerts
 */
const QUALITY_THRESHOLDS = {
  [METRIC_TYPES.DATA_COMPLETENESS]: {
    warning: 0.8,  // 80%
    error: 0.7,    // 70%
    critical: 0.5  // 50%
  },
  [METRIC_TYPES.CONSISTENCY_SCORE]: {
    warning: 0.85, // 85%
    error: 0.75,   // 75%
    critical: 0.6  // 60%
  },
  [METRIC_TYPES.VALIDATION_ERROR_RATE]: {
    warning: 0.05, // 5%
    error: 0.1,    // 10%
    critical: 0.2  // 20%
  },
  [METRIC_TYPES.OUTLIER_RATE]: {
    warning: 0.02, // 2%
    error: 0.05,   // 5%
    critical: 0.1  // 10%
  },
  [METRIC_TYPES.MATCH_ACCURACY]: {
    warning: 0.9,  // 90%
    error: 0.8,    // 80%
    critical: 0.7  // 70%
  },
  [METRIC_TYPES.SYNC_SUCCESS_RATE]: {
    warning: 0.95, // 95%
    error: 0.9,    // 90%
    critical: 0.8  // 80%
  },
  [METRIC_TYPES.DATA_FRESHNESS]: {
    warning: 86400,    // 24 hours in seconds
    error: 172800,     // 48 hours
    critical: 259200   // 72 hours
  },
  [METRIC_TYPES.PROCESSING_TIME]: {
    warning: 300,   // 5 minutes in seconds
    error: 600,     // 10 minutes
    critical: 1200  // 20 minutes
  }
};

/**
 * Quality metric data point
 */
class QualityMetric {
  constructor(type, value, timestamp = null, metadata = {}) {
    this.type = type;
    this.value = value;
    this.timestamp = timestamp || new Date().toISOString();
    this.metadata = metadata;
  }

  toJSON() {
    return {
      type: this.type,
      value: this.value,
      timestamp: this.timestamp,
      metadata: this.metadata
    };
  }
}

/**
 * Quality alert
 */
class QualityAlert {
  constructor(type, severity, message, metric, threshold = null, metadata = {}) {
    this.id = this.generateId();
    this.type = type;
    this.severity = severity;
    this.message = message;
    this.metric = metric;
    this.threshold = threshold;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
    this.acknowledged = false;
    this.acknowledgedBy = null;
    this.acknowledgedAt = null;
  }

  generateId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  acknowledge(acknowledgedBy) {
    this.acknowledged = true;
    this.acknowledgedBy = acknowledgedBy;
    this.acknowledgedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      severity: this.severity,
      message: this.message,
      metric: this.metric?.toJSON(),
      threshold: this.threshold,
      metadata: this.metadata,
      timestamp: this.timestamp,
      acknowledged: this.acknowledged,
      acknowledgedBy: this.acknowledgedBy,
      acknowledgedAt: this.acknowledgedAt
    };
  }
}

/**
 * Quality trend analyzer
 */
class QualityTrendAnalyzer {
  constructor() {
    this.metrics = new Map(); // type -> array of metrics
  }

  addMetric(metric) {
    if (!this.metrics.has(metric.type)) {
      this.metrics.set(metric.type, []);
    }
    
    const typeMetrics = this.metrics.get(metric.type);
    typeMetrics.push(metric);
    
    // Keep only last 100 data points per metric type
    if (typeMetrics.length > 100) {
      typeMetrics.shift();
    }
  }

  getTrend(metricType, timeWindow = 24 * 60 * 60 * 1000) { // 24 hours default
    const metrics = this.metrics.get(metricType) || [];
    const cutoffTime = new Date(Date.now() - timeWindow);
    
    const recentMetrics = metrics.filter(m => 
      new Date(m.timestamp) >= cutoffTime
    );

    if (recentMetrics.length < 2) {
      return {
        trend: 'INSUFFICIENT_DATA',
        direction: null,
        change: 0,
        confidence: 0
      };
    }

    // Calculate trend using linear regression
    const values = recentMetrics.map((m, i) => ({ x: i, y: m.value }));
    const trend = this.calculateLinearTrend(values);
    
    return {
      trend: trend.slope > 0.01 ? 'IMPROVING' : 
             trend.slope < -0.01 ? 'DEGRADING' : 'STABLE',
      direction: trend.slope > 0 ? 'UP' : trend.slope < 0 ? 'DOWN' : 'FLAT',
      change: trend.slope,
      confidence: trend.r2,
      dataPoints: recentMetrics.length,
      timeWindow: timeWindow
    };
  }

  calculateLinearTrend(points) {
    const n = points.length;
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
    const sumYY = points.reduce((sum, p) => sum + p.y * p.y, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared
    const yMean = sumY / n;
    const ssRes = points.reduce((sum, p) => {
      const predicted = slope * p.x + intercept;
      return sum + Math.pow(p.y - predicted, 2);
    }, 0);
    const ssTot = points.reduce((sum, p) => sum + Math.pow(p.y - yMean, 2), 0);
    const r2 = ssTot === 0 ? 1 : 1 - (ssRes / ssTot);

    return { slope, intercept, r2 };
  }

  getMetricSummary(metricType, timeWindow = 24 * 60 * 60 * 1000) {
    const metrics = this.metrics.get(metricType) || [];
    const cutoffTime = new Date(Date.now() - timeWindow);
    
    const recentMetrics = metrics.filter(m => 
      new Date(m.timestamp) >= cutoffTime
    );

    if (recentMetrics.length === 0) {
      return {
        count: 0,
        latest: null,
        average: null,
        min: null,
        max: null,
        trend: this.getTrend(metricType, timeWindow)
      };
    }

    const values = recentMetrics.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      count: recentMetrics.length,
      latest: recentMetrics[recentMetrics.length - 1],
      average: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      trend: this.getTrend(metricType, timeWindow)
    };
  }
}

/**
 * Main quality monitor class
 */
export class FFAnalyticsQualityMonitor {
  constructor(supabaseClient, config = {}) {
    this.client = supabaseClient;
    this.config = {
      alertThresholds: QUALITY_THRESHOLDS,
      retentionDays: 30, // Keep metrics for 30 days
      alertRetentionDays: 7, // Keep alerts for 7 days
      enableTrendAnalysis: true,
      enableAlerting: true,
      alertCooldownMinutes: 60, // Don't repeat same alert for 60 minutes
      ...config
    };
    
    this.metrics = new Map(); // Store metrics by type
    this.alerts = new Map(); // Store active alerts
    this.trendAnalyzer = new QualityTrendAnalyzer();
    this.lastAlerts = new Map(); // Track last alert time by type
    
    this.isMonitoring = false;
    this.monitoringInterval = null;
  }

  /**
   * Initialize the quality monitor
   */
  async initialize() {
    try {
      console.log('Initializing FFAnalyticsQualityMonitor...');
      
      // Load existing metrics and alerts
      await this.loadHistoricalData();
      
      console.log('FFAnalyticsQualityMonitor initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize FFAnalyticsQualityMonitor:', error);
      return false;
    }
  }

  /**
   * Start continuous monitoring
   * @param {number} intervalMinutes - Monitoring interval in minutes
   */
  startMonitoring(intervalMinutes = 15) {
    if (this.isMonitoring) {
      console.log('Quality monitoring is already running');
      return;
    }

    console.log(`Starting quality monitoring with ${intervalMinutes} minute intervals`);
    
    this.isMonitoring = true;
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.checkAlerts();
        await this.cleanupOldData();
      } catch (error) {
        console.error('Error during quality monitoring cycle:', error);
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop continuous monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('Quality monitoring stopped');
  }

  /**
   * Record a quality metric
   * @param {string} type - Metric type
   * @param {number} value - Metric value
   * @param {Object} metadata - Additional metadata
   */
  recordMetric(type, value, metadata = {}) {
    const metric = new QualityMetric(type, value, null, metadata);
    
    // Store metric
    if (!this.metrics.has(type)) {
      this.metrics.set(type, []);
    }
    this.metrics.get(type).push(metric);
    
    // Add to trend analyzer
    if (this.config.enableTrendAnalysis) {
      this.trendAnalyzer.addMetric(metric);
    }
    
    // Check for immediate alerts
    if (this.config.enableAlerting) {
      this.checkMetricAlert(metric);
    }
    
    console.log(`Recorded quality metric: ${type} = ${value}`);
  }

  /**
   * Record data completeness metric
   * @param {number} totalRecords - Total number of records
   * @param {number} validRecords - Number of valid records
   * @param {Object} metadata - Additional metadata
   */
  recordDataCompleteness(totalRecords, validRecords, metadata = {}) {
    const completeness = totalRecords > 0 ? validRecords / totalRecords : 0;
    this.recordMetric(METRIC_TYPES.DATA_COMPLETENESS, completeness, {
      totalRecords,
      validRecords,
      ...metadata
    });
  }

  /**
   * Record consistency score metric
   * @param {number} matchedPairs - Number of matched pairs
   * @param {number} consistencyIssues - Number of consistency issues
   * @param {Object} metadata - Additional metadata
   */
  recordConsistencyScore(matchedPairs, consistencyIssues, metadata = {}) {
    const consistency = matchedPairs > 0 ? 
      Math.max(0, 1 - (consistencyIssues / matchedPairs)) : 0;
    this.recordMetric(METRIC_TYPES.CONSISTENCY_SCORE, consistency, {
      matchedPairs,
      consistencyIssues,
      ...metadata
    });
  }

  /**
   * Record validation error rate
   * @param {number} totalRecords - Total number of records processed
   * @param {number} errorCount - Number of validation errors
   * @param {Object} metadata - Additional metadata
   */
  recordValidationErrorRate(totalRecords, errorCount, metadata = {}) {
    const errorRate = totalRecords > 0 ? errorCount / totalRecords : 0;
    this.recordMetric(METRIC_TYPES.VALIDATION_ERROR_RATE, errorRate, {
      totalRecords,
      errorCount,
      ...metadata
    });
  }

  /**
   * Record outlier rate
   * @param {number} totalRecords - Total number of records
   * @param {number} outlierCount - Number of outliers detected
   * @param {Object} metadata - Additional metadata
   */
  recordOutlierRate(totalRecords, outlierCount, metadata = {}) {
    const outlierRate = totalRecords > 0 ? outlierCount / totalRecords : 0;
    this.recordMetric(METRIC_TYPES.OUTLIER_RATE, outlierRate, {
      totalRecords,
      outlierCount,
      ...metadata
    });
  }

  /**
   * Record match accuracy
   * @param {number} totalMatches - Total number of match attempts
   * @param {number} successfulMatches - Number of successful matches
   * @param {Object} metadata - Additional metadata
   */
  recordMatchAccuracy(totalMatches, successfulMatches, metadata = {}) {
    const accuracy = totalMatches > 0 ? successfulMatches / totalMatches : 0;
    this.recordMetric(METRIC_TYPES.MATCH_ACCURACY, accuracy, {
      totalMatches,
      successfulMatches,
      ...metadata
    });
  }

  /**
   * Record sync success rate
   * @param {number} totalSyncs - Total number of sync attempts
   * @param {number} successfulSyncs - Number of successful syncs
   * @param {Object} metadata - Additional metadata
   */
  recordSyncSuccessRate(totalSyncs, successfulSyncs, metadata = {}) {
    const successRate = totalSyncs > 0 ? successfulSyncs / totalSyncs : 0;
    this.recordMetric(METRIC_TYPES.SYNC_SUCCESS_RATE, successRate, {
      totalSyncs,
      successfulSyncs,
      ...metadata
    });
  }

  /**
   * Record data freshness
   * @param {Date} lastUpdateTime - Last data update time
   * @param {Object} metadata - Additional metadata
   */
  recordDataFreshness(lastUpdateTime, metadata = {}) {
    const now = new Date();
    const ageSeconds = (now - new Date(lastUpdateTime)) / 1000;
    this.recordMetric(METRIC_TYPES.DATA_FRESHNESS, ageSeconds, {
      lastUpdateTime: lastUpdateTime.toISOString(),
      currentTime: now.toISOString(),
      ...metadata
    });
  }

  /**
   * Record processing time
   * @param {number} processingTimeMs - Processing time in milliseconds
   * @param {Object} metadata - Additional metadata
   */
  recordProcessingTime(processingTimeMs, metadata = {}) {
    const processingTimeSeconds = processingTimeMs / 1000;
    this.recordMetric(METRIC_TYPES.PROCESSING_TIME, processingTimeSeconds, {
      processingTimeMs,
      ...metadata
    });
  }

  /**
   * Check if a metric should trigger an alert
   * @private
   */
  checkMetricAlert(metric) {
    const thresholds = this.config.alertThresholds[metric.type];
    if (!thresholds) return;

    let severity = null;
    let threshold = null;

    // Determine alert severity based on thresholds
    // Note: For some metrics, lower values are worse (completeness, consistency)
    // For others, higher values are worse (error rates, processing time)
    const isLowerWorse = [
      METRIC_TYPES.DATA_COMPLETENESS,
      METRIC_TYPES.CONSISTENCY_SCORE,
      METRIC_TYPES.MATCH_ACCURACY,
      METRIC_TYPES.SYNC_SUCCESS_RATE
    ].includes(metric.type);

    if (isLowerWorse) {
      if (metric.value <= thresholds.critical) {
        severity = ALERT_SEVERITY.CRITICAL;
        threshold = thresholds.critical;
      } else if (metric.value <= thresholds.error) {
        severity = ALERT_SEVERITY.ERROR;
        threshold = thresholds.error;
      } else if (metric.value <= thresholds.warning) {
        severity = ALERT_SEVERITY.WARNING;
        threshold = thresholds.warning;
      }
    } else {
      if (metric.value >= thresholds.critical) {
        severity = ALERT_SEVERITY.CRITICAL;
        threshold = thresholds.critical;
      } else if (metric.value >= thresholds.error) {
        severity = ALERT_SEVERITY.ERROR;
        threshold = thresholds.error;
      } else if (metric.value >= thresholds.warning) {
        severity = ALERT_SEVERITY.WARNING;
        threshold = thresholds.warning;
      }
    }

    if (severity) {
      this.createAlert(metric.type, severity, metric, threshold);
    }
  }

  /**
   * Create a quality alert
   * @private
   */
  createAlert(type, severity, metric, threshold) {
    // Check cooldown period
    const lastAlertTime = this.lastAlerts.get(type);
    const cooldownMs = this.config.alertCooldownMinutes * 60 * 1000;
    
    if (lastAlertTime && (Date.now() - lastAlertTime) < cooldownMs) {
      return; // Skip alert due to cooldown
    }

    const message = this.generateAlertMessage(type, severity, metric, threshold);
    
    const alert = new QualityAlert(type, severity, message, metric, threshold, {
      metricType: type,
      metricValue: metric.value,
      threshold: threshold
    });

    this.alerts.set(alert.id, alert);
    this.lastAlerts.set(type, Date.now());

    console.log(`Quality alert created: ${severity} - ${message}`);
    
    // In a production environment, you would send notifications here
    this.sendAlert(alert);
  }

  /**
   * Generate alert message
   * @private
   */
  generateAlertMessage(type, severity, metric, threshold) {
    const value = typeof metric.value === 'number' ? 
      metric.value.toFixed(4) : metric.value;
    const thresholdStr = typeof threshold === 'number' ? 
      threshold.toFixed(4) : threshold;

    const messages = {
      [METRIC_TYPES.DATA_COMPLETENESS]: `Data completeness (${(value * 100).toFixed(1)}%) is below threshold (${(threshold * 100).toFixed(1)}%)`,
      [METRIC_TYPES.CONSISTENCY_SCORE]: `Data consistency (${(value * 100).toFixed(1)}%) is below threshold (${(threshold * 100).toFixed(1)}%)`,
      [METRIC_TYPES.VALIDATION_ERROR_RATE]: `Validation error rate (${(value * 100).toFixed(1)}%) exceeds threshold (${(threshold * 100).toFixed(1)}%)`,
      [METRIC_TYPES.OUTLIER_RATE]: `Outlier rate (${(value * 100).toFixed(1)}%) exceeds threshold (${(threshold * 100).toFixed(1)}%)`,
      [METRIC_TYPES.MATCH_ACCURACY]: `Match accuracy (${(value * 100).toFixed(1)}%) is below threshold (${(threshold * 100).toFixed(1)}%)`,
      [METRIC_TYPES.SYNC_SUCCESS_RATE]: `Sync success rate (${(value * 100).toFixed(1)}%) is below threshold (${(threshold * 100).toFixed(1)}%)`,
      [METRIC_TYPES.DATA_FRESHNESS]: `Data is stale (${Math.round(value / 3600)} hours old), exceeds threshold (${Math.round(threshold / 3600)} hours)`,
      [METRIC_TYPES.PROCESSING_TIME]: `Processing time (${Math.round(value)} seconds) exceeds threshold (${Math.round(threshold)} seconds)`
    };

    return messages[type] || `Quality metric ${type} (${value}) triggered ${severity} alert (threshold: ${thresholdStr})`;
  }

  /**
   * Send alert notification
   * @private
   */
  sendAlert(alert) {
    // In a production environment, this would send notifications via:
    // - Email
    // - Slack/Discord webhooks
    // - SMS
    // - Push notifications
    // - Database logging
    
    console.log(`[${alert.severity}] Quality Alert: ${alert.message}`);
    
    // For now, just log the alert
    // You could extend this to integrate with notification services
  }

  /**
   * Get quality dashboard data
   * @param {number} timeWindowHours - Time window in hours (default 24)
   * @returns {Object} Dashboard data
   */
  getQualityDashboard(timeWindowHours = 24) {
    const timeWindow = timeWindowHours * 60 * 60 * 1000;
    const dashboard = {
      summary: {},
      metrics: {},
      alerts: this.getActiveAlerts(),
      trends: {},
      timestamp: new Date().toISOString()
    };

    // Get summary for each metric type
    Object.values(METRIC_TYPES).forEach(metricType => {
      const summary = this.trendAnalyzer.getMetricSummary(metricType, timeWindow);
      dashboard.summary[metricType] = summary;
      
      if (summary.latest) {
        dashboard.metrics[metricType] = summary.latest.value;
        dashboard.trends[metricType] = summary.trend;
      }
    });

    return dashboard;
  }

  /**
   * Get active alerts
   * @returns {Array} Active alerts
   */
  getActiveAlerts() {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.acknowledged)
      .sort((a, b) => {
        // Sort by severity (critical first) then by timestamp (newest first)
        const severityOrder = {
          [ALERT_SEVERITY.CRITICAL]: 0,
          [ALERT_SEVERITY.ERROR]: 1,
          [ALERT_SEVERITY.WARNING]: 2,
          [ALERT_SEVERITY.INFO]: 3
        };
        
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        
        return new Date(b.timestamp) - new Date(a.timestamp);
      })
      .map(alert => alert.toJSON());
  }

  /**
   * Acknowledge an alert
   * @param {string} alertId - Alert ID to acknowledge
   * @param {string} acknowledgedBy - User acknowledging the alert
   * @returns {boolean} Success status
   */
  acknowledgeAlert(alertId, acknowledgedBy) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      console.warn(`Alert not found: ${alertId}`);
      return false;
    }

    alert.acknowledge(acknowledgedBy);
    console.log(`Alert acknowledged: ${alertId} by ${acknowledgedBy}`);
    return true;
  }

  /**
   * Collect current metrics from the system
   * @private
   */
  async collectMetrics() {
    try {
      // This would collect current system metrics
      // For now, we'll just log that collection is happening
      console.log('Collecting quality metrics...');
      
      // In a production environment, you would:
      // 1. Query database for current data quality stats
      // 2. Check sync status and success rates
      // 3. Analyze recent validation results
      // 4. Calculate data freshness
      // 5. Record all metrics using the record* methods
      
    } catch (error) {
      console.error('Error collecting metrics:', error);
    }
  }

  /**
   * Check for new alerts
   * @private
   */
  async checkAlerts() {
    try {
      // This would check current metrics against thresholds
      // Alerts are automatically created when metrics are recorded
      console.log('Checking for quality alerts...');
    } catch (error) {
      console.error('Error checking alerts:', error);
    }
  }

  /**
   * Clean up old data
   * @private
   */
  async cleanupOldData() {
    try {
      const metricCutoff = new Date();
      metricCutoff.setDate(metricCutoff.getDate() - this.config.retentionDays);
      
      const alertCutoff = new Date();
      alertCutoff.setDate(alertCutoff.getDate() - this.config.alertRetentionDays);
      
      let metricsRemoved = 0;
      let alertsRemoved = 0;
      
      // Clean up old metrics
      for (const [type, metrics] of this.metrics) {
        const filteredMetrics = metrics.filter(m => 
          new Date(m.timestamp) >= metricCutoff
        );
        metricsRemoved += metrics.length - filteredMetrics.length;
        this.metrics.set(type, filteredMetrics);
      }
      
      // Clean up old alerts
      for (const [id, alert] of this.alerts) {
        if (new Date(alert.timestamp) < alertCutoff) {
          this.alerts.delete(id);
          alertsRemoved++;
        }
      }
      
      if (metricsRemoved > 0 || alertsRemoved > 0) {
        console.log(`Cleaned up ${metricsRemoved} old metrics and ${alertsRemoved} old alerts`);
      }
    } catch (error) {
      console.error('Error cleaning up old data:', error);
    }
  }

  /**
   * Load historical data
   * @private
   */
  async loadHistoricalData() {
    try {
      // In a production environment, you would load from database
      console.log('Loading historical quality data...');
    } catch (error) {
      console.error('Error loading historical data:', error);
    }
  }

  /**
   * Get quality report
   * @param {number} timeWindowHours - Time window in hours
   * @returns {Object} Quality report
   */
  getQualityReport(timeWindowHours = 24) {
    const dashboard = this.getQualityDashboard(timeWindowHours);
    
    return {
      ...dashboard,
      recommendations: this.generateQualityRecommendations(dashboard),
      healthScore: this.calculateOverallHealthScore(dashboard)
    };
  }

  /**
   * Generate quality recommendations
   * @private
   */
  generateQualityRecommendations(dashboard) {
    const recommendations = [];
    
    Object.entries(dashboard.summary).forEach(([metricType, summary]) => {
      if (!summary.latest) return;
      
      const thresholds = this.config.alertThresholds[metricType];
      if (!thresholds) return;
      
      const value = summary.latest.value;
      const trend = summary.trend;
      
      // Check if metric is below warning threshold
      const isLowerWorse = [
        METRIC_TYPES.DATA_COMPLETENESS,
        METRIC_TYPES.CONSISTENCY_SCORE,
        METRIC_TYPES.MATCH_ACCURACY,
        METRIC_TYPES.SYNC_SUCCESS_RATE
      ].includes(metricType);
      
      const isBelowThreshold = isLowerWorse ? 
        value <= thresholds.warning : 
        value >= thresholds.warning;
      
      if (isBelowThreshold || trend.trend === 'DEGRADING') {
        recommendations.push({
          type: metricType,
          priority: isBelowThreshold ? 'HIGH' : 'MEDIUM',
          message: this.getRecommendationMessage(metricType, value, trend),
          action: this.getRecommendationAction(metricType)
        });
      }
    });
    
    return recommendations;
  }

  /**
   * Get recommendation message
   * @private
   */
  getRecommendationMessage(metricType, value, trend) {
    const messages = {
      [METRIC_TYPES.DATA_COMPLETENESS]: `Data completeness is ${(value * 100).toFixed(1)}% and ${trend.trend.toLowerCase()}`,
      [METRIC_TYPES.CONSISTENCY_SCORE]: `Data consistency is ${(value * 100).toFixed(1)}% and ${trend.trend.toLowerCase()}`,
      [METRIC_TYPES.VALIDATION_ERROR_RATE]: `Validation error rate is ${(value * 100).toFixed(1)}% and ${trend.trend.toLowerCase()}`,
      [METRIC_TYPES.OUTLIER_RATE]: `Outlier rate is ${(value * 100).toFixed(1)}% and ${trend.trend.toLowerCase()}`,
      [METRIC_TYPES.MATCH_ACCURACY]: `Match accuracy is ${(value * 100).toFixed(1)}% and ${trend.trend.toLowerCase()}`,
      [METRIC_TYPES.SYNC_SUCCESS_RATE]: `Sync success rate is ${(value * 100).toFixed(1)}% and ${trend.trend.toLowerCase()}`,
      [METRIC_TYPES.DATA_FRESHNESS]: `Data is ${Math.round(value / 3600)} hours old and ${trend.trend.toLowerCase()}`,
      [METRIC_TYPES.PROCESSING_TIME]: `Processing time is ${Math.round(value)} seconds and ${trend.trend.toLowerCase()}`
    };
    
    return messages[metricType] || `${metricType} needs attention`;
  }

  /**
   * Get recommendation action
   * @private
   */
  getRecommendationAction(metricType) {
    const actions = {
      [METRIC_TYPES.DATA_COMPLETENESS]: 'Review data sources and improve data collection processes',
      [METRIC_TYPES.CONSISTENCY_SCORE]: 'Investigate data source differences and improve matching algorithms',
      [METRIC_TYPES.VALIDATION_ERROR_RATE]: 'Review validation rules and fix data quality issues',
      [METRIC_TYPES.OUTLIER_RATE]: 'Investigate outliers and adjust detection thresholds if needed',
      [METRIC_TYPES.MATCH_ACCURACY]: 'Improve player matching algorithms and review matching criteria',
      [METRIC_TYPES.SYNC_SUCCESS_RATE]: 'Investigate sync failures and improve error handling',
      [METRIC_TYPES.DATA_FRESHNESS]: 'Check sync schedules and resolve any blocking issues',
      [METRIC_TYPES.PROCESSING_TIME]: 'Optimize processing algorithms and check system resources'
    };
    
    return actions[metricType] || 'Review and optimize the system';
  }

  /**
   * Calculate overall health score
   * @private
   */
  calculateOverallHealthScore(dashboard) {
    const weights = {
      [METRIC_TYPES.DATA_COMPLETENESS]: 0.2,
      [METRIC_TYPES.CONSISTENCY_SCORE]: 0.2,
      [METRIC_TYPES.VALIDATION_ERROR_RATE]: 0.15,
      [METRIC_TYPES.MATCH_ACCURACY]: 0.15,
      [METRIC_TYPES.SYNC_SUCCESS_RATE]: 0.15,
      [METRIC_TYPES.DATA_FRESHNESS]: 0.1,
      [METRIC_TYPES.PROCESSING_TIME]: 0.05
    };
    
    let totalScore = 0;
    let totalWeight = 0;
    
    Object.entries(weights).forEach(([metricType, weight]) => {
      const summary = dashboard.summary[metricType];
      if (summary && summary.latest) {
        let score = summary.latest.value;
        
        // Normalize scores to 0-1 range where 1 is best
        if (metricType === METRIC_TYPES.VALIDATION_ERROR_RATE || 
            metricType === METRIC_TYPES.OUTLIER_RATE) {
          score = Math.max(0, 1 - score); // Invert error rates
        } else if (metricType === METRIC_TYPES.DATA_FRESHNESS) {
          // Convert freshness to score (fresher is better)
          const maxAge = 7 * 24 * 3600; // 7 days in seconds
          score = Math.max(0, 1 - (score / maxAge));
        } else if (metricType === METRIC_TYPES.PROCESSING_TIME) {
          // Convert processing time to score (faster is better)
          const maxTime = 1800; // 30 minutes in seconds
          score = Math.max(0, 1 - (score / maxTime));
        }
        
        totalScore += score * weight;
        totalWeight += weight;
      }
    });
    
    const healthScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    
    return {
      score: healthScore,
      grade: this.getHealthGrade(healthScore),
      status: this.getHealthStatus(healthScore)
    };
  }

  /**
   * Get health grade
   * @private
   */
  getHealthGrade(score) {
    if (score >= 0.9) return 'A';
    if (score >= 0.8) return 'B';
    if (score >= 0.7) return 'C';
    if (score >= 0.6) return 'D';
    return 'F';
  }

  /**
   * Get health status
   * @private
   */
  getHealthStatus(score) {
    if (score >= 0.9) return 'EXCELLENT';
    if (score >= 0.8) return 'GOOD';
    if (score >= 0.7) return 'FAIR';
    if (score >= 0.6) return 'POOR';
    return 'CRITICAL';
  }
}

export {
  FFAnalyticsQualityMonitor,
  QualityMetric,
  QualityAlert,
  METRIC_TYPES,
  ALERT_SEVERITY,
  QUALITY_THRESHOLDS
};

export default FFAnalyticsQualityMonitor;