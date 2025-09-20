import React, { useState } from 'react';
import { Calendar, Users, CheckCircle, Clock, Edit3, Trash2, Save, X, MoreVertical } from 'lucide-react';
import { cn } from '../../../lib/utils';
import MobileButton from './MobileButton';
import { MobileNumberInput } from './MobileForm';

const MobileScheduleManager = ({ 
  season = null,
  schedule = [],
  currentWeek = 1,
  onUpdateGame,
  onDeleteGame,
  loading = false,
  isAuthenticated = false
}) => {
  const [viewMode, setViewMode] = useState('week'); // 'week' or 'full'
  const [expandedWeeks, setExpandedWeeks] = useState(new Set([currentWeek]));

  if (!season) {
    return (
      <div className="text-center py-12 px-6">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Calendar className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium mb-2 text-gray-900">No Active Season</h3>
        <p className="text-gray-600">Please select or create a season first.</p>
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
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'partial':
        return <Clock className="h-4 w-4 text-orange-600" />;
      case 'scheduled':
        return <Calendar className="h-4 w-4 text-blue-600" />;
      default:
        return <Calendar className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'partial':
        return 'bg-orange-50 border-orange-200';
      case 'scheduled':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const toggleWeekExpansion = (week) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(week)) {
      newExpanded.delete(week);
    } else {
      newExpanded.add(week);
    }
    setExpandedWeeks(newExpanded);
  };

  const totalWeeks = season.regularSeasonWeeks + season.playoffWeeks;
  const completedGames = schedule.filter(game => game.isCompleted).length;
  const scheduledGames = schedule.filter(game => !game.isCompleted).length;

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Calendar className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Schedule</h2>
            <p className="text-sm text-gray-600">{season.name || `${season.year} Season`}</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <MobileButton
            variant={viewMode === 'week' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('week')}
            className="flex-1"
          >
            Week View
          </MobileButton>
          <MobileButton
            variant={viewMode === 'full' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('full')}
            className="flex-1"
          >
            Full Schedule
          </MobileButton>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="text-blue-600 text-sm font-medium">Total Games</div>
          <div className="text-2xl font-bold text-blue-900">{schedule.length}</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="text-green-600 text-sm font-medium">Completed</div>
          <div className="text-2xl font-bold text-green-900">{completedGames}</div>
        </div>
      </div>

      {season.teams.length < 2 ? (
        <div className="text-center py-12 px-6">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium mb-2 text-gray-900">Not Enough Teams</h3>
          <p className="text-gray-600">You need at least 2 teams to create a schedule.</p>
        </div>
      ) : (
        <>
          {/* Week View */}
          {viewMode === 'week' && (
            <MobileWeekScheduleView 
              week={currentWeek}
              games={getGamesForWeek(currentWeek)}
              teams={season.teams}
              onUpdateGame={onUpdateGame}
              onDeleteGame={onDeleteGame}
              isAuthenticated={isAuthenticated}
            />
          )}

          {/* Full Schedule View */}
          {viewMode === 'full' && (
            <MobileFullScheduleView 
              schedule={schedule}
              teams={season.teams}
              totalWeeks={totalWeeks}
              regularSeasonWeeks={season.regularSeasonWeeks}
              getWeekStatus={getWeekStatus}
              getStatusIcon={getStatusIcon}
              getStatusColor={getStatusColor}
              expandedWeeks={expandedWeeks}
              toggleWeekExpansion={toggleWeekExpansion}
              onUpdateGame={onUpdateGame}
              onDeleteGame={onDeleteGame}
              isAuthenticated={isAuthenticated}
            />
          )}
        </>
      )}
    </div>
  );
};

