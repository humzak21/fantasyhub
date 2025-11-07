import React, { useState } from 'react';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Crown,
  Medal,
  Award,
  ChevronDown,
  ChevronUp,
  Info,
  Target,
  Zap,
  Shield,
  Activity,
  BarChart3
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { isUserTeam, getUserTeamHighlightClasses } from '../../utils/userTeamUtils';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';

/**
 * Mobile-optimized Power Rankings component
 * Features card-based layout optimized for touch interaction and mobile viewing
 */
const MobilePowerRankings = ({
  rankings = [],
  currentWeek = 1,
  loading = false,
  showAdvanced = false,
  analyticsData = {},
  showAnalytics = false,
  onExportAnalytics = null,
  user = null,
  isAdmin = false
}) => {
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [analyticsExpandedCards, setAnalyticsExpandedCards] = useState(new Set());

  const toggleCardExpansion = (teamId) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setExpandedCards(newExpanded);
  };

  const toggleAnalyticsExpansion = (teamId) => {
    const newExpanded = new Set(analyticsExpandedCards);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setAnalyticsExpandedCards(newExpanded);
  };

  const getRankColor = (rank) => {
    if (rank === 1) return 'text-yellow-700 bg-gradient-to-br from-yellow-100 to-amber-200 border-yellow-400 shadow-sm';
    if (rank <= 3) return 'text-orange-700 bg-gradient-to-br from-orange-100 to-red-200 border-orange-400 shadow-sm';
    if (rank <= 6) return 'text-green-700 bg-gradient-to-br from-green-100 to-emerald-200 border-green-400 shadow-sm';
    if (rank <= 10) return 'text-blue-700 bg-gradient-to-br from-blue-100 to-indigo-200 border-blue-400 shadow-sm';
    return 'text-muted-foreground bg-gradient-to-br from-muted/50 to-muted/80 border-muted-foreground/30';
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return <Crown className="h-5 w-5" />;
    if (rank <= 3) return <Medal className="h-5 w-5" />;
    if (rank <= 6) return <Award className="h-5 w-5" />;
    return null;
  };

  const getRankChangeIcon = (change) => {
    if (change > 0) return <TrendingUp size={16} className="text-green-600" />;
    if (change < 0) return <TrendingDown size={16} className="text-red-600" />;
    return <Minus size={16} className="text-gray-400" />;
  };

  const getStreakDisplay = (streak) => {
    if (streak?.type === 'none') return '-';
    const prefix = streak?.type === 'win' ? 'W' : streak?.type === 'loss' ? 'L' : 'T';
    return `${prefix}${streak?.length || 0}`;
  };

  const getStreakVariant = (streak) => {
    if (streak?.type === 'win') return 'default';
    if (streak?.type === 'loss') return 'destructive';
    return 'secondary';
  };

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
                <div className="w-16 h-8 bg-muted rounded"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!rankings.length) {
    return (
      <Card className="p-8">
        <CardContent className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
            <Trophy className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">No Rankings Available</h3>
            <p className="text-muted-foreground text-sm">
              Add teams and games to see power rankings for week {currentWeek}.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderComponentBreakdown = (team) => {
    if (!team.powerRatingComponents) return null;

    const components = [
      { key: 'performanceScore', label: 'Performance', shortLabel: 'Perf', icon: TrendingUp, color: 'text-blue-600', bgColor: 'bg-blue-600' },
      { key: 'teamStrength', label: 'Team Strength', shortLabel: 'Strength', icon: Zap, color: 'text-green-600', bgColor: 'bg-green-600' },
      { key: 'strengthOfSchedule', label: 'Schedule', shortLabel: 'SOS', icon: Target, color: 'text-orange-600', bgColor: 'bg-orange-600' },
      { key: 'momentumScore', label: 'Momentum', shortLabel: 'Momentum', icon: Activity, color: 'text-purple-600', bgColor: 'bg-purple-600' },
      { key: 'consistencyScore', label: 'Consistency', shortLabel: 'Consistent', icon: Shield, color: 'text-indigo-600', bgColor: 'bg-indigo-600' }
    ];

    return (
      <div className="border-t bg-muted/10">
        {/* Section Header */}
        <div className="p-4 bg-gradient-to-r from-muted/20 to-muted/10 border-b border-muted/30">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm text-foreground">Rating Components</span>
            <Badge variant="outline" className="text-xs h-5">Week {currentWeek}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Detailed breakdown of power rating calculation</p>
        </div>

        {/* Component Metrics */}
        <div className="p-4">
          <div className="space-y-3">
            {components.map((component) => {
              const value = team.powerRatingComponents[component.key] || 0;
              const percentage = Math.round((value / 100) * 100);
              const Icon = component.icon;

              return (
                <div key={component.key} className="bg-card rounded-lg p-3 border shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${component.bgColor}/10 border ${component.color.replace('text-', 'border-')}/20`}>
                        <Icon className={`h-4 w-4 ${component.color}`} />
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-foreground">{component.label}</div>
                        <div className="text-xs text-muted-foreground">Performance metric</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono font-bold text-lg ${component.color}`}>
                        {value.toFixed(1)}
                      </div>
                      <div className="text-xs text-muted-foreground">/ 100</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="w-full bg-muted/40 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all duration-700 ease-out ${component.bgColor}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0</span>
                      <span className={`font-medium ${component.color}`}>{percentage}%</span>
                      <span>100</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Insights Section */}
          <div className="mt-6 p-4 bg-gradient-to-r from-blue-50/80 to-indigo-50/60 rounded-lg border border-blue-200/40">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg border border-blue-200">
                <Info className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-blue-900 mb-3">Key Performance Insights</div>
                <div className="space-y-2">
                  {team.powerRatingComponents.performanceScore > 80 && (
                    <div className="flex items-start gap-2 text-sm">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span className="text-blue-800">Strong recent performance with consistent scoring patterns</span>
                    </div>
                  )}
                  {team.powerRatingComponents.teamStrength > 75 && (
                    <div className="flex items-start gap-2 text-sm">
                      <div className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span className="text-blue-800">Elite roster strength with deep talent pool</span>
                    </div>
                  )}
                  {team.powerRatingComponents.strengthOfSchedule > 60 && (
                    <div className="flex items-start gap-2 text-sm">
                      <div className="w-1.5 h-1.5 bg-orange-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span className="text-blue-800">Facing challenging opponents above league average</span>
                    </div>
                  )}
                  {team.powerRatingComponents.momentumScore > 70 && (
                    <div className="flex items-start gap-2 text-sm">
                      <div className="w-1.5 h-1.5 bg-purple-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span className="text-blue-800">Building positive momentum with upward trajectory</span>
                    </div>
                  )}
                  {team.powerRatingComponents.consistencyScore > 80 && (
                    <div className="flex items-start gap-2 text-sm">
                      <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-2 flex-shrink-0"></div>
                      <span className="text-blue-800">Highly reliable with minimal performance variance</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2 pb-safe">
      {/* Mobile Rankings Cards */}
      <div className="space-y-4">
        {rankings.map((team, index) => {
          const rank = index + 1;
          const teamId = team.teamId || team.id;
          const isExpanded = expandedCards.has(teamId);
          const isAnalyticsExpanded = analyticsExpandedCards.has(teamId);
          const isCurrentUserTeam = isUserTeam(team, user);
          const highlightClasses = getUserTeamHighlightClasses(isCurrentUserTeam);

          return (
            <Card key={teamId} className={`overflow-hidden border shadow-sm bg-card ${highlightClasses}`}>
              <CardContent className="p-0">
                {/* Header Section - Team Identity & Rating */}
                <div className="p-4 bg-gradient-to-r from-card to-muted/20 border-b">
                  <div className="flex items-center space-x-3">
                    {/* Rank Badge */}
                    <div className={`relative flex items-center justify-center w-10 h-10 rounded-lg font-bold text-sm border-2 ${getRankColor(rank)} flex-shrink-0`}>
                      {getRankIcon(rank) || rank}
                      {getRankIcon(rank) && (
                        <span className="absolute -bottom-0.5 -right-0.5 text-xs bg-background border rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                          {rank}
                        </span>
                      )}
                    </div>

                    {/* Team Identity */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0 mr-3">
                          <h3 className="font-semibold text-base leading-tight truncate text-foreground">
                            {getMaskedTeamName(team, user, isAdmin)}
                          </h3>
                          {team.owner && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {getMaskedOwnerName(team, user, isAdmin)}
                            </p>
                          )}
                        </div>

                        {/* Power Rating */}
                        <div className="text-right">
                          <div className="font-mono font-bold text-xl text-foreground">
                            {(team.powerRating || 0).toFixed(1)}
                          </div>
                          <p className="text-xs text-muted-foreground leading-none">Power Rating</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Core Statistics Section */}
                <div className="p-4 bg-card">
                  <div className="mb-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Season Performance
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Record */}
                      <div className="text-center bg-muted/30 rounded-lg p-3 border">
                        <div className="font-mono font-bold text-sm text-foreground">
                          {team.wins || 0}-{team.losses || 0}
                          {team.ties > 0 && `-${team.ties}`}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Record</div>
                      </div>

                      {/* Win Percentage */}
                      <div className="text-center bg-muted/30 rounded-lg p-3 border">
                        <div className={`font-mono font-bold text-sm ${
                          (team.winPercentage || 0) >= 0.7 ? 'text-green-600' :
                          (team.winPercentage || 0) >= 0.35 ? 'text-foreground' : 'text-red-600'
                        }`}>
                          {((team.winPercentage || 0) * 100).toFixed(0)}%
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Win Rate</div>
                      </div>

                      {/* Point Differential */}
                      <div className="text-center bg-muted/30 rounded-lg p-3 border">
                        <div className={`font-mono font-bold text-sm ${
                          (team.pointDifferential || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {(team.pointDifferential || 0) >= 0 ? '+' : ''}
                          {(team.pointDifferential || 0).toFixed(1)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Point Diff</div>
                      </div>

                      {/* Streak */}
                      <div className="text-center bg-muted/30 rounded-lg p-3 border">
                        <Badge
                          variant={getStreakVariant(team.currentStreak)}
                          className={`font-bold text-sm ${
                            (team.currentStreak?.type === 'win') ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''
                          }`}
                        >
                          {getStreakDisplay(team.currentStreak)}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1">Streak</div>
                      </div>
                    </div>
                  </div>

                  {/* Playoff Odds Section */}
                  {showAdvanced && typeof team.playoffOdds !== 'undefined' && (
                    <div className="border-t pt-3 mb-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Playoff Outlook
                      </h4>
                      <div className="bg-muted/30 rounded-lg p-3 border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground">Playoff Chances</span>
                          <span className={`font-mono font-bold text-base ${
                            (team.playoffOdds || 0) >= 80 ? 'text-green-600' :
                            (team.playoffOdds || 0) >= 50 ? 'text-blue-600' :
                            (team.playoffOdds || 0) >= 20 ? 'text-orange-600' : 'text-red-600'
                          }`}>
                            {(team.playoffOdds || 0).toFixed(0)}%
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all duration-500 ${
                              (team.playoffOdds || 0) >= 80 ? 'bg-green-600' :
                              (team.playoffOdds || 0) >= 50 ? 'bg-blue-600' :
                              (team.playoffOdds || 0) >= 20 ? 'bg-orange-600' : 'bg-red-600'
                            }`}
                            style={{ width: `${Math.min(100, team.playoffOdds || 0)}%` }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 text-center">
                          Top 3 per division make playoffs
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Advanced Metrics & Actions Section */}
                  {(showAdvanced || showAnalytics || team.powerRatingComponents) && (
                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between">
                        {/* Left Side - Indicators */}
                        <div className="flex items-center space-x-2">

                          {showAdvanced && (team.qualityWins || 0) > 0 && (
                            <div className="flex items-center space-x-1 px-2 py-1 rounded-md bg-green-50 border border-green-200">
                              <Target className="h-3 w-3 text-green-600" />
                              <span className="text-xs font-medium text-green-700">
                                {team.qualityWins} quality win{team.qualityWins > 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Right Side - Action Buttons */}
                        <div className="flex items-center space-x-1">
                          {showAnalytics && analyticsData[teamId] && (
                            <Button
                              onClick={() => toggleAnalyticsExpansion(teamId)}
                              variant="ghost"
                              size="sm"
                              className="h-9 w-9 p-0 rounded-lg"
                              title="View Analytics"
                            >
                              <Activity className="h-4 w-4" />
                            </Button>
                          )}

                          {team.powerRatingComponents && (
                            <Button
                              onClick={() => toggleCardExpansion(teamId)}
                              variant="ghost"
                              size="sm"
                              className="h-9 w-9 p-0 rounded-lg"
                              title={isExpanded ? "Hide Details" : "Show Details"}
                            >
                              {isExpanded ?
                                <ChevronUp className="h-4 w-4" /> :
                                <ChevronDown className="h-4 w-4" />
                              }
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Expanded Component Breakdown */}
                {isExpanded && renderComponentBreakdown(team)}

                {/* Analytics Section */}
                {showAnalytics && isAnalyticsExpanded && analyticsData[teamId] && (
                  <div className="border-t bg-gradient-to-r from-blue-50/40 to-indigo-50/40 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Activity className="h-4 w-4 text-blue-600" />
                      <span className="font-semibold text-sm">Analytics Dashboard</span>
                      <Badge variant="secondary" className="text-xs">Live</Badge>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="bg-background/60 rounded-lg p-3 border">
                        <div className="text-muted-foreground text-xs mb-1">Advanced Analytics</div>
                        <div className="text-foreground font-medium">
                          Enhanced insights available in Statistics view
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Mobile-optimized Legend */}
      {showAdvanced && (
        <Card className="mt-4 bg-muted/30 border-muted">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-4 w-4 text-blue-600" />
              <span className="font-semibold text-sm">Quick Reference</span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs mb-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-green-50 border border-green-200 flex items-center justify-center">
                    <Target className="h-3 w-3 text-green-600" />
                  </div>
                  <span className="font-medium">Quality Wins</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs h-5 px-2">W3</Badge>
                  <span className="font-medium">Win Streak</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-xs h-5 px-2">L2</Badge>
                  <span className="font-medium">Loss Streak</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-green-50 border border-green-200 flex items-center justify-center">
                    <TrendingUp className="h-3 w-3 text-green-600" />
                  </div>
                  <span className="font-medium">Rank Up</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200/40">
              <div className="text-xs text-blue-800 space-y-1">
                <p><strong>💡 Tip:</strong> Tap the chevron to see detailed rating breakdown</p>
                <p><strong>Rating:</strong> Score from performance, roster strength, schedule difficulty, momentum, and consistency</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MobilePowerRankings;