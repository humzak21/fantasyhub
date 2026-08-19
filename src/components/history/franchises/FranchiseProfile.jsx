import React from 'react';
import { ArrowLeft, Trophy, TrendingUp, Award, Calendar, Target, Users, Crown, Medal, Activity } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { useFranchiseProfile, useFranchiseTransactions } from '../../../../hooks/queries/index.js';
import { getMaskedFranchiseName, getMaskedHistoricalTeamName, canViewFullData } from '../utils/privacyHelpers';
import { formatWinPercentage, formatPoints, formatRecord, formatYearRange, formatPlayoffFinish } from '../utils/statFormatters';
import { TRANSACTION_COLORS } from '../../../../types/index.js';
import { AXIS_STYLE, GRID_STYLE } from '../utils/chartHelpers';

const FranchiseProfile = ({
  franchise,
  franchiseId,
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onBack = () => {}
}) => {
  const { data: franchiseData, isLoading: loading } = useFranchiseProfile(franchiseId);
  const { data: transactionHistory = [] } = useFranchiseTransactions(franchiseId);

  const rivalries = franchiseData?.rivalries ?? null;

  if (loading && !franchiseData) {
    return (
      <Card>
        <CardContent className="p-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!franchise) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">Franchise not found</p>
        </CardContent>
      </Card>
    );
  }

  // Career stats come from `v_franchise_career`, derived from the games. The
  // `franchise` fallbacks below are the denormalised columns on
  // `league_franchises`, which have not been recalculated since November 2025.
  const rawCareerStats = franchiseData?.careerStats || {};
  const careerStats = {
    total_wins: rawCareerStats.total_wins || franchise?.total_regular_season_wins || 0,
    total_losses: rawCareerStats.total_losses || franchise?.total_regular_season_losses || 0,
    avg_win_percentage: rawCareerStats.avg_win_percentage || franchise?.career_win_percentage || 0,
    playoff_appearances: rawCareerStats.playoff_appearances || franchise?.total_playoff_appearances || 0,
    // Map avg_points_per_game from materialized view to avg_points_for for display
    avg_points_for: rawCareerStats.avg_points_per_game ||
      (franchise?.total_points_for && (franchise?.total_regular_season_wins + franchise?.total_regular_season_losses) > 0
        ? franchise.total_points_for / (franchise.total_regular_season_wins + franchise.total_regular_season_losses)
        : 0),
    championships: rawCareerStats.championships || franchise?.total_championships || 0,
    runner_ups: rawCareerStats.runner_ups || 0,
    career_points_for: rawCareerStats.career_points_for || franchise?.total_points_for || 0,
    career_points_against: rawCareerStats.career_points_against || franchise?.total_points_against || 0
  };
  const seasonHistory = franchiseData?.seasonHistory || [];
  const awards = franchiseData?.awards || [];

  return (
    <div className="space-y-6">
      {/* Back button and header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Leaderboards
        </Button>
      </div>

      {/* Franchise header card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl mb-2">
                {getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames)}
              </CardTitle>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatYearRange(franchise.joined_year, franchise.left_year)}
                </span>
                <span>•</span>
                <span>{franchise.total_seasons || 0} seasons</span>
                {!franchise.is_active && (
                  <Badge variant="outline" className="ml-2">Inactive</Badge>
                )}
              </div>
            </div>
            {franchise.total_championships > 0 && (
              <div className="text-center">
                <Trophy className="h-8 w-8 text-amber-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-amber-600">{franchise.total_championships}</p>
                <p className="text-xs text-muted-foreground">
                  {franchise.total_championships === 1 ? 'Championship' : 'Championships'}
                </p>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Career stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Career Record</p>
              <p className="text-2xl font-bold">
                {formatRecord(careerStats.total_wins, careerStats.total_losses)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {formatWinPercentage(careerStats.avg_win_percentage)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Avg Points For</p>
              <p className="text-2xl font-bold">
                {careerStats.avg_points_for ? formatPoints(careerStats.avg_points_for) : '-'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Playoff Apps</p>
              <p className="text-2xl font-bold">
                {careerStats.playoff_appearances || 0}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Awards</p>
              <p className="text-2xl font-bold">
                {awards.length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Season-by-season history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Season-by-Season Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {seasonHistory.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Year</TableHead>
                    <TableHead>Team Name</TableHead>
                    <TableHead className="text-center">Record</TableHead>
                    <TableHead className="text-center">Win %</TableHead>
                    <TableHead className="text-center">PF</TableHead>
                    <TableHead className="text-center">PA</TableHead>
                    <TableHead className="text-center">Diff</TableHead>
                    <TableHead className="text-center">Finish</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...seasonHistory].sort((a, b) => b.season.year - a.season.year).map(season => {
                    const wins = season.regular_season_wins || 0;
                    const losses = season.regular_season_losses || 0;
                    const totalGames = wins + losses;
                    const winPct = totalGames > 0 ? wins / totalGames : 0;
                    const pf = season.points_for || 0;
                    const pa = season.points_against || 0;
                    const diff = pf - pa;
                    const isChampion = season.playoff_finish === 'champion';
                    const isRunnerUp = season.playoff_finish === '2nd' || season.playoff_finish === 'runner-up';
                    const isThird = season.playoff_finish === '3rd' || season.playoff_finish === '3rd place';

                    const getRowClass = () => {
                      if (isChampion) return 'bg-amber-500/10';
                      if (isRunnerUp) return 'bg-slate-400/10';
                      if (isThird) return 'bg-amber-700/10';
                      if (season.is_current_season) return 'bg-blue-500/10';
                      return '';
                    };

                    const getFinishIcon = () => {
                      if (isChampion) return <Crown className="h-4 w-4 text-amber-500" />;
                      if (isRunnerUp) return <Medal className="h-4 w-4 text-gray-400" />;
                      if (isThird) return <Medal className="h-4 w-4 text-amber-700" />;
                      return null;
                    };

                    return (
                      <TableRow key={season.id} className={getRowClass()}>
                        <TableCell className="font-semibold">
                          <div className="flex items-center gap-2">
                            {getFinishIcon()}
                            {season.season.year}
                            {season.is_current_season && (
                              <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-400 ml-1">
                                Live
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">
                            {getMaskedHistoricalTeamName(season, user, isAdmin, teamOwnerNames)}
                          </p>
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {formatRecord(wins, losses)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={winPct >= 0.5 ? 'text-green-500 font-semibold' : ''}>
                            {formatWinPercentage(winPct)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {formatPoints(pf)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {formatPoints(pa)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          <span className={diff >= 0 ? 'text-green-500' : 'text-red-500'}>
                            {diff >= 0 ? '+' : ''}{diff.toFixed(1)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {season.playoff_finish && season.playoff_finish !== 'missed' && season.playoff_finish !== 'none' ? (
                            <Badge variant={isChampion ? 'default' : 'secondary'}>
                              {formatPlayoffFinish(season.playoff_finish)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No season history available</p>
          )}
        </CardContent>
      </Card>

      {/* Transaction Activity Chart */}
      {transactionHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Transaction Activity by Season
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={transactionHistory.map(t => ({
                  year: t.year,
                  freeAgents: t.free_agent_adds || 0,
                  waivers: t.waiver_claims || 0,
                  trades: t.trades || 0,
                  drops: t.drops || 0,
                  total: t.total_transactions || 0
                }))}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <XAxis
                  dataKey="year"
                  style={AXIS_STYLE}
                />
                <YAxis
                  style={AXIS_STYLE}
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
                        <p className="font-semibold mb-2 text-foreground">{label} Season</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Free Agents:</span>
                            <span className="font-medium text-foreground">{data.freeAgents}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Waivers:</span>
                            <span className="font-medium text-foreground">{data.waivers}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Trades:</span>
                            <span className="font-medium text-foreground">{data.trades}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Drops:</span>
                            <span className="font-medium text-foreground">{data.drops}</span>
                          </div>
                          <div className="flex justify-between gap-4 pt-1 border-t border-border">
                            <span className="font-medium text-foreground">Total:</span>
                            <span className="font-bold text-foreground">{data.total}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                  cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconType="rect"
                />
                <Bar
                  dataKey="freeAgents"
                  stackId="a"
                  fill={TRANSACTION_COLORS.free_agent}
                  name="Free Agents"
                />
                <Bar
                  dataKey="waivers"
                  stackId="a"
                  fill={TRANSACTION_COLORS.waiver}
                  name="Waivers"
                />
                <Bar
                  dataKey="trades"
                  stackId="a"
                  fill={TRANSACTION_COLORS.trade}
                  name="Trades"
                />
                <Bar
                  dataKey="drops"
                  stackId="a"
                  fill={TRANSACTION_COLORS.drop}
                  name="Drops"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Head-to-Head Rivalries */}
      {rivalries && (rivalries.bestMatchups?.length > 0 || rivalries.worstMatchups?.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Head-to-Head Rivalries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Best Matchups */}
              {rivalries.bestMatchups?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-green-600 mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Best Matchups
                  </h4>
                  <div className="space-y-2">
                    {rivalries.bestMatchups.map((matchup, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                        <div>
                          <p className="font-semibold">
                            {canViewFullData(user, isAdmin, teamOwnerNames)
                              ? matchup.opponentName
                              : `Franchise ${matchup.opponentId?.substring(0, 8) || 'Unknown'}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {matchup.totalGames} games
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-semibold text-green-600">
                            {matchup.wins}-{matchup.losses}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(matchup.winPct * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Worst Matchups */}
              {rivalries.worstMatchups?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-red-600 mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Toughest Opponents
                  </h4>
                  <div className="space-y-2">
                    {rivalries.worstMatchups.map((matchup, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                        <div>
                          <p className="font-semibold">
                            {canViewFullData(user, isAdmin, teamOwnerNames)
                              ? matchup.opponentName
                              : `Franchise ${matchup.opponentId?.substring(0, 8) || 'Unknown'}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {matchup.totalGames} games
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-semibold text-red-600">
                            {matchup.wins}-{matchup.losses}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(matchup.winPct * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Awards */}
      {awards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Awards & Honors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {awards.map((award, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-semibold">{award.award_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {award.season?.year} • {award.value_label}
                    </p>
                  </div>
                  <Badge variant="outline">{award.award_category}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FranchiseProfile;
