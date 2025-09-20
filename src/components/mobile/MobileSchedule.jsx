import React, { useState, useMemo } from 'react';
import { Calendar, Users, Clock, CheckCircle } from 'lucide-react';
import MobileButton from './MobileButton';
import { cn } from '../../../lib/utils';

const MobileSchedule = ({
  season = null,
  schedule = [],
  currentWeek = 1,
  loading = false
}) => {
  const [viewMode, setViewMode] = useState('week'); // 'week' or 'full'

  if (!season) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <Calendar size={64} className="text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">No Active Season</h3>
        <p className="text-gray-500">Please select or create a season first.</p>
      </div>
    );
  }

  // Memoized functions for performance
  const getGamesForWeek = useMemo(() => {
    return (week) => schedule.filter(game => game.week === week);
  }, [schedule]);

  const getTeamName = useMemo(() => {
    const teamMap = new Map(season?.teams?.map(team => [team.id, team.name]) || []);
    return (teamId) => teamMap.get(teamId) || 'Unknown Team';
  }, [season?.teams]);

  const getWeekStatus = useMemo(() => {
    return (week) => {
      const weekGames = getGamesForWeek(week);
      if (weekGames.length === 0) return 'empty';
      if (weekGames.every(game => game.is_completed)) return 'completed';
      if (weekGames.some(game => game.is_completed)) return 'partial';
      return 'scheduled';
    };
  }, [getGamesForWeek]);



  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Mobile Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="text-blue-600" size={24} />
            <h1 className="text-xl font-bold text-gray-900">Schedule</h1>
          </div>
          
          <MobileButton
            variant="outline"
            size="sm"
            onClick={() => setViewMode(viewMode === 'week' ? 'full' : 'week')}
          >
            {viewMode === 'week' ? 'All Weeks' : 'Current Week'}
          </MobileButton>
        </div>
      </div>


      {season.teams.length < 2 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center">
          <Users size={64} className="text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Not Enough Teams</h3>
          <p className="text-gray-500">You need at least 2 teams to create a schedule.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {viewMode === 'week' ? (
            <MobileWeekView
              week={currentWeek}
              games={getGamesForWeek(currentWeek)}
              getTeamName={getTeamName}
            />
          ) : (
            <MobileFullScheduleView
              season={season}
              getGamesForWeek={getGamesForWeek}
              getTeamName={getTeamName}
              getWeekStatus={getWeekStatus}
            />
          )}
        </div>
      )}
    </div>
  );
};

// Mobile Week View Component
const MobileWeekView = ({
  week,
  games,
  getTeamName
}) => {
  if (games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <Calendar size={64} className="text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">No Games Scheduled</h3>
        <p className="text-gray-500">No games scheduled for Week {week}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      <div className="text-center py-3 bg-white rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Week {week}</h2>
        <p className="text-sm text-gray-600 mt-1">
          {games.length} game{games.length !== 1 ? 's' : ''} scheduled
        </p>
      </div>

      {games.map(game => (
        <MobileGameCard
          key={game.id}
          game={game}
          getTeamName={getTeamName}
        />
      ))}
    </div>
  );
};

