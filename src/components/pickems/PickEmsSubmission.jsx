import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { Clock, Trophy, Users, Target, AlertCircle, CheckCircle2, Calendar, Edit3, Save } from 'lucide-react';

const PickEmsSubmission = ({
  season,
  currentWeek,
  pickEmWeek,
  games,
  userPicks = [],
  onSubmitPicks,
  loading = false,
  canSubmit = false,
  timeRemaining = null
}) => {
  const [picks, setPicks] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Initialize picks from existing user picks
  useEffect(() => {
    if (userPicks && userPicks.length > 0) {
      const existingPicks = {};
      userPicks.forEach(pick => {
        existingPicks[pick.gameId] = {
          predictedWinnerTeamId: pick.predictedWinnerTeamId,
          confidenceLevel: 1 // Always 1 point per pick
        };
      });
      setPicks(existingPicks);
      setHasSubmitted(true);
    }
  }, [userPicks]);

  const handlePickChange = useCallback((gameId, teamId) => {
    setPicks(prev => {
      const newPicks = {
        ...prev,
        [gameId]: {
          predictedWinnerTeamId: teamId,
          confidenceLevel: 1 // Always 1 point per pick
        }
      };
      return newPicks;
    });
    setHasChanges(true);
    setError(null);
    // Clear confirmation when making changes
    setShowConfirmation(false);
  }, []);

  const handleSubmit = async () => {
    // Allow submission regardless of canSubmit for testing
    // if (!canSubmit) {
    //   setError('Submission window is closed');
    //   return;
    // }

    // Validate that all games have picks
    const picksArray = games
      .filter(game => !game.isCompleted) // Only submit picks for incomplete games
      .map(game => {
        const pick = picks[game.id];
        if (!pick?.predictedWinnerTeamId) {
          throw new Error(`Please make a pick for ${game.team1.name} vs ${game.team2.name}`);
        }
        return {
          gameId: game.id,
          predictedWinnerTeamId: pick.predictedWinnerTeamId,
          confidenceLevel: 1
        };
      });

    if (picksArray.length === 0) {
      setError('No games available for picks');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onSubmitPicks(pickEmWeek.id, picksArray);
      setHasChanges(false);
      setHasSubmitted(true);
      setIsEditing(false);
      setShowConfirmation(true);
      // Hide confirmation after 5 seconds
      setTimeout(() => {
        setShowConfirmation(false);
      }, 5000);
    } catch (err) {
      setError(err.message || 'Failed to submit picks');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimeRemaining = (timeStr) => {
    if (!timeStr) return null;

    try {
      const endTime = new Date(timeStr);
      const now = new Date();
      const diff = endTime - now;

      if (diff <= 0) return 'Expired';

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h remaining`;
      } else if (hours > 0) {
        return `${hours}h ${minutes}m remaining`;
      } else {
        return `${minutes}m remaining`;
      }
    } catch (err) {
      return 'Invalid time';
    }
  };

  const getPickEmStatus = () => {
    if (!pickEmWeek) return { status: 'no-week', message: 'No pick\'em week configured' };

    const now = new Date();
    const opensAt = new Date(pickEmWeek.submissionOpensAt);
    const closesAt = new Date(pickEmWeek.submissionClosesAt);
    const revealsAt = new Date(pickEmWeek.resultsRevealAt);

    if (now < opensAt) {
      return {
        status: 'upcoming',
        message: 'Submissions not yet open',
        timeInfo: `Opens ${opensAt.toLocaleDateString()} at ${opensAt.toLocaleTimeString()}`
      };
    } else if (now >= opensAt && now <= closesAt) {
      return {
        status: 'open',
        message: 'Submissions are open!',
        timeInfo: formatTimeRemaining(pickEmWeek.submissionClosesAt)
      };
    } else if (now > closesAt && now < revealsAt) {
      return {
        status: 'closed',
        message: 'Submissions are closed',
        timeInfo: `Results reveal ${revealsAt.toLocaleDateString()} at ${revealsAt.toLocaleTimeString()}`
      };
    } else {
      return {
        status: 'completed',
        message: 'Results are available',
        timeInfo: 'Check the results tab'
      };
    }
  };

  const status = getPickEmStatus();
  const totalPicks = Object.keys(picks).length;
  const availableGames = games.filter(game => !game.isCompleted);


  return (
    <div className="space-y-6">
      {/* Header with status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Week {currentWeek} Pick'ems
              </CardTitle>
              <CardDescription>
                Pick the winners for this week's matchups
              </CardDescription>
            </div>

            <div className="flex items-center gap-3">
              <Badge
                variant={
                  status.status === 'open' ? 'default' :
                  status.status === 'upcoming' ? 'secondary' :
                  status.status === 'closed' ? 'destructive' : 'outline'
                }
                className="flex items-center gap-1"
              >
                <Clock className="h-3 w-3" />
                {status.message}
              </Badge>

              {status.timeInfo && (
                <span className="text-sm text-muted-foreground">
                  {status.timeInfo}
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        {status.status === 'open' && (
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-600" />
                  <span className="font-medium">
                    {hasSubmitted && !isEditing ? 'Picks Submitted:' : 'Picks Made:'}
                  </span>
                  <span>{totalPicks}/{availableGames.length}</span>
                </div>

                {hasSubmitted && !isEditing && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    All Submitted
                  </Badge>
                )}

                {!hasSubmitted && totalPicks === availableGames.length && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Ready to Submit
                  </Badge>
                )}

                {isEditing && hasChanges && (
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                    Changes Made
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                {hasSubmitted && !isEditing ? (
                  <Button
                    onClick={() => setIsEditing(true)}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Edit3 className="h-4 w-4" />
                    Edit All Picks
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting || totalPicks !== availableGames.length}
                    className="flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        {hasSubmitted ? 'Updating...' : 'Submitting...'}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {hasSubmitted ? 'Update Picks' : 'Submit Picks'}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Success confirmation */}
      {showConfirmation && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Your picks have been successfully submitted! You can still edit them until the submission deadline.
          </AlertDescription>
        </Alert>
      )}

      {/* Error display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Games list */}
      {status.status === 'no-week' ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Pick'em Week Available</h3>
            <p className="text-muted-foreground">
              Pick'ems have not been set up for week {currentWeek} yet.
            </p>
          </CardContent>
        </Card>
      ) : availableGames.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Games Available</h3>
            <p className="text-muted-foreground">
              All games for week {currentWeek} have been completed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {availableGames.map((game, index) => (
            <Card key={game.id} className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  {/* Game matchup */}
                  <div className="flex items-center space-x-6">
                    <div className="text-sm text-muted-foreground font-medium">
                      Game {index + 1}
                    </div>

                    <div className="flex items-center space-x-4">
                      {/* Team 1 */}
                      <button
                        onClick={() => (status.status === 'open' && (!hasSubmitted || isEditing)) && handlePickChange(game.id, game.team1.id)}
                        disabled={status.status !== 'open' || (hasSubmitted && !isEditing)}
                        className={`
                          flex items-center space-x-3 p-3 rounded-lg border-2 transition-all
                          ${picks[game.id]?.predictedWinnerTeamId === game.team1.id
                            ? 'border-primary bg-primary/10 text-primary font-semibold'
                            : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                          }
                          ${(status.status !== 'open' || (hasSubmitted && !isEditing)) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
                        `}
                      >
                        <div className="text-center">
                          <div className="font-medium">{game.team1.name}</div>
                          <div className="text-xs text-muted-foreground">{game.team1.owner}</div>
                        </div>
                      </button>

                      <div className="text-muted-foreground font-medium">vs</div>

                      {/* Team 2 */}
                      <button
                        onClick={() => (status.status === 'open' && (!hasSubmitted || isEditing)) && handlePickChange(game.id, game.team2.id)}
                        disabled={status.status !== 'open' || (hasSubmitted && !isEditing)}
                        className={`
                          flex items-center space-x-3 p-3 rounded-lg border-2 transition-all
                          ${picks[game.id]?.predictedWinnerTeamId === game.team2.id
                            ? 'border-primary bg-primary/10 text-primary font-semibold'
                            : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                          }
                          ${(status.status !== 'open' || (hasSubmitted && !isEditing)) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
                        `}
                      >
                        <div className="text-center">
                          <div className="font-medium">{game.team2.name}</div>
                          <div className="text-xs text-muted-foreground">{game.team2.owner}</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Show existing pick for submitted but not editing */}
                  {hasSubmitted && !isEditing && picks[game.id] && (
                    <div className="flex items-center space-x-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-muted-foreground">Your pick:</span>
                      <span className="font-medium text-green-700">
                        {game.team1.id === picks[game.id].predictedWinnerTeamId ? game.team1.name : game.team2.name}
                      </span>
                    </div>
                  )}

                  {/* Show existing pick for completed status */}
                  {(status.status === 'closed' || status.status === 'completed') && picks[game.id] && (
                    <div className="flex items-center space-x-2 text-sm">
                      <span className="text-muted-foreground">Your pick:</span>
                      <span className="font-medium">
                        {game.team1.id === picks[game.id].predictedWinnerTeamId ? game.team1.name : game.team2.name}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bottom Submit Button */}
      {status.status === 'open' && availableGames.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-600" />
                  <span className="font-medium">
                    {hasSubmitted && !isEditing ? 'Picks Submitted:' : 'Picks Made:'}
                  </span>
                  <span>{totalPicks}/{availableGames.length}</span>
                </div>

                {hasSubmitted && !isEditing && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    All Submitted
                  </Badge>
                )}

                {!hasSubmitted && totalPicks === availableGames.length && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Ready to Submit
                  </Badge>
                )}

                {isEditing && hasChanges && (
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                    Changes Made
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                {hasSubmitted && !isEditing ? (
                  <Button
                    onClick={() => setIsEditing(true)}
                    variant="outline"
                    size="lg"
                    className="flex items-center gap-2 px-8"
                  >
                    <Edit3 className="h-4 w-4" />
                    Edit All Picks
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting || totalPicks !== availableGames.length}
                    size="lg"
                    className="flex items-center gap-2 px-8"
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        {hasSubmitted ? 'Updating...' : 'Submitting...'}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {hasSubmitted ? 'Update All Picks' : 'Submit All Picks'}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      {status.status === 'open' && availableGames.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground space-y-2">
              <h4 className="font-medium text-foreground">How to Play:</h4>
              <ul className="space-y-1 pl-4">
                <li>• Pick the winner for each matchup by clicking on a team</li>
                <li>• Each correct pick earns 1 point</li>
                <li>• You must make picks for all games before submitting</li>
                <li>• You can change your picks until the submission deadline</li>
                <li>• Results will be revealed on {pickEmWeek && new Date(pickEmWeek.resultsRevealAt).toLocaleDateString()}</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PickEmsSubmission;