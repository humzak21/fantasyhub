import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';

/**
 * Analytics Monitoring Dashboard Component
 * Provides real-time monitoring of the FFAnalytics integration system
 */
const AnalyticsMonitoringDashboard = () => {
  const [healthStatus, setHealthStatus] = useState(null);
  const [performanceMetrics, setPerformanceMetrics] = useState(null);
  const [systemLogs, setSystemLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Fetch health status
  const fetchHealthStatus = async () => {
    try {
      const response = await fetch('/api/analytics/health');
      const data = await response.json();
      setHealthStatus(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch health status:', error);
    }
  };

  // Fetch performance metrics
  const fetchPerformanceMetrics = async () => {
    try {
      const response = await fetch('/api/analytics/metrics');
      const data = await response.json();
      setPerformanceMetrics(data);
    } catch (error) {
      console.error('Failed to fetch performance metrics:', error);
    }
  };

  // Fetch system logs
  const fetchSystemLogs = async () => {
    try {
      const response = await fetch('/api/analytics/logs');
      const data = await response.json();
      setSystemLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to fetch system logs:', error);
    }
  };

  // Initial load and periodic updates
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchHealthStatus(),
        fetchPerformanceMetrics(),
        fetchSystemLogs()
      ]);
      setIsLoading(false);
    };

    loadData();

    // Set up periodic updates every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Status badge component
  const StatusBadge = ({ status }) => {
    const variants = {
      healthy: 'default',
      degraded: 'secondary',
      unhealthy: 'destructive',
      pending: 'outline'
    };

    const colors = {
      healthy: 'text-green-600',
      degraded: 'text-yellow-600',
      unhealthy: 'text-red-600',
      pending: 'text-gray-600'
    };

    return (
      <Badge variant={variants[status] || 'outline'} className={colors[status]}>
        {status?.toUpperCase() || 'UNKNOWN'}
      </Badge>
    );
  };

  // Health overview component
  const HealthOverview = () => {
    if (!healthStatus) return <div>Loading health status...</div>;

    const { overall, details } = healthStatus;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">System Health</h3>
          <div className="flex items-center gap-2">
            <StatusBadge status={overall.status} />
            <span className="text-sm text-gray-600">
              Score: {overall.score}%
            </span>
          </div>
        </div>

        <Progress value={overall.score} className="w-full" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(details).map(([category, info]) => (
            <Card key={category} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium capitalize">
                  {category.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <StatusBadge status={info.status} />
              </div>
              {info.details?.error && (
                <p className="text-sm text-red-600 mt-1">
                  {info.details.error}
                </p>
              )}
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // Performance metrics component
  const PerformanceMetrics = () => {
    if (!performanceMetrics) return <div>Loading performance metrics...</div>;

    const {
      rScriptExecutions,
      cachePerformance,
      dataQuality,
      systemResources
    } = performanceMetrics;

    return (
      <div className="space-y-6">
        {/* R Script Performance */}
        <Card>
          <CardHeader>
            <CardTitle>R Script Execution</CardTitle>
            <CardDescription>Performance metrics for R script operations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {rScriptExecutions?.totalExecutions || 0}
                </div>
                <div className="text-sm text-gray-600">Total Executions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {rScriptExecutions?.successRate || 0}%
                </div>
                <div className="text-sm text-gray-600">Success Rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {rScriptExecutions?.avgExecutionTime || 0}ms
                </div>
                <div className="text-sm text-gray-600">Avg Execution Time</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {rScriptExecutions?.failedExecutions || 0}
                </div>
                <div className="text-sm text-gray-600">Failed Executions</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cache Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Cache Performance</CardTitle>
            <CardDescription>Analytics data caching efficiency</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {cachePerformance?.hitRate || 0}%
                </div>
                <div className="text-sm text-gray-600">Hit Rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {cachePerformance?.totalRequests || 0}
                </div>
                <div className="text-sm text-gray-600">Total Requests</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {cachePerformance?.avgResponseTime || 0}ms
                </div>
                <div className="text-sm text-gray-600">Avg Response Time</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {cachePerformance?.cacheSize || 0}
                </div>
                <div className="text-sm text-gray-600">Cache Entries</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Quality */}
        <Card>
          <CardHeader>
            <CardTitle>Data Quality</CardTitle>
            <CardDescription>Analytics data quality metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {dataQuality?.playerMatchRate || 0}%
                </div>
                <div className="text-sm text-gray-600">Player Match Rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {dataQuality?.dataFreshness || 0}h
                </div>
                <div className="text-sm text-gray-600">Data Freshness (hours)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {dataQuality?.validationErrors || 0}
                </div>
                <div className="text-sm text-gray-600">Validation Errors</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // System logs component
  const SystemLogs = () => {
    const getLogLevelColor = (level) => {
      const colors = {
        error: 'text-red-600',
        warn: 'text-yellow-600',
        info: 'text-blue-600',
        debug: 'text-gray-600'
      };
      return colors[level] || 'text-gray-600';
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent System Logs</h3>
          <Button variant="outline" size="sm" onClick={fetchSystemLogs}>
            Refresh Logs
          </Button>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
          {systemLogs.length === 0 ? (
            <p className="text-gray-600 text-center py-4">No logs available</p>
          ) : (
            <div className="space-y-2">
              {systemLogs.map((log, index) => (
                <div key={index} className="flex items-start gap-3 text-sm">
                  <span className="text-gray-500 font-mono text-xs">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`font-medium ${getLogLevelColor(log.level)}`}>
                    [{log.level.toUpperCase()}]
                  </span>
                  <span className="flex-1">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading analytics monitoring dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics Monitoring</h1>
          <p className="text-gray-600">
            Monitor the health and performance of your FFAnalytics integration
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchHealthStatus}>
            Refresh
          </Button>
          {lastUpdate && (
            <span className="text-sm text-gray-600">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {healthStatus?.overall?.status === 'unhealthy' && (
        <Alert>
          <AlertDescription>
            The analytics system has critical issues that require attention.
            Check the health status and logs for more details.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="health" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="health">Health Status</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="logs">System Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="space-y-4">
          <HealthOverview />
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <PerformanceMetrics />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <SystemLogs />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsMonitoringDashboard;