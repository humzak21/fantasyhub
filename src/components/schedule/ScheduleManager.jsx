import React, { useState } from 'react';
import { Calendar, Users, RefreshCw, Download, Upload, Plus, Edit3, Trash2, CheckCircle, Clock } from 'lucide-react';
import { isUserTeam, getUserTeamHighlightClasses } from '../../utils/userTeamUtils';

const ScheduleManager = ({
  season = null,
  schedule = [],
  currentWeek = 1, // Added currentWeek prop to sync with week navigator
  onUpdateGame,
  onDeleteGame,
  loading = false,
  isAuthenticated = false, // This now represents isAdmin from parent
  user = null
}) => {
  const [viewMode, setViewMode] = useState('week'); // 'week' or 'full'

  if (!season) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Calendar size={48} className="mx-auto mb-4 text-gray-300" />
        <p>No active season. Please select or create a season first.</p>
      </div>
    );
  }

  const getGamesForWeek = (week) => {
    return schedule.filter(game => game.week === week);
  };

  const getTeamName = (teamId) => {
    const team = season.teams.find(t => t.id === teamId);
    return team ? team.name : 'Unknown Team';
  };

  const getWeekStatus = (week) => {
    const weekGames = getGamesForWeek(week);
    if (weekGames.length === 0) return 'empty';
    if (weekGames.every(game => game.isCompleted)) return 'completed';
    if (weekGames.some(game => game.isCompleted)) return 'partial';
    return 'scheduled';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'partial':
        return <Clock size={16} className="text-orange-600" />;
      case 'scheduled':
        return <Calendar size={16} className="text-blue-600" />;
      default:
        return <Calendar size={16} className="text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800/30 dark:text-green-300';
      case 'partial':
        return 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800/30 dark:text-orange-300';
      case 'scheduled':
        return 'bg-gray-100 border-gray-300 text-gray-700 dark:bg-slate-800/50 dark:border-slate-700/50 dark:text-slate-300';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-700 dark:bg-slate-800/50 dark:border-slate-700/50 dark:text-slate-300';
    }
  };



  const exportSchedule = () => {
    const scheduleData = {
      seasonInfo: {
        year: season.year,
        name: season.name,
        teams: season.teams.map(t => ({ id: t.id, name: t.name }))
      },
      schedule: schedule,
      exportedAt: new Date().toISOString()
    };

    const dataStr = JSON.stringify(scheduleData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `schedule-${season.year}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <Calendar className="text-blue-600" size={28} />
          Schedule
        </h2>
        
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'week' ? 'full' : 'week')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Users size={16} />
            {viewMode === 'week' ? 'Full View' : 'Week View'}
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="text-blue-600 text-sm font-medium">Total Games</div>
          <div className="text-2xl font-bold text-blue-900">{schedule.length}</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="text-green-600 text-sm font-medium">Completed</div>
          <div className="text-2xl font-bold text-green-900">
            {schedule.filter(game => game.isCompleted).length}
          </div>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <div className="text-orange-600 text-sm font-medium">Scheduled</div>
          <div className="text-2xl font-bold text-orange-900">
            {schedule.filter(game => !game.isCompleted).length}
          </div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <div className="text-purple-600 text-sm font-medium">Teams</div>
          <div className="text-2xl font-bold text-purple-900">{season.teams.length}</div>
        </div>
      </div>

      {season.teams.length < 2 ? (
        <div className="text-center py-12 text-gray-500">
          <Users size={64} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium mb-2">Not Enough Teams</h3>
          <p>You need at least 2 teams to create a schedule.</p>
        </div>
      ) : (
        <>
          {/* View Mode: Week */}
          {viewMode === 'week' && (
            <div className="space-y-4">
              {/* Week games */}
              <WeekScheduleView
                week={currentWeek}
                games={getGamesForWeek(currentWeek)}
                teams={season.teams}
                onUpdateGame={onUpdateGame}
                onDeleteGame={onDeleteGame}
                isAuthenticated={isAuthenticated}
                user={user}
              />
            </div>
          )}

          {/* View Mode: Full Schedule */}
          {viewMode === 'full' && (
            <FullScheduleView
              schedule={schedule}
              teams={season.teams}
              totalWeeks={season.totalWeeks}
              regularSeasonWeeks={season.regularSeasonWeeks}
              getWeekStatus={getWeekStatus}
              getStatusIcon={getStatusIcon}
              getStatusColor={getStatusColor}
              user={user}
            />
          )}
        </>
      )}

    </div>
  );
};

// Week Schedule View Component
const WeekScheduleView = ({ week, games, teams, onUpdateGame, onDeleteGame, isAuthenticated = false, user = null }) => {
  const getTeamName = (teamId) => {
    const team = teams.find(t => t.id === teamId);
    return team ? team.name : 'Unknown Team';
  };

  if (games.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Calendar size={48} className="mx-auto mb-4 text-gray-300" />
        <p>No games scheduled for Week {week}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {games.map(game => (
        <GameCard
          key={game.id}
          game={game}
          getTeamName={getTeamName}
          onUpdateGame={onUpdateGame}
          onDeleteGame={onDeleteGame}
          isAuthenticated={isAuthenticated}
          teams={teams}
          user={user}
        />
      ))}
    </div>
  );
};

// Full Schedule View Component
const FullScheduleView = ({
  schedule,
  teams,
  totalWeeks,
  regularSeasonWeeks,
  getWeekStatus,
  getStatusIcon,
  getStatusColor,
  user = null
}) => {
  const getTeamName = (teamId) => {
    const team = teams.find(t => t.id === teamId);
    return team ? team.name : 'Unknown Team';
  };

  const getGamesForWeek = (week) => {
    return schedule.filter(game => game.week === week);
  };

  return (
    <div className="space-y-6">
      {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(week => {
        const weekGames = getGamesForWeek(week);
        const status = getWeekStatus(week);
        const isPlayoff = week > regularSeasonWeeks;
        
        return (
          <div key={week} className={`border rounded-lg p-4 ${getStatusColor(status)}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                {getStatusIcon(status)}
                Week {week}
                {isPlayoff && <span className="text-sm font-normal">(Playoffs)</span>}
              </h3>
              <div className="text-sm">
                {weekGames.filter(g => g.isCompleted).length}/{weekGames.length} completed
              </div>
            </div>
            
            {weekGames.length === 0 ? (
              <p className="text-sm opacity-75">No games scheduled</p>
            ) : (
              <div className="grid gap-2">
                {weekGames.map(game => {
                  const team1 = teams.find(t => t.id === game.team1Id);
                  const team2 = teams.find(t => t.id === game.team2Id);
                  const isUserGame = isUserTeam(team1, user) || isUserTeam(team2, user);
                  const baseClasses = "bg-white bg-opacity-50 rounded p-2 text-sm";
                  const highlightClasses = getUserTeamHighlightClasses(isUserGame);

                  return (
                  <div key={game.id} className={`${baseClasses} ${highlightClasses}`}>
                    <span className="font-medium dark:text-white">{getTeamName(game.team1Id)}</span>
                    {game.isCompleted ? (
                      <span className="mx-2 dark:text-white">{game.team1Score} - {game.team2Score}</span>
                    ) : (
                      <span className="mx-2 dark:text-white">vs</span>
                    )}
                    <span className="font-medium dark:text-white">{getTeamName(game.team2Id)}</span>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Game Card Component
const GameCard = ({ game, getTeamName, onUpdateGame, onDeleteGame, isAuthenticated = false, teams = [], user = null }) => {
  const [editing, setEditing] = useState(false);
  const [scores, setScores] = useState({
    team1Score: game.team1Score || '',
    team2Score: game.team2Score || ''
  });

  const handleSave = async () => {
    try {
      await onUpdateGame(
        game.week,
        game.team1Id,
        game.team2Id,
        scores.team1Score ? parseFloat(scores.team1Score) : null,
        scores.team2Score ? parseFloat(scores.team2Score) : null
      );
      setEditing(false);
    } catch (error) {
      alert('Error updating game: ' + error.message);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this game?')) {
      try {
        await onDeleteGame(game.id);
      } catch (error) {
        alert('Error deleting game: ' + error.message);
      }
    }
  };

  // Check if this game involves the user's team
  const team1 = teams.find(t => t.id === game.team1Id);
  const team2 = teams.find(t => t.id === game.team2Id);
  const isUserGame = isUserTeam(team1, user) || isUserTeam(team2, user);
  const highlightClasses = getUserTeamHighlightClasses(isUserGame);

  return (
    <div className={`bg-white border rounded-lg p-4 shadow-sm ${highlightClasses}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          {editing ? (
            <div className="grid grid-cols-5 gap-2 items-center">
              <div className="text-sm font-medium">{getTeamName(game.team1Id)}</div>
              <input
                type="number"
                min="0"
                step="0.1"
                value={scores.team1Score}
                onChange={(e) => setScores(prev => ({ ...prev, team1Score: e.target.value }))}
                className="p-2 border rounded text-center"
                placeholder="0"
              />
              <div className="text-center text-gray-500">vs</div>
              <input
                type="number"
                min="0"
                step="0.1"
                value={scores.team2Score}
                onChange={(e) => setScores(prev => ({ ...prev, team2Score: e.target.value }))}
                className="p-2 border rounded text-center"
                placeholder="0"
              />
              <div className="text-sm font-medium">{getTeamName(game.team2Id)}</div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="font-semibold">{getTeamName(game.team1Id)}</span>
              {game.isCompleted ? (
                <span className="font-mono text-lg">
                  {game.team1Score} - {game.team2Score}
                </span>
              ) : (
                <span className="text-gray-500">vs</span>
              )}
              <span className="font-semibold">{getTeamName(game.team2Id)}</span>
              
              {game.isCompleted && (
                <div className="ml-auto text-sm text-gray-600">
                  Winner: {getTeamName(game.winnerTeamId)}
                  {game.isBlowout && <span className="ml-2 text-orange-600">Blowout</span>}
                  {game.isClose && <span className="ml-2 text-blue-600">Close Game</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {isAuthenticated && (
          <div className="flex items-center gap-2 ml-4">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="p-2 text-green-600 hover:text-green-800 hover:bg-green-100 rounded-lg transition-colors"
                >
                  Save
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setScores({
                      team1Score: game.team1Score || '',
                      team2Score: game.team2Score || ''
                    });
                    setEditing(true);
                  }}
                  className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit scores"
                >
                  <Edit3 size={16} />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete game"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleManager;