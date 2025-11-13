import React, { useState } from 'react';
import { Calendar, Users, RefreshCw, Download, Upload, Plus, Edit3, Trash2, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '../ui/badge';
import { isUserTeam, getUserTeamHighlightClasses } from '../../utils/userTeamUtils';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';
import SeasonProgressBar from '../season/SeasonProgressBar';

const ScheduleManager = ({
  season = null,
  schedule = [],
  currentWeek = 1, // Added currentWeek prop to sync with week navigator
  onUpdateGame,
  onDeleteGame,
  onWeekChange, // Added to handle week navigation from progress bar
  loading = false,
  isAuthenticated = false, // This now represents isAdmin from parent
  user = null,
  powerRankings = [],
  rosters = {},
  isAdmin = false,
  teamOwnerNames = []
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

      {/* Season Progress Bar */}
      <SeasonProgressBar
        season={season}
        schedule={schedule}
        currentWeek={currentWeek}
        onWeekChange={onWeekChange}
      />

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
                powerRankings={powerRankings}
                rosters={rosters}
                isAdmin={isAdmin}
                teamOwnerNames={teamOwnerNames}
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
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          )}
        </>
      )}

    </div>
  );
};

// Week Schedule View Component
const WeekScheduleView = ({
  week,
  games,
  teams,
  onUpdateGame,
  onDeleteGame,
  isAuthenticated = false,
  user = null,
  powerRankings = [],
  rosters = {},
  isAdmin = false,
  teamOwnerNames = []
}) => {
  if (games.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <Calendar size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p>No games scheduled for Week {week}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {games.map(game => (
        <GameCard
          key={game.id}
          game={game}
          onUpdateGame={onUpdateGame}
          onDeleteGame={onDeleteGame}
          isAuthenticated={isAuthenticated}
          teams={teams}
          user={user}
          powerRankings={powerRankings}
          rosters={rosters}
          isAdmin={isAdmin}
          teamOwnerNames={teamOwnerNames}
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
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  const getTeamName = (teamId) => {
    const team = teams.find(t => t.id === teamId);
    return team ? getMaskedTeamName(team, user, isAdmin, teamOwnerNames) : 'Unknown Team';
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
              <div className="grid gap-3">
                {weekGames.map(game => {
                  const team1 = teams.find(t => t.id === game.team1Id);
                  const team2 = teams.find(t => t.id === game.team2Id);
                  const isUserGame = isUserTeam(team1, user) || isUserTeam(team2, user);
                  const baseClasses = "bg-white bg-opacity-50 rounded p-3 border";
                  const highlightClasses = getUserTeamHighlightClasses(isUserGame);
                  const borderClasses = game.isCompleted
                    ? "border-green-200 dark:border-green-700/30"
                    : "border-gray-200 dark:border-gray-600";

                  const isTeam1Winner = game.isCompleted && game.winnerTeamId === game.team1Id;
                  const isTeam2Winner = game.isCompleted && game.winnerTeamId === game.team2Id;

                  return (
                    <div key={game.id} className={`${baseClasses} ${highlightClasses} ${borderClasses}`}>
                      <div className="flex items-center justify-between gap-4">
                        {/* Team 1 */}
                        <div className={`flex-1 flex items-center gap-2 ${isTeam1Winner ? 'font-bold' : 'font-medium'}`}>
                          <span className="flex-1 truncate dark:text-white">
                            {getTeamName(game.team1Id)}
                          </span>
                          {game.isCompleted && (
                            <span className={`text-lg font-bold min-w-[3rem] text-right ${
                              isTeam1Winner
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-gray-600 dark:text-gray-400'
                            }`}>
                              {game.team1Score}
                            </span>
                          )}
                        </div>

                        {/* VS or Score Separator */}
                        <div className="flex-shrink-0 px-2">
                          {game.isCompleted ? (
                            <span className="text-gray-400 dark:text-gray-500 font-medium">-</span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 text-xs font-medium">vs</span>
                          )}
                        </div>

                        {/* Team 2 */}
                        <div className={`flex-1 flex items-center gap-2 ${isTeam2Winner ? 'font-bold' : 'font-medium'}`}>
                          {game.isCompleted && (
                            <span className={`text-lg font-bold min-w-[3rem] ${
                              isTeam2Winner
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-gray-600 dark:text-gray-400'
                            }`}>
                              {game.team2Score}
                            </span>
                          )}
                          <span className="flex-1 truncate text-right dark:text-white">
                            {getTeamName(game.team2Id)}
                          </span>
                        </div>
                      </div>

                      {/* Game indicators */}
                      {game.isCompleted && (game.isBlowout || game.isClose) && (
                        <div className="flex gap-1 mt-2">
                          {game.isBlowout && (
                            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded dark:bg-orange-900/30 dark:text-orange-300">
                              Blowout
                            </span>
                          )}
                          {game.isClose && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded dark:bg-blue-900/30 dark:text-blue-300">
                              Close
                            </span>
                          )}
                        </div>
                      )}
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

// Game Card Component with Versus Layout
const GameCard = ({
  game,
  onUpdateGame,
  onDeleteGame,
  isAuthenticated = false,
  teams = [],
  user = null,
  powerRankings = [],
  rosters = {},
  isAdmin = false,
  teamOwnerNames = []
}) => {
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
      QB: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700',
      RB: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
      WR: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
      TE: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700',
      K: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700',
      'D/ST': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/30 dark:text-gray-300 dark:border-gray-600'
    };
    return colors[position] || 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/30 dark:text-gray-300 dark:border-gray-600';
  };

  const TeamRosterPreview = ({ roster }) => {
    if (!roster || roster.length === 0) {
      return (
        <div className="text-xs text-gray-500 dark:text-gray-400">No roster data</div>
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
      .flat();

    const benchPlayers = groupedRoster['BE'] || [];
    const irPlayers = groupedRoster['IR'] || [];

    const PlayerBadge = ({ player, slot }) => {
      const playerName = player.playerName || player.player?.name || 'Unknown';
      const position = player.position || player.player?.position || '?';
      const isStarter = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K'].includes(slot);

      return (
        <div
          className={`flex items-center gap-1 p-1 rounded text-xs border ${
            isStarter
              ? 'bg-white border-gray-200 font-medium dark:bg-gray-800 dark:border-gray-600'
              : slot === 'IR'
              ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300'
              : 'bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400'
          }`}
          title={`${playerName} (${position})${slot !== 'BE' && slot !== 'IR' ? ` - ${slot}` : ''}`}
        >
          <Badge
            variant="outline"
            className={`text-xs w-10 justify-center ${getPositionColor(position)}`}
          >
            {position}
          </Badge>
          <span className="truncate text-xs" style={{maxWidth: '140px'}}>{playerName}</span>
          {player.injuryStatus && player.injuryStatus !== 'ACTIVE' && (
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0" title={player.injuryStatus} />
          )}
        </div>
      );
    };

    return (
      <div className="space-y-2 max-h-128 overflow-y-auto">
        {/* Starting Lineup */}
        {starters.length > 0 && (
          <div className="space-y-1">
            <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Starters
            </h5>
            <div className="grid grid-cols-1 gap-1">
              {starters.map((player, idx) => (
                <PlayerBadge key={`starter-${idx}`} player={player} slot={player.rosterSlot} />
              ))}
            </div>
          </div>
        )}

        {/* Bench Players */}
        {benchPlayers.length > 0 && (
          <div className="space-y-1">
            <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Bench
            </h5>
            <div className="grid grid-cols-1 gap-1">
              {benchPlayers.map((player, idx) => (
                <PlayerBadge key={`bench-${idx}`} player={player} slot="BE" />
              ))}
            </div>
          </div>
        )}

        {/* IR Players */}
        {irPlayers.length > 0 && (
          <div className="space-y-1">
            <h5 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
              Injured Reserve
            </h5>
            <div className="grid grid-cols-1 gap-1">
              {irPlayers.map((player, idx) => (
                <PlayerBadge key={`ir-${idx}`} player={player} slot="IR" />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const TeamCard = ({ teamId, score, isWinner }) => {
    const team = teams.find(t => t.id === teamId);
    const stats = getTeamStats(teamId);
    const rank = getTeamRanking(teamId);
    const roster = rosters[teamId]?.roster || [];
    const teamName = team ? getMaskedTeamName(team, user, isAdmin, teamOwnerNames) : 'Unknown Team';

    return (
      <div className={`flex-1 p-3 rounded-lg border ${
        isWinner && game.isCompleted
          ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700'
          : 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-600'
      }`}>
        <div className="space-y-2">
          {/* Team Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-base truncate dark:text-white">{teamName}</h4>
              {team?.owner && (
                <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                  {getMaskedOwnerName(team, user, isAdmin, teamOwnerNames)}
                </div>
              )}
              {/* Record */}
              {stats.gamesPlayed > 0 && (
                <div className="text-xs mt-1">
                  <span className="text-gray-600 dark:text-gray-400">Record: </span>
                  <span className={`font-semibold ${
                    (stats.wins || 0) > (stats.losses || 0)
                      ? 'text-green-600 dark:text-green-400'
                      : (stats.wins || 0) < (stats.losses || 0)
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-600 dark:text-gray-400'
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
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                    : rank <= 3
                    ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                }`}>
                  {getRankIcon(rank)} #{rank}
                </div>
              )}

              {/* Score Display */}
              {editing ? (
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={teamId === game.team1Id ? scores.team1Score : scores.team2Score}
                  onChange={(e) => setScores(prev => ({
                    ...prev,
                    [teamId === game.team1Id ? 'team1Score' : 'team2Score']: e.target.value
                  }))}
                  className="p-1 border rounded text-center w-16 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="0"
                />
              ) : (
                <div className="text-2xl font-bold dark:text-white">
                  {score !== null && score !== undefined ? score : '-'}
                </div>
              )}
            </div>
          </div>

          {/* Roster Preview */}
          <TeamRosterPreview roster={roster} />
        </div>
      </div>
    );
  };

  // Check if this game involves the user's team
  const team1 = teams.find(t => t.id === game.team1Id);
  const team2 = teams.find(t => t.id === game.team2Id);
  const isUserGame = isUserTeam(team1, user) || isUserTeam(team2, user);
  const highlightClasses = getUserTeamHighlightClasses(isUserGame);

  return (
    <div className={`bg-white dark:bg-gray-900 border rounded-lg p-4 shadow-sm ${highlightClasses}`}>
      {/* Game Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-base font-semibold dark:text-white">Week {game.week}</div>
          {game.isCompleted && (
            <div className="flex items-center gap-1">
              {game.isBlowout && <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded dark:bg-orange-900/30 dark:text-orange-300">Blowout</span>}
              {game.isClose && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded dark:bg-blue-900/30 dark:text-blue-300">Close</span>}
            </div>
          )}
        </div>

        {isAuthenticated && (
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="px-2 py-1 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded text-xs transition-colors dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-2 py-1 text-green-600 hover:text-green-800 hover:bg-green-100 rounded text-xs transition-colors dark:text-green-400 dark:hover:text-green-200 dark:hover:bg-green-900/30"
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
                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors dark:text-blue-400 dark:hover:text-blue-200 dark:hover:bg-blue-900/30"
                  title="Edit scores"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors dark:text-red-400 dark:hover:text-red-200 dark:hover:bg-red-900/30"
                  title="Delete game"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Versus Layout */}
      <div className="flex items-start gap-3">
        <TeamCard
          teamId={game.team1Id}
          score={game.team1Score}
          isWinner={game.isCompleted && game.winnerTeamId === game.team1Id}
        />

        <div className="flex-shrink-0 text-center self-center">
          <div className="text-lg font-bold text-gray-400 dark:text-gray-500">VS</div>
          {!game.isCompleted && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Scheduled</div>
          )}
        </div>

        <TeamCard
          teamId={game.team2Id}
          score={game.team2Score}
          isWinner={game.isCompleted && game.winnerTeamId === game.team2Id}
        />
      </div>
    </div>
  );
};

export default ScheduleManager;