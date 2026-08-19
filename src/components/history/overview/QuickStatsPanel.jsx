import React, { useMemo } from 'react';
import { Trophy, TrendingUp, Users, Award, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { getMaskedFranchiseName } from '../utils/privacyHelpers';
import { formatPoints, formatWinPercentage } from '../utils/statFormatters';
import PointsWinsDistributionChart from '../charts/PointsWinsDistributionChart';
import { useTransactionLeaderboard } from '../../../../hooks/queries/index.js';

const QuickStatsPanel = ({
  franchises = [],
  seasons = [],
  careerStats = [],
  championships = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onViewFranchise = () => {},
  onViewSeason = () => {}
}) => {
  const { data: transactionData = [] } = useTransactionLeaderboard();

  // Calculate quick stats
  const stats = useMemo(() => {
    if (!careerStats.length) return null;

    // Most championships
    const mostChampionships = [...careerStats].sort((a, b) =>
      (b.championships || 0) - (a.championships || 0)
    )[0];

    // Best win percentage (min 2 seasons)
    const bestWinPct = [...careerStats]
      .filter(s => s.total_seasons >= 2)
      .sort((a, b) => (b.avg_win_percentage || 0) - (a.avg_win_percentage || 0))[0];

    // Most total wins
    const mostWins = [...careerStats].sort((a, b) =>
      (b.total_wins || 0) - (a.total_wins || 0)
    )[0];

    // Highest scoring season
    let highestScoringTeam = null;
    let highestPoints = 0;

    seasons.forEach(season => {
      if (season.stats?.highest_points_team) {
        const points = season.stats.highest_points;
        if (points > highestPoints) {
          highestPoints = points;
          highestScoringTeam = {
            ...season.stats.highest_points_team,
            year: season.year,
            points: points
          };
        }
      }
    });

    // Games in a league season, from whoever has played the most of them. This
    // was hardcoded to Humza Khalil's franchise on the grounds that he had
    // played every one — true until someone else outlasted him, and silently
    // zero if that franchise were ever renamed.
    const totalGamesPlayed = careerStats.reduce(
      (most, stat) =>
        Math.max(most, (stat.total_wins || 0) + (stat.total_losses || 0) + (stat.total_ties || 0)),
      0
    );

    return {
      mostChampionships,
      bestWinPct,
      mostWins,
      highestScoringTeam,
      totalGamesPlayed,
      totalSeasons: seasons.length,
      totalFranchises: franchises.length
    };
  }, [careerStats, seasons, championships, franchises]);

  if (!stats) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">No statistics available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left column - Key Stats */}
      <div className="lg:col-span-1 space-y-4">
        {/* Total Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">League Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Franchises</span>
              </div>
              <Badge variant="secondary">{stats.totalFranchises}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Seasons</span>
              </div>
              <Badge variant="secondary">{stats.totalSeasons}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Games Played</span>
              </div>
              <Badge variant="secondary">{stats.totalGamesPlayed}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Most Championships */}
        {stats.mostChampionships && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-600" />
                Most Championships
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {getMaskedFranchiseName(
                      franchises.find(f => f.id === stats.mostChampionships.franchise_id),
                      user,
                      isAdmin,
                      teamOwnerNames
                    )}
                  </span>
                  <Badge className="bg-amber-600">
                    {stats.mostChampionships.championships} {stats.mostChampionships.championships === 1 ? 'Title' : 'Titles'}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between"
                  onClick={() => onViewFranchise(stats.mostChampionships.franchise_id)}
                >
                  View Profile
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Best Win Percentage */}
        {stats.bestWinPct && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Best Win %
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {getMaskedFranchiseName(
                      franchises.find(f => f.id === stats.bestWinPct.franchise_id),
                      user,
                      isAdmin,
                      teamOwnerNames
                    )}
                  </span>
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    {formatWinPercentage(stats.bestWinPct.avg_win_percentage)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats.bestWinPct.total_wins}-{stats.bestWinPct.total_losses} overall
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between"
                  onClick={() => onViewFranchise(stats.bestWinPct.franchise_id)}
                >
                  View Profile
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Most Wins */}
        {stats.mostWins && stats.mostWins.franchise_id !== stats.bestWinPct?.franchise_id && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-600" />
                Most Wins
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {getMaskedFranchiseName(
                      franchises.find(f => f.id === stats.mostWins.franchise_id),
                      user,
                      isAdmin,
                      teamOwnerNames
                    )}
                  </span>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    {stats.mostWins.total_wins} Wins
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between"
                  onClick={() => onViewFranchise(stats.mostWins.franchise_id)}
                >
                  View Profile
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right column - Points & Wins Distribution Chart */}
      <div className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-lg">All-Time Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <PointsWinsDistributionChart
              careerStats={careerStats}
              franchises={franchises}
              transactionData={transactionData}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default QuickStatsPanel;
