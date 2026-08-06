import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Target, Zap, Shield, Heart, Award, BarChart3, ChevronDown, Info, Activity, Users, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu';
import AnalyticsExport from '../analytics/AnalyticsExport';
import { getMaskedTeamName } from '../../utils/displayNameUtils';
import { useViewer } from '../../contexts/ViewerContext.jsx';

const PowerRankingsVisualization = ({
  rankings = [],
  currentWeek = 1,
  analyticsData = {},
  showAnalyticsSection = false,
}) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const [showAllTeams, setShowAllTeams] = useState(false);
  const visualizationData = useMemo(() => {
    if (!rankings.length || !rankings[0]?.powerRatingComponents) return null;

    // Calculate league averages for each component
    const componentAverages = {
      performanceScore: 0,
      teamStrength: 0,
      strengthOfSchedule: 0,
      momentumScore: 0,
      consistencyScore: 0,
      clutchScore: 0
    };

    rankings.forEach(team => {
      if (team.powerRatingComponents) {
        Object.keys(componentAverages).forEach(key => {
          componentAverages[key] += team.powerRatingComponents[key] || 0;
        });
      }
    });

    Object.keys(componentAverages).forEach(key => {
      componentAverages[key] = componentAverages[key] / rankings.length;
    });

    // Find standout teams in each category
    const standouts = {
      bestPerformance: rankings.reduce((best, team) => 
        (team.powerRatingComponents?.performanceScore || 0) > (best?.powerRatingComponents?.performanceScore || 0) ? team : best, rankings[0]),
      strongestRoster: rankings.reduce((best, team) => 
        (team.powerRatingComponents?.teamStrength || 0) > (best?.powerRatingComponents?.teamStrength || 0) ? team : best, rankings[0]),
      toughestSchedule: rankings.reduce((best, team) => 
        (team.powerRatingComponents?.strengthOfSchedule || 0) > (best?.powerRatingComponents?.strengthOfSchedule || 0) ? team : best, rankings[0]),
      hottest: rankings.reduce((best, team) => 
        (team.powerRatingComponents?.momentumScore || 0) > (best?.powerRatingComponents?.momentumScore || 0) ? team : best, rankings[0]),
      mostConsistent: rankings.reduce((best, team) => 
        (team.powerRatingComponents?.consistencyScore || 0) > (best?.powerRatingComponents?.consistencyScore || 0) ? team : best, rankings[0]),
      mostClutch: rankings.reduce((best, team) => 
        (team.powerRatingComponents?.clutchScore || 0) > (best?.powerRatingComponents?.clutchScore || 0) ? team : best, rankings[0])
    };

    return { componentAverages, standouts };
  }, [rankings]);

  if (!visualizationData) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-2">Advanced Analytics Unavailable</h3>
          <p className="text-muted-foreground">
            Enhanced power ranking data is not yet available. Complete more games to see advanced visualizations.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { componentAverages, standouts } = visualizationData;

  const ComponentChart = ({ title, icon: Icon, teams, componentKey, color, formatValue }) => {
    const allSortedTeams = [...teams]
      .filter(team => team.powerRatingComponents?.[componentKey] !== undefined)
      .sort((a, b) => (b.powerRatingComponents[componentKey] || 0) - (a.powerRatingComponents[componentKey] || 0));

    const displayTeams = showAllTeams ? allSortedTeams : allSortedTeams.slice(0, 5);
    const maxValue = Math.max(...allSortedTeams.map(team => team.powerRatingComponents[componentKey] || 0));
    const average = componentAverages[componentKey];

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className={`h-4 w-4 ${color}`} />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {displayTeams.map((team, index) => {
            const value = team.powerRatingComponents[componentKey] || 0;
            const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
            const isAboveAverage = value > average;
            
            return (
              <div key={team.teamId || team.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={index === 0 ? "default" : "secondary"} className="w-6 h-6 text-xs p-0 flex items-center justify-center">
                      {index + 1}
                    </Badge>
                    <span className="font-medium">{getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}</span>
                    {isAboveAverage && (
                      <TrendingUp className="h-3 w-3 text-green-600" />
                    )}
                  </div>
                  <span className={`font-mono font-semibold ${color}`}>
                    {formatValue ? formatValue(value) : value.toFixed(2)}
                  </span>
                </div>
                
                <div className="w-full bg-muted rounded-full h-2 relative">
                  <div 
                    className={`h-2 rounded-full transition-all duration-500 ${color.replace('text-', 'bg-')}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                  {/* League average indicator */}
                  <div 
                    className="absolute top-0 w-0.5 h-2 bg-border"
                    style={{ left: `${maxValue > 0 ? (average / maxValue) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
          
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>League Average:</span>
              <span className="font-mono">
                {formatValue ? formatValue(average) : average.toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const StandoutCard = ({ title, team, metric, icon: Icon, color, description }) => {
    if (!team?.powerRatingComponents) return null;

    return (
      <Card className="relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-1 h-full ${color.replace('text-', 'bg-')}`} />
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-full ${color.replace('text-', 'bg-').replace('bg-', 'bg-')}10`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-sm">{title}</h4>
                <Badge variant="outline" className="text-xs">{metric}</Badge>
              </div>
              <div className="font-bold text-lg">{getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}</div>
              <div className="text-xs text-muted-foreground mt-1">{description}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Calculate analytics overview
  const analyticsOverview = useMemo(() => {
    if (!showAnalyticsSection || Object.keys(analyticsData).length === 0) return null;

    const teamsWithAnalytics = rankings.filter(team => 
      analyticsData[team.teamId || team.id]
    );

    if (teamsWithAnalytics.length === 0) return null;

    const totalTrendingUp = teamsWithAnalytics.reduce((sum, team) => {
      const analytics = analyticsData[team.teamId || team.id];
      return sum + (analytics?.trendingUpPlayers || 0);
    }, 0);

    const totalTrendingDown = teamsWithAnalytics.reduce((sum, team) => {
      const analytics = analyticsData[team.teamId || team.id];
      return sum + (analytics?.trendingDownPlayers || 0);
    }, 0);

    const avgAnalyticsStrength = teamsWithAnalytics.reduce((sum, team) => {
      const analytics = analyticsData[team.teamId || team.id];
      return sum + (analytics?.analyticsStrengthScore || 0);
    }, 0) / teamsWithAnalytics.length;

    const topAnalyticsTeam = teamsWithAnalytics.reduce((best, team) => {
      const analytics = analyticsData[team.teamId || team.id];
      const bestAnalytics = analyticsData[best?.teamId || best?.id];
      return (analytics?.analyticsStrengthScore || 0) > (bestAnalytics?.analyticsStrengthScore || 0) ? 
        team : best;
    }, teamsWithAnalytics[0]);

    return {
      teamsAnalyzed: teamsWithAnalytics.length,
      totalTrendingUp,
      totalTrendingDown,
      avgAnalyticsStrength,
      topAnalyticsTeam
    };
  }, [rankings, analyticsData, showAnalyticsSection]);

  return (
    <div className="space-y-6">
      {/* Analytics Overview Section */}
      {showAnalyticsSection && analyticsOverview && (
        <div>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Activity className="text-blue-600" size={20} />
            Analytics Overview - Week {currentWeek}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                <div className="text-2xl font-bold">{analyticsOverview.teamsAnalyzed}</div>
                <div className="text-sm text-muted-foreground">Teams Analyzed</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp className="h-6 w-6 mx-auto mb-2 text-green-600" />
                <div className="text-2xl font-bold text-green-600">{analyticsOverview.totalTrendingUp}</div>
                <div className="text-sm text-muted-foreground">Players Trending Up</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingDown className="h-6 w-6 mx-auto mb-2 text-red-600" />
                <div className="text-2xl font-bold text-red-600">{analyticsOverview.totalTrendingDown}</div>
                <div className="text-sm text-muted-foreground">Players Trending Down</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <Star className="h-6 w-6 mx-auto mb-2 text-purple-600" />
                <div className="text-2xl font-bold text-purple-600">
                  {Math.round(analyticsOverview.avgAnalyticsStrength)}
                </div>
                <div className="text-sm text-muted-foreground">Avg Analytics Score</div>
              </CardContent>
            </Card>
          </div>
          
          {analyticsOverview.topAnalyticsTeam && (
            <Card className="mb-6">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Award className="h-6 w-6 text-yellow-600" />
                  <div>
                    <h4 className="font-semibold">Top Analytics Team</h4>
                    <p className="text-sm text-muted-foreground">
                      <strong>{getMaskedTeamName(analyticsOverview.topAnalyticsTeam, user, isAdmin, teamOwnerNames)}</strong> leads with an analytics strength score of{' '}
                      <strong>{Math.round(analyticsData[analyticsOverview.topAnalyticsTeam.teamId || analyticsOverview.topAnalyticsTeam.id]?.analyticsStrengthScore || 0)}</strong>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* League Standouts */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Award className="text-yellow-600" size={20} />
          Week {currentWeek} League Leaders
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StandoutCard
            title="🔥 Best Performance"
            team={standouts.bestPerformance}
            metric={`${standouts.bestPerformance?.powerRatingComponents?.performanceScore?.toFixed(2) || 0}`}
            icon={TrendingUp}
            color="text-blue-600"
            description="Leading in recent scoring and trends"
          />
          <StandoutCard
            title="💪 Strongest Roster"
            team={standouts.strongestRoster}
            metric={`${standouts.strongestRoster?.powerRatingComponents?.teamStrength?.toFixed(2) || 0}`}
            icon={Zap}
            color="text-green-600"
            description="Highest projected talent level"
          />
          <StandoutCard
            title="⚔️ Toughest Schedule"
            team={standouts.toughestSchedule}
            metric={`${standouts.toughestSchedule?.powerRatingComponents?.strengthOfSchedule?.toFixed(2) || 0}`}
            icon={Target}
            color="text-orange-600"
            description="Facing the strongest opponents"
          />
          <StandoutCard
            title="🚀 Hottest Team"
            team={standouts.hottest}
            metric={`${standouts.hottest?.powerRatingComponents?.momentumScore?.toFixed(2) || 0}`}
            icon={TrendingUp}
            color="text-purple-600"
            description="Building the most momentum"
          />
          <StandoutCard
            title="🎯 Most Consistent"
            team={standouts.mostConsistent}
            metric={`${standouts.mostConsistent?.powerRatingComponents?.consistencyScore?.toFixed(2) || 0}`}
            icon={Shield}
            color="text-indigo-600"
            description="Lowest scoring variance"
          />
        </div>
      </div>

      {/* Component Charts */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <BarChart3 className="text-blue-600" size={20} />
            Component Analysis
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-md border">
                {showAllTeams ? `All Teams` : `Top 5 Teams`}
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setShowAllTeams(false)}
                className={!showAllTeams ? "bg-accent" : ""}
              >
                Top 5 Teams
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowAllTeams(true)}
                className={showAllTeams ? "bg-accent" : ""}
              >
                All Teams
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          <ComponentChart
            title="Performance Score"
            icon={TrendingUp}
            teams={rankings}
            componentKey="performanceScore"
            color="text-blue-600"
          />
          <ComponentChart
            title="Team Strength"
            icon={Zap}
            teams={rankings}
            componentKey="teamStrength"
            color="text-green-600"
          />
          <ComponentChart
            title="Schedule Difficulty"
            icon={Target}
            teams={rankings}
            componentKey="strengthOfSchedule"
            color="text-orange-600"
          />
          <ComponentChart
            title="Momentum Score"
            icon={TrendingUp}
            teams={rankings}
            componentKey="momentumScore"
            color="text-purple-600"
          />
          <ComponentChart
            title="Consistency Score"
            icon={Shield}
            teams={rankings}
            componentKey="consistencyScore"
            color="text-indigo-600"
          />
        </div>
      </div>


      {/* Component Explanations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="text-blue-600" size={20} />
            Component Calculation Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  Performance Score (25% weight)
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Measures recent scoring trends and overall production effectiveness.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                  <li>• Recent 3-week scoring average vs season average</li>
                  <li>• Points per game relative to league average</li>
                  <li>• Scoring trend momentum and consistency</li>
                  <li>• Bonus for teams exceeding projections</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-green-600" />
                  Team Strength (20% weight)
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Evaluates roster talent based on projected player performance.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                  <li>• Total projected points for starting lineup</li>
                  <li>• Bench depth and backup strength</li>
                  <li>• Position group balance and reliability</li>
                  <li>• Player injury risk and availability</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Target className="h-4 w-4 text-orange-600" />
                  Schedule Difficulty (15% weight)
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Measures the difficulty of opponents faced and remaining.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                  <li>• Average opponent win percentage</li>
                  <li>• Quality of opponents' scoring averages</li>
                  <li>• Strength of upcoming matchups</li>
                  <li>• Adjustments for division vs non-division games</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-600" />
                  Momentum Score (15% weight)
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Captures recent hot streaks and building momentum.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                  <li>• Last 3 games performance vs season average</li>
                  <li>• Win/loss streak consideration</li>
                  <li>• Recent scoring improvements</li>
                  <li>• Clutch performance in close games</li>
                </ul>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-indigo-600" />
                  Consistency Score (10% weight)
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Rewards teams with reliable, predictable scoring patterns.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                  <li>• Coefficient of variation in weekly scores</li>
                  <li>• Frequency of boom/bust weeks</li>
                  <li>• Standard deviation from scoring average</li>
                  <li>• Bonus for consistent top-half finishes</li>
                </ul>
              </div>


              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Award className="h-4 w-4 text-yellow-600" />
                  Clutch Performance (5% weight)
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Rewards teams that perform well in high-pressure situations.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                  <li>• Performance in games decided by ≤7 points</li>
                  <li>• Monday Night Football and primetime scoring</li>
                  <li>• Comeback victories and late-game execution</li>
                  <li>• Performance against higher-ranked opponents</li>
                </ul>
              </div>

              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-semibold mb-2 text-sm">Calculation Notes</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• All components are normalized to 0-100 scale</li>
                  <li>• League averages shown as reference lines</li>
                  <li>• Historical data weighted more heavily than projections</li>
                  <li>• Algorithm adapts weights based on weeks completed</li>
                  <li>• Quality wins/losses provide additional context</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Export Section */}
      {showAnalyticsSection && Object.keys(analyticsData).length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="text-green-600" size={20} />
            Export Analytics Data
          </h3>
          <AnalyticsExport
            rankings={rankings}
            currentWeek={currentWeek}
            analyticsData={analyticsData}
            onExport={(exportInfo) => {
              console.log('Analytics data exported:', exportInfo);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default PowerRankingsVisualization;