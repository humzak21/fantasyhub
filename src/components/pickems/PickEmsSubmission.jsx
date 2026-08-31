import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { Clock, Trophy, Users, Target, AlertCircle, CheckCircle2, Calendar, Edit3, Save, X } from 'lucide-react';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';
import { getTeamColor } from '../../utils/teamColors';
import { cn } from '../../lib/utils';
import PickEmsSubmitBar from './PickEmsSubmitBar';

const PickEmsSubmission = ({
  season,
  currentWeek,
  pickEmWeek,
  games,
  userPicks = [],
  onSubmitPicks,
  loading = false,
  canSubmit = false,
  timeRemaining = null,
  user = null,
  isAdmin = false,
  teamOwnerNames = []
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
      setIsEditing(false); // Exit edit mode when picks are loaded
      setHasChanges(false); // Clear changes flag
    } else {
      // Reset picks when no user picks exist (e.g., navigating to a new week)
      setPicks({});
      setHasSubmitted(false);
      setIsEditing(false);
      setHasChanges(false);
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

    // Validate that all selectable games (non-bye) have picks
    const picksArray = games
      .filter(game => !game.isCompleted && !isByeWeek(game)) // Only submit picks for incomplete, non-bye games
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

  const handleCancelEdit = () => {
    // Reset picks to original user picks
    if (userPicks && userPicks.length > 0) {
      const originalPicks = {};
      userPicks.forEach(pick => {
        originalPicks[pick.gameId] = {
          predictedWinnerTeamId: pick.predictedWinnerTeamId,
          confidenceLevel: 1
        };
      });
      setPicks(originalPicks);
    } else {
      // If no user picks exist, clear the picks entirely
      setPicks({});
    }
    setIsEditing(false);
    setHasChanges(false);
    setError(null);
    setShowConfirmation(false);
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

  // Helper function to determine if a game is a bye week
  const isByeWeek = (game) => {
    return game.type === 'bye' || !game.team2 || game.team2 === null;
  };

  const status = getPickEmStatus();
  const totalPicks = Object.keys(picks).length;
  const availableGames = games.filter(game => !game.isCompleted);
  const selectableGames = availableGames.filter(game => !isByeWeek(game));
  const byeGames = availableGames.filter(game => isByeWeek(game));


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
          {availableGames.map((game, index) => {
            const isBye = isByeWeek(game);
            // One expression for "may this viewer change this pick", instead
            // of the same four-clause condition repeated in each button's
            // onClick, its `disabled` and twice more in its class string.
            const canPick = Boolean(user) && status.status === 'open' && (!hasSubmitted || isEditing);
            return (
              <Card key={game.id} className={`overflow-hidden ${isBye ? 'bg-muted/30' : ''}`}>
                <CardContent className="p-4 sm:p-6">
                  {/*
                    This row used to be a hard 632px: a w-16 label, w-60 + w-8 +
                    w-60, and three fixed gaps. At 375px (~310px usable) the
                    second team button sat entirely off-screen behind the root's
                    overflow-x: hidden, so nobody could pick team 2 on a phone.

                    It is fluid below sm: and pinned to the old track widths
                    from sm: up, so the desktop layout is byte-for-byte what it
                    was.
                  */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                    <div className="text-sm text-muted-foreground font-medium sm:w-16 sm:shrink-0">
                      {isBye ? (
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                          BYE
                        </Badge>
                      ) : (
                        `Game ${selectableGames.findIndex(g => g.id === game.id) + 1}`
                      )}
                    </div>

                    <div
                      role="radiogroup"
                      aria-label={isBye ? 'Bye week' : `Pick the winner of game ${selectableGames.findIndex(g => g.id === game.id) + 1}`}
                      className={`grid w-full min-w-0 items-stretch gap-2 sm:w-auto sm:gap-4 ${
                        isBye
                          ? 'grid-cols-1 sm:grid-cols-[15rem]'
                          : 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:grid-cols-[15rem_2rem_15rem]'
                      }`}
                    >
                      <PickOption
                        team={game.team1}
                        isSelected={picks[game.id]?.predictedWinnerTeamId === game.team1.id}
                        isBye={isBye}
                        disabled={isBye || !canPick}
                        onSelect={() => canPick && handlePickChange(game.id, game.team1.id)}
                        user={user}
                        isAdmin={isAdmin}
                        teamOwnerNames={teamOwnerNames}
                      />

                      {!isBye && (
                        <>
                          <div className="self-center text-center text-xs font-medium uppercase text-muted-foreground">
                            vs
                          </div>

                          <PickOption
                            team={game.team2}
                            isSelected={picks[game.id]?.predictedWinnerTeamId === game.team2.id}
                            disabled={!canPick}
                            onSelect={() => canPick && handlePickChange(game.id, game.team2.id)}
                            user={user}
                            isAdmin={isAdmin}
                            teamOwnerNames={teamOwnerNames}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {status.status === 'open' && availableGames.length > 0 && (
        <PickEmsSubmitBar
          totalPicks={totalPicks}
          totalGames={selectableGames.length}
          hasSubmitted={hasSubmitted}
          isEditing={isEditing}
          hasChanges={hasChanges}
          submitting={submitting}
          user={user}
          onSubmit={handleSubmit}
          onEdit={() => setIsEditing(true)}
          onCancelEdit={handleCancelEdit}
        />
      )}
    </div>
  );
};

/**
 * One team, as a choice.
 *
 * The two buttons this replaces were near-identical copies whose selected
 * state was a solid blue fill and nothing else. That is a colour-only
 * distinction — invisible to anyone who cannot separate the two hues, and
 * invisible to assistive technology, because these were plain `<button>`s in a
 * plain `<div>`: no radio role, no `aria-checked`, no group, so a screen
 * reader was given two unrelated buttons with no indication that one of them
 * was the answer.
 *
 * Selection now reads three ways at once: a check mark, the border, and a
 * tint. The tint is the *team's* colour, so picking a team looks like picking
 * that team rather than like filling in a form field.
 */
const PickOption = ({ team, isSelected, isBye, disabled, onSelect, user, isAdmin, teamOwnerNames }) => {
  const color = getTeamColor(team);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'relative flex min-h-16 min-w-0 items-center justify-center rounded-lg border-2 p-3 text-center transition-colors sm:p-4',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isBye && 'cursor-not-allowed border-border bg-muted/50 opacity-60',
        !isBye && isSelected && ['border-current bg-current/10', color.text],
        !isBye && !isSelected && 'border-border hover:border-foreground/30 hover:bg-accent/50',
        disabled && !isBye && 'cursor-not-allowed',
        !disabled && 'cursor-pointer'
      )}
    >
      {isSelected && (
        <CheckCircle2
          className="absolute right-2 top-2 h-4 w-4"
          aria-hidden="true"
        />
      )}

      <div className="w-full min-w-0">
        <div className={cn('truncate text-sm font-semibold sm:text-base', !isSelected && 'text-foreground')}>
          {getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {getMaskedOwnerName(team, user, isAdmin, teamOwnerNames)}
        </div>
        {isBye && <div className="mt-1 text-xs font-semibold text-warning">On bye</div>}
      </div>
    </button>
  );
};

export default PickEmsSubmission;