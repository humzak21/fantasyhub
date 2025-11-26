import React from 'react';
import { Edit3, TrendingUp, TrendingDown, Minus, Trophy, Target } from 'lucide-react';

const PowerRankingsTable = ({ 
  rankings = [], 
  onEditTeam, 
  currentWeek = 1,
  showAdvanced = false 
}) => {
  const getRankColor = (rank) => {
    if (rank === 1) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    if (rank <= 3) return 'text-orange-600 bg-orange-50 border-orange-200';
    if (rank <= 6) return 'text-green-600 bg-green-50 border-green-200';
    if (rank <= 10) return 'text-blue-600 bg-blue-50 border-blue-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  const getFormColor = (form) => {
    if (form >= 5) return 'text-green-700 bg-green-100';
    if (form >= 2) return 'text-green-600 bg-green-50';
    if (form >= -2) return 'text-gray-600 bg-gray-50';
    if (form >= -5) return 'text-red-600 bg-red-50';
    return 'text-red-700 bg-red-100';
  };

  const getRankChangeIcon = (change) => {
    if (change > 0) return <TrendingUp size={14} className="text-green-600" />;
    if (change < 0) return <TrendingDown size={14} className="text-red-600" />;
    return <Minus size={14} className="text-gray-400" />;
  };

  const getStreakDisplay = (streak) => {
    if (streak.type === 'none') return '-';
    const prefix = streak.type === 'win' ? 'W' : streak.type === 'loss' ? 'L' : 'T';
    return `${prefix}${streak.length}`;
  };

  const getStreakColor = (streak) => {
    if (streak.type === 'win') return 'text-green-600 bg-green-50';
    if (streak.type === 'loss') return 'text-red-600 bg-red-50';
    return 'text-gray-600 bg-gray-50';
  };

  if (!rankings.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Trophy size={48} className="mx-auto mb-4 text-gray-300" />
        <p>No rankings available. Add teams and games to see power rankings.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b">
            <th className="text-left p-4 font-semibold">Rank</th>
            <th className="text-left p-4 font-semibold">Team</th>
            <th className="text-center p-4 font-semibold">Record</th>
            <th className="text-center p-4 font-semibold">Win%</th>
            <th className="text-center p-4 font-semibold">Point Diff</th>
            {showAdvanced && (
              <>
                <th className="text-center p-4 font-semibold">SOS</th>
                <th className="text-center p-4 font-semibold">Form</th>
                <th className="text-center p-4 font-semibold">Streak</th>
                <th className="text-center p-4 font-semibold">Quality</th>
              </>
            )}
            <th className="text-center p-4 font-semibold">Power Rating</th>
            {onEditTeam && <th className="text-center p-4 font-semibold">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rankings.map((team, index) => (
            <tr key={team.teamId || team.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="p-4">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm border ${getRankColor(index + 1)}`}>
                    {index + 1}
                  </span>
                  {team.rankChange !== 0 && (
                    <div className="flex items-center gap-1">
                      {getRankChangeIcon(team.rankChange)}
                      <span className="text-xs text-gray-500">
                        {Math.abs(team.rankChange)}
                      </span>
                    </div>
                  )}
                </div>
              </td>
              
              <td className="p-4">
                <div className="font-semibold text-gray-900">{team.name}</div>
                {team.owner && (
                  <div className="text-sm text-gray-600">{team.owner}</div>
                )}
                {showAdvanced && (
                  <div className="text-xs text-gray-500 mt-1">
                    QW: {team.qualityWins || 0} | BL: {team.badLosses || 0}
                  </div>
                )}
              </td>
              
              <td className="p-4 text-center font-mono">
                <div className="font-semibold">
                  {team.wins || 0}-{team.losses || 0}
                  {team.ties > 0 && `-${team.ties}`}
                </div>
                <div className="text-sm text-gray-600">
                  ({team.gamesPlayed || 0} games)
                </div>
              </td>
              
              <td className="p-4 text-center font-mono">
                {((team.winPercentage || 0) * 100).toFixed(1)}%
              </td>
              
              <td className="p-4 text-center font-mono">
                <div className={
                  (team.pointDifferential || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                }>
                  {(team.pointDifferential || 0) >= 0 ? '+' : ''}
                  {team.pointDifferential || 0}
                </div>
                <div className="text-xs text-gray-500">
                  {(team.averagePointsFor || 0).toFixed(1)} - {(team.averagePointsAgainst || 0).toFixed(1)}
                </div>
              </td>
              
              {showAdvanced && (
                <>
                  <td className="p-4 text-center font-mono">
                    <div className={
                      (team.strengthOfSchedule || 0) >= 0 ? 'text-orange-600' : 'text-green-600'
                    }>
                      {(team.strengthOfSchedule || 0) >= 0 ? '+' : ''}
                      {((team.strengthOfSchedule || 0) * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">
                      vs {((team.opponentWinPercentage || 0) * 100).toFixed(1)}%
                    </div>
                  </td>
                  
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getFormColor(team.recentForm || 0)}`}>
                      {(team.recentForm || 0) >= 0 ? '+' : ''}{(team.recentForm || 0).toFixed(1)}
                    </span>
                  </td>
                  
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStreakColor(team.currentStreak || { type: 'none', length: 0 })}`}>
                      {getStreakDisplay(team.currentStreak || { type: 'none', length: 0 })}
                    </span>
                  </td>
                  
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2 text-xs">
                      <span className="text-green-600 flex items-center gap-1">
                        <Target size={12} />
                        {team.qualityWins || 0}
                      </span>
                      <span className="text-red-600">
                        {team.badLosses || 0}
                      </span>
                    </div>
                  </td>
                </>
              )}
              
              <td className="p-4 text-center font-mono font-bold text-lg">
                {(team.powerRating || 0).toFixed(1)}
              </td>
              
              {onEditTeam && (
                <td className="p-4 text-center">
                  <button
                    onClick={() => onEditTeam(team)}
                    className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit team"
                  >
                    <Edit3 size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      
      {showAdvanced && (
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-semibold text-blue-900 mb-2">Legend</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-blue-800">
            <div><strong>SOS:</strong> Strength of Schedule</div>
            <div><strong>Form:</strong> Recent 4-week performance</div>
            <div><strong>QW:</strong> Quality Wins</div>
            <div><strong>BL:</strong> Bad Losses</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PowerRankingsTable;