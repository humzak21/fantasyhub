import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import {
  Trophy, TrendingUp, Award
} from 'lucide-react';
import { getMaskedTeamName, getMaskedUserName } from '../../utils/displayNameUtils';

const PickEmsSeasonStandings = ({
  season,
  currentWeek,
  seasonStandings = [],
  seasonPicks = [],
  loading = false,
  resultsAvailable = false,
  user = null,
  isAdmin = false
}) => {
  const formatAccuracy = (accuracy) => {
    return `${accuracy?.toFixed(1) || '0.0'}%`;
  };

  const getRankBadgeVariant = (rank) => {
    if (rank === 1) return 'default';
    if (rank <= 3) return 'secondary';
    return 'outline';
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy className="h-4 w-4 text-yellow-500" />;
    if (rank === 2) return <Award className="h-4 w-4 text-gray-400" />;
    if (rank === 3) return <Award className="h-4 w-4 text-amber-600" />;
    return null;
  };

  // Calculate team pick frequency for season-long analysis
  const calculateTeamPickFrequency = () => {
    const teamStats = {};
    
    seasonPicks.forEach(pick => {
      // Count picks for the picked team
      const pickedTeamId = pick.pickedTeamId;
      const pickedTeam = { id: pickedTeamId, name: pick.pickedTeamName };
      const pickedTeamName = getMaskedTeamName(pickedTeam, user, isAdmin);

      if (pickedTeamId && pickedTeamName) {
        if (!teamStats[pickedTeamId]) {
          teamStats[pickedTeamId] = {
            teamId: pickedTeamId,
            teamName: pickedTeamName,
            timesPicked: 0,
            timesCorrect: 0,
            totalMatchups: 0
          };
        }
        teamStats[pickedTeamId].timesPicked++;
        if (pick.isCorrect) {
          teamStats[pickedTeamId].timesCorrect++;
        }
      }

      // Count total matchups for both teams
      [pick.team1Id, pick.team2Id].forEach((teamId, idx) => {
        const originalTeamName = idx === 0 ? pick.team1Name : pick.team2Name;
        const team = { id: teamId, name: originalTeamName };
        const teamName = getMaskedTeamName(team, user, isAdmin);
        if (teamId && teamName) {
          if (!teamStats[teamId]) {
            teamStats[teamId] = {
              teamId: teamId,
              teamName: teamName,
              timesPicked: 0,
              timesCorrect: 0,
              totalMatchups: 0
            };
          }
          teamStats[teamId].totalMatchups++;
        }
      });
    });

    // Convert to array and calculate percentages
    return Object.values(teamStats)
      .map(team => ({
        ...team,
        pickRate: team.totalMatchups > 0 ? (team.timesPicked / team.totalMatchups) * 100 : 0,
        winRate: team.timesPicked > 0 ? (team.timesCorrect / team.timesPicked) * 100 : 0
      }))
      .sort((a, b) => b.timesPicked - a.timesPicked);
  };

  const teamPickFrequency = calculateTeamPickFrequency();

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading standings...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Season Standings
          </CardTitle>
          <CardDescription>
            Overall pick'ems performance across all completed weeks
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Season Standings */}
      {seasonStandings.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Season Standings Available</h3>
            <p className="text-muted-foreground">
              Season-long pick'em standings will appear here as weeks are completed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Season-Long Standings</CardTitle>
            <CardDescription>
              Overall performance across all completed weeks
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!resultsAvailable && currentWeek && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-200">
                  <span className="font-medium">Note:</span> These standings do not include Week {currentWeek} results, as games are still in progress or results haven't been finalized yet.
                </p>
              </div>
            )}
            <div className="space-y-3">
              {seasonStandings.map((standing, index) => (
                <div
                  key={standing.id || index}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {getRankIcon(standing.seasonRank)}
                      <Badge variant={getRankBadgeVariant(standing.seasonRank)}>
                        #{standing.seasonRank}
                      </Badge>
                    </div>

                    <div>
                      <div className="font-medium">
                        {getMaskedUserName(standing.displayName, standing.userId, user, isAdmin)}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-4">
                        <span>{standing.totalCorrectPicks}/{standing.totalPicks} picks</span>
                        <span>{standing.totalWeeksParticipated} weeks</span>
                        {standing.perfectWeeks > 0 && (
                          <span className="flex items-center gap-1">
                            <Trophy className="h-3 w-3" />
                            {standing.perfectWeeks} perfect
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-semibold">{standing.totalPoints} pts</div>
                    <div className="text-sm text-muted-foreground">
                      {formatAccuracy(standing.overallAccuracyPercentage)} overall
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team Pick Frequency Table */}
      {teamPickFrequency.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Team Pick Popularity
            </CardTitle>
            <CardDescription>
              How often each team is picked to win across all matchups
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {teamPickFrequency.map((team, index) => (
                <div
                  key={team.teamId}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted font-semibold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium">{team.teamName}</div>
                      <div className="text-sm text-muted-foreground">
                        {team.timesPicked} picks in {team.totalMatchups} matchups
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-center min-w-[80px]">
                      <div className="flex items-center justify-center gap-2 h-6">
                        <span className="font-semibold">{team.pickRate.toFixed(1)}%</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        pick rate
                      </div>
                    </div>
                    <div className="text-center min-w-[80px]">
                      {team.timesPicked > 0 && (
                        <>
                          <div className="flex items-center justify-center gap-2 h-6">
                            <span className={`font-semibold ${
                              team.winRate >= 50 
                                ? 'text-green-600 dark:text-green-400' 
                                : 'text-red-600 dark:text-red-400'
                            }`}>
                              {team.winRate.toFixed(1)}%
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            win rate
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Legend */}
            <Separator className="my-4" />
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <span className="font-semibold min-w-[80px]">Pick Rate:</span>
                <span>Percentage of times this team was picked to win out of their total matchups</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-semibold min-w-[80px]">Win Rate:</span>
                <span>Percentage of times this team actually won when picked by users</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PickEmsSeasonStandings;

