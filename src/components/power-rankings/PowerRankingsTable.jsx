import React, { useState } from 'react';
import { Edit3, TrendingUp, TrendingDown, Minus, Trophy, Target, Medal, Crown, Award, BarChart3, ChevronDown, ChevronUp, Info, Activity } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Card, CardContent } from '../ui/card';
import TrendingPlayerIndicators from '../analytics/TrendingPlayerIndicators';
import AnalyticsInsights from '../analytics/AnalyticsInsights';
import { isUserTeam, getUserTeamHighlightClasses } from '../../utils/userTeamUtils';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';

const PowerRankingsTable = ({
  rankings = [],
  onEditTeam,
  showAdvanced = false,
  currentWeek = 1,
  loading = false,
  analyticsData = {},
  showAnalytics = false,
  onExportAnalytics = null,
  user = null,
  initializing = false,
  isAdmin = false
}) => {
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [analyticsExpandedRows, setAnalyticsExpandedRows] = useState(new Set());
  
  const toggleRowExpansion = (teamId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setExpandedRows(newExpanded);
  };

  const toggleAnalyticsExpansion = (teamId) => {
    const newExpanded = new Set(analyticsExpandedRows);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setAnalyticsExpandedRows(newExpanded);
  };
  const getRankColor = (rank) => {
    if (rank === 1) return 'text-yellow-600 bg-gradient-to-br from-yellow-50 to-amber-100 border-yellow-300 shadow-yellow-200/50';
    if (rank <= 3) return 'text-orange-600 bg-gradient-to-br from-orange-50 to-red-100 border-orange-300 shadow-orange-200/50';
    if (rank <= 6) return 'text-green-600 bg-gradient-to-br from-green-50 to-emerald-100 border-green-300 shadow-green-200/50';
    if (rank <= 10) return 'text-blue-600 bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-300 shadow-blue-200/50';
    return 'text-muted-foreground bg-gradient-to-br from-muted to-muted/80 border-border shadow-muted/50';
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return <Crown className="h-4 w-4" />;
    if (rank <= 3) return <Medal className="h-4 w-4" />;
    if (rank <= 6) return <Award className="h-4 w-4" />;
    return null;
  };

  const getFormVariant = (form) => {
    if (form >= 5) return 'default';
    if (form >= 2) return 'secondary';
    if (form >= -2) return 'outline';
    if (form >= -5) return 'destructive';
    return 'destructive';
  };

  const getRankChangeIcon = (change) => {
    if (change > 0) return <TrendingUp size={14} className="text-green-600" />;
    if (change < 0) return <TrendingDown size={14} className="text-red-600" />;
    return <Minus size={14} className="text-gray-400" />;
  };

  const getStreakDisplay = (streak) => {
    if (streak.type === 'none') return '-';
    const prefix = streak.type === 'win' ? 'W' : streak.type === 'loss' ? 'L' : 'T';
    return `${prefix}${streak.length}`;
  };

  const getStreakVariant = (streak) => {
    if (streak.type === 'win') return 'default';
    if (streak.type === 'loss') return 'destructive';
    return 'secondary';
  };

  const renderComponentBreakdown = (team) => {
    if (!team.powerRatingComponents) return null;

    const components = [
      { key: 'performanceScore', label: 'Performance Score', weight: '25%', color: 'text-blue-600' },
      { key: 'teamStrength', label: 'Team Strength', weight: '20%', color: 'text-green-600' },
      { key: 'strengthOfSchedule', label: 'Strength of Schedule', weight: '15%', color: 'text-orange-600' },
      { key: 'momentumScore', label: 'Momentum Score', weight: '15%', color: 'text-purple-600' },
      { key: 'consistencyScore', label: 'Consistency Score', weight: '15%', color: 'text-indigo-600' },
      { key: 'clutchScore', label: 'Clutch Score', weight: '5%', color: 'text-amber-600' },
      { key: 'allPlayWinPct', label: 'All-Play Win %', weight: '*', color: 'text-teal-600' }
    ];

    return (
      <TableRow className="bg-muted/20 hover:bg-muted/30">
        <TableCell colSpan={showAdvanced ? (onEditTeam ? 10 : 9) : (onEditTeam ? 7 : 6)}>
          <div className="py-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Power Rating Component Breakdown - {getMaskedTeamName(team, user, isAdmin)}</span>
              <Badge variant="outline" className="text-xs">Week {currentWeek}</Badge>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {components.map((component) => {
                const value = team.powerRatingComponents[component.key] || 0;
                const percentage = Math.round((value / 100) * 100);
                
                return (
                  <div key={component.key} className="bg-background rounded-lg p-3 border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${component.color.replace('text-', 'bg-')}`} />
                        <span className="font-medium text-sm">{component.label}</span>
                        <Badge variant="secondary" className="text-xs">{component.weight}</Badge>
                      </div>
                      <span className={`font-mono font-semibold ${component.color}`}>
                        {value.toFixed(2)}
                      </span>
                    </div>
                    
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${component.color.replace('text-', 'bg-')}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>0</span>
                      <span className="font-medium">{percentage}%</span>
                      <span>100</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Component insights */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <div className="font-medium text-blue-900 mb-1">Algorithm Insights</div>
                  <div className="text-blue-700 space-y-1">
                    {team.powerRatingComponents.performanceScore > 80 && (
                      <div>• <strong>Strong Recent Performance:</strong> Excelling in recent weeks with consistent scoring</div>
                    )}
                    {team.powerRatingComponents.teamStrength > 75 && (
                      <div>• <strong>Elite Roster:</strong> High projected points from player talent</div>
                    )}
                    {team.powerRatingComponents.strengthOfSchedule > 60 && (
                      <div>• <strong>Tough Schedule:</strong> Facing stronger opponents than league average</div>
                    )}
                    {team.powerRatingComponents.momentumScore > 70 && (
                      <div>• <strong>Hot Streak:</strong> Building positive momentum with recent wins/performance</div>
                    )}
                    {team.powerRatingComponents.consistencyScore > 80 && (
                      <div>• <strong>Reliable Scorer:</strong> Low variance in weekly point totals</div>
                    )}
                    {team.powerRatingComponents.clutchScore > 70 && (
                      <div>• <strong>Clutch Performer:</strong> Excels in close games and high-pressure situations</div>
                    )}
                    {team.powerRatingComponents.allPlayWinPct > 75 && (
                      <div>• <strong>All-Play Dominator:</strong> Would beat most teams regardless of matchups</div>
                    )}
                    {team.powerRatingComponents.allPlayWinPct < 35 && (
                      <div>• <strong>Schedule Dependent:</strong> Record heavily influenced by specific matchups</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  // During initialization or data loading, don't show placeholder states (full-screen overlay handles loading)
  if (initializing || loading) {
    return null;
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
            <p className="text-muted-foreground">
              Add teams and games to see power rankings for week {currentWeek}.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }


  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[100px]">Rank</TableHead>
            <TableHead>Team</TableHead>
            <TableHead className="text-center">Record</TableHead>
            <TableHead className="text-center">Win%</TableHead>
            <TableHead className="text-center">Total Point Diff</TableHead>
            <TableHead className="text-center">Streak</TableHead>
            {/* <TableHead className="text-center">Rank Change</TableHead> */}
            {showAdvanced && (
              <>
                {/* <TableHead className="text-center">SOS</TableHead> */}
                <TableHead className="text-center">Playoff Odds</TableHead>
                <TableHead className="text-center">Form</TableHead>
                <TableHead className="text-center">Quality</TableHead>
              </>
            )}
            <TableHead className="text-center">Power Rating</TableHead>
            {showAnalytics && <TableHead className="text-center">Analytics</TableHead>}
            {onEditTeam && <TableHead className="text-center">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rankings.map((team, index) => {
            const isCurrentUserTeam = isUserTeam(team, user);
            const highlightClasses = getUserTeamHighlightClasses(isCurrentUserTeam);

            return (
            <React.Fragment key={team.teamId || team.id}>
              <TableRow className={`group ${highlightClasses}`}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm border-2 shadow-sm ${getRankColor(index + 1)}`}>
                    {getRankIcon(index + 1) || (index + 1)}
                    {getRankIcon(index + 1) && (
                      <span className="absolute -bottom-1 -right-1 text-xs bg-background border rounded-full w-5 h-5 flex items-center justify-center">
                        {index + 1}
                      </span>
                    )}
                  </div>
                </div>
              </TableCell>
              
              <TableCell>
                <div className="space-y-1">
                  <div className="font-semibold">{getMaskedTeamName(team, user, isAdmin)}</div>
                  {team.owner && (
                    <div className="text-sm text-muted-foreground">{getMaskedOwnerName(team, user, isAdmin)}</div>
                  )}
                  {showAdvanced && (
                    <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1 text-green-600">
                        <Target className="h-3 w-3" />
                        QW: {team.qualityWins || 0}
                      </span>
                      <span>BL: {team.badLosses || 0}</span>
                    </div>
                  )}
                </div>
              </TableCell>
              
              <TableCell className="text-center">
                <div className="font-semibold font-mono text-base">
                  {team.wins || 0}-{team.losses || 0}
                  {team.ties > 0 && `-${team.ties}`}
                </div>
              </TableCell>
              
              <TableCell className={`text-center font-mono font-semibold text-base ${
                (team.winPercentage || 0) >= 0.7 ? 'text-green-600' :
                (team.winPercentage || 0) >= 0.35 ? 'text-black' : 'text-red-600'
              }`}>
                {((team.winPercentage || 0) * 100).toFixed(2)}%
              </TableCell>
              
              <TableCell className="text-center">
                <div className="space-y-1">
                  <div className={`font-mono font-semibold ${
                    (team.pointDifferential || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {(team.pointDifferential || 0) >= 0 ? '+' : ''}
                    {(team.pointDifferential || 0).toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {(team.pointsFor || 0).toFixed(2)} - {(team.pointsAgainst || 0).toFixed(2)}
                  </div>
                </div>
              </TableCell>

              <TableCell className="text-center">
                <Badge
                  variant={getStreakVariant(team.currentStreak || { type: 'none', length: 0 })}
                  className={
                    (team.currentStreak?.type === 'win') ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''
                  }
                >
                  {getStreakDisplay(team.currentStreak || { type: 'none', length: 0 })}
                </Badge>
              </TableCell>

              {/* <TableCell className="text-center">
                <div className={`font-mono font-semibold text-lg ${
                  (team.rankChange || 0) > 0 ? 'text-green-600' :
                  (team.rankChange || 0) < 0 ? 'text-red-600' :
                  'text-gray-400'
                }`}>
                  {team.rankChange === 0 ? '-' :
                    `${team.rankChange > 0 ? '+' : ''}${team.rankChange}`
                  }
                </div>
              </TableCell> */}

              {showAdvanced && (
                <>
                  {/* <TableCell className="text-center">
                    <div className="space-y-1">
                      <div className={`font-mono font-semibold ${
                        (team.strengthOfSchedule || 0) >= 0 ? 'text-orange-600' : 'text-green-600'
                      }`}>
                        {(team.strengthOfSchedule || 0) >= 0 ? '+' : ''}
                        {((team.strengthOfSchedule || 0) * 100).toFixed(2)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        vs {((team.opponentWinPercentage || 0) * 100).toFixed(2)}%
                      </div>
                    </div>
                  </TableCell> */}
                  
                  <TableCell className="text-center">
                    <div className="space-y-1">
                      <div className={`font-mono font-bold text-base ${
                        (team.playoffOdds || 0) >= 80 ? 'text-green-600' :
                        (team.playoffOdds || 0) >= 50 ? 'text-blue-600' :
                        (team.playoffOdds || 0) >= 20 ? 'text-orange-600' : 'text-red-600'
                      }`}>
                        {(team.playoffOdds || 0).toFixed(0)}%
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                        <div 
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            (team.playoffOdds || 0) >= 80 ? 'bg-green-600' :
                            (team.playoffOdds || 0) >= 50 ? 'bg-blue-600' :
                            (team.playoffOdds || 0) >= 20 ? 'bg-orange-600' : 'bg-red-600'
                          }`}
                          style={{ width: `${Math.min(100, team.playoffOdds || 0)}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell className="text-center">
                    <Badge
                      variant={getFormVariant(team.recentForm || 0)}
                      className={`font-mono ${
                        (team.recentForm || 0) > 0 ? 'bg-green-100 text-green-700 hover:bg-green-100' :
                        (team.recentForm || 0) < 0 ? 'bg-red-100 text-red-700 hover:bg-red-100' : ''
                      }`}
                    >
                      {(team.recentForm || 0) >= 0 ? '+' : ''}{(team.recentForm || 0).toFixed(2)}
                    </Badge>
                  </TableCell>
                  
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">
                        <Target className="h-3 w-3 mr-1" />
                        {team.qualityWins || 0}
                      </Badge>
                      <Badge variant="destructive" className="text-xs">
                        {team.badLosses || 0}
                      </Badge>
                    </div>
                  </TableCell>
                </>
              )}
              
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <div className="font-mono font-bold text-lg bg-muted/50 rounded-lg px-3 py-1 inline-block">
                    {(team.powerRating || 0).toFixed(2)}
                  </div>
                  {team.powerRatingComponents && (
                    <Button
                      onClick={() => toggleRowExpansion(team.teamId || team.id)}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                    >
                      {expandedRows.has(team.teamId || team.id) ? 
                        <ChevronUp className="h-4 w-4" /> : 
                        <ChevronDown className="h-4 w-4" />
                      }
                    </Button>
                  )}
                </div>
              </TableCell>
              
              {showAnalytics && (
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="min-w-0 flex-1">
                      <TrendingPlayerIndicators 
                        team={team}
                        analyticsData={analyticsData[team.teamId || team.id]}
                        compact={true}
                        showTooltips={true}
                      />
                    </div>
                    {analyticsData[team.teamId || team.id] && (
                      <Button
                        onClick={() => toggleAnalyticsExpansion(team.teamId || team.id)}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 flex-shrink-0"
                      >
                        {analyticsExpandedRows.has(team.teamId || team.id) ? 
                          <ChevronUp className="h-4 w-4" /> : 
                          <Activity className="h-4 w-4" />
                        }
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
              
              {onEditTeam && (
                <TableCell className="text-center">
                  <Button
                    onClick={() => onEditTeam(team)}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </TableCell>
              )}
              </TableRow>
              
              {/* Component breakdown row */}
              {expandedRows.has(team.teamId || team.id) && renderComponentBreakdown(team)}
              
              {/* Analytics insights row */}
              {showAnalytics && analyticsExpandedRows.has(team.teamId || team.id) && (
                <TableRow className="bg-blue-50/30 hover:bg-blue-50/50">
                  <TableCell colSpan={showAdvanced ? (onEditTeam ? 11 : 10) : (onEditTeam ? 8 : 7)}>
                    <div className="py-4">
                      <AnalyticsInsights
                        team={team}
                        currentWeek={currentWeek}
                        analyticsData={analyticsData[team.teamId || team.id]}
                        showPlayerDetails={true}
                        onExportData={onExportAnalytics}
                        user={user}
                        isAdmin={isAdmin}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          );
          })}
        </TableBody>
      </Table>
      
      {showAdvanced && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Legend
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Traditional Metrics */}
              <div>
                <h5 className="font-medium mb-2 text-sm">Traditional Metrics</h5>
                <div className="space-y-2 text-sm">
                  {/* <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">SOS</Badge>
                    <span className="text-muted-foreground">Strength of Schedule</span>
                  </div> */}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">Playoff Odds</Badge>
                    <span className="text-muted-foreground">Probability of making playoffs (top 3 per division)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">Form</Badge>
                    <span className="text-muted-foreground">Recent 4-week performance</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">QW</Badge>
                    <span className="text-muted-foreground">Quality Wins</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">BL</Badge>
                    <span className="text-muted-foreground">Bad Losses</span>
                  </div>
                </div>
              </div>
              
              {/* New Algorithm Components */}
              <div>
                <h5 className="font-medium mb-2 text-sm">Components</h5>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div><strong className="text-black">Performance (25%):</strong> Recent scoring trends and consistency</div>
                  <div><strong className="text-black">Team Strength (20%):</strong> Roster talent based on projections</div>
                  <div><strong className="text-black">Schedule (15%):</strong> Past and future opponent difficulty</div>
                  <div><strong className="text-black">Momentum (15%):</strong> Win streaks and point trends</div>
                  <div><strong className="text-black">Consistency (15%):</strong> Week-to-week variance</div>
                  <div><strong className="text-black">Clutch (5%):</strong> Performance in close games</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
};

export default PowerRankingsTable;