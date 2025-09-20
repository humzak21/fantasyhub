import React, { useState } from 'react';
import { Trophy, Target, Users, TrendingUp, Calendar, BarChart3, CheckCircle2, XCircle, Award } from 'lucide-react';
import MobileButton from './MobileButton';

const MobilePickEmsResults = ({
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
  const [activeView, setActiveView] = useState('weekly');

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

  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy className="h-4 w-4 text-yellow-500" />;
    if (rank === 2) return <Award className="h-4 w-4 text-gray-400" />;
    if (rank === 3) return <Award className="h-4 w-4 text-amber-600" />;
    return null;
  };

  const getRankColor = (rank) => {
    if (rank === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (rank <= 3) return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  if (!resultsAvailable) {
    return (
      <div className="text-center py-12">
        <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Results Not Available</h3>
        <p className="text-gray-600 mb-2">
          Results for week {currentWeek} will be revealed on
        </p>
        {pickEmWeek && (
          <p className="text-sm font-medium text-gray-900">
            {new Date(pickEmWeek.resultsRevealAt).toLocaleDateString()}
          </p>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading results...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="h-5 w-5 text-yellow-600" />
          <h2 className="text-lg font-semibold text-gray-900">Week {currentWeek} Results</h2>
        </div>
        <p className="text-gray-600 text-sm">
          See how everyone performed this week
        </p>
      </div>

      {/* View selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1">
        <div className="grid grid-cols-3 gap-1">
          <MobileButton
            onClick={() => setActiveView('weekly')}
            variant={activeView === 'weekly' ? 'primary' : 'ghost'}
            size="sm"
            className="flex items-center justify-center gap-1 text-xs"
          >
            <Target className="h-3 w-3" />
            Weekly
          </MobileButton>
          <MobileButton
            onClick={() => setActiveView('breakdown')}
            variant={activeView === 'breakdown' ? 'primary' : 'ghost'}
            size="sm"
            className="flex items-center justify-center gap-1 text-xs"
          >
            <BarChart3 className="h-3 w-3" />
            Breakdown
          </MobileButton>
          <MobileButton
            onClick={() => setActiveView('season')}
            variant={activeView === 'season' ? 'primary' : 'ghost'}
            size="sm"
            className="flex items-center justify-center gap-1 text-xs"
          >
            <Trophy className="h-3 w-3" />
            Season
          </MobileButton>
        </div>
      </div>

      {/* Weekly Results */}
      {activeView === 'weekly' && (
        <div className="space-y-3">
          {weeklyScores.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-10 w-10 mx-auto text-gray-400 mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">No Results</h3>
              <p className="text-gray-600 text-sm">
                No pick'em results found for week {currentWeek}.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Week {currentWeek} Leaderboard</h3>
                <div className="space-y-3">
                  {weeklyScores.map((score, index) => (
                    <div
                      key={score.id || index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          {getRankIcon(score.weeklyRank)}
                          <div className={`px-2 py-1 rounded-full border text-xs font-medium ${getRankColor(score.weeklyRank)}`}>
                            #{score.weeklyRank}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            User {score.userId}
                          </div>
                          <div className="text-xs text-gray-500">
                            {score.correctPicks}/{score.totalPicks} correct
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900">{score.totalPoints} pts</div>
                        <div className="text-xs text-gray-500">
                          {formatAccuracy(score.accuracyPercentage)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick stats */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h4 className="font-medium text-gray-900 mb-3">Quick Stats</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {weeklyScores.length}
                    </div>
                    <div className="text-xs text-gray-500">Participants</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {Math.max(...weeklyScores.map(s => s.totalPoints))}
                    </div>
                    <div className="text-xs text-gray-500">Top Score</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatAccuracy(
                        weeklyScores.reduce((sum, s) => sum + s.accuracyPercentage, 0) / weeklyScores.length
                      )}
                    </div>
                    <div className="text-xs text-gray-500">Avg Accuracy</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {weeklyScores.filter(s => s.accuracyPercentage === 100).length}
                    </div>
                    <div className="text-xs text-gray-500">Perfect Weeks</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Pick Breakdown */}
      {activeView === 'breakdown' && (
        <div className="space-y-3">
          {Object.keys(picksByUser).length === 0 ? (
            <div className="text-center py-8">
              <Target className="h-10 w-10 mx-auto text-gray-400 mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">No Pick Details</h3>
              <p className="text-gray-600 text-sm">
                Pick breakdown is not available for week {currentWeek}.
              </p>
            </div>
          ) : (
            Object.entries(picksByUser).map(([userId, picks]) => (
              <div key={userId} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
                  <h4 className="font-medium text-gray-900">User {userId}'s Picks</h4>
                </div>
                <div className="p-4 space-y-3">
                  {picks.map((pick) => (
                    <div
                      key={pick.submissionId}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          {pick.isCorrect ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-gray-900 text-sm">
                            {pick.team1Name} vs {pick.team2Name}
                          </div>
                          <div className="text-xs text-gray-500">
                            Picked: {pick.predictedWinnerName}
                            {pick.actualWinnerName && (
                              <span> • Winner: {pick.actualWinnerName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm font-medium text-gray-900">
                        {pick.pointsEarned || 0} pts
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Season Standings */}
      {activeView === 'season' && (
        <div className="space-y-3">
          {seasonStandings.length === 0 ? (
            <div className="text-center py-8">
              <Trophy className="h-10 w-10 mx-auto text-gray-400 mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">No Season Standings</h3>
              <p className="text-gray-600 text-sm">
                Season standings will appear as weeks are completed.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Season-Long Standings</h3>
              <div className="space-y-3">
                {seasonStandings.map((standing, index) => (
                  <div
                    key={standing.id || index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {getRankIcon(standing.seasonRank)}
                        <div className={`px-2 py-1 rounded-full border text-xs font-medium ${getRankColor(standing.seasonRank)}`}>
                          #{standing.seasonRank}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          User {standing.userId}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{standing.totalCorrectPicks}/{standing.totalPicks}</span>
                          <span>{standing.totalWeeksParticipated} weeks</span>
                          {standing.perfectWeeks > 0 && (
                            <span className="flex items-center gap-1">
                              <Trophy className="h-3 w-3" />
                              {standing.perfectWeeks}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">{standing.totalPoints} pts</div>
                      <div className="text-xs text-gray-500">
                        {formatAccuracy(standing.overallAccuracyPercentage)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MobilePickEmsResults;