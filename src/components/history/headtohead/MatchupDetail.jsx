import React, { useMemo } from 'react';
import { ArrowLeft, Target } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { useMatchupHistory } from '../../../../hooks/queries/index.js';
import { getMaskedFranchiseName } from '../utils/privacyHelpers';

const MatchupDetail = ({
  franchise1Id,
  franchise2Id,
  franchises = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onBack = () => {}
}) => {
  const { data: matchups = [], isLoading: loading } = useMatchupHistory(franchise1Id, franchise2Id);

  // Get franchise info
  const franchise1 = franchises.find(f => f.id === franchise1Id);
  const franchise2 = franchises.find(f => f.id === franchise2Id);

  const getName = (franchise) => {
    if (!franchise) return 'Unknown';
    return getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames);
  };

  // Every row is already oriented with franchise 1 as `team1`, so the summary
  // is a straight fold over the list.
  const summary = useMemo(() => {
    if (matchups.length === 0) return null;

    let f1Wins = 0;
    let f2Wins = 0;
    let f1Points = 0;
    let f2Points = 0;
    let playoffF1Wins = 0;
    let playoffF2Wins = 0;
    let highestScore = 0;
    let highestScoreGame = null;
    let closestMargin = Infinity;
    let closestGame = null;

    for (const game of matchups) {
      const f1Score = game.team1Score;
      const f2Score = game.team2Score;

      f1Points += f1Score;
      f2Points += f2Score;

      if (f1Score > f2Score) {
        f1Wins++;
        if (game.isPlayoff) playoffF1Wins++;
      } else if (f2Score > f1Score) {
        f2Wins++;
        if (game.isPlayoff) playoffF2Wins++;
      }

      // Track notable games
      const totalScore = f1Score + f2Score;
      if (totalScore > highestScore) {
        highestScore = totalScore;
        highestScoreGame = { ...game, f1Score, f2Score };
      }

      const margin = Math.abs(f1Score - f2Score);
      if (margin < closestMargin && margin > 0) {
        closestMargin = margin;
        closestGame = { ...game, f1Score, f2Score, margin };
      }
    }

    return {
      totalGames: matchups.length,
      f1Wins,
      f2Wins,
      f1Points,
      f2Points,
      f1AvgPoints: f1Points / matchups.length,
      f2AvgPoints: f2Points / matchups.length,
      playoffF1Wins,
      playoffF2Wins,
      playoffGames: matchups.filter(game => game.isPlayoff).length,
      highestScoreGame,
      closestGame
    };
  }, [matchups]);

  // Group matchups by season
  const matchupsByYear = matchups.reduce((acc, game) => {
    const year = game.year || 'Unknown';
    if (!acc[year]) {
      acc[year] = [];
    }
    acc[year].push(game);
    return acc;
  }, {});

  if (loading && matchups.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Matrix
          </Button>
        </div>
        <Card>
          <CardContent className="p-12">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Matrix
        </Button>
      </div>

      {/* Header with overall record */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {getName(franchise1)} vs {getName(franchise2)}
          </CardTitle>
          <CardDescription>
            All-time matchup history between these franchises
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary ? (
            <div className="space-y-6">
              {/* Overall Record */}
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">{getName(franchise1)}</p>
                  <p className="text-4xl font-bold" style={{ color: summary.f1Wins > summary.f2Wins ? '#10b981' : summary.f1Wins < summary.f2Wins ? '#ef4444' : '#9ca3af' }}>
                    {summary.f1Wins}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Record</p>
                  <p className="text-2xl font-bold">-</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">{getName(franchise2)}</p>
                  <p className="text-4xl font-bold" style={{ color: summary.f2Wins > summary.f1Wins ? '#10b981' : summary.f2Wins < summary.f1Wins ? '#ef4444' : '#9ca3af' }}>
                    {summary.f2Wins}
                  </p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="p-3 rounded-lg" style={{ backgroundColor: '#1f2937' }}>
                  <p className="text-xs text-muted-foreground">Total Games</p>
                  <p className="text-lg font-semibold">{summary.totalGames}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: '#1f2937' }}>
                  <p className="text-xs text-muted-foreground">Playoff Games</p>
                  <p className="text-lg font-semibold">{summary.playoffGames}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: '#1f2937' }}>
                  <p className="text-xs text-muted-foreground">{getName(franchise1)} Avg</p>
                  <p className="text-lg font-semibold">{summary.f1AvgPoints.toFixed(1)}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: '#1f2937' }}>
                  <p className="text-xs text-muted-foreground">{getName(franchise2)} Avg</p>
                  <p className="text-lg font-semibold">{summary.f2AvgPoints.toFixed(1)}</p>
                </div>
              </div>

              {/* Notable Games */}
              {(summary.highestScoreGame || summary.closestGame) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {summary.highestScoreGame && (
                    <div className="p-4 rounded-lg border" style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
                      <p className="text-xs text-muted-foreground mb-1">Highest Scoring Game</p>
                      <p className="font-semibold">
                        {summary.highestScoreGame.f1Score} - {summary.highestScoreGame.f2Score}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Week {summary.highestScoreGame.week}, {summary.highestScoreGame.year}
                      </p>
                    </div>
                  )}
                  {summary.closestGame && (
                    <div className="p-4 rounded-lg border" style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
                      <p className="text-xs text-muted-foreground mb-1">Closest Game</p>
                      <p className="font-semibold">
                        {summary.closestGame.f1Score} - {summary.closestGame.f2Score}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Week {summary.closestGame.week}, {summary.closestGame.year} (margin: {summary.closestGame.margin.toFixed(1)})
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No matchup history found
            </p>
          )}
        </CardContent>
      </Card>

      {/* Game-by-Game History */}
      {Object.keys(matchupsByYear).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Game History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {Object.entries(matchupsByYear)
                .sort(([a], [b]) => Number(b) - Number(a)) // Sort by year descending
                .map(([year, games]) => {
                  // Sort games by week descending (later weeks first)
                  const sortedGames = [...games].sort((a, b) => b.week - a.week);

                  return (
                    <div key={year}>
                      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                        {year} Season
                        <Badge variant="secondary" className="text-xs">
                          {games.length} game{games.length !== 1 ? 's' : ''}
                        </Badge>
                      </h3>

                      {/* Column headers */}
                      <div className="grid grid-cols-[60px_1fr_80px_40px_80px_1fr] gap-2 px-3 py-2 text-sm text-muted-foreground border-b border-gray-700 mb-2">
                        <div>Week</div>
                        <div className="text-right">{getName(franchise1)}</div>
                        <div className="text-right">Record</div>
                        <div className="text-center"></div>
                        <div>Record</div>
                        <div>{getName(franchise2)}</div>
                      </div>

                      <div className="space-y-1">
                        {sortedGames.map((game) => {
                          const { team1Score: f1Score, team2Score: f2Score } = game;
                          const f1Record = game.team1Record;
                          const f2Record = game.team2Record;
                          const f1Won = f1Score > f2Score;
                          const f2Won = f2Score > f1Score;

                          return (
                            <div
                              key={game.id}
                              className="grid grid-cols-[60px_1fr_80px_40px_80px_1fr] gap-2 items-center p-3 rounded-lg"
                              style={{ backgroundColor: '#111827' }}
                            >
                              {/* Week */}
                              <div className="text-sm text-muted-foreground">
                                {game.week}
                              </div>

                              {/* Franchise 1 Score */}
                              <div className="text-right text-base font-semibold">
                                <span style={{ color: f1Won ? '#10b981' : f2Won ? '#ef4444' : '#9ca3af' }}>
                                  {f1Score.toFixed(2)}
                                </span>
                              </div>

                              {/* Franchise 1 Record */}
                              <div className="text-right text-sm text-muted-foreground">
                                {f1Record || '-'}
                              </div>

                              {/* VS */}
                              <div className="text-center text-sm text-muted-foreground">
                                vs
                              </div>

                              {/* Franchise 2 Record */}
                              <div className="text-sm text-muted-foreground">
                                {f2Record || '-'}
                              </div>

                              {/* Franchise 2 Score */}
                              <div className="text-base font-semibold">
                                <span style={{ color: f2Won ? '#10b981' : f1Won ? '#ef4444' : '#9ca3af' }}>
                                  {f2Score.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MatchupDetail;
