import React, { useMemo, useState } from 'react';
import { TrendingUp, Target, Zap, Award, BarChart3, Users } from 'lucide-react';
import { getMaskedTeamName } from '../../utils/displayNameUtils';
import {
  calculateScoreDistribution,
  calculateWeeklyScoringTrends,
  calculateMarginOfVictory,
  calculateRankingMovement,
  calculateAllPlayRecords,
  calculatePointsPerGame
} from '../../utils/chartCalculations';
import ScoreDistributionChart from '../statistics/charts/ScoreDistributionChart';
import WeeklyScoringTrendsChart from '../statistics/charts/WeeklyScoringTrendsChart';
import MarginOfVictoryChart from '../statistics/charts/MarginOfVictoryChart';
import RankingsMovementChart from '../statistics/charts/RankingsMovementChart';
import AllPlayRecordsChart from '../statistics/charts/AllPlayRecordsChart';
import PointsPerGameChart from '../statistics/charts/PointsPerGameChart';
import FloatingTeamFilter from '../ui/FloatingTeamFilter';
import { useViewer } from '../../contexts/ViewerContext.jsx';

const StatisticsPanel = ({ rankings = [], currentWeek = 1, season = null }) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  // State management for chart filtering
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [minWeek, setMinWeek] = useState(1);
  const [maxWeek, setMaxWeek] = useState(currentWeek);

  // Calculate chart data
  const chartData = useMemo(() => {
    if (!season || !rankings.length) return {};

    return {
      scoreDistribution: calculateScoreDistribution(rankings, season.schedule || []),
      weeklyScoringTrends: calculateWeeklyScoringTrends(rankings, season.schedule || []),
      marginOfVictory: calculateMarginOfVictory(rankings, season.schedule || []),
      rankingMovement: [], // Will be calculated in component
      allPlayRecords: calculateAllPlayRecords(rankings, season.schedule || []),
      pointsPerGame: calculatePointsPerGame(rankings, season.schedule || [], minWeek, maxWeek)
    };
  }, [rankings, season, minWeek, maxWeek]);

  // Handle team selection toggle
  const toggleTeamSelection = (teamId) => {
    setSelectedTeams(prev =>
      prev.includes(teamId)
        ? prev.filter(id => id !== teamId)
        : [...prev, teamId]
    );
  };

  // Handle select all/deselect all
  const toggleAllTeams = () => {
    if (selectedTeams.length === rankings.length) {
      setSelectedTeams([]);
    } else {
      setSelectedTeams(rankings.map(r => r.id));
    }
  };

  // New algorithm insights - moved before early return
  // COMMENTED OUT: Power ranking algorithm insights hidden from view
  /*
  const algorithmInsights = useMemo(() => {
    if (!rankings.length || !rankings[0]?.powerRatingComponents) return null;

    const activeRankings = rankings.filter(team => team.gamesPlayed > 0);
    const teamsWithComponents = activeRankings.filter(team => team.powerRatingComponents);
    if (teamsWithComponents.length === 0) return null;

    // Calculate component averages
    const componentAvgs = {
      performanceScore: 0,
      teamStrength: 0,
      strengthOfSchedule: 0,
      momentumScore: 0,
      consistencyScore: 0,
      clutchScore: 0
    };

    teamsWithComponents.forEach(team => {
      Object.keys(componentAvgs).forEach(key => {
        componentAvgs[key] += team.powerRatingComponents[key] || 0;
      });
    });

    Object.keys(componentAvgs).forEach(key => {
      componentAvgs[key] = componentAvgs[key] / teamsWithComponents.length;
    });

    // Find extremes
    const strongestComponent = Object.entries(componentAvgs).reduce(
      (max, [key, value]) => value > max.value ? { key, value } : max,
      { key: '', value: 0 }
    );

    const weakestComponent = Object.entries(componentAvgs).reduce(
      (min, [key, value]) => value < min.value ? { key, value } : min,
      { key: '', value: 100 }
    );

    return {
      componentAvgs,
      strongestComponent,
      weakestComponent,
      teamsAnalyzed: teamsWithComponents.length
    };
  }, [rankings]);
  */
  const algorithmInsights = null; // Disabled algorithm insights

  if (!rankings || !Array.isArray(rankings) || rankings.length === 0 || !season) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <BarChart3 size={48} className="mx-auto mb-4 text-muted-foreground" />
        <p>No statistics available. Add teams and complete games to see analytics.</p>
      </div>
    );
  }
  
  // Filter out teams with no games played for more accurate statistics
  const activeRankings = rankings.filter(team => team.gamesPlayed > 0);
  const hasActiveTeams = activeRankings.length > 0;

  // Calculate league-wide statistics using active teams only
  const leagueStats = {
    totalGames: hasActiveTeams ? activeRankings.reduce((sum, team) => sum + (team.gamesPlayed || 0), 0) / 2 : 0, // Divide by 2 since each game involves 2 teams
    averageWinPercentage: hasActiveTeams ? activeRankings.reduce((sum, team) => sum + (team.winPercentage || 0), 0) / activeRankings.length : 0,
    averagePointsFor: hasActiveTeams ? activeRankings.reduce((sum, team) => sum + (team.averagePointsFor || 0), 0) / activeRankings.length : 0,
    averagePointsAgainst: hasActiveTeams ? activeRankings.reduce((sum, team) => sum + (team.averagePointsAgainst || 0), 0) / activeRankings.length : 0,
    totalPoints: activeRankings.reduce((sum, team) => sum + (team.pointsFor || 0), 0),
    powerRatingRange: activeRankings.length > 0 ? (activeRankings[0]?.powerRating || 0) - (activeRankings[activeRankings.length - 1]?.powerRating || 0) : 0
  };

  // Find notable teams/records (use active teams only)
  const workingRankings = hasActiveTeams ? activeRankings : rankings;
  
  const highestScoringTeam = workingRankings.length > 0 ? workingRankings.reduce((highest, team) => 
    (team.averagePointsFor || 0) > (highest.averagePointsFor || 0) ? team : highest, workingRankings[0]
  ) : null;

  const lowestScoringTeam = workingRankings.length > 0 ? workingRankings.reduce((lowest, team) => 
    (team.averagePointsFor || 0) < (lowest.averagePointsFor || 0) ? team : lowest, workingRankings[0]
  ) : null;

  const bestDefense = workingRankings.length > 0 ? workingRankings.reduce((best, team) => 
    (team.averagePointsAgainst || 0) < (best.averagePointsAgainst || 0) ? team : best, workingRankings[0]
  ) : null;

  const worstDefense = workingRankings.length > 0 ? workingRankings.reduce((worst, team) => 
    (team.averagePointsAgainst || 0) > (worst.averagePointsAgainst || 0) ? team : worst, workingRankings[0]
  ) : null;

  const mostBlowouts = workingRankings.length > 0 ? workingRankings.reduce((most, team) => 
    (team.blowoutWins || 0) > (most.blowoutWins || 0) ? team : most, workingRankings[0]
  ) : null;

  const luckiestTeam = workingRankings.length > 0 ? workingRankings.reduce((luckiest, team) => {
    const teamLuck = (team.winPercentage || 0) - ((team.powerRating || 0) / 100);
    const luckiestLuck = (luckiest.winPercentage || 0) - ((luckiest.powerRating || 0) / 100);
    return teamLuck > luckiestLuck ? team : luckiest;
  }, workingRankings[0]) : null;

  const unluckiestTeam = workingRankings.length > 0 ? workingRankings.reduce((unluckiest, team) => {
    const teamLuck = (team.winPercentage || 0) - ((team.powerRating || 0) / 100);
    const unluckiestLuck = (unluckiest.winPercentage || 0) - ((unluckiest.powerRating || 0) / 100);
    return teamLuck < unluckiestLuck ? team : unluckiest;
  }, workingRankings[0]) : null;

  // Calculate strength of schedule leaders
  const toughestSchedule = workingRankings.length > 0 ? workingRankings.reduce((toughest, team) => 
    (team.strengthOfSchedule || 0) > (toughest.strengthOfSchedule || 0) ? team : toughest, workingRankings[0]
  ) : null;

  const easiestSchedule = workingRankings.length > 0 ? workingRankings.reduce((easiest, team) => 
    (team.strengthOfSchedule || 0) < (easiest.strengthOfSchedule || 0) ? team : easiest, workingRankings[0]
  ) : null;


  const StatCard = ({ title, value, subtitle, icon: Icon, color = 'blue' }) => (
    <div className={`bg-${color}-50 p-4 rounded-lg border border-${color}-200`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`text-${color}-600`} size={20} />
        <span className={`text-${color}-600 text-sm font-medium`}>{title}</span>
      </div>
      <div className={`text-2xl font-bold text-foreground`}>{value}</div>
      {subtitle && <div className={`text-${color}-700 text-sm mt-1`}>{subtitle}</div>}
    </div>
  );

  const TeamHighlight = ({ title, team, stat, description, color = 'gray', teamOwnerNames = [] }) => {
    if (!team) {
      return (
        <div className={`bg-muted p-3 rounded-lg border border-border`}>
          <div className={`text-foreground font-medium text-sm mb-1`}>{title}</div>
          <div className={`text-foreground font-bold`}>No Data</div>
          <div className={`text-muted-foreground text-sm`}>Complete games to see stats</div>
        </div>
      );
    }
    
    return (
      <div className={`bg-${color}-50 p-3 rounded-lg border border-${color}-200`}>
        <div className={`text-${color}-700 font-medium text-sm mb-1`}>{title}</div>
        <div className={`text-foreground font-bold`}>{getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}</div>
        <div className={`text-${color}-600 text-sm`}>{stat}</div>
        {description && <div className={`text-${color}-500 text-xs mt-1`}>{description}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* League Overview */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <BarChart3 className="text-blue-600" size={20} />
          League Overview - Week {currentWeek}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Total Games"
            value={Math.floor(leagueStats.totalGames)}
            subtitle="Completed"
            icon={Target}
            color="blue"
          />
          <StatCard
            title="League PPG"
            value={leagueStats.averagePointsFor.toFixed(2)}
            subtitle="Average scoring"
            icon={Zap}
            color="orange"
            teamOwnerNames={teamOwnerNames}
          />
          <StatCard
            title="Power Range"
            value={Math.abs(leagueStats.powerRatingRange).toFixed(2)}
            subtitle="Rating spread"
            icon={Award}
            color="purple"
            teamOwnerNames={teamOwnerNames}
          />
        </div>
      </div>

      {/* Offensive Leaders */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Zap className="text-orange-600" size={20} />
          Offensive Leaders
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TeamHighlight
            title="Highest Scoring"
            team={highestScoringTeam}
            stat={`${(highestScoringTeam?.averagePointsFor || 0).toFixed(2)} PPG`}
            description={`${(highestScoringTeam?.pointsFor || 0).toFixed(2)} total points in ${highestScoringTeam?.gamesPlayed || 0} games`}
            color="orange"
            teamOwnerNames={teamOwnerNames}
          />
          <TeamHighlight
            title="Lowest Scoring"
            team={lowestScoringTeam}
            stat={`${(lowestScoringTeam?.averagePointsFor || 0).toFixed(2)} PPG`}
            description={`${(lowestScoringTeam?.pointsFor || 0).toFixed(2)} total points in ${lowestScoringTeam?.gamesPlayed || 0} games`}
            color="blue"
            teamOwnerNames={teamOwnerNames}
          />
        </div>
      </div>

      {/* Defensive Leaders */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Target className="text-blue-600" size={20} />
          Defensive Leaders
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TeamHighlight
            title="Best Defense"
            team={bestDefense}
            stat={`${(bestDefense?.averagePointsAgainst || 0).toFixed(2)} PA/G`}
            description={`Allows ${(bestDefense?.pointsAgainst || 0).toFixed(2)} total points`}
            color="green"
            teamOwnerNames={teamOwnerNames}
          />
          <TeamHighlight
            title="Worst Defense"
            team={worstDefense}
            stat={`${(worstDefense?.averagePointsAgainst || 0).toFixed(2)} PA/G`}
            description={`Allows ${(worstDefense?.pointsAgainst || 0).toFixed(2)} total points`}
            color="red"
            teamOwnerNames={teamOwnerNames}
          />
        </div>
      </div>

      {/* Performance Analysis */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="text-purple-600" size={20} />
          Performance Analysis
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TeamHighlight
            title="Most Dominant"
            team={mostBlowouts}
            stat={`${mostBlowouts?.blowoutWins || 0} blowout wins`}
            description="Wins by 30+ points"
            color="purple"
            teamOwnerNames={teamOwnerNames}
          />
          <TeamHighlight
            title="Luckiest Team"
            team={luckiestTeam}
            stat={`${((luckiestTeam?.winPercentage || 0) * 100).toFixed(2)}% win rate`}
            description="Performing above power rating"
            color="green"
            teamOwnerNames={teamOwnerNames}
          />
          <TeamHighlight
            title="Unluckiest Team"
            team={unluckiestTeam}
            stat={`${((unluckiestTeam?.winPercentage || 0) * 100).toFixed(2)}% win rate`}
            description="Performing below power rating"
            color="red"
            teamOwnerNames={teamOwnerNames}
          />
        </div>
      </div>

      {/* Strength of Schedule - COMMENTED OUT/HIDDEN */}
      {/*
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Users className="text-muted-foreground" size={20} />
          Strength of Schedule
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TeamHighlight
            title="Toughest Schedule"
            team={toughestSchedule}
            stat={`+${((toughestSchedule?.strengthOfSchedule || 0) * 100).toFixed(2)}% SOS`}
            description={`Faced opponents with ${((toughestSchedule?.opponentWinPercentage || 0) * 100).toFixed(2)}% win rate`}
            color="red"
            teamOwnerNames={teamOwnerNames}
          />
          <TeamHighlight
            title="Easiest Schedule"
            team={easiestSchedule}
            stat={`${((easiestSchedule?.strengthOfSchedule || 0) * 100).toFixed(2)}% SOS`}
            description={`Faced opponents with ${((easiestSchedule?.opponentWinPercentage || 0) * 100).toFixed(2)}% win rate`}
            color="green"
            teamOwnerNames={teamOwnerNames}
          />
        </div>
      </div>
      */}


      {/* Algorithm Insights - COMMENTED OUT/HIDDEN */}
      {/*
      {algorithmInsights && (
        <div>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="text-purple-600" size={20} />
            Power Rankings Algorithm Insights
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border rounded-lg p-4">
              <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Component Analysis
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Strongest League Component:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {algorithmInsights.strongestComponent.key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </span>
                    <span className="text-green-600 font-bold">{algorithmInsights.strongestComponent.value.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Area for Improvement:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {algorithmInsights.weakestComponent.key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </span>
                    <span className="text-orange-600 font-bold">{algorithmInsights.weakestComponent.value.toFixed(2)}</span>
                  </div>
                </div>
                <div className="pt-2 border-t text-xs text-muted-foreground">
                  Analysis based on {algorithmInsights.teamsAnalyzed} teams with complete data
                </div>
              </div>
            </div>

            <div className="bg-card border rounded-lg p-4">
              <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Award className="h-4 w-4 text-purple-600" />
                Component Averages
              </h4>
              <div className="space-y-2">
                {Object.entries(algorithmInsights.componentAvgs).map(([key, value]) => {
                  const labels = {
                    performanceScore: 'Performance (25%)',
                    teamStrength: 'Team Strength (20%)',
                    strengthOfSchedule: 'Schedule (15%)',
                    momentumScore: 'Momentum (15%)',
                    consistencyScore: 'Consistency (15%)',
                    clutchScore: 'Clutch (5%)'
                  };

                  const colors = {
                    performanceScore: 'text-blue-600',
                    teamStrength: 'text-green-600',
                    strengthOfSchedule: 'text-orange-600',
                    momentumScore: 'text-purple-600',
                    consistencyScore: 'text-indigo-600',
                    clutchScore: 'text-amber-600'
                  };

                  return (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className={`text-xs ${colors[key]}`}>{labels[key]}</span>
                      <span className={`font-mono font-semibold ${colors[key]}`}>{value.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start gap-2">
              <BarChart3 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-blue-900 mb-1">Algorithm Insights for Week {currentWeek}</div>
                <div className="text-blue-700 space-y-1">
                  {algorithmInsights.strongestComponent.value > 70 && (
                    <div>• <strong>League Strength:</strong> The league shows strong {algorithmInsights.strongestComponent.key.replace(/([A-Z])/g, ' $1').toLowerCase()} overall</div>
                  )}
                  {algorithmInsights.weakestComponent.value < 50 && (
                    <div>• <strong>Room for Growth:</strong> Teams could improve their {algorithmInsights.weakestComponent.key.replace(/([A-Z])/g, ' $1').toLowerCase()}</div>
                  )}
                  <div>• <strong>Statistical Depth:</strong> Advanced rankings now consider {Object.keys(algorithmInsights.componentAvgs).length} distinct performance factors</div>
                  <div>• <strong>Accuracy:</strong> New algorithm provides more comprehensive team evaluation than traditional win/loss records</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      */}

      {/* Chart Filtering Controls */}
      <div className="mt-8 pt-6 border-t border-border">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <BarChart3 className="text-blue-600" size={20} />
          Advanced Analytics
        </h3>

        {/* Week Range Filter */}
        <div className="mb-6 p-4 bg-muted rounded-lg border border-border">
          <h4 className="font-semibold text-foreground text-sm mb-3">Week Range Filter</h4>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-foreground mb-1">
                Min Week: {minWeek}
              </label>
              <input
                type="range"
                min="1"
                max={currentWeek}
                value={minWeek}
                onChange={(e) => setMinWeek(Math.min(parseInt(e.target.value), maxWeek))}
                className="w-full"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-foreground mb-1">
                Max Week: {maxWeek}
              </label>
              <input
                type="range"
                min="1"
                max={currentWeek}
                value={maxWeek}
                onChange={(e) => setMaxWeek(Math.max(parseInt(e.target.value), minWeek))}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Score Distribution - COMMENTED OUT */}
          {/*
          <div className="bg-card p-4 rounded-lg border border-border">
            <h4 className="text-base font-semibold text-foreground mb-4">
              Score Distribution (Min/Q1/Avg/Q3/Max)
            </h4>
            <ScoreDistributionChart
              data={chartData.scoreDistribution}
              selectedTeams={selectedTeams}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          </div>
          */}

          {/* Weekly Scoring Trends */}
          <div className="bg-card p-4 rounded-lg border border-border">
            <h4 className="text-base font-semibold text-foreground mb-4">
              Weekly Scoring Trends
            </h4>
            <WeeklyScoringTrendsChart
              data={chartData.weeklyScoringTrends}
              rankings={rankings}
              selectedTeams={selectedTeams}
              minWeek={minWeek}
              maxWeek={maxWeek}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          </div>

          {/* Points Per Game */}
          <div className="bg-card p-4 rounded-lg border border-border">
            <h4 className="text-base font-semibold text-foreground mb-4">
              Points Per Game
            </h4>
            <PointsPerGameChart
              data={chartData.pointsPerGame}
              selectedTeams={selectedTeams}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          </div>

          {/* Margin of Victory */}
          <div className="bg-card p-4 rounded-lg border border-border">
            <h4 className="text-base font-semibold text-foreground mb-4">
              Average Margin of Victory
            </h4>
            <MarginOfVictoryChart
              data={chartData.marginOfVictory}
              selectedTeams={selectedTeams}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          </div>

          {/* All-Play Records */}
          <div className="bg-card p-4 rounded-lg border border-border">
            <h4 className="text-base font-semibold text-foreground mb-4">
              All-Play Records (vs Median Score)
            </h4>
            <AllPlayRecordsChart
              data={chartData.allPlayRecords}
              selectedTeams={selectedTeams}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          </div>
        </div>

        {/* Rankings Movement - COMMENTED OUT FOR NOW */}
        {/*
        <div className="mb-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Users className="text-purple-600" size={20} />
            League-Wide Comparisons
          </h3>
          <div className="space-y-6">
            <div className="bg-card p-4 rounded-lg border border-border">
              <h4 className="text-base font-semibold text-foreground mb-4">
                Power Rankings Movement
              </h4>
              <RankingsMovementChart
                data={chartData.rankingMovement}
                teams={rankings}
                games={season?.schedule || []}
                rankings={rankings}
                selectedTeams={selectedTeams}
                minWeek={Math.max(2, minWeek)}
                maxWeek={maxWeek}
                user={user}
                isAdmin={isAdmin}
                players={season?.players || []}
                divisions={season?.divisions || []}
                regularSeasonWeeks={season?.regularSeasonWeeks || 14}
                currentWeek={currentWeek}
                teamOwnerNames={teamOwnerNames}
              />
            </div>
          </div>
        </div>
        */}
      </div>

      {/* Floating Team Filter */}
      <FloatingTeamFilter
        rankings={rankings}
        selectedTeams={selectedTeams}
        onToggleTeam={toggleTeamSelection}
        onToggleAllTeams={toggleAllTeams}
        user={user}
        isAdmin={isAdmin}
        teamOwnerNames={teamOwnerNames}
      />
    </div>
  );
};

export default StatisticsPanel;