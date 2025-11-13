import React from 'react';
import { Trophy, TrendingUp, Award } from 'lucide-react';
import { getMaskedTeamName, getMaskedUserName } from '../../utils/displayNameUtils';

const MobilePickEmsSeasonStandings = ({
  season,
  currentWeek,
  seasonStandings = [],
  seasonPicks = [],
  loading = false,
  resultsAvailable = false,
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  const formatAccuracy = (accuracy) => {
    return `${accuracy?.toFixed(1) || '0.0'}%`;
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy className="h-4 w-4 text-yellow-500" />;
    if (rank === 2) return <Award className="h-4 w-4 text-gray-400" />;
    if (rank === 3) return <Award className="h-4 w-4 text-amber-600" />;
    return null;
  };

  const getRankColor = (rank) => {
    if (rank === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (rank <= 3) return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  // Calculate team pick frequency for season-long analysis
  const calculateTeamPickFrequency = () => {
    const teamStats = {};
    
    seasonPicks.forEach(pick => {
      // Count picks for the picked team
      const pickedTeamId = pick.pickedTeamId;
      const pickedTeam = { id: pickedTeamId, name: pick.pickedTeamName };
      const pickedTeamName = getMaskedTeamName(pickedTeam, user, isAdmin);
      
      if (pickedTeamId && pickedTeamName) {
        if (!teamStats[pickedTeamId]) {
          teamStats[pickedTeamId] = {
            teamId: pickedTeamId,
            teamName: pickedTeamName,
            timesPicked: 0,
            timesCorrect: 0,
            totalMatchups: 0
          };
        }
        teamStats[pickedTeamId].timesPicked++;
        if (pick.isCorrect) {
          teamStats[pickedTeamId].timesCorrect++;
        }
      }

      // Count total matchups for both teams
      [pick.team1Id, pick.team2Id].forEach((teamId, idx) => {
        const originalTeamName = idx === 0 ? pick.team1Name : pick.team2Name;
        const team = { id: teamId, name: originalTeamName };
        const teamName = getMaskedTeamName(team, user, isAdmin, teamOwnerNames);
        if (teamId && teamName) {
          if (!teamStats[teamId]) {
            teamStats[teamId] = {
              teamId: teamId,
              teamName: teamName,
              timesPicked: 0,
              timesCorrect: 0,
              totalMatchups: 0
            };
          }
          teamStats[teamId].totalMatchups++;
        }
      });
    });

    // Convert to array and calculate percentages
    return Object.values(teamStats)
      .map(team => ({
        ...team,
        pickRate: team.totalMatchups > 0 ? (team.timesPicked / team.totalMatchups) * 100 : 0,
        winRate: team.timesPicked > 0 ? (team.timesCorrect / team.timesPicked) * 100 : 0
      }))
      .sort((a, b) => b.timesPicked - a.timesPicked);
  };

  const teamPickFrequency = calculateTeamPickFrequency();

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading standings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="h-5 w-5 text-yellow-600" />
          <h2 className="text-lg font-semibold text-gray-900">Season Standings</h2>
        </div>
        <p className="text-gray-600 text-sm">
          Overall performance across all completed weeks
        </p>
      </div>

      {/* Season Standings */}
      {seasonStandings.length === 0 ? (
        <div className="text-center py-8">
          <Trophy className="h-10 w-10 mx-auto text-gray-400 mb-3" />
          <h3 className="font-semibold text-gray-900 mb-1">No Season Standings</h3>
          <p className="text-gray-600 text-sm">
            Season standings will appear as weeks are completed.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Season-Long Standings</h3>
          {!resultsAvailable && currentWeek && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-200">
                <span className="font-medium">Note:</span> These standings do not include Week {currentWeek} results, as games are still in progress or results haven't been finalized yet.
              </p>
            </div>
          )}
          <div className="space-y-3">
            {seasonStandings.map((standing, index) => (
              <div
                key={standing.id || index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {getRankIcon(standing.seasonRank)}
                    <div className={`px-2 py-1 rounded-full border text-xs font-medium ${getRankColor(standing.seasonRank)}`}>
                      #{standing.seasonRank}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {getMaskedUserName(standing.displayName, standing.userId, user, isAdmin, teamOwnerNames)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{standing.totalCorrectPicks}/{standing.totalPicks}</span>
                      <span>{standing.totalWeeksParticipated} weeks</span>
                      {standing.perfectWeeks > 0 && (
                        <span className="flex items-center gap-1">
                          <Trophy className="h-3 w-3" />
                          {standing.perfectWeeks}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-gray-900">{standing.totalPoints} pts</div>
                  <div className="text-xs text-gray-500">
                    {formatAccuracy(standing.overallAccuracyPercentage)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Pick Frequency */}
      {teamPickFrequency.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Team Pick Popularity</h3>
          </div>
          <p className="text-xs text-gray-600 mb-4">
            How often each team is picked to win across all matchups
          </p>
          <div className="space-y-2">
            {teamPickFrequency.map((team, index) => (
              <div
                key={team.teamId}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 text-sm truncate">{team.teamName}</div>
                    <div className="text-xs text-gray-500">
                      {team.timesPicked} picks in {team.totalMatchups} matchups
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 ml-2">
                  <div className="text-center min-w-[60px]">
                    <div className="flex items-center justify-center h-5">
                      <span className="font-semibold text-gray-900 text-sm">{team.pickRate.toFixed(1)}%</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      pick rate
                    </div>
                  </div>
                  {team.timesPicked > 0 && (
                    <div className="text-center min-w-[60px]">
                      <div className="flex items-center justify-center h-5">
                        <span className={`font-semibold text-sm ${
                          team.winRate >= 50 
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`}>
                          {team.winRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        win rate
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Legend */}
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-2 text-xs text-gray-600">
            <div className="flex items-start gap-2">
              <span className="font-semibold min-w-[70px]">Pick Rate:</span>
              <span>% of times this team was picked to win out of their total matchups</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold min-w-[70px]">Win Rate:</span>
              <span>% of times this team actually won when picked by users</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobilePickEmsSeasonStandings;

