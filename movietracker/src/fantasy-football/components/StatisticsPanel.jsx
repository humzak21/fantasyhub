import React from 'react';
import { TrendingUp, Target, Zap, Award, BarChart3, Users } from 'lucide-react';

const StatisticsPanel = ({ rankings = [], currentWeek = 1, season = null }) => {
  if (!rankings.length || !season) {
    return (
      <div className="text-center py-8 text-gray-500">
        <BarChart3 size={48} className="mx-auto mb-4 text-gray-300" />
        <p>No statistics available. Add teams and complete games to see analytics.</p>
      </div>
    );
  }

  // Calculate league-wide statistics
  const leagueStats = {
    totalGames: rankings.reduce((sum, team) => sum + (team.gamesPlayed || 0), 0) / 2, // Divide by 2 since each game involves 2 teams
    averageWinPercentage: rankings.reduce((sum, team) => sum + (team.winPercentage || 0), 0) / rankings.length,
    averagePointsFor: rankings.reduce((sum, team) => sum + (team.averagePointsFor || 0), 0) / rankings.length,
    averagePointsAgainst: rankings.reduce((sum, team) => sum + (team.averagePointsAgainst || 0), 0) / rankings.length,
    totalPoints: rankings.reduce((sum, team) => sum + (team.pointsFor || 0), 0),
    powerRatingRange: rankings.length > 0 ? rankings[0].powerRating - rankings[rankings.length - 1].powerRating : 0
  };

  // Find notable teams/records
  const highestScoringTeam = rankings.reduce((highest, team) => 
    (team.averagePointsFor || 0) > (highest.averagePointsFor || 0) ? team : highest, rankings[0]
  );

  const lowestScoringTeam = rankings.reduce((lowest, team) => 
    (team.averagePointsFor || 0) < (lowest.averagePointsFor || 0) ? team : lowest, rankings[0]
  );

  const bestDefense = rankings.reduce((best, team) => 
    (team.averagePointsAgainst || 0) < (best.averagePointsAgainst || 0) ? team : best, rankings[0]
  );

  const worstDefense = rankings.reduce((worst, team) => 
    (team.averagePointsAgainst || 0) > (worst.averagePointsAgainst || 0) ? team : worst, rankings[0]
  );

  const mostBlowouts = rankings.reduce((most, team) => 
    (team.blowoutWins || 0) > (most.blowoutWins || 0) ? team : most, rankings[0]
  );

  const luckiestTeam = rankings.reduce((luckiest, team) => 
    (team.winPercentage || 0) - ((team.powerRating || 0) / 100) > 
    ((luckiestTeam.winPercentage || 0) - ((luckiestTeam.powerRating || 0) / 100)) ? team : luckiest, rankings[0]
  );

  const unluckiestTeam = rankings.reduce((unluckiest, team) => 
    (team.winPercentage || 0) - ((team.powerRating || 0) / 100) < 
    ((unluckiest.winPercentage || 0) - ((unluckiest.powerRating || 0) / 100)) ? team : unluckiest, rankings[0]
  );

  // Calculate strength of schedule leaders
  const toughestSchedule = rankings.reduce((toughest, team) => 
    (team.strengthOfSchedule || 0) > (toughest.strengthOfSchedule || 0) ? team : toughest, rankings[0]
  );

  const easiestSchedule = rankings.reduce((easiest, team) => 
    (team.strengthOfSchedule || 0) < (easiest.strengthOfSchedule || 0) ? team : easiest, rankings[0]
  );

  const StatCard = ({ title, value, subtitle, icon: Icon, color = 'blue' }) => (
    <div className={`bg-${color}-50 p-4 rounded-lg border border-${color}-200`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`text-${color}-600`} size={20} />
        <span className={`text-${color}-600 text-sm font-medium`}>{title}</span>
      </div>
      <div className={`text-2xl font-bold text-${color}-900`}>{value}</div>
      {subtitle && <div className={`text-${color}-700 text-sm mt-1`}>{subtitle}</div>}
    </div>
  );

  const TeamHighlight = ({ title, team, stat, description, color = 'gray' }) => (
    <div className={`bg-${color}-50 p-3 rounded-lg border border-${color}-200`}>
      <div className={`text-${color}-700 font-medium text-sm mb-1`}>{title}</div>
      <div className={`text-${color}-900 font-bold`}>{team?.name || 'N/A'}</div>
      <div className={`text-${color}-600 text-sm`}>{stat}</div>
      {description && <div className={`text-${color}-500 text-xs mt-1`}>{description}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* League Overview */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <BarChart3 className="text-blue-600" size={20} />
          League Overview - Week {currentWeek}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Games"
            value={Math.floor(leagueStats.totalGames)}
            subtitle="Completed"
            icon={Target}
            color="blue"
          />
          <StatCard
            title="Avg Win %"
            value={`${(leagueStats.averageWinPercentage * 100).toFixed(1)}%`}
            subtitle="League balance"
            icon={TrendingUp}
            color="green"
          />
          <StatCard
            title="League PPG"
            value={leagueStats.averagePointsFor.toFixed(1)}
            subtitle="Average scoring"
            icon={Zap}
            color="orange"
          />
          <StatCard
            title="Power Range"
            value={leagueStats.powerRatingRange.toFixed(1)}
            subtitle="Rating spread"
            icon={Award}
            color="purple"
          />
        </div>
      </div>

      {/* Offensive Leaders */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Zap className="text-orange-600" size={20} />
          Offensive Leaders
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TeamHighlight
            title="🔥 Highest Scoring"
            team={highestScoringTeam}
            stat={`${(highestScoringTeam?.averagePointsFor || 0).toFixed(1)} PPG`}
            description={`${(highestScoringTeam?.pointsFor || 0)} total points in ${highestScoringTeam?.gamesPlayed || 0} games`}
            color="orange"
          />
          <TeamHighlight
            title="❄️ Lowest Scoring"
            team={lowestScoringTeam}
            stat={`${(lowestScoringTeam?.averagePointsFor || 0).toFixed(1)} PPG`}
            description={`${(lowestScoringTeam?.pointsFor || 0)} total points in ${lowestScoringTeam?.gamesPlayed || 0} games`}
            color="blue"
          />
        </div>
      </div>

      {/* Defensive Leaders */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Target className="text-blue-600" size={20} />
          Defensive Leaders
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TeamHighlight
            title="🛡️ Best Defense"
            team={bestDefense}
            stat={`${(bestDefense?.averagePointsAgainst || 0).toFixed(1)} PA/G`}
            description={`Allows ${(bestDefense?.pointsAgainst || 0)} total points`}
            color="green"
          />
          <TeamHighlight
            title="🕳️ Worst Defense"
            team={worstDefense}
            stat={`${(worstDefense?.averagePointsAgainst || 0).toFixed(1)} PA/G`}
            description={`Allows ${(worstDefense?.pointsAgainst || 0)} total points`}
            color="red"
          />
        </div>
      </div>

      {/* Performance Analysis */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="text-purple-600" size={20} />
          Performance Analysis
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <TeamHighlight
            title="💥 Most Dominant"
            team={mostBlowouts}
            stat={`${mostBlowouts?.blowoutWins || 0} blowout wins`}
            description="Wins by 30+ points"
            color="purple"
          />
          <TeamHighlight
            title="🍀 Luckiest Team"
            team={luckiestTeam}
            stat={`${((luckiestTeam?.winPercentage || 0) * 100).toFixed(1)}% win rate`}
            description="Performing above power rating"
            color="green"
          />
          <TeamHighlight
            title="😤 Unluckiest Team"
            team={unluckiestTeam}
            stat={`${((unluckiestTeam?.winPercentage || 0) * 100).toFixed(1)}% win rate`}
            description="Performing below power rating"
            color="red"
          />
        </div>
      </div>

      {/* Strength of Schedule */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Users className="text-gray-600" size={20} />
          Strength of Schedule
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TeamHighlight
            title="⚔️ Toughest Schedule"
            team={toughestSchedule}
            stat={`+${((toughestSchedule?.strengthOfSchedule || 0) * 100).toFixed(1)}% SOS`}
            description={`Faced opponents with ${((toughestSchedule?.opponentWinPercentage || 0) * 100).toFixed(1)}% win rate`}
            color="red"
          />
          <TeamHighlight
            title="🎯 Easiest Schedule"
            team={easiestSchedule}
            stat={`${((easiestSchedule?.strengthOfSchedule || 0) * 100).toFixed(1)}% SOS`}
            description={`Faced opponents with ${((easiestSchedule?.opponentWinPercentage || 0) * 100).toFixed(1)}% win rate`}
            color="green"
          />
        </div>
      </div>

      {/* Top Performers */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Award className="text-yellow-600" size={20} />
          Current Top 5
        </h3>
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="divide-y divide-gray-200">
            {rankings.slice(0, 5).map((team, index) => (
              <div key={team.teamId || team.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                    index === 1 ? 'bg-gray-100 text-gray-800' :
                    index === 2 ? 'bg-orange-100 text-orange-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {index + 1}
                  </span>
                  <div>
                    <div className="font-semibold">{team.name}</div>
                    <div className="text-sm text-gray-600">
                      {team.wins || 0}-{team.losses || 0} • {((team.winPercentage || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">{(team.powerRating || 0).toFixed(1)}</div>
                  <div className="text-sm text-gray-600">
                    {(team.pointDifferential || 0) >= 0 ? '+' : ''}{team.pointDifferential || 0}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Season Progress */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-semibold text-gray-900 mb-3">Season Progress</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Current Week:</span>
            <span className="ml-2 font-medium">{currentWeek}</span>
          </div>
          <div>
            <span className="text-gray-600">Regular Season:</span>
            <span className="ml-2 font-medium">{Math.min(currentWeek, season.regularSeasonWeeks)}/{season.regularSeasonWeeks}</span>
          </div>
          <div>
            <span className="text-gray-600">Teams:</span>
            <span className="ml-2 font-medium">{season.teams.length}/{season.leagueSize}</span>
          </div>
          <div>
            <span className="text-gray-600">Completion:</span>
            <span className="ml-2 font-medium">
              {((Math.min(currentWeek - 1, season.regularSeasonWeeks) / season.regularSeasonWeeks) * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatisticsPanel;