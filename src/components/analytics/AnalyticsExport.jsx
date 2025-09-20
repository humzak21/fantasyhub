import React, { useState } from 'react';
import { Download, FileText, Table, BarChart3, Calendar } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '../ui/dropdown-menu';
import { Badge } from '../ui/badge';

/**
 * AnalyticsExport Component
 * 
 * Provides analytics data export capabilities for power rankings.
 * Supports multiple export formats and data selections.
 * 
 * Requirements addressed:
 * - Implement analytics data export capabilities
 * - Support multiple export formats (JSON, CSV, Summary)
 * - Allow selective data export
 */
const AnalyticsExport = ({ 
  rankings = [], 
  currentWeek = 1, 
  analyticsData = {},
  onExport = null 
}) => {
  const [isExporting, setIsExporting] = useState(false);

  // Generate export data based on format
  const generateExportData = (format, scope) => {
    const timestamp = new Date().toISOString();
    const baseData = {
      exportInfo: {
        timestamp,
        week: currentWeek,
        format,
        scope,
        totalTeams: rankings.length
      }
    };

    switch (scope) {
      case 'summary':
        return {
          ...baseData,
          summary: generateSummaryData()
        };
      
      case 'detailed':
        return {
          ...baseData,
          teams: generateDetailedTeamData(),
          leagueAnalytics: generateLeagueAnalytics()
        };
      
      case 'players':
        return {
          ...baseData,
          playerAnalytics: generatePlayerAnalyticsData()
        };
      
      case 'trends':
        return {
          ...baseData,
          trends: generateTrendsData()
        };
      
      default:
        return {
          ...baseData,
          rankings: rankings.map(team => ({
            rank: rankings.indexOf(team) + 1,
            teamId: team.teamId || team.id,
            teamName: team.name,
            powerRating: team.powerRating,
            analyticsData: analyticsData[team.teamId || team.id] || null
          }))
        };
    }
  };

  const generateSummaryData = () => {
    const teamsWithAnalytics = rankings.filter(team => 
      analyticsData[team.teamId || team.id]
    );

    const totalTrendingUp = teamsWithAnalytics.reduce((sum, team) => {
      const analytics = analyticsData[team.teamId || team.id];
      return sum + (analytics?.trendingUpPlayers || 0);
    }, 0);

    const totalTrendingDown = teamsWithAnalytics.reduce((sum, team) => {
      const analytics = analyticsData[team.teamId || team.id];
      return sum + (analytics?.trendingDownPlayers || 0);
    }, 0);

    const avgAnalyticsStrength = teamsWithAnalytics.length > 0 ? 
      teamsWithAnalytics.reduce((sum, team) => {
        const analytics = analyticsData[team.teamId || team.id];
        return sum + (analytics?.analyticsStrengthScore || 0);
      }, 0) / teamsWithAnalytics.length : 0;

    return {
      week: currentWeek,
      teamsAnalyzed: teamsWithAnalytics.length,
      totalTrendingUp,
      totalTrendingDown,
      avgAnalyticsStrength: Math.round(avgAnalyticsStrength),
      topAnalyticsTeam: teamsWithAnalytics.reduce((best, team) => {
        const analytics = analyticsData[team.teamId || team.id];
        const bestAnalytics = analyticsData[best?.teamId || best?.id];
        return (analytics?.analyticsStrengthScore || 0) > (bestAnalytics?.analyticsStrengthScore || 0) ? 
          team : best;
      }, teamsWithAnalytics[0])
    };
  };

  const generateDetailedTeamData = () => {
    return rankings.map((team, index) => {
      const analytics = analyticsData[team.teamId || team.id];
      return {
        rank: index + 1,
        teamId: team.teamId || team.id,
        teamName: team.name,
        owner: team.owner,
        record: `${team.wins || 0}-${team.losses || 0}${team.ties > 0 ? `-${team.ties}` : ''}`,
        powerRating: team.powerRating,
        powerRatingComponents: team.powerRatingComponents,
        analytics: analytics ? {
          trendingUpPlayers: analytics.trendingUpPlayers,
          trendingDownPlayers: analytics.trendingDownPlayers,
          avgPlayerRank: analytics.avgPlayerRank,
          avgTrendScore: analytics.avgTrendScore,
          consistencyRating: analytics.consistencyRating,
          analyticsStrengthScore: analytics.analyticsStrengthScore,
          totalCeilingScore: analytics.totalCeilingScore,
          totalFloorScore: analytics.totalFloorScore
        } : null
      };
    });
  };

  const generatePlayerAnalyticsData = () => {
    const allPlayerData = [];
    
    rankings.forEach(team => {
      const analytics = analyticsData[team.teamId || team.id];
      if (analytics?.playerAnalytics) {
        analytics.playerAnalytics.forEach(player => {
          allPlayerData.push({
            teamId: team.teamId || team.id,
            teamName: team.name,
            teamRank: rankings.indexOf(team) + 1,
            playerId: player.playerId,
            playerName: player.playerName,
            position: player.position,
            weeklyRank: player.weeklyRank,
            positionRank: player.positionRank,
            projectedPoints: player.projectedPoints,
            trendScore: player.trendScore,
            consistencyRating: player.consistencyRating,
            ceilingScore: player.ceilingScore,
            floorScore: player.floorScore
          });
        });
      }
    });

    return allPlayerData.sort((a, b) => (b.projectedPoints || 0) - (a.projectedPoints || 0));
  };

  const generateTrendsData = () => {
    const trends = {
      week: currentWeek,
      teamTrends: [],
      leagueTrends: {
        totalPlayersAnalyzed: 0,
        avgTrendScore: 0,
        avgConsistencyRating: 0,
        topTrendingTeams: [],
        strugglingTeams: []
      }
    };

    let totalPlayers = 0;
    let totalTrendScore = 0;
    let totalConsistency = 0;

    rankings.forEach(team => {
      const analytics = analyticsData[team.teamId || team.id];
      if (analytics) {
        const teamTrend = {
          teamId: team.teamId || team.id,
          teamName: team.name,
          rank: rankings.indexOf(team) + 1,
          trendingUpPlayers: analytics.trendingUpPlayers,
          trendingDownPlayers: analytics.trendingDownPlayers,
          avgTrendScore: analytics.avgTrendScore,
          consistencyRating: analytics.consistencyRating,
          momentum: analytics.avgTrendScore > 0.1 ? 'positive' : 
                   analytics.avgTrendScore < -0.1 ? 'negative' : 'neutral'
        };
        
        trends.teamTrends.push(teamTrend);
        
        if (analytics.playerAnalytics) {
          totalPlayers += analytics.playerAnalytics.length;
          totalTrendScore += analytics.avgTrendScore || 0;
          totalConsistency += analytics.consistencyRating || 0;
        }
      }
    });

    // Calculate league averages
    const teamsWithData = trends.teamTrends.length;
    if (teamsWithData > 0) {
      trends.leagueTrends.totalPlayersAnalyzed = totalPlayers;
      trends.leagueTrends.avgTrendScore = totalTrendScore / teamsWithData;
      trends.leagueTrends.avgConsistencyRating = totalConsistency / teamsWithData;
      
      // Find top trending and struggling teams
      trends.leagueTrends.topTrendingTeams = trends.teamTrends
        .filter(t => t.avgTrendScore > 0.1)
        .sort((a, b) => b.avgTrendScore - a.avgTrendScore)
        .slice(0, 3);
        
      trends.leagueTrends.strugglingTeams = trends.teamTrends
        .filter(t => t.avgTrendScore < -0.1)
        .sort((a, b) => a.avgTrendScore - b.avgTrendScore)
        .slice(0, 3);
    }

    return trends;
  };

  const generateLeagueAnalytics = () => {
    const teamsWithAnalytics = rankings.filter(team => 
      analyticsData[team.teamId || team.id]
    );

    if (teamsWithAnalytics.length === 0) return null;

    const analytics = teamsWithAnalytics.map(team => 
      analyticsData[team.teamId || team.id]
    );

    return {
      teamsAnalyzed: teamsWithAnalytics.length,
      averages: {
        analyticsStrengthScore: analytics.reduce((sum, a) => sum + (a.analyticsStrengthScore || 0), 0) / analytics.length,
        avgPlayerRank: analytics.reduce((sum, a) => sum + (a.avgPlayerRank || 0), 0) / analytics.length,
        consistencyRating: analytics.reduce((sum, a) => sum + (a.consistencyRating || 0), 0) / analytics.length,
        avgTrendScore: analytics.reduce((sum, a) => sum + (a.avgTrendScore || 0), 0) / analytics.length
      },
      totals: {
        trendingUpPlayers: analytics.reduce((sum, a) => sum + (a.trendingUpPlayers || 0), 0),
        trendingDownPlayers: analytics.reduce((sum, a) => sum + (a.trendingDownPlayers || 0), 0),
        totalCeilingScore: analytics.reduce((sum, a) => sum + (a.totalCeilingScore || 0), 0),
        totalFloorScore: analytics.reduce((sum, a) => sum + (a.totalFloorScore || 0), 0)
      }
    };
  };

  const formatDataForExport = (data, format) => {
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      
      case 'csv':
        return convertToCSV(data);
      
      case 'summary':
        return generateTextSummary(data);
      
      default:
        return JSON.stringify(data, null, 2);
    }
  };

  const convertToCSV = (data) => {
    if (data.teams) {
      // Detailed team data CSV
      const headers = [
        'Rank', 'Team Name', 'Owner', 'Record', 'Power Rating',
        'Trending Up', 'Trending Down', 'Avg Player Rank', 'Trend Score',
        'Consistency', 'Analytics Strength', 'Ceiling Score', 'Floor Score'
      ];
      
      const rows = data.teams.map(team => [
        team.rank,
        team.teamName,
        team.owner || '',
        team.record,
        team.powerRating?.toFixed(2) || '',
        team.analytics?.trendingUpPlayers || 0,
        team.analytics?.trendingDownPlayers || 0,
        team.analytics?.avgPlayerRank?.toFixed(1) || '',
        team.analytics?.avgTrendScore?.toFixed(3) || '',
        team.analytics?.consistencyRating?.toFixed(3) || '',
        team.analytics?.analyticsStrengthScore?.toFixed(1) || '',
        team.analytics?.totalCeilingScore?.toFixed(1) || '',
        team.analytics?.totalFloorScore?.toFixed(1) || ''
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
    
    if (data.playerAnalytics) {
      // Player analytics CSV
      const headers = [
        'Team Name', 'Team Rank', 'Player Name', 'Position', 'Weekly Rank',
        'Position Rank', 'Projected Points', 'Trend Score', 'Consistency',
        'Ceiling Score', 'Floor Score'
      ];
      
      const rows = data.playerAnalytics.map(player => [
        player.teamName,
        player.teamRank,
        player.playerName,
        player.position,
        player.weeklyRank || '',
        player.positionRank || '',
        player.projectedPoints?.toFixed(1) || '',
        player.trendScore?.toFixed(3) || '',
        player.consistencyRating?.toFixed(3) || '',
        player.ceilingScore?.toFixed(1) || '',
        player.floorScore?.toFixed(1) || ''
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
    
    // Default CSV format
    return JSON.stringify(data, null, 2);
  };

  const generateTextSummary = (data) => {
    if (data.summary) {
      return `
Fantasy Football Analytics Summary - Week ${data.summary.week}
Generated: ${new Date(data.exportInfo.timestamp).toLocaleString()}

League Overview:
- Teams Analyzed: ${data.summary.teamsAnalyzed}
- Players Trending Up: ${data.summary.totalTrendingUp}
- Players Trending Down: ${data.summary.totalTrendingDown}
- Average Analytics Strength: ${data.summary.avgAnalyticsStrength}
- Top Analytics Team: ${data.summary.topAnalyticsTeam?.name || 'N/A'}

This summary provides a high-level view of league analytics trends.
For detailed data, export in JSON or CSV format.
      `.trim();
    }
    
    return JSON.stringify(data, null, 2);
  };

  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format, scope) => {
    setIsExporting(true);
    
    try {
      const data = generateExportData(format, scope);
      const content = formatDataForExport(data, format);
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `fantasy-analytics-${scope}-week${currentWeek}-${timestamp}.${format === 'csv' ? 'csv' : format === 'summary' ? 'txt' : 'json'}`;
      const mimeType = format === 'csv' ? 'text/csv' : format === 'summary' ? 'text/plain' : 'application/json';
      
      downloadFile(content, filename, mimeType);
      
      if (onExport) {
        onExport({ format, scope, filename, timestamp });
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const teamsWithAnalytics = rankings.filter(team => 
    analyticsData[team.teamId || team.id]
  ).length;

  if (teamsWithAnalytics === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <Download className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h4 className="font-medium mb-2">Export Unavailable</h4>
          <p className="text-sm text-muted-foreground">
            No analytics data available for export.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Export Analytics Data
          <Badge variant="outline" className="ml-2">
            Week {currentWeek}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Export analytics data for {teamsWithAnalytics} teams with available data.
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Quick Export Options */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Quick Export</h4>
              <div className="space-y-2">
                <Button
                  onClick={() => handleExport('json', 'summary')}
                  disabled={isExporting}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Summary Report (JSON)
                </Button>
                <Button
                  onClick={() => handleExport('csv', 'detailed')}
                  disabled={isExporting}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                >
                  <Table className="h-4 w-4 mr-2" />
                  Team Data (CSV)
                </Button>
                <Button
                  onClick={() => handleExport('summary', 'summary')}
                  disabled={isExporting}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Text Summary
                </Button>
              </div>
            </div>
            
            {/* Advanced Export Options */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Advanced Export</h4>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    disabled={isExporting}
                    className="w-full justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      More Options
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => handleExport('json', 'detailed')}>
                    <FileText className="h-4 w-4 mr-2" />
                    Detailed Teams (JSON)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('csv', 'players')}>
                    <Table className="h-4 w-4 mr-2" />
                    Player Analytics (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('json', 'players')}>
                    <FileText className="h-4 w-4 mr-2" />
                    Player Analytics (JSON)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport('json', 'trends')}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Trends Analysis (JSON)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('csv', 'trends')}>
                    <Table className="h-4 w-4 mr-2" />
                    Trends Analysis (CSV)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          {isExporting && (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                Generating export...
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AnalyticsExport;