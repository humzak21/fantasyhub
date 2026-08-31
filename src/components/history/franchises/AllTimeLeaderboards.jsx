import React, { useState, useMemo } from 'react';
import { Trophy, TrendingUp, Award, Medal, Crown, Target } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { ResponsiveDataTable } from '../../ui/responsive-table';
import { getMaskedFranchiseName } from '../utils/privacyHelpers';
import { formatWinPercentage, formatPoints, formatRecord } from '../utils/statFormatters';

const AllTimeLeaderboards = ({
  franchises = [],
  careerStats = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onViewProfile = () => {}
}) => {
  const [sortBy, setSortBy] = useState('championships');
  const [sortOrder, setSortOrder] = useState('desc');

  // Merge franchises with career stats from mv_franchise_career_stats
  // Falls back to league_franchises table fields if materialized view data is unavailable
  const leaderboardData = useMemo(() => {
    return franchises.map(franchise => {
      const stats = careerStats.find(s => s.franchise_id === franchise.id) || {};

      // Map data from either materialized view or league_franchises table
      // Materialized view uses: total_wins, avg_win_percentage, avg_points_per_game, seasons_played
      // league_franchises uses: total_regular_season_wins, career_win_percentage, total_points_for, total_seasons
      return {
        ...franchise,
        // Career stats - try materialized view first, then fall back to franchise table
        total_wins: stats.total_wins || franchise.total_regular_season_wins || 0,
        total_losses: stats.total_losses || franchise.total_regular_season_losses || 0,
        total_ties: stats.total_ties || 0,
        avg_win_percentage: stats.avg_win_percentage || franchise.career_win_percentage || 0,
        playoff_appearances: stats.playoff_appearances || franchise.total_playoff_appearances || 0,
        championships: stats.championships || franchise.total_championships || 0,
        runner_ups: stats.runner_ups || 0,
        career_points_for: stats.career_points_for || franchise.total_points_for || 0,
        career_points_against: stats.career_points_against || franchise.total_points_against || 0,
        // For avg_points_for, calculate from franchise data if materialized view is empty
        avg_points_for: stats.avg_points_per_game ||
          (franchise.total_points_for && franchise.total_regular_season_wins + franchise.total_regular_season_losses > 0
            ? franchise.total_points_for / (franchise.total_regular_season_wins + franchise.total_regular_season_losses)
            : 0),
        avg_final_rank: stats.avg_final_rank || 0,
        best_finish: stats.best_finish || null,
        worst_finish: stats.worst_finish || null,
        total_seasons: stats.seasons_played || franchise.total_seasons || 0
      };
    });
  }, [franchises, careerStats]);

  // Sort data - default sort by championships, then win%, then avg points
  const sortedData = useMemo(() => {
    const sorted = [...leaderboardData].sort((a, b) => {
      // Primary sort by selected field
      let aVal = a[sortBy] || 0;
      let bVal = b[sortBy] || 0;

      let comparison;
      if (sortOrder === 'asc') {
        comparison = aVal - bVal;
      } else {
        comparison = bVal - aVal;
      }

      // If primary sort is equal, use tiebreakers
      if (comparison === 0) {
        // Secondary: win percentage (descending)
        const winPctDiff = (b.avg_win_percentage || 0) - (a.avg_win_percentage || 0);
        if (winPctDiff !== 0) return winPctDiff;

        // Tertiary: average points for (descending)
        return (b.avg_points_for || 0) - (a.avg_points_for || 0);
      }

      return comparison;
    });

    return sorted;
  }, [leaderboardData, sortBy, sortOrder]);

  const handleSort = (key) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('desc');
    }
  };

  const getRankIcon = (index) => {
    if (index === 0) return <Crown className="h-4 w-4 text-amber-600" />;
    if (index === 1) return <Medal className="h-4 w-4 text-muted-foreground" />;
    if (index === 2) return <Medal className="h-4 w-4 text-orange-600" />;
    return null;
  };

  const getRankClass = (index) => {
    if (index === 0) return 'bg-amber-500/20';
    if (index === 1) return 'bg-slate-400/20';
    if (index === 2) return 'bg-orange-500/20';
    return '';
  };

  if (!leaderboardData.length) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">No leaderboard data available</p>
        </CardContent>
      </Card>
    );
  }

  const leaderboardColumns = [
    {
      key: 'rank',
      header: 'Rank',
      priority: 'primary',
      headerClassName: 'w-12',
      className: 'font-medium',
      cell: (_f, index) => (
        <div className="flex items-center gap-2 font-medium">
          {getRankIcon(index)}
          {index + 1}
        </div>
      ),
    },
    {
      key: 'franchise',
      header: 'Franchise',
      priority: 'primary',
      cell: (franchise) => (
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {franchise.joined_year}
            {franchise.left_year ? `-${franchise.left_year}` : '-Present'}
            {' • '}
            {franchise.total_seasons || 0} seasons
          </p>
        </div>
      ),
    },
    {
      key: 'titles',
      header: 'Titles',
      priority: 'primary',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (franchise) =>
        franchise.championships > 0 ? (
          <Badge className="bg-amber-600">{franchise.championships}</Badge>
        ) : (
          <span className="text-muted-foreground">0</span>
        ),
    },
    {
      key: 'record',
      header: 'Record',
      className: 'text-center tabular text-sm',
      headerClassName: 'text-center',
      cell: (franchise) => formatRecord(franchise.total_wins || 0, franchise.total_losses || 0),
    },
    {
      key: 'winPct',
      header: 'Win %',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (franchise) => (
        <span className={franchise.avg_win_percentage >= 0.5 ? 'font-semibold text-green-600' : ''}>
          {formatWinPercentage(franchise.avg_win_percentage)}
        </span>
      ),
    },
    {
      key: 'avgPf',
      header: 'Avg PF',
      className: 'text-center tabular text-sm',
      headerClassName: 'text-center',
      cell: (franchise) => (franchise.avg_points_for ? formatPoints(franchise.avg_points_for) : '-'),
    },
    {
      key: 'playoffs',
      header: 'Playoffs',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (franchise) => <Badge variant="secondary">{franchise.playoff_appearances || 0}</Badge>,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          All-Time Leaderboards
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Sort buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            variant={sortBy === 'championships' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSort('championships')}
          >
            <Trophy className="h-3 w-3 mr-1" />
            Championships
          </Button>
          <Button
            variant={sortBy === 'avg_win_percentage' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSort('avg_win_percentage')}
          >
            <TrendingUp className="h-3 w-3 mr-1" />
            Wins
          </Button>
          <Button
            variant={sortBy === 'avg_points_for' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSort('avg_points_for')}
          >
            <Award className="h-3 w-3 mr-1" />
            Avg Points
          </Button>
          <Button
            variant={sortBy === 'playoff_appearances' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSort('playoff_appearances')}
          >
            <Target className="h-3 w-3 mr-1" />
            Playoffs
          </Button>
        </div>

        {/* Leaderboard table. Seven columns of small numbers; below sm: the
            same column definitions render one card per franchise. */}
        <div className="rounded-lg border p-2 sm:p-0 sm:overflow-hidden">
          <ResponsiveDataTable
            columns={leaderboardColumns}
            data={sortedData}
            rowClassName={(_f, index) => `${getRankClass(index)} hover:bg-muted/50 transition-colors`}
            onRowClick={(franchise) => onViewProfile(franchise.id)}
          />
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Click on a franchise to view their complete history, season-by-season performance, and awards.
        </p>
      </CardContent>
    </Card>
  );
};

export default AllTimeLeaderboards;
