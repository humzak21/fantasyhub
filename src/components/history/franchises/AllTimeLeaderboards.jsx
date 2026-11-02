import React, { useState, useMemo } from 'react';
import { Trophy, Medal, Crown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { ResponsiveDataTable } from '../../ui/responsive-table';
import { getMaskedFranchiseName } from '../utils/privacyHelpers';
import { formatWinPercentage, formatPoints, formatRecord } from '../utils/statFormatters';
import { sortRows } from '../../../utils/tableSort';

/** Championships, then win %, then average points: the board's own order. */
const byDefaultOrder = (a, b) =>
  (b.championships || 0) - (a.championships || 0) ||
  (b.avg_win_percentage || 0) - (a.avg_win_percentage || 0) ||
  (b.avg_points_for || 0) - (a.avg_points_for || 0);

const AllTimeLeaderboards = ({
  franchises = [],
  careerStats = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onViewProfile = () => {}
}) => {
  const [sort, setSort] = useState(null);

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

  // The rank is the franchise's place on the default board, so it stays with
  // the franchise however the table is sorted.
  const rankedData = useMemo(
    () => [...leaderboardData].sort(byDefaultOrder).map((franchise, index) => ({ ...franchise, rank: index + 1 })),
    [leaderboardData]
  );

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
      sortValue: (franchise) => franchise.rank,
      cell: (franchise) => (
        <div className="flex items-center gap-2 font-medium">
          {getRankIcon(franchise.rank - 1)}
          {franchise.rank}
        </div>
      ),
    },
    {
      key: 'franchise',
      header: 'Franchise',
      priority: 'primary',
      sortValue: (franchise) => getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames),
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
      sortValue: (franchise) => franchise.championships,
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
      sortValue: (franchise) => franchise.total_wins,
      cell: (franchise) => formatRecord(franchise.total_wins || 0, franchise.total_losses || 0),
    },
    {
      key: 'winPct',
      header: 'Win %',
      className: 'text-center',
      headerClassName: 'text-center',
      sortValue: (franchise) => franchise.avg_win_percentage,
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
      sortValue: (franchise) => franchise.avg_points_for,
      cell: (franchise) => (franchise.avg_points_for ? formatPoints(franchise.avg_points_for) : '-'),
    },
    {
      key: 'playoffs',
      header: 'Playoffs',
      className: 'text-center',
      headerClassName: 'text-center',
      sortValue: (franchise) => franchise.playoff_appearances,
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
        {/* Leaderboard table. Seven columns of small numbers; below sm: the
            same column definitions render one card per franchise. */}
        <div className="rounded-lg border p-2 sm:p-0 sm:overflow-hidden">
          <ResponsiveDataTable
            columns={leaderboardColumns}
            data={sortRows(rankedData, sort, leaderboardColumns)}
            sort={sort}
            onSortChange={setSort}
            rowClassName={(franchise) => `${getRankClass(franchise.rank - 1)} hover:bg-muted/50 transition-colors`}
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