// Mobile Week Schedule View Component
const MobileWeekScheduleView = ({ week, games, teams, onUpdateGame, onDeleteGame, isAuthenticated }) => {
  const getTeamName = (teamId) => {
    const team = teams.find(t => t.id === teamId);
    return team ? team.name : 'Unknown Team';
  };

  if (games.length === 0) {
    return (
      <div className="text-center py-12 px-6">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Calendar className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium mb-2 text-gray-900">No Games Scheduled</h3>
        <p className="text-gray-600">No games scheduled for Week {week}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Week {week} Games</h3>
        <span className="text-sm text-gray-600">
          {games.filter(g => g.isCompleted).length}/{games.length} completed
        </span>
      </div>
      
      {games.map(game => (
        <MobileGameCard 
          key={game.id}
          game={game}
          getTeamName={getTeamName}
          onUpdateGame={onUpdateGame}
          onDeleteGame={onDeleteGame}
          isAuthenticated={isAuthenticated}
        />
      ))}
    </div>
  );
};

// Mobile Full Schedule View Component
const MobileFullScheduleView = ({ 
  schedule, 
  teams, 
  totalWeeks, 
  regularSeasonWeeks,
  getWeekStatus,
  getStatusIcon,
  getStatusColor,
  expandedWeeks,
  toggleWeekExpansion,
  onUpdateGame,
  onDeleteGame,
  isAuthenticated
}) => {
  const getTeamName = (teamId) => {
    const team = teams.find(t => t.id === teamId);
    return team ? team.name : 'Unknown Team';
  };

  const getGamesForWeek = (week) => {
    return schedule.filter(game => game.week === week);
  };

  return (
    <div className="space-y-4">
      {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(week => {
        const weekGames = getGamesForWeek(week);
        const status = getWeekStatus(week);
        const isPlayoff = week > regularSeasonWeeks;
        const isExpanded = expandedWeeks.has(week);
        
        return (
          <div key={week} className={cn(
            'border rounded-lg overflow-hidden',
            getStatusColor(status)
          )}>
            {/* Week Header */}
            <button
              onClick={() => toggleWeekExpansion(week)}
              className="w-full p-4 flex items-center justify-between hover:bg-black hover:bg-opacity-5 transition-colors"
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(status)}
                <div className="text-left">
                  <div className="font-semibold">
                    Week {week}
                    {isPlayoff && <span className="text-sm font-normal ml-2">(Playoffs)</span>}
                  </div>
                  <div className="text-sm opacity-75">
                    {weekGames.filter(g => g.isCompleted).length}/{weekGames.length} completed
                  </div>
                </div>
              </div>
              
              <div className={cn(
                'transform transition-transform',
                isExpanded ? 'rotate-180' : ''
              )}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            
            {/* Week Games */}
            {isExpanded && (
              <div className="border-t border-current border-opacity-20">
                {weekGames.length === 0 ? (
                  <div className="p-4 text-center text-sm opacity-75">
                    No games scheduled
                  </div>
                ) : (
                  <div className="space-y-3 p-4">
                    {weekGames.map(game => (
                      <MobileGameCard 
                        key={game.id}
                        game={game}
                        getTeamName={getTeamName}
                        onUpdateGame={onUpdateGame}
                        onDeleteGame={onDeleteGame}
                        isAuthenticated={isAuthenticated}
                        compact={true}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Mobile Game Card Component
const MobileGameCard = ({ game, getTeamName, onUpdateGame, onDeleteGame, isAuthenticated, compact = false }) => {
  const [editing, setEditing] = useState(false);
  const [scores, setScores] = useState({
    team1Score: game.team1Score?.toString() || '',
    team2Score: game.team2Score?.toString() || ''
  });
  const [showActions, setShowActions] = useState(false);

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
      setShowActions(false);
    } catch (error) {
      alert('Error updating game: ' + error.message);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this game?')) {
      try {
        await onDeleteGame(game.id);
        setShowActions(false);
      } catch (error) {
        alert('Error deleting game: ' + error.message);
      }
    }
  };

  const handleCancel = () => {
    setScores({
      team1Score: game.team1Score?.toString() || '',
      team2Score: game.team2Score?.toString() || ''
    });
    setEditing(false);
    setShowActions(false);
  };

  return (
    <div className={cn(
      'bg-white rounded-lg border border-gray-200',
      compact ? 'p-3' : 'p-4'
    )}>
      {editing ? (
        <div className="space-y-4">
          {/* Editing Mode */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 text-sm font-medium">{getTeamName(game.team1Id)}</div>
              <MobileNumberInput
                value={scores.team1Score}
                onChange={(value) => setScores(prev => ({ ...prev, team1Score: value }))}
                placeholder="0"
                showSteppers={false}
                className="w-20"
              />
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex-1 text-sm font-medium">{getTeamName(game.team2Id)}</div>
              <MobileNumberInput
                value={scores.team2Score}
                onChange={(value) => setScores(prev => ({ ...prev, team2Score: value }))}
                placeholder="0"
                showSteppers={false}
                className="w-20"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <MobileButton
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="flex-1"
            >
              Cancel
            </MobileButton>
            <MobileButton
              size="sm"
              onClick={handleSave}
              className="flex-1"
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </MobileButton>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          {/* Game Display */}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className={cn(
                'font-medium',
                compact ? 'text-sm' : 'text-base'
              )}>
                {getTeamName(game.team1Id)}
              </span>
              <span className={cn(
                'font-mono',
                compact ? 'text-sm' : 'text-lg'
              )}>
                {game.isCompleted ? game.team1Score : '—'}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className={cn(
                'font-medium',
                compact ? 'text-sm' : 'text-base'
              )}>
                {getTeamName(game.team2Id)}
              </span>
              <span className={cn(
                'font-mono',
                compact ? 'text-sm' : 'text-lg'
              )}>
                {game.isCompleted ? game.team2Score : '—'}
              </span>
            </div>
            
            {game.isCompleted && (
              <div className={cn(
                'mt-2 text-gray-600',
                compact ? 'text-xs' : 'text-sm'
              )}>
                Winner: {getTeamName(game.winnerTeamId)}
                {game.isBlowout && <span className="ml-2 text-orange-600">• Blowout</span>}
                {game.isClose && <span className="ml-2 text-blue-600">• Close Game</span>}
              </div>
            )}
          </div>

          {/* Actions */}
          {isAuthenticated && (
            <div className="ml-4">
              {showActions ? (
                <div className="flex gap-2">
                  <MobileButton
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setScores({
                        team1Score: game.team1Score?.toString() || '',
                        team2Score: game.team2Score?.toString() || ''
                      });
                      setEditing(true);
                    }}
                  >
                    <Edit3 className="h-4 w-4" />
                  </MobileButton>
                  <MobileButton
                    size="sm"
                    variant="destructive"
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-4 w-4" />
                  </MobileButton>
                  <MobileButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowActions(false)}
                  >
                    <X className="h-4 w-4" />
                  </MobileButton>
                </div>
              ) : (
                <MobileButton
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowActions(true)}
                >
                  <MoreVertical className="h-4 w-4" />
                </MobileButton>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MobileScheduleManager;