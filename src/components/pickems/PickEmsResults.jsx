import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Trophy, Target, Users, Award,
  CheckCircle2, XCircle, Clock, Calendar, BarChart3
} from 'lucide-react';
import { getMaskedTeamName, getMaskedUserName } from '../../utils/displayNameUtils';

const PickEmsResults = ({
  season,
  currentWeek,
  pickEmWeek,
  weeklyScores = [],
  allPicks = [],
  loading = false,
  resultsAvailable = false,
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  const [selectedTab, setSelectedTab] = useState('weekly');

  // Group picks by user for weekly results
  const picksByUser = allPicks.reduce((acc, pick) => {
    const userId = pick.userId;
    if (!acc[userId]) {
      acc[userId] = [];
    }
    acc[userId].push(pick);
    return acc;
  }, {});

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
    if (rank === 2) return <Award className="h-4 w-4 text-muted-foreground" />;
    if (rank === 3) return <Award className="h-4 w-4 text-amber-600" />;
    return null;
  };

  if (!resultsAvailable) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Results Not Yet Available</h3>
          <p className="text-muted-foreground">
            Results for week {currentWeek} will be revealed on{' '}
            {pickEmWeek && new Date(pickEmWeek.resultsRevealAt).toLocaleDateString()}.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading results...</p>
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
            Pick'ems Results - Week {currentWeek}
          </CardTitle>
          <CardDescription>
            See how everyone performed this week
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Results tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="w-full">
          <TabsTrigger value="weekly" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Weekly Results
          </TabsTrigger>
          <TabsTrigger value="breakdown" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Pick Breakdown
          </TabsTrigger>
        </TabsList>

        {/* Weekly Results Tab */}
        <TabsContent value="weekly" className="space-y-4">
          {weeklyScores.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Results Available</h3>
                <p className="text-muted-foreground">
                  No pick'em results found for week {currentWeek}.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Week {currentWeek} Leaderboard</CardTitle>
                <CardDescription>
                  Ranked by total points earned this week
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {weeklyScores.map((score, index) => (
                    <div
                      key={score.id || index}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          {getRankIcon(score.weeklyRank)}
                          <Badge variant={getRankBadgeVariant(score.weeklyRank)}>
                            #{score.weeklyRank}
                          </Badge>
                        </div>

                        <div>
                          <div className="font-medium">
                            {getMaskedUserName(score.displayName, score.userId, user, isAdmin, teamOwnerNames)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {score.correctPicks}/{score.totalPicks} correct
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-semibold">{score.totalPoints} pts</div>
                        <div className="text-sm text-muted-foreground">
                          {formatAccuracy(score.accuracyPercentage)} accuracy
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Pick Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-4">
          {Object.keys(picksByUser).length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Pick Details Available</h3>
                <p className="text-muted-foreground">
                  Pick breakdown is not available for week {currentWeek}.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {Object.entries(picksByUser).map(([userId, picks]) => {
                const displayName = picks[0]?.displayName || `User ${userId.slice(0, 8)}`;
                const maskedName = getMaskedUserName(displayName, userId, user, isAdmin, teamOwnerNames);
                return (
                <Card key={userId}>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {maskedName}'s Picks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {picks.map((pick) => {
                        // A game with no winner is either unplayed or a tie;
                        // neither may read as a named team.
                        const outcome = !pick.gameCompleted
                          ? 'pending'
                          : pick.isCorrect ? 'hit' : 'miss';
                        const winnerLabel = !pick.gameCompleted
                          ? 'Not played yet'
                          : pick.actualWinnerName
                            ? getMaskedTeamName({ id: pick.actualWinnerTeamId, name: pick.actualWinnerName }, user, isAdmin, teamOwnerNames)
                            : 'Tie';
                        const chosenLabel = pick.pickedTeamName
                          ? getMaskedTeamName({ id: pick.pickedTeamId, name: pick.pickedTeamName }, user, isAdmin, teamOwnerNames)
                          : '—';

                        return (
                        <div
                          key={pick.submissionId}
                          className="flex items-start justify-between gap-3 p-3 border rounded-lg"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="pt-0.5 shrink-0">
                              {outcome === 'hit' && (
                                <CheckCircle2 className="h-5 w-5 text-success" aria-label="Hit" />
                              )}
                              {outcome === 'miss' && (
                                <XCircle className="h-5 w-5 text-destructive" aria-label="Miss" />
                              )}
                              {outcome === 'pending' && (
                                <Clock className="h-5 w-5 text-muted-foreground" aria-label="Pending" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="font-medium break-words">
                                {getMaskedTeamName({ id: pick.team1Id, name: pick.team1Name }, user, isAdmin, teamOwnerNames)} vs {getMaskedTeamName({ id: pick.team2Id, name: pick.team2Name }, user, isAdmin, teamOwnerNames)}
                              </div>
                              <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-sm">
                                <dt className="text-muted-foreground">Winner of Matchup:</dt>
                                <dd className={`break-words ${outcome === 'pending' ? 'text-muted-foreground' : 'font-semibold text-foreground'}`}>
                                  {winnerLabel}
                                </dd>
                                <dt className="text-muted-foreground">Chosen:</dt>
                                <dd className="font-semibold text-foreground break-words">
                                  {chosenLabel}
                                </dd>
                              </dl>
                            </div>
                          </div>

                          <div className="text-right shrink-0 space-y-1">
                            {outcome === 'hit' && <Badge variant="success">Hit</Badge>}
                            {outcome === 'miss' && (
                              <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">
                                Miss
                              </Badge>
                            )}
                            {outcome === 'pending' && <Badge variant="outline">Pending</Badge>}
                            <div className="text-sm font-medium tabular">
                              {pick.pointsEarned || 0} pts
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
              })}
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* Summary stats */}
      {weeklyScores.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {weeklyScores.length > 0 && (
                <>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {weeklyScores.length}
                    </div>
                    <div className="text-sm text-muted-foreground">Participants</div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {Math.max(...weeklyScores.map(s => s.totalPoints))}
                    </div>
                    <div className="text-sm text-muted-foreground">Top Score</div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {formatAccuracy(
                        weeklyScores.reduce((sum, s) => sum + s.accuracyPercentage, 0) / weeklyScores.length
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Accuracy</div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {weeklyScores.filter(s => s.accuracyPercentage === 100).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Perfect Weeks</div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PickEmsResults;