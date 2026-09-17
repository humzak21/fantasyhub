import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { EmptyState } from '../ui/empty-state';
import { TeamAvatar } from '../ui/team-identity';
import {
  Trophy, TrendingUp
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getMaskedTeamName, getMaskedUserName } from '../../utils/displayNameUtils';
import { rankSeasonStandings, ordinal } from './seasonRanks.js';
import TourneyNote from './TourneyNote.jsx';

const PickEmsSeasonStandings = ({
  season,
  currentWeek,
  seasonStandings = [],
  seasonPicks = [],
  loading = false,
  resultsAvailable = false,
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  const formatAccuracy = (accuracy) => {
    return `${accuracy?.toFixed(1) || '0.0'}%`;
  };

  // Competition ranking on points, so everyone level at the top is level. The
  // rows arrive numbered by array position — see `seasonRanks.js`.
  const ranked = rankSeasonStandings(seasonStandings);

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
        const teamName = getMaskedTeamName(team, user, isAdmin, teamOwnerNames);
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
      {/* Header. The two tourneys are stated here rather than in a sentence
          under the title: this is the table a member reads to work out whether
          they are in line for the FAAB, and the participation floor is the
          part of that answer the points column cannot give them. */}
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
        <CardContent>
          <TourneyNote currentWeek={currentWeek} />
        </CardContent>
      </Card>

      {/* Season Standings */}
      {ranked.length === 0 ? (
        <Card>
          <EmptyState
            icon={Trophy}
            title="No season standings yet"
            description="Season-long pick'em standings appear here as weeks are completed."
          />
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
              <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3">
                <p className="text-sm text-warning">
                  <span className="font-medium">Note:</span> These standings do not include Week {currentWeek} results, as games are still in progress or results haven't been finalized yet.
                </p>
              </div>
            )}
            <div className="space-y-3">
              {ranked.map((standing, index) => {
                const name = getMaskedUserName(
                  standing.displayName,
                  standing.userId,
                  user,
                  isAdmin,
                  teamOwnerNames
                );
                const isViewer = Boolean(user) && standing.userId === user?.id;

                return (
                  <div
                    key={standing.userId || index}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50',
                      // Warm means yours.
                      isViewer && 'border-primary/40 bg-primary/[0.06]'
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {/* The trophy is the whole of the podium now. Second and
                          third wore ribbons of their own, which said the
                          league pays three places; it pays one, and everyone
                          level at the top shares it. */}
                      <span className="flex w-9 shrink-0 items-center justify-center">
                        {standing.isLeader ? (
                          <Trophy className="h-5 w-5 text-warning" aria-hidden="true" />
                        ) : (
                          <span className="text-sm font-semibold tabular text-muted-foreground">
                            {ordinal(standing.rank)}
                          </span>
                        )}
                      </span>

                      {/* The same mark the schedule and rankings use, keyed on
                          the name the viewer is shown — a masked reader's
                          avatar must follow the masked name, or the initials
                          give the owner away. */}
                      <TeamAvatar team={{ owner: name }} size="sm" />

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 truncate font-medium">
                          {name}
                          {standing.isLeader && (
                            <Badge variant="warning" className="shrink-0">
                              {standing.isTied ? `T-${ordinal(standing.rank)}` : ordinal(standing.rank)}
                            </Badge>
                          )}
                          {!standing.isLeader && standing.isTied && (
                            <span className="shrink-0 text-xs text-muted-foreground">tied</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
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

                    <div className="shrink-0 text-right">
                      <div className="font-semibold tabular">{standing.totalPoints} pts</div>
                      <div className="text-sm tabular text-muted-foreground">
                        {formatAccuracy(standing.overallAccuracyPercentage)} overall
                      </div>
                    </div>
                  </div>
                );
              })}
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
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular">
                      {index + 1}
                    </div>
                    <TeamAvatar team={{ name: team.teamName }} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{team.teamName}</div>
                      <div className="text-sm text-muted-foreground">
                        {team.timesPicked} picks in {team.totalMatchups} matchups
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-6">
                    <div className="text-center min-w-[80px]">
                      <div className="flex items-center justify-center gap-2 h-6">
                        <span className="font-semibold tabular">{team.pickRate.toFixed(1)}%</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        pick rate
                      </div>
                    </div>
                    <div className="text-center min-w-[80px]">
                      {team.timesPicked > 0 && (
                        <>
                          <div className="flex items-center justify-center gap-2 h-6">
                            {/* A rate either side of even has a direction, so
                                it carries colour; the raw counts beside it do
                                not and stay in the foreground. */}
                            <span className={cn(
                              'font-semibold tabular',
                              team.winRate >= 50 ? 'text-success' : 'text-destructive'
                            )}>
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
