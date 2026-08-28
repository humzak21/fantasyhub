import React from 'react';
import { ArrowLeft, Calendar, Crown, Medal } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { isCurrentSeason } from '../../../../utils/seasonConfig.js';
import { ResponsiveDataTable } from '../../ui/responsive-table';
import { useSeasonDetail } from '../../../../hooks/queries/index.js';
import { getMaskedHistoricalOwnerName, getMaskedHistoricalTeamName } from '../utils/privacyHelpers';
import { formatRecord, formatPoints, formatPlayoffFinish } from '../utils/statFormatters';

const SeasonDetail = ({
  season,
  seasonYear,
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onBack = () => { }
}) => {
  // The parent owns the season list and passes the row down; this only needs
  // the detail behind it.
  const currentSeason = season;
  const { data: seasonData, isLoading: loading } = useSeasonDetail(currentSeason?.id);

  if (loading && !seasonData) {
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

  if (!currentSeason) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">Season not found</p>
        </CardContent>
      </Card>
    );
  }

  const teams = seasonData?.teams || [];

  // `final_rank` is written by `finalize_season` and is the season's own
  // answer; the finish/record ordering below is the fallback for a season that
  // has not been finalized.
  const sortedTeams = [...teams].sort((a, b) => {
    if (a.final_rank != null && b.final_rank != null) return a.final_rank - b.final_rank;
    if (a.final_rank != null) return -1;
    if (b.final_rank != null) return 1;

    // Map finish values to sort order (lower = better)
    const getFinishRank = (finish) => {
      if (!finish || finish === 'none' || finish === 'missed') return 99;
      const f = finish.toLowerCase();
      if (f === 'champion') return 1;
      if (f === 'runner-up' || f === '2nd') return 2;
      if (f === '3rd place' || f === '3rd') return 3;
      if (f === '4th place' || f === '4th') return 4;
      if (f === '5th') return 5;
      if (f === '6th') return 6;
      if (f === 'playoffs' || f === 'semifinals' || f === 'quarterfinals') return 7;
      return 99;
    };

    const aFinishRank = getFinishRank(a.playoff_finish);
    const bFinishRank = getFinishRank(b.playoff_finish);
    if (aFinishRank !== bFinishRank) return aFinishRank - bFinishRank;

    // Then by win percentage
    const aGames = (a.regular_season_wins || 0) + (a.regular_season_losses || 0);
    const bGames = (b.regular_season_wins || 0) + (b.regular_season_losses || 0);
    const aWinPct = aGames > 0 ? (a.regular_season_wins || 0) / aGames : 0;
    const bWinPct = bGames > 0 ? (b.regular_season_wins || 0) / bGames : 0;
    if (bWinPct !== aWinPct) return bWinPct - aWinPct;

    // Then by points for
    return (b.points_for || 0) - (a.points_for || 0);
  });

  const getRankIcon = (index) => {
    if (index === 0) return <Crown className="h-4 w-4 text-amber-500" />;
    if (index === 1) return <Medal className="h-4 w-4 text-gray-400" />;
    if (index === 2) return <Medal className="h-4 w-4 text-amber-700" />;
    return null;
  };

  const getRankClass = (index) => {
    if (index === 0) return 'bg-amber-500/10';
    if (index === 1) return 'bg-slate-400/10';
    if (index === 2) return 'bg-amber-700/10';
    return '';
  };

  const getPlayoffBadgeVariant = (finish) => {
    if (finish === 'champion') return 'default';
    if (finish === '2nd' || finish === '3rd') return 'secondary';
    return 'outline';
  };

  // Seven columns of small numbers do not survive a 375px screen; below sm:
  // this renders as a card per team. Rank, owner and final placement are the
  // card header — they are what identifies the row — and the point totals
  // become a labelled grid, which is more readable than the table even on
  // desktop when the header has scrolled away.
  const standingsColumns = [
    {
      key: 'rank',
      header: 'Rank',
      priority: 'primary',
      headerClassName: 'w-12',
      className: 'font-medium',
      cell: (_team, index) => (
        <div className="flex items-center gap-2 font-medium">
          {getRankIcon(index)}
          {index + 1}
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      priority: 'primary',
      cell: (team) => (
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {getMaskedHistoricalOwnerName(team, user, isAdmin, teamOwnerNames)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {getMaskedHistoricalTeamName(team, user, isAdmin, teamOwnerNames)}
          </p>
        </div>
      ),
    },
    {
      key: 'finish',
      header: 'Finish',
      priority: 'primary',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (team) =>
        team.playoff_finish && team.playoff_finish !== 'missed' && team.playoff_finish !== 'none' ? (
          <Badge variant={getPlayoffBadgeVariant(team.playoff_finish)}>
            {formatPlayoffFinish(team.playoff_finish)}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        ),
    },
    {
      key: 'record',
      header: 'Record',
      className: 'text-center font-mono text-sm',
      headerClassName: 'text-center',
      cell: (team) => formatRecord(team.regular_season_wins, team.regular_season_losses),
    },
    {
      key: 'pf',
      header: 'PF',
      cardLabel: 'Points for',
      className: 'text-center font-mono text-sm',
      headerClassName: 'text-center',
      cell: (team) => formatPoints(team.points_for),
    },
    {
      key: 'pa',
      header: 'PA',
      cardLabel: 'Points against',
      className: 'text-center font-mono text-sm',
      headerClassName: 'text-center',
      cell: (team) => formatPoints(team.points_against),
    },
    {
      key: 'diff',
      header: 'Diff',
      className: 'text-center font-mono text-sm',
      headerClassName: 'text-center',
      cell: (team) => {
        const diff = (team.points_for || 0) - (team.points_against || 0);
        return (
          <span className={diff >= 0 ? 'text-green-500' : 'text-red-500'}>
            {diff >= 0 ? '+' : ''}{diff.toFixed(1)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Overview
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {currentSeason.year} Season
            {isCurrentSeason(currentSeason) && (
              <Badge variant="secondary" className="ml-2 bg-blue-500/20 text-blue-400">
                In Progress
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Teams</p>
              <p className="text-2xl font-bold">{currentSeason.league_size || 14}</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Regular Season</p>
              <p className="text-2xl font-bold">{currentSeason.regular_season_weeks || 14} weeks</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Playoffs</p>
              <p className="text-2xl font-bold">{currentSeason.playoff_weeks || 3} weeks</p>
            </div>
          </div>

          {sortedTeams.length > 0 ? (
            <div className="rounded-lg border p-2 sm:p-0 sm:overflow-hidden">
              <ResponsiveDataTable columns={standingsColumns} data={sortedTeams} rowClassName={(_t, i) => getRankClass(i)} />
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No team data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SeasonDetail;
