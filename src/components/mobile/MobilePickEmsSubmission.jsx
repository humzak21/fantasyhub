import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Trophy, Target, AlertCircle, CheckCircle2, Calendar, Save, Edit3 } from 'lucide-react';
import MobileButton from './MobileButton';
import { isUserTeam, getUserTeamHighlightClasses } from '../../utils/userTeamUtils';

const MobilePickEmsSubmission = ({
  season,
  currentWeek,
  pickEmWeek,
  games,
  userPicks = [],
  onSubmitPicks,
  loading = false,
  canSubmit = false,
  timeRemaining = null,
  user = null
}) => {
  const [picks, setPicks] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (userPicks && userPicks.length > 0) {
      const existingPicks = {};
      userPicks.forEach(pick => {
        existingPicks[pick.gameId] = {
          predictedWinnerTeamId: pick.predictedWinnerTeamId,
          confidenceLevel: 1
        };
      });
      setPicks(existingPicks);
      setHasSubmitted(true);
    }
  }, [userPicks]);

  const handlePickChange = useCallback((gameId, teamId) => {
    setPicks(prev => ({
      ...prev,
      [gameId]: {
        predictedWinnerTeamId: teamId,
        confidenceLevel: 1
      }
    }));
    setHasChanges(true);
    setError(null);
    setShowConfirmation(false);
  }, []);

  const handleSubmit = async () => {
    const picksArray = games
      .filter(game => !game.isCompleted)
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
      setTimeout(() => setShowConfirmation(false), 5000);
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
        return `${days}d ${hours % 24}h left`;
      } else if (hours > 0) {
        return `${hours}h ${minutes}m left`;
      } else {
        return `${minutes}m left`;
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
        message: 'Not open yet',
        timeInfo: `Opens ${opensAt.toLocaleDateString()}`
      };
    } else if (now >= opensAt && now <= closesAt) {
      return {
        status: 'open',
        message: 'Open for picks!',
        timeInfo: formatTimeRemaining(pickEmWeek.submissionClosesAt)
      };
    } else if (now > closesAt && now < revealsAt) {
      return {
        status: 'closed',
        message: 'Closed',
        timeInfo: `Results ${revealsAt.toLocaleDateString()}`
      };
    } else {
      return {
        status: 'completed',
        message: 'Results available',
        timeInfo: 'Check results tab'
      };
    }
  };

  const status = getPickEmStatus();
  const totalPicks = Object.keys(picks).length;
  const availableGames = games.filter(game => !game.isCompleted);

  return (
    <div className="space-y-4">
      {/* Mobile Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Week {currentWeek}</h2>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            status.status === 'open' ? 'bg-green-100 text-green-800' :
            status.status === 'upcoming' ? 'bg-blue-100 text-blue-800' :
            status.status === 'closed' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {status.message}
          </div>
        </div>

        {status.timeInfo && (
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <Clock className="h-4 w-4" />
            {status.timeInfo}
          </div>
        )}

        {/* Progress indicator */}
        {status.status === 'open' && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-600">
                {hasSubmitted && !isEditing ? 'Submitted' : 'Progress'}
              </span>
              <span className="font-medium text-gray-900">
                {totalPicks}/{availableGames.length}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  hasSubmitted && !isEditing ? 'bg-green-500' :
                  totalPicks === availableGames.length ? 'bg-blue-500' : 'bg-blue-300'
                }`}
                style={{ width: `${(totalPicks / Math.max(availableGames.length, 1)) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Success confirmation */}
      {showConfirmation && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-green-800 font-medium">Picks submitted successfully!</p>
          </div>
          <p className="text-green-700 text-sm mt-1">
            You can still edit them until the deadline.
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Games list */}
      {status.status === 'no-week' ? (
        <div className="text-center py-12">
          <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pick'em Week</h3>
          <p className="text-gray-600">
            Pick'ems haven't been set up for week {currentWeek} yet.
          </p>
        </div>
      ) : availableGames.length === 0 ? (
        <div className="text-center py-12">
          <Trophy className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">All Games Complete</h3>
          <p className="text-gray-600">
            All games for week {currentWeek} have finished.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {availableGames.map((game, index) => (
            <div key={game.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Game header */}
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Game {index + 1}
                </span>
              </div>

              {/* Teams selection */}
              <div className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  {/* Team 1 */}
                  <button
                    onClick={() => (status.status === 'open' && (!hasSubmitted || isEditing)) && handlePickChange(game.id, game.team1.id)}
                    disabled={status.status !== 'open' || (hasSubmitted && !isEditing)}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                      picks[game.id]?.predictedWinnerTeamId === game.team1.id
                        ? 'border-blue-500 bg-blue-50 shadow-md'
                        : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-25'
                    } ${
                      (status.status !== 'open' || (hasSubmitted && !isEditing))
                        ? 'opacity-60 cursor-not-allowed'
                        : 'active:scale-95 cursor-pointer'
                    } ${getUserTeamHighlightClasses(isUserTeam(game.team1, user))}`}
                  >
                    <div className="text-center">
                      <div className={`font-semibold text-sm mb-1 ${
                        picks[game.id]?.predictedWinnerTeamId === game.team1.id ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {game.team1.name}
                      </div>
                      <div className={`text-xs ${
                        picks[game.id]?.predictedWinnerTeamId === game.team1.id ? 'text-blue-700' : 'text-gray-500'
                      }`}>
                        {game.team1.owner}
                      </div>
                    </div>
                  </button>

                  {/* Team 2 */}
                  <button
                    onClick={() => (status.status === 'open' && (!hasSubmitted || isEditing)) && handlePickChange(game.id, game.team2.id)}
                    disabled={status.status !== 'open' || (hasSubmitted && !isEditing)}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                      picks[game.id]?.predictedWinnerTeamId === game.team2.id
                        ? 'border-blue-500 bg-blue-50 shadow-md'
                        : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-25'
                    } ${
                      (status.status !== 'open' || (hasSubmitted && !isEditing))
                        ? 'opacity-60 cursor-not-allowed'
                        : 'active:scale-95 cursor-pointer'
                    } ${getUserTeamHighlightClasses(isUserTeam(game.team2, user))}`}
                  >
                    <div className="text-center">
                      <div className={`font-semibold text-sm mb-1 ${
                        picks[game.id]?.predictedWinnerTeamId === game.team2.id ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {game.team2.name}
                      </div>
                      <div className={`text-xs ${
                        picks[game.id]?.predictedWinnerTeamId === game.team2.id ? 'text-blue-700' : 'text-gray-500'
                      }`}>
                        {game.team2.owner}
                      </div>
                    </div>
                  </button>
                </div>

                {/* VS indicator */}
                <div className="text-center mt-3 mb-2">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">vs</span>
                </div>

                {/* Show current pick when submitted */}
                {hasSubmitted && !isEditing && picks[game.id] && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-gray-600">Your pick:</span>
                      <span className="font-medium text-green-700">
                        {game.team1.id === picks[game.id].predictedWinnerTeamId ? game.team1.name : game.team2.name}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {status.status === 'open' && availableGames.length > 0 && (
        <div className="space-y-3 pt-4">
          {hasSubmitted && !isEditing ? (
            <MobileButton
              onClick={() => setIsEditing(true)}
              variant="secondary"
              className="w-full flex items-center justify-center gap-2"
            >
              <Edit3 className="h-4 w-4" />
              Edit All Picks
            </MobileButton>
          ) : (
            <MobileButton
              onClick={handleSubmit}
              disabled={submitting || totalPicks !== availableGames.length}
              className="w-full flex items-center justify-center gap-2"
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
            </MobileButton>
          )}

          {/* Instructions */}
          <div className="bg-blue-50 rounded-xl p-4">
            <h4 className="font-medium text-blue-900 mb-2">How to Play:</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <p>• Tap a team to pick them as the winner</p>
              <p>• Each correct pick earns 1 point</p>
              <p>• Pick all games before submitting</p>
              <p>• You can change picks until deadline</p>
              {pickEmWeek && (
                <p>• Results revealed on {new Date(pickEmWeek.resultsRevealAt).toLocaleDateString()}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobilePickEmsSubmission;