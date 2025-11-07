import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Trophy, Target, Users, Award,
  CheckCircle2, XCircle, Calendar, BarChart3
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
  isAdmin = false
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
            See how everyone performed this week
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Results tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-2">
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
                            {getMaskedUserName(score.displayName, score.userId, user, isAdmin)}
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
                const maskedName = getMaskedUserName(displayName, userId, user, isAdmin);
                return (
                <Card key={userId}>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {maskedName}'s Picks
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
                                {getMaskedTeamName({ id: pick.team1Id, name: pick.team1Name }, user, isAdmin)} vs {getMaskedTeamName({ id: pick.team2Id, name: pick.team2Name }, user, isAdmin)}
                              </div>
                              {pick.actualWinnerName && (
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Winner: </span>
                                  <span className={`font-semibold ${
                                    pick.isCorrect
                                      ? 'text-green-600 dark:text-green-400'
                                      : 'text-red-600 dark:text-red-400'
                                  }`}>
                                    {getMaskedTeamName({ id: pick.actualWinnerId, name: pick.actualWinnerName }, user, isAdmin)}
                                  </span>
                                </div>
                              )}
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