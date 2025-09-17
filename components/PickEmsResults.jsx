import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Table } from './ui/table';
import { Separator } from './ui/separator';
import {
  Trophy, Target, Users, TrendingUp, TrendingDown, Award,
  CheckCircle2, XCircle, Calendar, BarChart3, Percent
} from 'lucide-react';

const PickEmsResults = ({
  season,
  currentWeek,
  pickEmWeek,
  weeklyScores = [],
  seasonStandings = [],
  allPicks = [],
  userPicks = [],
  loading = false,
  resultsAvailable = false
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
    if (rank === 2) return <Award className="h-4 w-4 text-gray-400" />;
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
            See how everyone performed this week and season standings
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Results tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="weekly" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Weekly Results
          </TabsTrigger>
          <TabsTrigger value="breakdown" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Pick Breakdown
          </TabsTrigger>
          <TabsTrigger value="season" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Season Standings
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
                            User {score.userId} {/* Replace with actual user names when available */}
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
              {Object.entries(picksByUser).map(([userId, picks]) => (
                <Card key={userId}>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      User {userId}'s Picks {/* Replace with actual user names */}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {picks.map((pick) => (
                        <div
                          key={pick.submissionId}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              {pick.isCorrect ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-500" />
                              )}
                            </div>

                            <div>
                              <div className="font-medium">
                                {pick.team1Name} vs {pick.team2Name}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Picked: {pick.predictedWinnerName}
                                {pick.actualWinnerName && (
                                  <span> • Winner: {pick.actualWinnerName}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-sm font-medium">
                              {pick.pointsEarned || 0} pts
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Season Standings Tab */}
        <TabsContent value="season" className="space-y-4">
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
                            User {standing.userId} {/* Replace with actual user names */}
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
        </TabsContent>
      </Tabs>

      {/* Summary stats */}
      {(weeklyScores.length > 0 || seasonStandings.length > 0) && (
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