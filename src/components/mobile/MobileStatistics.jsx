import React, { useMemo } from 'react';
import {
  TrendingUp,
  Target,
  Zap,
  Award,
  BarChart3,
  Users,
  Trophy,
  Shield,
  Activity,
  Star,
  TrendingDown,
  Crown
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { getMaskedTeamName } from '../../utils/displayNameUtils';

/**
 * Statistics component
 * Single scrollable page with all statistics sections
 */
const MobileStatistics = ({ rankings = [], currentWeek = 1, season = null, user = null, isAdmin = false }) => {

  // Calculate statistics (same logic as desktop but optimized for mobile display)
  const statistics = useMemo(() => {
    if (!rankings.length || !season) {
      return null;
    }

    const activeRankings = rankings.filter(team => team.gamesPlayed > 0);
    const hasActiveTeams = activeRankings.length > 0;
    const workingRankings = hasActiveTeams ? activeRankings : rankings;

    // League-wide statistics
    const leagueStats = {
      totalGames: hasActiveTeams ? activeRankings.reduce((sum, team) => sum + (team.gamesPlayed || 0), 0) / 2 : 0,
      averageWinPercentage: hasActiveTeams ? activeRankings.reduce((sum, team) => sum + (team.winPercentage || 0), 0) / activeRankings.length : 0,
      averagePointsFor: hasActiveTeams ? activeRankings.reduce((sum, team) => sum + (team.averagePointsFor || 0), 0) / activeRankings.length : 0,
      averagePointsAgainst: hasActiveTeams ? activeRankings.reduce((sum, team) => sum + (team.averagePointsAgainst || 0), 0) / activeRankings.length : 0,
      totalPoints: activeRankings.reduce((sum, team) => sum + (team.pointsFor || 0), 0),
      powerRatingRange: activeRankings.length > 0 ? (activeRankings[0]?.powerRating || 0) - (activeRankings[activeRankings.length - 1]?.powerRating || 0) : 0
    };

    // Find notable teams
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

    const toughestSchedule = workingRankings.length > 0 ? workingRankings.reduce((toughest, team) => 
      (team.strengthOfSchedule || 0) > (toughest.strengthOfSchedule || 0) ? team : toughest, workingRankings[0]
    ) : null;

    const easiestSchedule = workingRankings.length > 0 ? workingRankings.reduce((easiest, team) => 
      (team.strengthOfSchedule || 0) < (easiest.strengthOfSchedule || 0) ? team : easiest, workingRankings[0]
    ) : null;

    return {
      leagueStats,
      highestScoringTeam,
      lowestScoringTeam,
      bestDefense,
      worstDefense,
      mostBlowouts,
      luckiestTeam,
      unluckiestTeam,
      toughestSchedule,
      easiestSchedule,
      workingRankings
    };
  }, [rankings, season]);

  // stat card component
  const MobileStatCard = ({ title, value, subtitle, icon: Icon, color = 'blue', size = 'normal' }) => (
    <Card className={`${size === 'large' ? 'col-span-2' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-sm text-muted-foreground">{title}</h4>
          <Icon className={`h-4 w-4 text-${color}-600`} />
        </div>
        <div className={`font-bold ${color === 'blue' || color === 'orange' || color === 'purple' ? 'text-white' : `text-${color}-900`} ${size === 'large' ? 'text-3xl' : 'text-xl'}`}>
          {value}
        </div>
        {subtitle && (
          <p className={`text-${color}-700 text-sm mt-1`}>{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );

  // team highlight component
  const MobileTeamHighlight = ({ title, team, stat, description, color = 'gray', icon: Icon }) => {
    if (!team) {
      return (
        <Card>
          <CardContent className="p-4 text-center">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              {Icon && <Icon className="h-6 w-6 text-muted-foreground" />}
            </div>
            <h4 className="font-medium text-sm text-muted-foreground mb-1">{title}</h4>
            <p className="text-lg font-bold text-muted-foreground">No Data</p>
            <p className="text-xs text-muted-foreground">Complete games to see stats</p>
          </CardContent>
        </Card>
      );
    }
    
    return (
      <Card className={`border-${color}-200 bg-${color}-50/50`}>
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            {Icon && (
              <div className={`w-10 h-10 bg-${color}-100 rounded-full flex items-center justify-center flex-shrink-0`}>
                <Icon className={`h-5 w-5 text-${color}-600`} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h4 className={`font-medium text-sm text-${color}-700 mb-1`}>{title}</h4>
              <p className={`font-bold text-lg text-white truncate`}>{getMaskedTeamName(team, user, isAdmin)}</p>
              <p className={`text-${color}-600 text-sm font-medium`}>{stat}</p>
              {description && (
                <p className={`text-${color}-500 text-xs mt-1`}>{description}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!statistics) {
    return (
      <Card className="p-8">
        <CardContent className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">No Statistics Available</h3>
            <p className="text-muted-foreground text-sm">
              Add teams and complete games to see analytics.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Section header component for visual separation
  const SectionHeader = ({ title, icon: Icon }) => (
    <div className="flex items-center space-x-2 mb-4 mt-6 first:mt-0">
      <Icon className="h-5 w-5 text-primary" />
      <h2 className="text-lg font-semibold text-primary">{title}</h2>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* League Overview */}
      <div>
        <SectionHeader title="League Overview" icon={BarChart3} />
        <div className="grid grid-cols-2 gap-4">
          <MobileStatCard
            title="Total Games"
            value={Math.floor(statistics.leagueStats.totalGames)}
            subtitle="Completed"
            icon={Target}
            color="blue"
          />
          <MobileStatCard
            title="League PPG"
            value={statistics.leagueStats.averagePointsFor.toFixed(1)}
            subtitle="Average scoring"
            icon={Zap}
            color="orange"
          />
          <MobileStatCard
            title="Power Range"
            value={Math.abs(statistics.leagueStats.powerRatingRange).toFixed(1)}
            subtitle="Rating spread"
            icon={Award}
            color="purple"
            size="large"
          />
        </div>
      </div>

      {/* Offensive Leaders */}
      <div>
        <SectionHeader title="Offensive Leaders" icon={Zap} />
        <div className="space-y-4">
          <MobileTeamHighlight
            title="Highest Scoring Team"
            team={statistics.highestScoringTeam}
            stat={`${(statistics.highestScoringTeam?.averagePointsFor || 0).toFixed(1)} PPG`}
            description={`${(statistics.highestScoringTeam?.pointsFor || 0).toFixed(1)} total points in ${statistics.highestScoringTeam?.gamesPlayed || 0} games`}
            color="orange"
            icon={Zap}
          />
          <MobileTeamHighlight
            title="Lowest Scoring Team"
            team={statistics.lowestScoringTeam}
            stat={`${(statistics.lowestScoringTeam?.averagePointsFor || 0).toFixed(1)} PPG`}
            description={`${(statistics.lowestScoringTeam?.pointsFor || 0).toFixed(1)} total points in ${statistics.lowestScoringTeam?.gamesPlayed || 0} games`}
            color="blue"
            icon={TrendingDown}
          />
        </div>
      </div>

      {/* Defensive Leaders */}
      <div>
        <SectionHeader title="Defensive Leaders" icon={Shield} />
        <div className="space-y-4">
          <MobileTeamHighlight
            title="Best Defense"
            team={statistics.bestDefense}
            stat={`${(statistics.bestDefense?.averagePointsAgainst || 0).toFixed(1)} PA/G`}
            description={`Allows ${(statistics.bestDefense?.pointsAgainst || 0).toFixed(1)} total points`}
            color="green"
            icon={Shield}
          />
          <MobileTeamHighlight
            title="Worst Defense"
            team={statistics.worstDefense}
            stat={`${(statistics.worstDefense?.averagePointsAgainst || 0).toFixed(1)} PA/G`}
            description={`Allows ${(statistics.worstDefense?.pointsAgainst || 0).toFixed(1)} total points`}
            color="red"
            icon={Target}
          />
        </div>
      </div>

      {/* Performance Analysis */}
      <div>
        <SectionHeader title="Performance Analysis" icon={TrendingUp} />
        <div className="space-y-4">
          <MobileTeamHighlight
            title="Most Dominant"
            team={statistics.mostBlowouts}
            stat={`${statistics.mostBlowouts?.blowoutWins || 0} blowout wins`}
            description="Wins by 30+ points"
            color="purple"
            icon={Award}
          />
          <MobileTeamHighlight
            title="Luckiest Team"
            team={statistics.luckiestTeam}
            stat={`${((statistics.luckiestTeam?.winPercentage || 0) * 100).toFixed(1)}% win rate`}
            description="Performing above power rating"
            color="green"
            icon={TrendingUp}
          />
          <MobileTeamHighlight
            title="Unluckiest Team"
            team={statistics.unluckiestTeam}
            stat={`${((statistics.unluckiestTeam?.winPercentage || 0) * 100).toFixed(1)}% win rate`}
            description="Performing below power rating"
            color="red"
            icon={TrendingDown}
          />
        </div>
      </div>

      {/* Schedule Analysis */}
      <div>
        <SectionHeader title="Schedule Analysis" icon={Users} />
        <div className="space-y-4">
          <MobileTeamHighlight
            title="Toughest Schedule"
            team={statistics.toughestSchedule}
            stat={`+${((statistics.toughestSchedule?.strengthOfSchedule || 0) * 100).toFixed(1)}% SOS`}
            description={`Faced opponents with ${((statistics.toughestSchedule?.opponentWinPercentage || 0) * 100).toFixed(1)}% win rate`}
            color="red"
            icon={Users}
          />
          <MobileTeamHighlight
            title="Easiest Schedule"
            team={statistics.easiestSchedule}
            stat={`${((statistics.easiestSchedule?.strengthOfSchedule || 0) * 100).toFixed(1)}% SOS`}
            description={`Faced opponents with ${((statistics.easiestSchedule?.opponentWinPercentage || 0) * 100).toFixed(1)}% win rate`}
            color="green"
            icon={Activity}
          />
        </div>
      </div>

      {/* Top Performers */}
      <div>
        <SectionHeader title="Top Performers" icon={Trophy} />
        <div className="space-y-3">
          {statistics.workingRankings.slice(0, 5).map((team, index) => (
            <Card key={team.teamId || team.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                    index === 1 ? 'bg-gray-100 text-gray-800' :
                    index === 2 ? 'bg-orange-100 text-orange-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {index === 0 ? <Crown className="h-5 w-5" /> : index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold truncate text-white">{getMaskedTeamName(team, user, isAdmin)}</h4>
                    <p className="text-sm text-muted-foreground">
                      {team.wins || 0}-{team.losses || 0} • {((team.winPercentage || 0) * 100).toFixed(1)}%
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-lg">{(team.powerRating || 0).toFixed(1)}</div>
                    <div className="text-sm text-muted-foreground">
                      {(team.pointDifferential || 0) >= 0 ? '+' : ''}{(team.pointDifferential || 0).toFixed(1)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MobileStatistics;