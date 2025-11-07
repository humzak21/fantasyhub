import React, { useState } from 'react';
import { Calendar, Users, CheckCircle, Clock, Edit3, Trash2, Save, X, MoreVertical } from 'lucide-react';
import { cn } from '../../../lib/utils';
import MobileButton from './MobileButton';
import { MobileNumberInput } from './MobileForm';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';

const MobileScheduleManager = ({
  season = null,
  schedule = [],
  currentWeek = 1,
  onUpdateGame,
  onDeleteGame,
  loading = false,
  isAuthenticated = false,
  powerRankings = [],
  rosters = {},
  user = null,
  isAdmin = false
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
              powerRankings={powerRankings}
              rosters={rosters}
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
              powerRankings={powerRankings}
              rosters={rosters}
            />
          )}
        </>
      )}
    </div>
  );
};

// Mobile Week Schedule View Component
const MobileWeekScheduleView = ({
  week,
  games,
  teams,
  onUpdateGame,
  onDeleteGame,
  isAuthenticated,
  powerRankings = [],
  rosters = {}
}) => {
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
          teams={teams}
          onUpdateGame={onUpdateGame}
          onDeleteGame={onDeleteGame}
          isAuthenticated={isAuthenticated}
          powerRankings={powerRankings}
          rosters={rosters}
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
  isAuthenticated,
  powerRankings = [],
  rosters = {}
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
                        teams={teams}
                        onUpdateGame={onUpdateGame}
                        onDeleteGame={onDeleteGame}
                        isAuthenticated={isAuthenticated}
                        powerRankings={powerRankings}
                        rosters={rosters}
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

// Mobile Game Card Component with Versus Layout
const MobileGameCard = ({
  game,
  teams,
  onUpdateGame,
  onDeleteGame,
  isAuthenticated,
  compact = false,
  powerRankings = [],
  rosters = {}
}) => {
  const [editing, setEditing] = useState(false);
  const [scores, setScores] = useState({
    team1Score: game.team1Score?.toString() || '',
    team2Score: game.team2Score?.toString() || ''
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

  const handleCancel = () => {
    setScores({
      team1Score: game.team1Score?.toString() || '',
      team2Score: game.team2Score?.toString() || ''
    });
    setEditing(false);
  };

  const getTeamStats = (teamId) => {
    const ranking = powerRankings.find(r => (r.teamId || r.id) === teamId);
    return ranking || {};
  };

  const getTeamRanking = (teamId) => {
    const ranking = powerRankings.find(r => (r.teamId || r.id) === teamId);
    return ranking ? ranking.rank : null;
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return '👑';
    if (rank <= 3) return '🥉';
    if (rank <= 6) return '🏆';
    return '🏅';
  };

  const getPositionColor = (position) => {
    const colors = {
      QB: 'bg-red-100 text-red-700 border-red-200',
      RB: 'bg-green-100 text-green-700 border-green-200',
      WR: 'bg-blue-100 text-blue-700 border-blue-200',
      TE: 'bg-orange-100 text-orange-700 border-orange-200',
      K: 'bg-purple-100 text-purple-700 border-purple-200',
      'D/ST': 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return colors[position] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const MobileTeamRosterPreview = ({ roster }) => {
    if (!roster || roster.length === 0) {
      return (
        <div className="text-xs text-gray-500">No roster data</div>
      );
    }

    // Group players by roster slot
    const groupedRoster = roster.reduce((acc, player) => {
      const slot = player.rosterSlot || 'BE';
      if (!acc[slot]) {
        acc[slot] = [];
      }
      acc[slot].push(player);
      return acc;
    }, {});

    const starters = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K']
      .map(slot => groupedRoster[slot] || [])
      .flat()
      .slice(0, compact ? 3 : 5);

    const benchPlayers = (groupedRoster['BE'] || []).slice(0, compact ? 2 : 4);

    const PlayerBadge = ({ player, slot }) => {
      const playerName = player.playerName || player.player?.name || 'Unknown';
      const position = player.position || player.player?.position || '?';

      return (
        <div className="flex items-center gap-1 p-1 rounded text-xs border bg-white border-gray-200">
          <div className={`px-1 py-0.5 rounded text-xs border ${getPositionColor(position)}`}>
            {position}
          </div>
          <span className="truncate" style={{maxWidth: '110px'}}>{playerName}</span>
          {player.injuryStatus && player.injuryStatus !== 'ACTIVE' && (
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0" />
          )}
        </div>
      );
    };

    return (
      <div className="space-y-1">
        {/* Starting Lineup */}
        {starters.length > 0 && (
          <div className="space-y-1">
            <h6 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Starters
            </h6>
            <div className="space-y-1">
              {starters.map((player, idx) => (
                <PlayerBadge key={`starter-${idx}`} player={player} slot={player.rosterSlot} />
              ))}
            </div>
          </div>
        )}

        {/* Bench Players */}
        {benchPlayers.length > 0 && (
          <div className="space-y-1">
            <h6 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Bench
            </h6>
            <div className="space-y-1">
              {benchPlayers.map((player, idx) => (
                <PlayerBadge key={`bench-${idx}`} player={player} slot="BE" />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const MobileTeamCard = ({ teamId, score, isWinner }) => {
    const team = teams.find(t => t.id === teamId);
    const stats = getTeamStats(teamId);
    const rank = getTeamRanking(teamId);
    const roster = rosters[teamId]?.roster || [];
    const teamName = team ? getMaskedTeamName(team, user, isAdmin) : 'Unknown Team';

    return (
      <div className={`w-full p-3 rounded-lg border ${
        isWinner && game.isCompleted
          ? 'bg-green-50 border-green-200'
          : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="space-y-2">
          {/* Team Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h5 className={cn(
                'font-bold truncate',
                compact ? 'text-sm' : 'text-base'
              )}>{teamName}</h5>
              {team?.owner && (
                <div className="text-xs text-gray-600 truncate">
                  {getMaskedOwnerName(team, user, isAdmin)}
                </div>
              )}
              {/* Record */}
              {stats.gamesPlayed > 0 && (
                <div className="text-xs mt-1">
                  <span className="text-gray-600">Record: </span>
                  <span className={`font-semibold ${
                    (stats.wins || 0) > (stats.losses || 0)
                      ? 'text-green-600'
                      : (stats.wins || 0) < (stats.losses || 0)
                      ? 'text-red-600'
                      : 'text-gray-600'
                  }`}>
                    {stats.wins || 0}-{stats.losses || 0}
                    {stats.ties > 0 && `-${stats.ties}`}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-1">
              {rank && (
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                  rank === 1
                    ? 'bg-yellow-100 text-yellow-800'
                    : rank <= 3
                    ? 'bg-gray-100 text-gray-800'
                    : 'bg-blue-50 text-blue-700'
                }`}>
                  {getRankIcon(rank)} #{rank}
                </div>
              )}

              {/* Score Display */}
              {editing ? (
                <MobileNumberInput
                  value={teamId === game.team1Id ? scores.team1Score : scores.team2Score}
                  onChange={(value) => setScores(prev => ({
                    ...prev,
                    [teamId === game.team1Id ? 'team1Score' : 'team2Score']: value
                  }))}
                  placeholder="0"
                  showSteppers={false}
                  className="w-16 text-center"
                />
              ) : (
                <div className={cn(
                  'font-bold',
                  compact ? 'text-xl' : 'text-2xl'
                )}>
                  {score !== null && score !== undefined ? score : '-'}
                </div>
              )}
            </div>
          </div>

          {/* Roster Preview */}
          {!compact && <MobileTeamRosterPreview roster={roster} />}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      {/* Game Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            'font-semibold',
            compact ? 'text-sm' : 'text-base'
          )}>Week {game.week}</div>
          {game.isCompleted && (
            <div className="flex items-center gap-1">
              {game.isBlowout && (
                <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                  Blowout
                </span>
              )}
              {game.isClose && (
                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                  Close
                </span>
              )}
            </div>
          )}
        </div>

        {isAuthenticated && (
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <MobileButton
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                >
                  Cancel
                </MobileButton>
                <MobileButton
                  size="sm"
                  onClick={handleSave}
                >
                  Save
                </MobileButton>
              </>
            ) : (
              <>
                <MobileButton
                  size="sm"
                  variant="ghost"
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
                  variant="ghost"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </MobileButton>
              </>
            )}
          </div>
        )}
      </div>

      {/* Versus Layout - Vertical Stack */}
      <div className="flex flex-col gap-2">
        <MobileTeamCard
          teamId={game.team1Id}
          score={game.team1Score}
          isWinner={game.isCompleted && game.winnerTeamId === game.team1Id}
        />

        <div className="flex-shrink-0 text-center py-1">
          <div className={cn(
            'font-bold text-gray-400',
            compact ? 'text-sm' : 'text-lg'
          )}>VS</div>
          {!game.isCompleted && (
            <div className="text-xs text-gray-500 mt-1">Scheduled</div>
          )}
        </div>

        <MobileTeamCard
          teamId={game.team2Id}
          score={game.team2Score}
          isWinner={game.isCompleted && game.winnerTeamId === game.team2Id}
        />
      </div>
    </div>
  );
};

export default MobileScheduleManager;