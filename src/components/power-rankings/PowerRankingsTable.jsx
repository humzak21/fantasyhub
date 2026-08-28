import React, { useState } from 'react';
import { Edit3, TrendingUp, TrendingDown, Minus, Trophy, Target, Medal, Crown, Award, BarChart3, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { TableCell, TableRow } from '../ui/table';
import { ResponsiveDataTable } from '../ui/responsive-table';
import { Card, CardContent } from '../ui/card';
import { isUserTeam, getUserTeamHighlightClasses } from '../../utils/userTeamUtils';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { POWER_RANKING_WEIGHTS, POWER_RANKING_COMPONENT_META } from '../../../types/index.js';

/**
 * The components, in weight order, built from the weights themselves.
 *
 * This list used to be written out by hand here, and it named six components
 * with percentages ("Performance Score 25%", "Team Strength 20%") that matched
 * neither `POWER_RANKING_WEIGHTS` nor the literals the calculator actually
 * used — three different sets of numbers, one of them shown to the user.
 * Deriving it means the legend cannot drift from the algorithm again.
 */
const RANKING_COMPONENTS = Object.entries(POWER_RANKING_WEIGHTS)
  .sort(([, a], [, b]) => b - a)
  .map(([key, weight]) => ({
    key,
    weight,
    weightLabel: `${Math.round(weight * 100)}%`,
    ...POWER_RANKING_COMPONENT_META[key]
  }));

const PowerRankingsTable = ({
  rankings = [],
  onEditTeam,
  showAdvanced = false,
  currentWeek = 1,
  loading = false,
  initializing = false,
}) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const [expandedRows, setExpandedRows] = useState(new Set());
  
  const toggleRowExpansion = (teamId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setExpandedRows(newExpanded);
  };
  const getRankColor = (rank) => {
    if (rank === 1) return 'bg-gradient-to-br from-ff-rank-gold-50 to-amber-100 text-ff-rank-gold-600 border-[4px] border-amber-300';
    if (rank === 2) return 'bg-gradient-to-br from-ff-rank-silver-50 to-gray-100 text-ff-rank-silver-600 border-[4px] border-slate-200';
    if (rank === 3) return 'bg-gradient-to-br from-ff-rank-bronze-50 to-orange-100 text-ff-rank-bronze-600 border-[4px] border-orange-400';
    if (rank <= 6) return 'bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600 border-2 border-emerald-300';
    if (rank <= 10) return 'bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-600 border-2 border-blue-300';
    return 'bg-gradient-to-br from-muted to-muted/80 text-muted-foreground border-2 border-border';
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

    const components = RANKING_COMPONENTS;

    return (
      <TableRow className="bg-muted/20 hover:bg-muted/30">
        <TableCell colSpan={showAdvanced ? (onEditTeam ? 11 : 10) : (onEditTeam ? 8 : 7)}>
          <div className="py-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Power Rating Component Breakdown - {getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}</span>
              <Badge variant="outline" className="text-xs">Week {currentWeek}</Badge>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {components.map((component) => {
                const raw = team.powerRatingComponents[component.key];
                // A component with no input is not a component that scored
                // zero. Rendering the two the same way is how the old table
                // showed every team a confident 0.00 for roster strength it had
                // never been able to calculate.
                const available = typeof raw === 'number' && Number.isFinite(raw);
                const value = available ? raw : null;
                const percentage = available ? Math.round(value) : 0;

                return (
                  <div key={component.key} className="bg-background rounded-lg p-3 border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${component.color.replace('text-', 'bg-')}`} />
                        <span className="font-medium text-sm">{component.label}</span>
                        <Badge variant="secondary" className="text-xs">{component.weightLabel}</Badge>
                      </div>
                      <span
                        className={`font-mono font-semibold ${available ? component.color : 'text-muted-foreground'}`}
                        title={available ? undefined : 'No data for this component in this week'}
                      >
                        {available ? value.toFixed(2) : '—'}
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
                      <span className="font-medium">{available ? `${percentage}%` : '—'}</span>
                      <span>100</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Component insights */}
            <div className="mt-4 p-3 bg-blue-50/80 rounded-lg border border-blue-200">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-700 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <div className="font-semibold text-blue-900 mb-1">Algorithm Insights</div>
                  <div className="text-blue-800 space-y-1">
                    {team.powerRatingComponents.recentForm > 80 && (
                      <div>• <strong>Strong Recent Form:</strong> Winning and outscoring the league over the last three weeks</div>
                    )}
                    {team.powerRatingComponents.rosterStrength > 75 && (
                      <div>• <strong>Elite Roster:</strong> Starters are producing more points per week than anyone else&rsquo;s</div>
                    )}
                    {team.powerRatingComponents.lineupEfficiency < 30 && (
                      <div>• <strong>Points on the Bench:</strong> Leaving a large share of the optimal lineup unstarted</div>
                    )}
                    {team.powerRatingComponents.futureStrength > 75 && (
                      <div>• <strong>Best Outlook:</strong> The most projected production still to come from these starters</div>
                    )}
                    {team.powerRatingComponents.leagueSos > 70 && (
                      <div>• <strong>Brutal Run-In:</strong> Still to play the strongest teams in the league</div>
                    )}
                    {team.powerRatingComponents.leagueSos < 30 && (
                      <div>• <strong>Friendly Run-In:</strong> The easiest set of remaining fantasy opponents</div>
                    )}
                    {team.powerRatingComponents.consistency > 80 && (
                      <div>• <strong>Reliable Scorer:</strong> Low variance in weekly point totals</div>
                    )}
                    {team.powerRatingComponents.allPlayWinPct > 75 && (
                      <div>• <strong>All-Play Dominator:</strong> Would beat most teams regardless of matchups</div>
                    )}
                    {team.powerRatingComponents.allPlayWinPct < 35 && (
                      <div>• <strong>Schedule Dependent:</strong> Record heavily influenced by specific matchups</div>
                    )}
                    {team.powerRatingComponents.luckPercentage > 0.15 && (
                      <div>• <strong>Fortunate Record:</strong> Winning more games than all-play analysis suggests - riding high variance</div>
                    )}
                    {team.powerRatingComponents.luckPercentage < -0.15 && (
                      <div>• <strong>Unlucky Record:</strong> Winning fewer games than all-play analysis suggests - underperforming expected results</div>
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

  // This used to `return null`, on the reasoning that the app shell's
  // full-screen overlay was showing the loading state. That overlay is gone —
  // it blocked the entire page on every mutation — so the table now owns its
  // own loading state. Returning null here rendered a blank main screen for as
  // long as anything upstream was in flight.
  if (initializing || loading) {
    return (
      <Card className="p-8">
        <CardContent className="flex items-center justify-center gap-3 text-muted-foreground">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
          <span>Calculating week {currentWeek} rankings…</span>
        </CardContent>
      </Card>
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
            <p className="text-muted-foreground">
              Add teams and games to see power rankings for week {currentWeek}.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }


  /*
   * One column list, two layouts — see ui/responsive-table.jsx.
   *
   * This was eleven `<TableHead>`s and a matching pile of `<TableCell>`s. At
   * 375px it forced the document 132px wider than the viewport (the Playwright
   * smoke job measures exactly this), and scrolling it sideways is useless
   * anyway: the team name leaves the screen before the numbers arrive, so
   * every cell becomes an unlabelled figure.
   *
   * `priority` is the whole design decision. Rank, team and the power rating
   * are what the page is *for*, so they are the card header. The traditional
   * stats are what people scan, so they are a two-column grid. The advanced
   * stats are a deliberate opt-in even on desktop, so they fold away.
   */
  const columns = [
    {
      key: 'rank',
      header: 'Rank',
      priority: 'primary',
      headerClassName: 'w-[100px]',
      cell: (_team, index) => (
        <div className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm ${getRankColor(index + 1)}`}>
          {getRankIcon(index + 1) || (index + 1)}
          {getRankIcon(index + 1) && (
            <span className="absolute -bottom-1 -right-1 text-xs bg-background border rounded-full w-5 h-5 flex items-center justify-center">
              {index + 1}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'team',
      header: 'Team',
      priority: 'primary',
      cell: (team) => (
        <div className="min-w-0 space-y-1">
          <div className="truncate font-semibold">{getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}</div>
          {team.owner && (
            <div className="truncate text-sm text-muted-foreground">{getMaskedOwnerName(team, user, isAdmin, teamOwnerNames)}</div>
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
      ),
    },
    {
      key: 'powerRating',
      header: 'Power Rating',
      priority: 'primary',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (team) => (
        <div className="inline-block rounded-lg bg-muted/50 px-3 py-1 font-mono text-lg font-bold">
          {(team.powerRating || 0).toFixed(2)}
        </div>
      ),
    },
    {
      key: 'record',
      header: 'Record',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (team) => (
        <div className="font-mono text-base font-semibold">
          {team.wins || 0}-{team.losses || 0}
          {team.ties > 0 && `-${team.ties}`}
        </div>
      ),
    },
    {
      key: 'winPct',
      header: 'Win%',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (team) => (
        <span className={`font-mono text-base font-semibold ${
          (team.winPercentage || 0) >= 0.7 ? 'text-green-600' :
          (team.winPercentage || 0) >= 0.35 ? 'text-foreground' : 'text-red-600'
        }`}>
          {((team.winPercentage || 0) * 100).toFixed(2)}%
        </span>
      ),
    },
    {
      key: 'luck',
      header: 'Luck%',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (team) => (
        <span className={`font-mono text-base font-semibold ${
          (team.powerRatingComponents?.luckPercentage || 0) > 0.05 ? 'text-green-600' :
          (team.powerRatingComponents?.luckPercentage || 0) < -0.05 ? 'text-red-600' : 'text-muted-foreground'
        }`}>
          {((team.powerRatingComponents?.luckPercentage || 0) * 100).toFixed(2)}%
        </span>
      ),
    },
    {
      key: 'pointDiff',
      header: 'Total Point Diff',
      cardLabel: 'Point Diff',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (team) => (
        <div className="space-y-1">
          <div className={`font-mono font-semibold ${
            (team.pointDifferential || 0) >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {(team.pointDifferential || 0) >= 0 ? '+' : ''}
            {(team.pointDifferential || 0).toFixed(2)}
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {(team.pointsFor || 0).toFixed(2)} - {(team.pointsAgainst || 0).toFixed(2)}
          </div>
        </div>
      ),
    },
    {
      key: 'streak',
      header: 'Streak',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (team) => (
        <Badge
          variant={getStreakVariant(team.currentStreak || { type: 'none', length: 0 })}
          className={
            (team.currentStreak?.type === 'win') ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-50' :
            (team.currentStreak?.type === 'loss') ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-50' : ''
          }
        >
          {getStreakDisplay(team.currentStreak || { type: 'none', length: 0 })}
        </Badge>
      ),
    },
    ...(showAdvanced ? [
      {
        key: 'playoffOdds',
        header: 'Playoff Odds',
        priority: 'detail',
        className: 'text-center',
        headerClassName: 'text-center',
        cell: (team) => (
          <div className="min-w-[4rem] space-y-1">
            <div className={`font-mono text-base font-bold ${
              (team.playoffOdds || 0) >= 80 ? 'text-green-600' :
              (team.playoffOdds || 0) >= 50 ? 'text-blue-600' :
              (team.playoffOdds || 0) >= 20 ? 'text-orange-600' : 'text-red-600'
            }`}>
              {(team.playoffOdds || 0).toFixed(0)}%
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
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
        ),
      },
      {
        key: 'form',
        header: 'Form',
        priority: 'detail',
        className: 'text-center',
        headerClassName: 'text-center',
        cell: (team) => (
          <Badge
            variant={getFormVariant(team.recentForm || 0)}
            className={`font-mono ${
              (team.recentForm || 0) >= 5 ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-50' :
              (team.recentForm || 0) >= 2 ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50' :
              (team.recentForm || 0) >= -2 ? 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-50' :
              (team.recentForm || 0) >= -5 ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50' :
              'bg-red-50 text-red-700 border-red-200 hover:bg-red-50'
            }`}
          >
            {(team.recentForm || 0) >= 0 ? '+' : ''}{(team.recentForm || 0).toFixed(2)}
          </Badge>
        ),
      },
      {
        key: 'quality',
        header: 'Quality',
        priority: 'detail',
        className: 'text-center',
        headerClassName: 'text-center',
        cell: (team) => (
          <div className="flex items-center justify-center gap-2">
            <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-50">
              <Target className="mr-1 h-3 w-3" />
              {team.qualityWins || 0}
            </Badge>
            <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50 text-xs">
              {team.badLosses || 0}
            </Badge>
          </div>
        ),
      },
    ] : []),
    ...(onEditTeam ? [
      {
        key: 'actions',
        header: 'Actions',
        cardLabel: 'Edit',
        className: 'text-center',
        headerClassName: 'text-center',
        cell: (team) => (
          <Button onClick={() => onEditTeam(team)} variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Edit3 className="h-4 w-4" />
          </Button>
        ),
      },
    ] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-2 sm:p-0">
        <ResponsiveDataTable
          columns={columns}
          data={rankings}
          rowKey={(team, i) => team.teamId || team.id || i}
          rowClassName={(team) => getUserTeamHighlightClasses(isUserTeam(team, user))}
          cardClassName="bg-background"
        />
      </div>

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
              
              {/* Algorithm components, straight from the weights themselves */}
              <div>
                <h5 className="font-medium mb-2 text-sm">Components</h5>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {RANKING_COMPONENTS.map((component) => (
                    <div key={component.key}>
                      <strong className="text-black">
                        {component.label} ({component.weightLabel}):
                      </strong>{' '}
                      {component.description}
                    </div>
                  ))}
                  <div className="pt-2">
                    Components are each scaled 0–100 across the league, then weighted. A
                    component with no data for the week shown — roster figures before the
                    2026 season, or any component in week 1 — is dropped and the remaining
                    weights are rescaled, rather than being counted as a zero.
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PowerRankingsTable;