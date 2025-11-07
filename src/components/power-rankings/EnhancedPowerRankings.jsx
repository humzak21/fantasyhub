import React, { useState, useMemo } from 'react';
import { BarChart3, Activity, Download, RefreshCw, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import PowerRankingsTable from './PowerRankingsTable';
import PowerRankingsVisualization from './PowerRankingsVisualization';
import AnalyticsExport from './AnalyticsExport';
import useAnalyticsData from '../../../hooks/useAnalyticsData';

/**
 * EnhancedPowerRankings Component
 * 
 * Main component that integrates analytics display with power rankings.
 * Provides tabbed interface for table view, visualization, and analytics export.
 * 
 * Requirements addressed:
 * - Add optional display of player performance insights in power rankings
 * - Show trending player indicators and analytics-influenced ranking factors
 * - Create analytics summary views for team composition analysis
 * - Implement analytics data export capabilities
 */
const EnhancedPowerRankings = ({
  rankings = [],
  onEditTeam = null,
  currentWeek = 1,
  loading = false,
  showAdvanced = false,
  analyticsEnabled = true,
  user = null,
  isAdmin = false
}) => {
  const [activeTab, setActiveTab] = useState('table');
  const [showAnalyticsColumn, setShowAnalyticsColumn] = useState(true);

  // Use analytics data hook
  const {
    analyticsData,
    hasAnalyticsData,
    loading: analyticsLoading,
    error: analyticsError,
    refreshAnalytics,
    getAnalyticsSummary,
    exportAnalyticsData,
    isEnabled: analyticsServiceEnabled
  } = useAnalyticsData(rankings, currentWeek, analyticsEnabled);

  // Calculate analytics summary
  const analyticsSummary = useMemo(() => {
    return getAnalyticsSummary();
  }, [getAnalyticsSummary]);

  // Handle analytics export
  const handleAnalyticsExport = (exportData) => {
    try {
      exportAnalyticsData('json', 'detailed');
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // Handle analytics refresh
  const handleRefreshAnalytics = async () => {
    try {
      await refreshAnalytics();
    } catch (error) {
      console.error('Refresh failed:', error);
    }
  };

  const renderAnalyticsStatus = () => {
    if (!analyticsEnabled) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Settings className="h-3 w-3" />
          Analytics Disabled
        </Badge>
      );
    }

    if (!analyticsServiceEnabled) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <Activity className="h-3 w-3" />
          Service Unavailable
        </Badge>
      );
    }

    if (analyticsError) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <Activity className="h-3 w-3" />
          Error: {analyticsError}
        </Badge>
      );
    }

    if (analyticsLoading) {
      return (
        <Badge variant="outline" className="flex items-center gap-1">
          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
          Loading Analytics
        </Badge>
      );
    }

    if (hasAnalyticsData) {
      return (
        <Badge variant="default" className="flex items-center gap-1 bg-green-100 text-green-700 hover:bg-green-100">
          <Activity className="h-3 w-3" />
          {analyticsSummary?.teamsAnalyzed || 0} Teams Analyzed
        </Badge>
      );
    }

    return (
      // <Badge variant="outline" className="flex items-center gap-1">
      //   <Activity className="h-3 w-3" />
      //   No Data
      // </Badge>
      null
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Analytics Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-blue-600" />
                Power Rankings
                <Badge variant="outline">Week {currentWeek}</Badge>
              </CardTitle>
              {renderAnalyticsStatus()}
            </div>
            
            <div className="flex items-center gap-2">
              {analyticsEnabled && hasAnalyticsData && (
                <>
                  <Button
                    onClick={handleRefreshAnalytics}
                    disabled={analyticsLoading}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${analyticsLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  
                  <Button
                    onClick={() => setShowAnalyticsColumn(!showAnalyticsColumn)}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Activity className="h-4 w-4" />
                    {showAnalyticsColumn ? 'Hide' : 'Show'} Analytics
                  </Button>
                </>
              )}
            </div>
          </div>
          
          {/* Analytics Summary */}
          {analyticsSummary && (
            <div className="flex items-center gap-6 text-sm text-muted-foreground mt-2">
              <div className="flex items-center gap-1">
                <span>Teams:</span>
                <span className="font-medium">{analyticsSummary.teamsAnalyzed}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>Trending Up:</span>
                <span className="font-medium text-green-600">{analyticsSummary.totalTrendingUp}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>Trending Down:</span>
                <span className="font-medium text-red-600">{analyticsSummary.totalTrendingDown}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>Avg Strength:</span>
                <span className="font-medium">{analyticsSummary.avgStrengthScore}</span>
              </div>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="table" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Table View
          </TabsTrigger>
          <TabsTrigger value="visualization" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Visualization
          </TabsTrigger>
          <TabsTrigger 
            value="export" 
            className="flex items-center gap-2"
            disabled={!hasAnalyticsData}
          >
            <Download className="h-4 w-4" />
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="space-y-4">
          <PowerRankingsTable
            rankings={rankings}
            onEditTeam={onEditTeam}
            showAdvanced={showAdvanced}
            currentWeek={currentWeek}
            loading={loading}
            analyticsData={analyticsData}
            showAnalytics={analyticsEnabled && showAnalyticsColumn && hasAnalyticsData}
            onExportAnalytics={handleAnalyticsExport}
            user={user}
          />
        </TabsContent>

        <TabsContent value="visualization" className="space-y-4">
          <PowerRankingsVisualization
            rankings={rankings}
            currentWeek={currentWeek}
            analyticsData={analyticsData}
            showAnalyticsSection={analyticsEnabled && hasAnalyticsData}
            user={user}
            isAdmin={isAdmin}
          />
        </TabsContent>

        <TabsContent value="export" className="space-y-4">
          {hasAnalyticsData ? (
            <AnalyticsExport
              rankings={rankings}
              currentWeek={currentWeek}
              analyticsData={analyticsData}
              onExport={handleAnalyticsExport}
            />
          ) : (
            // <Card>
            //   <CardContent className="p-8 text-center">
            //     <Download className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            //     <h3 className="font-semibold text-lg mb-2">No Analytics Data</h3>
            //     <p className="text-muted-foreground mb-4">
            //       Analytics data is not available for export. Enable analytics and ensure data is loaded.
            //     </p>
            //     {analyticsEnabled && (
            //       <Button onClick={handleRefreshAnalytics} disabled={analyticsLoading}>
            //         <RefreshCw className={`h-4 w-4 mr-2 ${analyticsLoading ? 'animate-spin' : ''}`} />
            //         Try Loading Analytics
            //       </Button>
            //     )}
            //   </CardContent>
            // </Card>
            null
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EnhancedPowerRankings;