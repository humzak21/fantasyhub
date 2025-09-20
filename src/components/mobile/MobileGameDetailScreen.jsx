import React from 'react';
import MobileScreenManager from './MobileScreenManager';
import { Calendar, Users, Trophy, Target, Clock } from 'lucide-react';

const MobileGameDetailScreen = ({ 
  isOpen, 
  onClose, 
  game,
  week,
  homeTeamRoster = [],
  awayTeamRoster = [] 
}) => {
  if (!game) return null;

  const formatScore = (score) => {
    return typeof score === 'number' ? score.toFixed(1) : score || '0.0';
  };

  const getWinnerStyle = (homeScore, awayScore, isHome) => {
    if (!homeScore || !awayScore) return 'text-gray-900';
    
    const homeWins = parseFloat(homeScore) > parseFloat(awayScore);
    const isWinner = isHome ? homeWins : !homeWins;
    
    return isWinner ? 'text-green-600 font-bold' : 'text-gray-600';
  };

  const getGameStatus = () => {
    if (game.status === 'completed') return 'Final';
    if (game.status === 'in_progress') return 'In Progress';
    if (game.status === 'scheduled') return 'Scheduled';
    return 'Unknown';
  };

  const getStatusColor = () => {
    if (game.status === 'completed') return 'text-green-600 bg-green-100';
    if (game.status === 'in_progress') return 'text-yellow-600 bg-yellow-100';
    if (game.status === 'scheduled') return 'text-blue-600 bg-blue-100';
    return 'text-gray-600 bg-gray-100';
  };

  return (
    <MobileScreenManager
      isOpen={isOpen}
      onClose={onClose}
      title={`Week ${week} Game`}
      className="bg-gray-50"
    >
      <div className="space-y-4 p-4">
        {/* Game Header */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-900">Week {week}</span>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor()}`}>
              {getGameStatus()}
            </div>
          </div>

          {/* Teams and Scores */}
          <div className="space-y-4">
            {/* Away Team */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className={`text-lg font-medium ${getWinnerStyle(game.homeScore, game.awayScore, false)}`}>
                    {game.awayTeam?.name || 'Away Team'}
                  </div>
                  <div className="text-sm text-gray-500">
                    {game.awayTeam?.owner || 'Unknown Owner'}
                  </div>
                </div>
              </div>
              <div className={`text-2xl font-bold ${getWinnerStyle(game.homeScore, game.awayScore, false)}`}>
                {formatScore(game.awayScore)}
              </div>
            </div>

            {/* VS Divider */}
            <div className="flex items-center justify-center">
              <div className="text-sm font-medium text-gray-500 bg-white px-3 py-1 rounded-full border">
                VS
              </div>
            </div>

            {/* Home Team */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className={`text-lg font-medium ${getWinnerStyle(game.homeScore, game.awayScore, true)}`}>
                    {game.homeTeam?.name || 'Home Team'}
                  </div>
                  <div className="text-sm text-gray-500">
                    {game.homeTeam?.owner || 'Unknown Owner'}
                  </div>
                </div>
              </div>
              <div className={`text-2xl font-bold ${getWinnerStyle(game.homeScore, game.awayScore, true)}`}>
                {formatScore(game.homeScore)}
              </div>
            </div>
          </div>

          {/* Game Details */}
          {(game.date || game.time) && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Clock className="w-4 h-4" />
                <span>
                  {game.date && new Date(game.date).toLocaleDateString()}
                  {game.time && ` at ${game.time}`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Game Statistics */}
        {(game.homeScore && game.awayScore) && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <Target className="w-5 h-5 mr-2 text-blue-600" />
              Game Statistics
            </h3>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Point Differential</span>
                <span className="text-sm font-medium">
                  {Math.abs(parseFloat(game.homeScore) - parseFloat(game.awayScore)).toFixed(1)}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Points</span>
                <span className="text-sm font-medium">
                  {(parseFloat(game.homeScore) + parseFloat(game.awayScore)).toFixed(1)}
                </span>
              </div>
              
              {game.projectedScore && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Projected Total</span>
                  <span className="text-sm font-medium">
                    {formatScore(game.projectedScore)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Away Team Roster */}
        {awayTeamRoster.length > 0 && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <Users className="w-5 h-5 mr-2 text-blue-600" />
              {game.awayTeam?.name || 'Away Team'} Roster
            </h3>
            
            <div className="space-y-2">
              {awayTeamRoster.map((player, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-xs font-medium text-blue-600">
                        {player.position}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {player.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {player.team} • {player.position}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    {player.points !== undefined && (
                      <>
                        <div className="text-sm font-medium text-gray-900">
                          {player.points.toFixed(1)}
                        </div>
                        <div className="text-xs text-gray-500">pts</div>
                      </>
                    )}
                    {player.projected !== undefined && (
                      <div className="text-xs text-gray-400">
                        Proj: {player.projected.toFixed(1)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Home Team Roster */}
        {homeTeamRoster.length > 0 && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <Users className="w-5 h-5 mr-2 text-green-600" />
              {game.homeTeam?.name || 'Home Team'} Roster
            </h3>
            
            <div className="space-y-2">
              {homeTeamRoster.map((player, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-xs font-medium text-green-600">
                        {player.position}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {player.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {player.team} • {player.position}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    {player.points !== undefined && (
                      <>
                        <div className="text-sm font-medium text-gray-900">
                          {player.points.toFixed(1)}
                        </div>
                        <div className="text-xs text-gray-500">pts</div>
                      </>
                    )}
                    {player.projected !== undefined && (
                      <div className="text-xs text-gray-400">
                        Proj: {player.projected.toFixed(1)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Winner Banner */}
        {game.status === 'completed' && game.homeScore && game.awayScore && (
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-4 text-white">
            <div className="flex items-center justify-center space-x-2">
              <Trophy className="w-6 h-6" />
              <div className="text-center">
                <div className="text-lg font-bold">
                  {parseFloat(game.homeScore) > parseFloat(game.awayScore) 
                    ? game.homeTeam?.name || 'Home Team'
                    : game.awayTeam?.name || 'Away Team'
                  } Wins!
                </div>
                <div className="text-sm opacity-90">
                  Final Score: {formatScore(game.homeScore)} - {formatScore(game.awayScore)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MobileScreenManager>
  );
};

export default MobileGameDetailScreen;