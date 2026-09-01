import React, { useMemo, useState } from 'react';
import {
  TrendingUp, Target, Zap, Shield, Award, BarChart3, ChevronDown, Info,
  Trophy, Users, Flame, Gauge, Telescope, Swords
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu';
import { getMaskedTeamName } from '../../utils/displayNameUtils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { cn } from '../../lib/utils';
import { POWER_RANKING_WEIGHTS, POWER_RANKING_COMPONENT_META } from '../../../types/index.js';

/**
 * The components, in weight order, derived from the weights.
 *
 * Every key in this file used to be a hardcoded string naming a component the
 * calculator no longer produces — `performanceScore`, `teamStrength`,
 * `clutchScore`. Each of those reads resolved to `undefined`, was coalesced to
 * 0 by the `|| 0` beside it, and rendered as a chart where every team scored
 * zero and the first team in the array was declared the league leader.
 */
const RANKING_COMPONENTS = Object.entries(POWER_RANKING_WEIGHTS)
  .sort(([, a], [, b]) => b - a)
  .map(([key, weight]) => ({
    key,
    weight,
    weightLabel: `${Math.round(weight * 100)}%`,
    ...POWER_RANKING_COMPONENT_META[key]
  }));

/** One icon per component. Keys track `POWER_RANKING_WEIGHTS`. */
const COMPONENT_ICONS = {
  record: Trophy,
  allPlay: Users,
  scoring: TrendingUp,
  recentForm: Flame,
  consistency: Shield,
  rosterStrength: Zap,
  lineupEfficiency: Gauge,
  futureStrength: Telescope,
  leagueSos: Target,
  nflSos: Swords
};

const componentValue = (team, key) => {
  const value = team?.powerRatingComponents?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const PowerRankingsVisualization = ({
  rankings = [],
  currentWeek = 1,
}) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const [showAllTeams, setShowAllTeams] = useState(false);
  const visualizationData = useMemo(() => {
    if (!rankings.length || !rankings[0]?.powerRatingComponents) return null;

    // League average per component, over the teams that actually have one. A
    // team missing the component is not a team averaging zero into it.
    const componentAverages = {};
    const leaders = {};

    for (const { key } of RANKING_COMPONENTS) {
      const scored = rankings
        .map(team => ({ team, value: componentValue(team, key) }))
        .filter(entry => entry.value !== null);

      componentAverages[key] = scored.length
        ? scored.reduce((sum, entry) => sum + entry.value, 0) / scored.length
        : null;

      leaders[key] = scored.length
        ? scored.reduce((best, entry) => (entry.value > best.value ? entry : best)).team
        : null;
    }

    return { componentAverages, leaders };
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

  const { componentAverages, leaders } = visualizationData;

  const ComponentChart = ({ title, icon: Icon, teams, componentKey, color, formatValue }) => {
    const allSortedTeams = [...teams]
      .filter(team => componentValue(team, componentKey) !== null)
      .sort((a, b) => componentValue(b, componentKey) - componentValue(a, componentKey));

    // A component nobody could compute — roster figures for a pre-2026 season —
    // gets a chart that says so rather than nine zero-length bars.
    if (allSortedTeams.length === 0) {
      return (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Icon className={`h-4 w-4 ${color}`} />
              {title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No data for this component in week {currentWeek}.
            </p>
          </CardContent>
        </Card>
      );
    }

    const displayTeams = showAllTeams ? allSortedTeams : allSortedTeams.slice(0, 5);
    const maxValue = Math.max(...allSortedTeams.map(team => componentValue(team, componentKey)));
    const average = componentAverages[componentKey] ?? 0;

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
            const value = componentValue(team, componentKey);
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
                  <span className={`tabular font-semibold ${color}`}>
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
              <span className="tabular">
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

    // `${color.replace('text-','bg-')}10` produced class names like
    // `bg-blue-60010`, which is not a class, so these icon chips have never
    // had a background. The rail and the chip each set `currentColor` and paint
    // from it, so there is one source and nothing to mistype — and the tint
    // stays on those two elements rather than colouring the whole card.
    return (
      <Card className="relative overflow-hidden">
        <div className={cn('absolute left-0 top-0 h-full w-1 bg-current', color)} />
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={cn('rounded-full bg-current/15 p-2', color)}>
              <Icon className="h-4 w-4" />
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

  return (
    <div className="space-y-6">
      {/* League Standouts */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Award className="text-yellow-600" size={20} />
          Week {currentWeek} League Leaders
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {RANKING_COMPONENTS.map((component) => {
            const leader = leaders[component.key];
            if (!leader) return null;

            return (
              <StandoutCard
                key={component.key}
                title={component.label}
                team={leader}
                metric={componentValue(leader, component.key).toFixed(2)}
                icon={COMPONENT_ICONS[component.key] ?? TrendingUp}
                color={component.color}
                description={component.description}
              />
            );
          })}
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
          {RANKING_COMPONENTS.map((component) => (
            <ComponentChart
              key={component.key}
              title={`${component.label} (${component.weightLabel})`}
              icon={COMPONENT_ICONS[component.key] ?? TrendingUp}
              teams={rankings}
              componentKey={component.key}
              color={component.color}
            />
          ))}
        </div>
      </div>


      {/* Component Explanations, from the same source as the weights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="text-blue-600" size={20} />
            Component Calculation Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {RANKING_COMPONENTS.map((component) => {
              const Icon = COMPONENT_ICONS[component.key] ?? TrendingUp;
              return (
                <div key={component.key}>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${component.color}`} />
                    {component.label} ({component.weightLabel} weight)
                  </h4>
                  <p className="text-sm text-muted-foreground">{component.description}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-semibold mb-2 text-sm">Calculation Notes</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Every component is scaled 0–100 across the league, so the weights are directly comparable</li>
              <li>• A component with no data is dropped and the remaining weights are rescaled — it is never counted as a zero</li>
              <li>• Roster and lineup figures come from what each team’s players actually scored, week by week, under this league’s scoring settings</li>
              <li>• Roster data starts with the 2026 season; earlier seasons rank on the five team-level components</li>
              <li>• Projections describe the future, so the outlook component appears only on the current week, not on historical views</li>
              <li>• Historical views use only games from before the week being viewed</li>
            </ul>
          </div>
        </CardContent>
      </Card>

    </div>
  );
};

export default PowerRankingsVisualization;