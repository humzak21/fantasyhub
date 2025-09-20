import React from 'react';
import PowerRankingsTable from './PowerRankingsTable';
import TrendingPlayerIndicators from './TrendingPlayerIndicators';
import AnalyticsInsights from './AnalyticsInsights';
import AnalyticsExport from './AnalyticsExport';

/**
 * Demo component showing how to use the analytics integration
 */
const PowerRankingsDemo = () => {
  // Sample data for demonstration
  const sampleRankings = [
    {
      id: 'team-1',
      teamId: 'team-1',
      name: 'Team Alpha',
      owner: 'John Doe',
      wins: 8,
      losses: 2,
      powerRating: 85.5,
      powerRatingComponents: {
        performanceScore: 82.0,
        teamStrength: 78.5,
        strengthOfSchedule: 65.2,
        momentumScore: 88.0,
        consistencyScore: 75.5,
        clutchScore: 70.0
      }
    },
    {
      id: 'team-2',
      teamId: 'team-2',
      name: 'Team Beta',
      owner: 'Jane Smith',
      wins: 6,
      losses: 4,
      powerRating: 72.3,
      powerRatingComponents: {
        performanceScore: 70.0,
        teamStrength: 68.5,
        strengthOfSchedule: 75.2,
        momentumScore: 65.0,
        consistencyScore: 80.5,
        clutchScore: 85.0
      }
    }
  ];

  const sampleAnalyticsData = {
    'team-1': {
      trendingUpPlayers: 3,
      trendingDownPlayers: 1,
      totalCeilingScore: 145.5,
      totalFloorScore: 98.2,
      avgPlayerRank: 25.5,
      avgTrendScore: 0.15,
      consistencyRating: 0.72,
      analyticsStrengthScore: 78.5,
      playerAnalytics: [
        {
          playerId: 'player-1',
          playerName: 'Josh Allen',
          position: 'QB',
          weeklyRank: 8,
          positionRank: 3,
          projectedPoints: 22.5,
          trendScore: 0.25,
          consistencyRating: 0.85,
          ceilingScore: 28.0,
          floorScore: 18.0
        },
        {
          playerId: 'player-2',
          playerName: 'Christian McCaffrey',
          position: 'RB',
          weeklyRank: 5,
          positionRank: 2,
          projectedPoints: 20.8,
          trendScore: 0.18,
          consistencyRating: 0.78,
          ceilingScore: 26.5,
          floorScore: 15.2
        }
      ]
    },
    'team-2': {
      trendingUpPlayers: 1,
      trendingDownPlayers: 2,
      totalCeilingScore: 132.8,
      totalFloorScore: 89.5,
      avgPlayerRank: 35.2,
      avgTrendScore: -0.08,
      consistencyRating: 0.65,
      analyticsStrengthScore: 65.2,
      playerAnalytics: [
        {
          playerId: 'player-3',
          playerName: 'Patrick Mahomes',
          position: 'QB',
          weeklyRank: 12,
          positionRank: 5,
          projectedPoints: 21.2,
          trendScore: -0.12,
          consistencyRating: 0.72,
          ceilingScore: 27.0,
          floorScore: 16.8
        }
      ]
    }
  };

  const handleExportAnalytics = (exportData) => {
    console.log('Analytics exported:', exportData);
    // In a real app, this would trigger the actual export
  };

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold mb-4">Power Rankings with Analytics Integration</h1>
        <p className="text-muted-foreground mb-6">
          This demo shows the analytics integration in action. The table includes trending indicators,
          expandable analytics insights, and export capabilities.
        </p>
      </div>

      {/* Main Power Rankings Table with Analytics */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Enhanced Power Rankings Table</h2>
        <PowerRankingsTable
          rankings={sampleRankings}
          currentWeek={10}
          showAdvanced={true}
          showAnalytics={true}
          analyticsData={sampleAnalyticsData}
          onExportAnalytics={handleExportAnalytics}
        />
      </div>

      {/* Individual Component Demos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xl font-semibold mb-4">Trending Player Indicators</h2>
          <div className="space-y-4">
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium mb-2">Team Alpha - Compact View</h3>
              <TrendingPlayerIndicators
                team={sampleRankings[0]}
                analyticsData={sampleAnalyticsData['team-1']}
                compact={true}
                showTooltips={false}
              />
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium mb-2">Team Beta - Full View</h3>
              <TrendingPlayerIndicators
                team={sampleRankings[1]}
                analyticsData={sampleAnalyticsData['team-2']}
                compact={false}
                showTooltips={false}
              />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Analytics Export</h2>
          <AnalyticsExport
            rankings={sampleRankings}
            currentWeek={10}
            analyticsData={sampleAnalyticsData}
            onExport={handleExportAnalytics}
          />
        </div>
      </div>

      {/* Full Analytics Insights */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Detailed Analytics Insights</h2>
        <AnalyticsInsights
          team={sampleRankings[0]}
          currentWeek={10}
          analyticsData={sampleAnalyticsData['team-1']}
          showPlayerDetails={true}
          onExportData={handleExportAnalytics}
        />
      </div>

      {/* Usage Instructions */}
      <div className="bg-blue-50 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">How to Use</h2>
        <div className="space-y-2 text-sm">
          <p><strong>1. Power Rankings Table:</strong> Set <code>showAnalytics={`{true}`}</code> to enable the analytics column</p>
          <p><strong>2. Analytics Data:</strong> Pass analytics data in the format shown in the sample data above</p>
          <p><strong>3. Trending Indicators:</strong> Click the activity icon in the analytics column to expand detailed insights</p>
          <p><strong>4. Export:</strong> Use the export buttons to download analytics data in various formats</p>
          <p><strong>5. Graceful Fallback:</strong> Components handle missing analytics data gracefully</p>
        </div>
      </div>
    </div>
  );
};

export default PowerRankingsDemo;