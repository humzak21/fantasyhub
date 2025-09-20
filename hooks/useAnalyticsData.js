import { useState, useEffect, useCallback } from 'react';
import { FFAnalyticsService } from '../services/ffAnalyticsService.client.js';
import { getSampleAnalyticsData, shouldUseSampleData } from '../utils/sampleAnalyticsData.js';

/**
 * Custom hook for managing analytics data in power rankings
 * 
 * Provides analytics data fetching, caching, and state management
 * for power rankings components.
 * 
 * Requirements addressed:
 * - Fetch and manage analytics data for power rankings display
 * - Handle loading states and error conditions
 * - Provide data export capabilities
 */
export const useAnalyticsData = (teams = [], currentWeek = 1, enabled = true) => {
  const [analyticsData, setAnalyticsData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [analyticsService, setAnalyticsService] = useState(null);

  // Initialize analytics service
  useEffect(() => {
    if (enabled) {
      try {
        const service = new FFAnalyticsService();
        setAnalyticsService(service);
      } catch (err) {
        console.warn('Failed to initialize analytics service:', err);
        setError(err.message);
      }
    }
  }, [enabled]);

  // Fetch analytics data for all teams
  const fetchAnalyticsData = useCallback(async (force = false) => {
    if (!analyticsService || !enabled || teams.length === 0) {
      return;
    }

    // Skip if recently fetched and not forced
    if (!force && lastUpdated && Date.now() - lastUpdated < 300000) { // 5 minutes
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const teamAnalyticsData = {};

      // Fetch analytics for each team
      await Promise.all(
        teams.map(async (team) => {
          try {
            const teamId = team.teamId || team.id;
            const analytics = await analyticsService.getTeamAnalyticsScore(
              teamId,
              currentWeek
            );

            if (analytics && (analytics.analyticsStrengthScore > 0 || analytics.trendingUpPlayers > 0 || analytics.trendingDownPlayers > 0)) {
              // Also fetch individual player analytics for detailed view
              const playerAnalytics = await fetchPlayerAnalytics(teamId, currentWeek);
              
              teamAnalyticsData[teamId] = {
                ...analytics,
                playerAnalytics: playerAnalytics || []
              };
            }
          } catch (teamError) {
            console.warn(`Failed to fetch analytics for team ${team.name}:`, teamError);
            // Don't fail the entire operation for one team
          }
        })
      );

      setAnalyticsData(teamAnalyticsData);
      setLastUpdated(Date.now());
    } catch (err) {
      console.error('Failed to fetch analytics data:', err);
      setError(err.message);
      // In client-side mode, don't treat this as a fatal error
      setAnalyticsData({});
    } finally {
      setLoading(false);
    }
  }, [analyticsService, enabled, teams, currentWeek, lastUpdated]);

  // Fetch player analytics for a specific team
  const fetchPlayerAnalytics = async (teamId, week) => {
    if (!analyticsService) return null;

    try {
      // This would need to be implemented in the analytics service
      // For now, return mock data structure
      return [];
    } catch (error) {
      console.warn(`Failed to fetch player analytics for team ${teamId}:`, error);
      return null;
    }
  };

  // Refresh analytics data
  const refreshAnalytics = useCallback(() => {
    return fetchAnalyticsData(true);
  }, [fetchAnalyticsData]);

  // Get analytics for a specific team
  const getTeamAnalytics = useCallback((teamId) => {
    return analyticsData[teamId] || null;
  }, [analyticsData]);

  // Check if analytics are available for any team
  const hasAnalyticsData = Object.keys(analyticsData).length > 0;

  // Get analytics summary
  const getAnalyticsSummary = useCallback(() => {
    if (!hasAnalyticsData) return null;

    const teams = Object.values(analyticsData);
    const totalTrendingUp = teams.reduce((sum, team) => sum + (team.trendingUpPlayers || 0), 0);
    const totalTrendingDown = teams.reduce((sum, team) => sum + (team.trendingDownPlayers || 0), 0);
    const avgStrengthScore = teams.reduce((sum, team) => sum + (team.analyticsStrengthScore || 0), 0) / teams.length;

    return {
      teamsAnalyzed: teams.length,
      totalTrendingUp,
      totalTrendingDown,
      avgStrengthScore: Math.round(avgStrengthScore)
    };
  }, [analyticsData, hasAnalyticsData]);

  // Export analytics data
  const exportAnalyticsData = useCallback((format = 'json', scope = 'summary') => {
    if (!hasAnalyticsData) {
      throw new Error('No analytics data available for export');
    }

    const exportData = {
      timestamp: new Date().toISOString(),
      week: currentWeek,
      format,
      scope,
      data: analyticsData
    };

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `analytics-${scope}-week${currentWeek}-${timestamp}.${format}`;

    // Format data based on format
    let content;
    switch (format) {
      case 'csv':
        content = convertToCSV(exportData);
        break;
      case 'json':
      default:
        content = JSON.stringify(exportData, null, 2);
        break;
    }

    // Download file
    const blob = new Blob([content], { 
      type: format === 'csv' ? 'text/csv' : 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { filename, timestamp };
  }, [analyticsData, hasAnalyticsData, currentWeek]);

  // Convert analytics data to CSV format
  const convertToCSV = (data) => {
    const headers = [
      'Team ID', 'Trending Up', 'Trending Down', 'Avg Player Rank',
      'Trend Score', 'Consistency', 'Analytics Strength', 'Ceiling Score', 'Floor Score'
    ];

    const rows = Object.entries(data.data).map(([teamId, analytics]) => [
      teamId,
      analytics.trendingUpPlayers || 0,
      analytics.trendingDownPlayers || 0,
      analytics.avgPlayerRank?.toFixed(1) || '',
      analytics.avgTrendScore?.toFixed(3) || '',
      analytics.consistencyRating?.toFixed(3) || '',
      analytics.analyticsStrengthScore?.toFixed(1) || '',
      analytics.totalCeilingScore?.toFixed(1) || '',
      analytics.totalFloorScore?.toFixed(1) || ''
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  };

  // Auto-fetch on mount and when dependencies change
  useEffect(() => {
    if (enabled && teams.length > 0) {
      fetchAnalyticsData();
    }
  }, [fetchAnalyticsData, enabled, teams.length]);

  return {
    // Data
    analyticsData,
    hasAnalyticsData,
    loading,
    error,
    lastUpdated,
    
    // Methods
    refreshAnalytics,
    getTeamAnalytics,
    getAnalyticsSummary,
    exportAnalyticsData,
    
    // Status
    isEnabled: enabled && analyticsService !== null
  };
};

export default useAnalyticsData;