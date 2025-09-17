import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Target, Zap, Shield, Heart, Award, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';

const PowerRankingsVisualization = ({ rankings = [], currentWeek = 1 }) => {
  const visualizationData = useMemo(() => {
    if (!rankings.length || !rankings[0]?.powerRatingComponents) return null;

    // Calculate league averages for each component
    const componentAverages = {
      performanceScore: 0,
      teamStrength: 0,
      strengthOfSchedule: 0,
      momentumScore: 0,
      consistencyScore: 0,
      injuryScore: 0,
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
      healthiest: rankings.reduce((best, team) => 
        (team.powerRatingComponents?.injuryScore || 0) > (best?.powerRatingComponents?.injuryScore || 0) ? team : best, rankings[0]),
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
    const sortedTeams = [...teams]
      .filter(team => team.powerRatingComponents?.[componentKey] !== undefined)
      .sort((a, b) => (b.powerRatingComponents[componentKey] || 0) - (a.powerRatingComponents[componentKey] || 0))
      .slice(0, 5);

    const maxValue = Math.max(...sortedTeams.map(team => team.powerRatingComponents[componentKey] || 0));
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
          {sortedTeams.map((team, index) => {
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
                    <span className="font-medium">{team.name}</span>
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
              <div className="font-bold text-lg">{team.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{description}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
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
          <StandoutCard
            title="🏥 Healthiest Roster"
            team={standouts.healthiest}
            metric={`${standouts.healthiest?.powerRatingComponents?.injuryScore?.toFixed(2) || 0}`}
            icon={Heart}
            color="text-red-600"
            description="Best injury status and depth"
          />
        </div>
      </div>

      {/* Component Charts */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <BarChart3 className="text-blue-600" size={20} />
          Component Analysis
        </h3>
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
          <ComponentChart
            title="Health & Depth"
            icon={Heart}
            teams={rankings}
            componentKey="injuryScore"
            color="text-red-600"
          />
        </div>
      </div>

      {/* Algorithm Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="text-blue-600" size={20} />
            Algorithm Insights - Week {currentWeek}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-3">Key Trends</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>Performance Leaders:</strong> Teams with strong recent scoring are dominating the Performance Score component (25% weight).
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Target className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>Schedule Impact:</strong> Strength of Schedule varies significantly, affecting 15% of each team&apos;s rating.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Zap className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>Talent Matters:</strong> Team Strength based on projected points makes up 20% of the algorithm.
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold mb-3">Component Balance</h4>
              <div className="space-y-2">
                {Object.entries(componentAverages).map(([key, value]) => {
                  const labels = {
                    performanceScore: 'Performance (25%)',
                    teamStrength: 'Team Strength (20%)',
                    strengthOfSchedule: 'Schedule (15%)',
                    momentumScore: 'Momentum (15%)',
                    consistencyScore: 'Consistency (10%)',
                    injuryScore: 'Health (10%)',
                    clutchScore: 'Clutch (5%)'
                  };
                  
                  return (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{labels[key]}</span>
                      <span className="font-mono font-semibold">{value.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PowerRankingsVisualization;