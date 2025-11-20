import React, { useState, useEffect } from 'react';
import { Medal, Trophy, TrendingUp, TrendingDown, Target, Zap } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { useLeagueHistory } from '../../../hooks/useLeagueHistory';
import { getMaskedFranchiseName, canViewFullData } from '../utils/privacyHelpers';
import { formatPoints } from '../utils/statFormatters';

const RecordBook = ({
  franchises = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onViewFranchise = () => {}
}) => {
  const { getSingleSeasonRecords, getAllTimeLeaderboard, loading } = useLeagueHistory();
  const [singleSeasonRecords, setSingleSeasonRecords] = useState({});
  const [allTimeLeaders, setAllTimeLeaders] = useState({});
  const [activeTab, setActiveTab] = useState('season');

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      const [seasonRecords, winsLeaders, pointsLeaders, chipsLeaders] = await Promise.all([
        getSingleSeasonRecords(),
        getAllTimeLeaderboard('wins', 5),
        getAllTimeLeaderboard('points', 5),
        getAllTimeLeaderboard('championships', 5)
      ]);

      setSingleSeasonRecords(seasonRecords || {});
      setAllTimeLeaders({
        wins: winsLeaders || [],
        points: pointsLeaders || [],
        championships: chipsLeaders || []
      });
    };
    loadData();
  }, [getSingleSeasonRecords, getAllTimeLeaderboard]);

  // Get display name with masking
  const getDisplayName = (ownerName) => {
    const franchise = franchises.find(f => f.owner_name === ownerName);
    if (!franchise) return ownerName;
    return getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames);
  };

  // Get masked team name
  const getMaskedTeamName = (ownerName, teamName) => {
    if (canViewFullData(user, isAdmin, teamOwnerNames)) {
      return teamName;
    }
    const franchise = franchises.find(f => f.owner_name === ownerName);
    if (!franchise) return 'Unknown Team';
    return `Team ${franchise.id?.substring(0, 8) || 'Unknown'}`;
  };

  // Record card component
  const RecordCard = ({ title, icon: Icon, record, isNegative = false }) => {
    if (!record) return null;

    return (
      <div className={`p-4 rounded-lg border ${isNegative ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`h-4 w-4 ${isNegative ? 'text-red-600' : 'text-green-600'}`} />
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <div className="space-y-1">
          <p className="text-lg font-bold">{record.value}</p>
          <p className="text-sm text-muted-foreground">
            {getDisplayName(record.ownerName)}
          </p>
          <p className="text-xs text-muted-foreground">
            {getMaskedTeamName(record.ownerName, record.teamName)} ({record.year})
          </p>
        </div>
      </div>
    );
  };

  // Leaderboard component
  const LeaderboardList = ({ title, icon: Icon, leaders, statKey }) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {leaders.length > 0 ? (
          <div className="space-y-2">
            {leaders.map((leader, index) => (
              <div
                key={leader.franchiseId}
                className={`flex items-center justify-between p-2 rounded ${
                  index === 0 ? 'bg-amber-50' : 'bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`font-bold ${index === 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                    #{index + 1}
                  </span>
                  <div>
                    <p className="font-medium text-sm">
                      {getDisplayName(leader.ownerName)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {leader.record}
                    </p>
                  </div>
                </div>
                <Badge variant={index === 0 ? 'default' : 'secondary'}>
                  {statKey === 'points'
                    ? formatPoints(leader.value)
                    : leader.value}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-4 text-sm">
            No data available
          </p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Medal className="h-5 w-5" />
            League Record Book
          </CardTitle>
          <CardDescription>
            All-time records and achievements across league history
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="season">Single Season Records</TabsTrigger>
          <TabsTrigger value="alltime">All-Time Leaders</TabsTrigger>
        </TabsList>

        {/* Single Season Records */}
        <TabsContent value="season" className="space-y-6">
          {/* Positive records */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Best Performances
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <RecordCard
                  title="Most Wins"
                  icon={Trophy}
                  record={singleSeasonRecords.mostWins}
                />
                <RecordCard
                  title="Most Points"
                  icon={Zap}
                  record={singleSeasonRecords.mostPoints}
                />
                <RecordCard
                  title="Best Point Differential"
                  icon={TrendingUp}
                  record={singleSeasonRecords.bestPointDiff}
                />
                <RecordCard
                  title="Fewest Losses"
                  icon={Target}
                  record={singleSeasonRecords.fewestLosses}
                />
              </div>
            </CardContent>
          </Card>

          {/* Dubious records */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600" />
                Dubious Honors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RecordCard
                  title="Fewest Points"
                  icon={TrendingDown}
                  record={singleSeasonRecords.fewestPoints}
                  isNegative
                />
                <RecordCard
                  title="Worst Point Differential"
                  icon={TrendingDown}
                  record={singleSeasonRecords.worstPointDiff}
                  isNegative
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* All-Time Leaders */}
        <TabsContent value="alltime" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <LeaderboardList
              title="Most Championships"
              icon={Trophy}
              leaders={allTimeLeaders.championships || []}
              statKey="championships"
            />
            <LeaderboardList
              title="Most Wins"
              icon={Target}
              leaders={allTimeLeaders.wins || []}
              statKey="wins"
            />
            <LeaderboardList
              title="Most Points"
              icon={Zap}
              leaders={allTimeLeaders.points || []}
              statKey="points"
            />
          </div>

          <p className="text-xs text-muted-foreground text-center">
            All-time statistics are calculated across all seasons in league history.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RecordBook;