// Mobile Full Schedule View Component
const MobileFullScheduleView = ({
  season,
  getGamesForWeek,
  getTeamName,
  getWeekStatus
}) => {
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

  return (
    <div className="p-4 space-y-4">
      {Array.from({ length: season.totalWeeks }, (_, i) => i + 1).map(week => {
        const weekGames = getGamesForWeek(week);
        const status = getWeekStatus(week);
        const isPlayoff = week > season.regularSeasonWeeks;
        
        return (
          <div key={week} className={cn(
            'border-2 rounded-xl overflow-hidden shadow-sm',
            getStatusColor(status)
          )}>
            <div className="bg-white bg-opacity-80 p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(status)}
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">
                      Week {week}
                    </h3>
                    {isPlayoff && (
                      <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded-full mt-1 inline-block">
                        Playoffs
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-600">
                    {weekGames.filter(g => g.is_completed).length}/{weekGames.length}
                  </div>
                  <div className="text-xs text-gray-500">
                    Complete
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4">
            
            {weekGames.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No games scheduled</p>
            ) : (
              <div className="space-y-3">
                {weekGames.map(game => {
                  const team1IsWinner = game.is_completed && game.team1_score > game.team2_score;
                  const team2IsWinner = game.is_completed && game.team2_score > game.team1_score;
                  const isTie = game.is_completed && game.team1_score === game.team2_score;

                  return (
                    <div key={game.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      <div className="p-4">
                        {/* Game Status */}
                        <div className="flex items-center justify-between mb-3">
                          <div className={cn(
                            "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                            game.is_completed
                              ? "bg-green-100 text-green-700"
                              : "bg-blue-100 text-blue-700"
                          )}>
                            {game.is_completed ? "Final" : "Upcoming"}
                          </div>

                          {game.is_completed && isTie && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                              TIE
                            </span>
                          )}
                        </div>

                        {/* Matchup */}
                        <div className="space-y-2">
                          {/* Team 1 */}
                          <div className={cn(
                            "flex items-center justify-between p-2 rounded border transition-colors",
                            team1IsWinner
                              ? "bg-green-50 border-green-200"
                              : "bg-gray-50 border-gray-200"
                          )}>
                            <div className="flex-1 min-w-0 pr-2">
                              <span className={cn(
                                "text-xs font-medium truncate block",
                                team1IsWinner ? "text-green-700" : "text-gray-900"
                              )}>
                                {getTeamName(game.team1_id)}
                              </span>
                            </div>
                            {game.is_completed && (
                              <div className={cn(
                                "text-lg font-mono font-bold",
                                team1IsWinner ? "text-green-600" : "text-gray-600"
                              )}>
                                {game.team1_score}
                              </div>
                            )}
                          </div>

                          {/* VS Separator */}
                          {!game.is_completed && (
                            <div className="text-center py-1">
                              <span className="text-xs text-gray-500 font-medium">VS</span>
                            </div>
                          )}

                          {/* Team 2 */}
                          <div className={cn(
                            "flex items-center justify-between p-2 rounded border transition-colors",
                            team2IsWinner
                              ? "bg-green-50 border-green-200"
                              : "bg-gray-50 border-gray-200"
                          )}>
                            <div className="flex-1 min-w-0 pr-2">
                              <span className={cn(
                                "text-xs font-medium truncate block",
                                team2IsWinner ? "text-green-700" : "text-gray-900"
                              )}>
                                {getTeamName(game.team2_id)}
                              </span>
                            </div>
                            {game.is_completed && (
                              <div className={cn(
                                "text-lg font-mono font-bold",
                                team2IsWinner ? "text-green-600" : "text-gray-600"
                              )}>
                                {game.team2_score}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Mobile Game Card Component
const MobileGameCard = ({
  game,
  getTeamName
}) => {
  // Determine winner and style accordingly
  const team1IsWinner = game.is_completed && game.team1_score > game.team2_score;
  const team2IsWinner = game.is_completed && game.team2_score > game.team1_score;
  const isTie = game.is_completed && game.team1_score === game.team2_score;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-5">
        {/* Game Status Header */}
        <div className="flex items-center justify-between mb-4">
          <div className={cn(
            "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium",
            game.is_completed
              ? "bg-green-100 text-green-700"
              : "bg-blue-100 text-blue-700"
          )}>
            {game.is_completed ? "Final" : "Upcoming"}
          </div>

          {game.is_completed && isTie && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
              TIE GAME
            </span>
          )}
        </div>

        {/* Teams and Scores */}
        <div className="space-y-4">
          {/* Team 1 */}
          <div className={cn(
            "flex items-center justify-between p-3 rounded-lg border-2 transition-colors",
            team1IsWinner
              ? "bg-green-50 border-green-200"
              : "bg-gray-50 border-gray-200"
          )}>
            <div className="flex-1 min-w-0">
              <div className={cn(
                "font-semibold text-sm truncate",
                team1IsWinner ? "text-green-700" : "text-gray-900"
              )}>
                {getTeamName(game.team1_id)}
              </div>
            </div>
            {game.is_completed && (
              <div className={cn(
                "text-2xl font-mono font-bold ml-3",
                team1IsWinner ? "text-green-600" : "text-gray-600"
              )}>
                {game.team1_score}
              </div>
            )}
          </div>

          {/* Team 2 */}
          <div className={cn(
            "flex items-center justify-between p-3 rounded-lg border-2 transition-colors",
            team2IsWinner
              ? "bg-green-50 border-green-200"
              : "bg-gray-50 border-gray-200"
          )}>
            <div className="flex-1 min-w-0">
              <div className={cn(
                "font-semibold text-sm truncate",
                team2IsWinner ? "text-green-700" : "text-gray-900"
              )}>
                {getTeamName(game.team2_id)}
              </div>
            </div>
            {game.is_completed && (
              <div className={cn(
                "text-2xl font-mono font-bold ml-3",
                team2IsWinner ? "text-green-600" : "text-gray-600"
              )}>
                {game.team2_score}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileSchedule;