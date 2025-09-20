import React from 'react';
import MobileScreenManager from './MobileScreenManager';
import { Trophy, TrendingUp, TrendingDown, Users, Calendar } from 'lucide-react';

const MobileTeamDetailScreen = ({ 
  isOpen, 
  onClose, 
  team, 
  teamStats, 
  recentGames = [],
  roster = [] 
}) => {
  if (!team) return null;

  const formatRecord = (wins, losses, ties = 0) => {
    return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
  };

  const getRecordColor = (wins, losses) => {
    const winPercentage = wins / (wins + losses);
    if (winPercentage >= 0.7) return 'text-green-600';
    if (winPercentage >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <MobileScreenManager
      isOpen={isOpen}
      onClose={onClose}
      title={team.name || 'Team Details'}
      className="bg-gray-50"
    >
      <div className="space-y-4 p-4">
        {/* Team Header */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Trophy className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">{team.name}</h2>
              <p className="text-sm text-gray-600">
                Owner: {team.owner || 'Unknown'}
              </p>
            </div>
          </div>
          
          {teamStats && (
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className={`text-2xl font-bold ${getRecordColor(teamStats.wins || 0, teamStats.losses || 0)}`}>
                  {formatRecord(teamStats.wins || 0, teamStats.losses || 0, teamStats.ties)}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Record</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {teamStats.pointsFor ? teamStats.pointsFor.toFixed(1) : '0.0'}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Points For</div>
              </div>
            </div>
          )}
        </div>

        {/* Team Statistics */}
        {teamStats && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
              Season Statistics
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Points Against</span>
                  <span className="text-sm font-medium">
                    {teamStats.pointsAgainst ? teamStats.pointsAgainst.toFixed(1) : '0.0'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Point Differential</span>
                  <span className={`text-sm font-medium ${
                    (teamStats.pointsFor - teamStats.pointsAgainst) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {teamStats.pointsFor && teamStats.pointsAgainst 
                      ? (teamStats.pointsFor - teamStats.pointsAgainst).toFixed(1)
                      : '0.0'
                    }
                  </span>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Avg Points/Game</span>
                  <span className="text-sm font-medium">
                    {teamStats.wins && teamStats.losses 
                      ? (teamStats.pointsFor / (teamStats.wins + teamStats.losses)).toFixed(1)
                      : '0.0'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Win Percentage</span>
                  <span className="text-sm font-medium">
                    {teamStats.wins && teamStats.losses 
                      ? ((teamStats.wins / (teamStats.wins + teamStats.losses)) * 100).toFixed(1) + '%'
                      : '0.0%'
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Games */}
        {recentGames.length > 0 && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-blue-600" />
              Recent Games
            </h3>
            
            <div className="space-y-3">
              {recentGames.slice(0, 5).map((game, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      game.result === 'W' ? 'bg-green-500' : 
                      game.result === 'L' ? 'bg-red-500' : 'bg-gray-400'
                    }`} />
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        vs {game.opponent}
                      </div>
                      <div className="text-xs text-gray-500">
                        Week {game.week}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`text-sm font-medium ${
                      game.result === 'W' ? 'text-green-600' : 
                      game.result === 'L' ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {game.result}
                    </div>
                    <div className="text-xs text-gray-500">
                      {game.score}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Team Roster */}
        {roster.length > 0 && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <Users className="w-5 h-5 mr-2 text-blue-600" />
              Current Roster
            </h3>
            
            <div className="space-y-2">
              {roster.map((player, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
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
                  
                  {player.points && (
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {player.points.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-500">pts</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Power Ranking Info */}
        {teamStats && teamStats.powerRanking && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
              Power Ranking
            </h3>
            
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  #{teamStats.powerRanking.rank}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">
                  Current Rank
                </div>
              </div>
              
              {teamStats.powerRanking.trend && (
                <div className="flex items-center space-x-2">
                  {teamStats.powerRanking.trend > 0 ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  ) : teamStats.powerRanking.trend < 0 ? (
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  ) : null}
                  <span className={`text-sm font-medium ${
                    teamStats.powerRanking.trend > 0 ? 'text-green-600' :
                    teamStats.powerRanking.trend < 0 ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {teamStats.powerRanking.trend > 0 ? '+' : ''}
                    {teamStats.powerRanking.trend}
                  </span>
                </div>
              )}
            </div>
            
            {teamStats.powerRanking.score && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Power Score</span>
                  <span className="font-medium">
                    {teamStats.powerRanking.score.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </MobileScreenManager>
  );
};

export default MobileTeamDetailScreen;