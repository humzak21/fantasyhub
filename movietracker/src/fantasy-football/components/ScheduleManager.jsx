import React, { useState } from 'react';
import { Calendar, Users, RefreshCw, Download, Upload, Plus, Edit3, Trash2, CheckCircle, Clock } from 'lucide-react';

const ScheduleManager = ({ 
  season = null,
  schedule = [],
  onGenerateSchedule,
  onUpdateGame,
  onDeleteGame,
  loading = false 
}) => {
  const [viewMode, setViewMode] = useState('week'); // 'week' or 'full'
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [showAddGame, setShowAddGame] = useState(false);
  const [newGame, setNewGame] = useState({
    week: 1,
    team1Id: '',
    team2Id: '',
    team1Score: '',
    team2Score: ''
  });

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
        return 'bg-green-50 border-green-200 text-green-800';
      case 'partial':
        return 'bg-orange-50 border-orange-200 text-orange-800';
      case 'scheduled':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-600';
    }
  };

  const handleAddGame = async () => {
    if (!newGame.team1Id || !newGame.team2Id || newGame.team1Id === newGame.team2Id) {
      alert('Please select two different teams');
      return;
    }

    try {
      await onUpdateGame(
        newGame.week,
        newGame.team1Id,
        newGame.team2Id,
        newGame.team1Score ? parseFloat(newGame.team1Score) : null,
        newGame.team2Score ? parseFloat(newGame.team2Score) : null
      );
      setShowAddGame(false);
      setNewGame({
        week: selectedWeek,
        team1Id: '',
        team2Id: '',
        team1Score: '',
        team2Score: ''
      });
    } catch (error) {
      alert('Error adding game: ' + error.message);
    }
  };

  const handleGenerateSchedule = async () => {
    if (schedule.length > 0) {
      if (!confirm('This will replace the existing schedule. Continue?')) {
        return;
      }
    }

    try {
      await onGenerateSchedule();
    } catch (error) {
      alert('Error generating schedule: ' + error.message);
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

  const weekOptions = Array.from({ length: season.totalWeeks }, (_, i) => i + 1);
  const availableTeams = season.teams.filter(team => 
    team.id !== newGame.team1Id && team.id !== newGame.team2Id
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <Calendar className="text-blue-600" size={28} />
          Schedule Manager
        </h2>
        
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'week' ? 'full' : 'week')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Users size={16} />
            {viewMode === 'week' ? 'Full View' : 'Week View'}
          </button>
          
          <button
            onClick={exportSchedule}
            disabled={schedule.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50"
          >
            <Download size={16} />
            Export
          </button>
          
          <button
            onClick={handleGenerateSchedule}
            disabled={loading || season.teams.length < 2}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} />
            {schedule.length > 0 ? 'Regenerate' : 'Generate'} Schedule
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
              {/* Week selector */}
              <div className="flex items-center gap-4">
                <label className="font-medium">Select Week:</label>
                <select
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                  className="px-3 py-2 border rounded-lg"
                >
                  {weekOptions.map(week => {
                    const status = getWeekStatus(week);
                    return (
                      <option key={week} value={week}>
                        Week {week} {status === 'completed' ? '✓' : status === 'partial' ? '◐' : ''}
                      </option>
                    );
                  })}
                </select>
                
                <button
                  onClick={() => setShowAddGame(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus size={16} />
                  Add Game
                </button>
              </div>

              {/* Week games */}
              <WeekScheduleView 
                week={selectedWeek}
                games={getGamesForWeek(selectedWeek)}
                teams={season.teams}
                onUpdateGame={onUpdateGame}
                onDeleteGame={onDeleteGame}
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
            />
          )}
        </>
      )}

      {/* Add Game Modal */}
      {showAddGame && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Add New Game</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Week</label>
                <select
                  value={newGame.week}
                  onChange={(e) => setNewGame(prev => ({ ...prev, week: parseInt(e.target.value) }))}
                  className="w-full p-2 border rounded-lg"
                >
                  {weekOptions.map(week => (
                    <option key={week} value={week}>Week {week}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Team 1</label>
                  <select
                    value={newGame.team1Id}
                    onChange={(e) => setNewGame(prev => ({ ...prev, team1Id: e.target.value }))}
                    className="w-full p-2 border rounded-lg"
                  >
                    <option value="">Select Team</option>
                    {season.teams.filter(t => t.id !== newGame.team2Id).map(team => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Team 2</label>
                  <select
                    value={newGame.team2Id}
                    onChange={(e) => setNewGame(prev => ({ ...prev, team2Id: e.target.value }))}
                    className="w-full p-2 border rounded-lg"
                  >
                    <option value="">Select Team</option>
                    {season.teams.filter(t => t.id !== newGame.team1Id).map(team => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Team 1 Score (optional)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={newGame.team1Score}
                    onChange={(e) => setNewGame(prev => ({ ...prev, team1Score: e.target.value }))}
                    className="w-full p-2 border rounded-lg"
                    placeholder="0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Team 2 Score (optional)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={newGame.team2Score}
                    onChange={(e) => setNewGame(prev => ({ ...prev, team2Score: e.target.value }))}
                    className="w-full p-2 border rounded-lg"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowAddGame(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddGame}
                disabled={!newGame.team1Id || !newGame.team2Id}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Add Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Week Schedule View Component
const WeekScheduleView = ({ week, games, teams, onUpdateGame, onDeleteGame }) => {
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
  getStatusColor 
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
                {weekGames.map(game => (
                  <div key={game.id} className="bg-white bg-opacity-50 rounded p-2 text-sm">
                    <span className="font-medium">{getTeamName(game.team1Id)}</span>
                    {game.isCompleted ? (
                      <span className="mx-2">{game.team1Score} - {game.team2Score}</span>
                    ) : (
                      <span className="mx-2">vs</span>
                    )}
                    <span className="font-medium">{getTeamName(game.team2Id)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Game Card Component
const GameCard = ({ game, getTeamName, onUpdateGame, onDeleteGame }) => {
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

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
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
      </div>
    </div>
  );
};

export default ScheduleManager;