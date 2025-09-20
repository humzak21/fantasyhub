import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Zap, 
  Shield, 
  Award, 
  BarChart3, 
  ChevronDown, 
  ChevronUp,
  Info,
  Star,
  AlertTriangle,
  Activity,
  Users,
  Download
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu';

/**
 * AnalyticsInsights Component
 * 
 * Displays player performance insights and analytics-influenced ranking factors
 * for power rankings. Shows trending player indicators, team composition analysis,
 * and provides analytics data export capabilities.
 * 
 * Requirements addressed:
 * - 3.5: Optional display of player performance insights in power rankings
 * - Show trending player indicators and analytics-influenced ranking factors
 * - Create analytics summary views for team composition analysis
 * - Implement analytics data export capabilities
 */
const AnalyticsInsights = ({ 
  team, 
  currentWeek = 1, 
  showPlayerDetails = false,
  onExportData = null,
  analyticsData = null 
}) => {
  const [expandedSections, setExpandedSections] = useState(new Set());
  const [selectedView, setSelectedView] = useState('overview');

  // Process analytics data for display
  const processedAnalytics = useMemo(() => {
    if (!analyticsData || !team) return null;

    const {
      trendingUpPlayers = 0,
      trendingDownPlayers = 0,
      totalCeilingScore = 0,
      totalFloorScore = 0,
      avgPlayerRank = null,
      avgTrendScore = 0,
      consistencyRating = 0,
      analyticsStrengthScore = 0,
      playerAnalytics = []
    } = analyticsData;

    // Calculate insights
    const totalPlayers = playerAnalytics.length;
    const rankedPlayers = playerAnalytics.filter(p => p.weeklyRank && p.weeklyRank > 0);
    const topTierPlayers = playerAnalytics.filter(p => p.weeklyRank && p.weeklyRank <= 12);
    const strugglingPlayers = playerAnalytics.filter(p => p.trendScore < -0.2);
    const consistentPlayers = playerAnalytics.filter(p => p.consistencyRating > 0.7);

    return {
      overview: {
        trendingUpPlayers,
        trendingDownPlayers,
        totalCeilingScore,
        totalFloorScore,
        avgPlayerRank,
        avgTrendScore,
        consistencyRating,
        analyticsStrengthScore
      },
      composition: {
        totalPlayers,
        rankedPlayers: rankedPlayers.length,
        topTierPlayers: topTierPlayers.length,
        strugglingPlayers: strugglingPlayers.length,
        consistentPlayers: consistentPlayers.length
      },
      players: playerAnalytics.sort((a, b) => (b.projectedPoints || 0) - (a.projectedPoints || 0))
    };
  }, [analyticsData, team]);

  const toggleSection = (sectionId) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const handleExportData = () => {
    if (onExportData && processedAnalytics) {
      const exportData = {
        team: {
          id: team.teamId || team.id,
          name: team.name,
          week: currentWeek
        },
        analytics: processedAnalytics,
        exportedAt: new Date().toISOString()
      };
      onExportData(exportData);
    }
  };

  if (!processedAnalytics) {
    return (
      // <Card className="border-dashed">
      //   <CardContent className="p-6 text-center">
      //     <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      //     <h4 className="font-medium mb-2">Analytics Unavailable</h4>
      //     <p className="text-sm text-muted-foreground">
      //       Player performance insights are not available for this team.
      //     </p>
      //   </CardContent>
      // </Card>
      null
    );
  }

  const { overview, composition, players } = processedAnalytics;

  const AnalyticsOverview = () => (
    <div className="space-y-4">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-xs font-medium text-green-700">Trending Up</span>
          </div>
          <div className="text-2xl font-bold text-green-800">{overview.trendingUpPlayers}</div>
          <div className="text-xs text-green-600">players improving</div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-rose-100 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-red-600" />
            <span className="text-xs font-medium text-red-700">Trending Down</span>
          </div>
          <div className="text-2xl font-bold text-red-800">{overview.trendingDownPlayers}</div>
          <div className="text-xs text-red-600">players declining</div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-medium text-blue-700">Avg Rank</span>
          </div>
          <div className="text-2xl font-bold text-blue-800">
            {overview.avgPlayerRank ? Math.round(overview.avgPlayerRank) : 'N/A'}
          </div>
          <div className="text-xs text-blue-600">league position</div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-violet-100 border border-purple-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-medium text-purple-700">Strength</span>
          </div>
          <div className="text-2xl font-bold text-purple-800">
            {Math.round(overview.analyticsStrengthScore)}
          </div>
          <div className="text-xs text-purple-600">analytics score</div>
        </div>
      </div>

      {/* Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-orange-600" />
              Ceiling vs Floor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Ceiling Score</span>
                <span className="font-mono font-semibold text-orange-600">
                  {overview.totalCeilingScore.toFixed(1)}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="h-2 rounded-full bg-gradient-to-r from-orange-400 to-orange-600"
                  style={{ width: `${Math.min(100, (overview.totalCeilingScore / 200) * 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Floor Score</span>
                <span className="font-mono font-semibold text-blue-600">
                  {overview.totalFloorScore.toFixed(1)}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="h-2 rounded-full bg-gradient-to-r from-blue-400 to-blue-600"
                  style={{ width: `${Math.min(100, (overview.totalFloorScore / 150) * 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-indigo-600" />
              Consistency & Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Consistency</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-indigo-600">
                    {(overview.consistencyRating * 100).toFixed(0)}%
                  </span>
                  {overview.consistencyRating > 0.7 && <Star className="h-3 w-3 text-yellow-500" />}
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="h-2 rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600"
                  style={{ width: `${overview.consistencyRating * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Trend Score</span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-semibold ${
                    overview.avgTrendScore > 0.1 ? 'text-green-600' :
                    overview.avgTrendScore < -0.1 ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {overview.avgTrendScore > 0 ? '+' : ''}{(overview.avgTrendScore * 100).toFixed(0)}%
                  </span>
                  {Math.abs(overview.avgTrendScore) > 0.2 && (
                    overview.avgTrendScore > 0 ? 
                      <TrendingUp className="h-3 w-3 text-green-600" /> :
                      <TrendingDown className="h-3 w-3 text-red-600" />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const TeamComposition = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <Users className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
          <div className="text-lg font-bold">{composition.totalPlayers}</div>
          <div className="text-xs text-muted-foreground">Total Players</div>
        </div>
        
        <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
          <Target className="h-5 w-5 mx-auto mb-2 text-blue-600" />
          <div className="text-lg font-bold text-blue-800">{composition.rankedPlayers}</div>
          <div className="text-xs text-blue-600">Ranked Players</div>
        </div>
        
        <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
          <Star className="h-5 w-5 mx-auto mb-2 text-yellow-600" />
          <div className="text-lg font-bold text-yellow-800">{composition.topTierPlayers}</div>
          <div className="text-xs text-yellow-600">Top 12 Ranked</div>
        </div>
        
        <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
          <Shield className="h-5 w-5 mx-auto mb-2 text-green-600" />
          <div className="text-lg font-bold text-green-800">{composition.consistentPlayers}</div>
          <div className="text-xs text-green-600">Consistent</div>
        </div>
        
        <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
          <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-red-600" />
          <div className="text-lg font-bold text-red-800">{composition.strugglingPlayers}</div>
          <div className="text-xs text-red-600">Struggling</div>
        </div>
      </div>

      {/* Team Strengths & Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-green-700">
              <Award className="h-4 w-4" />
              Team Strengths
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {composition.topTierPlayers > 2 && (
              <div className="flex items-center gap-2 text-sm">
                <Star className="h-3 w-3 text-yellow-500" />
                <span>Elite player depth ({composition.topTierPlayers} top-12 players)</span>
              </div>
            )}
            {composition.consistentPlayers > composition.totalPlayers * 0.6 && (
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-3 w-3 text-green-500" />
                <span>High consistency across roster</span>
              </div>
            )}
            {overview.avgTrendScore > 0.15 && (
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span>Strong positive momentum</span>
              </div>
            )}
            {overview.totalCeilingScore > 150 && (
              <div className="flex items-center gap-2 text-sm">
                <Zap className="h-3 w-3 text-orange-500" />
                <span>High upside potential</span>
              </div>
            )}
            {!composition.topTierPlayers && !composition.consistentPlayers && overview.avgTrendScore <= 0.15 && (
              <div className="text-sm text-muted-foreground italic">
                No significant strengths identified
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />
              Areas of Concern
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {composition.strugglingPlayers > 2 && (
              <div className="flex items-center gap-2 text-sm">
                <TrendingDown className="h-3 w-3 text-red-500" />
                <span>Multiple players trending down</span>
              </div>
            )}
            {composition.rankedPlayers < composition.totalPlayers * 0.5 && (
              <div className="flex items-center gap-2 text-sm">
                <Target className="h-3 w-3 text-gray-500" />
                <span>Many unranked players</span>
              </div>
            )}
            {overview.consistencyRating < 0.4 && (
              <div className="flex items-center gap-2 text-sm">
                <Activity className="h-3 w-3 text-orange-500" />
                <span>High scoring variance</span>
              </div>
            )}
            {overview.totalFloorScore < 80 && (
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span>Low floor - bust risk</span>
              </div>
            )}
            {composition.strugglingPlayers === 0 && composition.rankedPlayers >= composition.totalPlayers * 0.5 && (
              <div className="text-sm text-muted-foreground italic">
                No major concerns identified
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const PlayerDetails = () => (
    <div className="space-y-4">
      {players.length === 0 ? (
        <div className="text-center py-8">
          <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          {/* <p className="text-muted-foreground">No player analytics available</p> */}
        </div>
      ) : (
        <div className="space-y-3">
          {players.map((player, index) => (
            <Card key={player.playerId || index} className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-semibold">{player.playerName}</h4>
                      <Badge variant="outline" className="text-xs">
                        {player.position}
                      </Badge>
                      {player.weeklyRank && player.weeklyRank <= 12 && (
                        <Star className="h-4 w-4 text-yellow-500" />
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Rank:</span>
                        <span className="ml-2 font-mono">
                          {player.weeklyRank || 'Unranked'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Projected:</span>
                        <span className="ml-2 font-mono">
                          {(player.projectedPoints || 0).toFixed(1)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Trend:</span>
                        <span className={`ml-2 font-mono ${
                          player.trendScore > 0.1 ? 'text-green-600' :
                          player.trendScore < -0.1 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {player.trendScore > 0 ? '+' : ''}{((player.trendScore || 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Consistency:</span>
                        <span className="ml-2 font-mono">
                          {((player.consistencyRating || 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {Math.abs(player.trendScore || 0) > 0.2 && (
                      player.trendScore > 0 ? 
                        <TrendingUp className="h-4 w-4 text-green-600" /> :
                        <TrendingDown className="h-4 w-4 text-red-600" />
                    )}
                    {(player.consistencyRating || 0) > 0.8 && (
                      <Shield className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            Analytics Insights - {team.name}
            <Badge variant="outline" className="ml-2">Week {currentWeek}</Badge>
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {onExportData && (
              <Button
                onClick={handleExportData}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  {selectedView === 'overview' && 'Overview'}
                  {selectedView === 'composition' && 'Composition'}
                  {selectedView === 'players' && 'Players'}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setSelectedView('overview')}
                  className={selectedView === 'overview' ? "bg-accent" : ""}
                >
                  Overview
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSelectedView('composition')}
                  className={selectedView === 'composition' ? "bg-accent" : ""}
                >
                  Team Composition
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSelectedView('players')}
                  className={selectedView === 'players' ? "bg-accent" : ""}
                >
                  Player Details
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {selectedView === 'overview' && <AnalyticsOverview />}
        {selectedView === 'composition' && <TeamComposition />}
        {selectedView === 'players' && <PlayerDetails />}
      </CardContent>
    </Card>
  );
};

export default AnalyticsInsights;