import React, { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, Crown, Medal } from 'lucide-react';
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
import { useLeagueHistory } from '../../../hooks/useLeagueHistory';
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
  const { loadSeasonDetail, loading, seasons } = useLeagueHistory();
  const [seasonData, setSeasonData] = useState(null);

  // Get season from year if not provided
  const currentSeason = season || seasons.find(s => s.year === seasonYear);

  useEffect(() => {
    const loadData = async () => {
      if (currentSeason?.id) {
        const data = await loadSeasonDetail(currentSeason.id);
        setSeasonData(data);
      }
    };
    loadData();
  }, [currentSeason, loadSeasonDetail]);

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

  // Sort teams by playoff finish, then win%, then points for
  const sortedTeams = [...teams].sort((a, b) => {
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
            {currentSeason.year === 2025 && (
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
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Rank</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-center">Record</TableHead>
                    <TableHead className="text-center">PF</TableHead>
                    <TableHead className="text-center">PA</TableHead>
                    <TableHead className="text-center">Diff</TableHead>
                    <TableHead className="text-center">Finish</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTeams.map((team, index) => {
                    const diff = (team.points_for || 0) - (team.points_against || 0);
                    return (
                      <TableRow key={team.id} className={getRankClass(index)}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {getRankIcon(index)}
                            {index + 1}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-semibold">
                              {getMaskedHistoricalOwnerName(team, user, isAdmin, teamOwnerNames)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {getMaskedHistoricalTeamName(team, user, isAdmin, teamOwnerNames)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {formatRecord(team.regular_season_wins, team.regular_season_losses)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {formatPoints(team.points_for)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {formatPoints(team.points_against)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          <span className={diff >= 0 ? 'text-green-500' : 'text-red-500'}>
                            {diff >= 0 ? '+' : ''}{diff.toFixed(1)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {team.playoff_finish && team.playoff_finish !== 'missed' && team.playoff_finish !== 'none' ? (
                            <Badge variant={getPlayoffBadgeVariant(team.playoff_finish)}>
                              {formatPlayoffFinish(team.playoff_finish)}
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
            <p className="text-muted-foreground text-center py-8">No team data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SeasonDetail;
