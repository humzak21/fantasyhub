import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Trophy, Award, Star, Target, TrendingUp, Crown, Zap, Settings, PieChart, Vote } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';

// Components (to be created)
import AwardsVoting from './AwardsVoting';
import AwardsResults from './AwardsResults';
import AwardsGallery from './AwardsGallery';
import AwardsAdmin from './AwardsAdmin';

const AwardsManager = ({
  season,
  currentWeek,
  dataManager,
  loading = false,
  isAuthenticated = false,
  isAdmin = false,
  user = null,
  teamOwnerNames = []
}) => {
  const [activeTab, setActiveTab] = useState('voting');
  const [awards, setAwards] = useState([]);
  const [userVotes, setUserVotes] = useState([]);
  const [unlockStatus, setUnlockStatus] = useState({ unique_voters: 0, required_voters: 14, unlocked: false });
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAwardsData = useCallback(async () => {
    if (!season || !dataManager) return;

    setDataLoading(true);
    setError(null);

    try {
      const [awardsData, unlockData] = await Promise.all([
        dataManager.getAwards(season.id),
        dataManager.getAwardsUnlockStatus(season.id)
      ]);

      setAwards(awardsData || []);
      setUnlockStatus(unlockData || { unique_voters: 0, required_voters: 14, unlocked: false });

      if (user) {
        const votesData = await dataManager.getUserVotes(season.id, user.id);
        setUserVotes(votesData || []);
      }
    } catch (err) {
      console.error('Error loading awards data:', err);
      setError('Failed to load awards data');
    } finally {
      setDataLoading(false);
    }
  }, [season, dataManager, user]);

  useEffect(() => {
    loadAwardsData();
  }, [loadAwardsData]);

  // Check if conditions are met (deadline passed AND enough voters)
  const conditionsMet =
    unlockStatus.unique_voters >= unlockStatus.required_voters &&
    (!unlockStatus.deadline || new Date() > new Date(unlockStatus.deadline));

  // Results are unlocked only if explicitly released by admin
  const isUnlocked = unlockStatus.results_released;

  const handleReleaseResults = async () => {
    if (!confirm('Are you sure you want to release the results? This will make them visible to all users.')) return;

    setDataLoading(true);
    try {
      await dataManager.releaseAwardResults(season.id);
      await loadAwardsData();
    } catch (err) {
      setError(err.message || 'Failed to release results');
    } finally {
      setDataLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-6 w-6 text-yellow-500" />
                Season {season?.year} Awards
              </CardTitle>
              <CardDescription>
                Vote for the best (and worst) of the season!
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={conditionsMet ? "success" : "secondary"}>
                  {unlockStatus.unique_voters} / {unlockStatus.required_voters} Voters
                </Badge>
                {isUnlocked ? (
                  <Badge variant="default" className="bg-green-600">Results Released</Badge>
                ) : (
                  <Badge variant="outline">Results Locked</Badge>
                )}
              </div>

              {isAdmin && conditionsMet && !isUnlocked && (
                <Button
                  onClick={handleReleaseResults}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Crown className="h-4 w-4 mr-2" />
                  Release Results
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="voting" className="flex items-center gap-2">
            <Vote className="h-4 w-4" />
            Ballot
          </TabsTrigger>
          <TabsTrigger value="results" disabled={!isUnlocked && !isAdmin} className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Results {(!isUnlocked && !isAdmin) && '(Locked)'}
          </TabsTrigger>
          <TabsTrigger value="gallery" disabled={!isUnlocked && !isAdmin} className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Gallery {(!isUnlocked && !isAdmin) && '(Locked)'}
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="admin" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Admin
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="voting">
          <AwardsVoting
            awards={awards.filter(a => a.category === 'voted')}
            userVotes={userVotes}
            onVote={loadAwardsData} // Reload to update vote counts/status
            dataManager={dataManager}
            season={season}
            user={user}
            loading={dataLoading}
            teamOwnerNames={teamOwnerNames}
          />
        </TabsContent>

        <TabsContent value="results">
          <AwardsResults
            awards={awards.filter(a => a.category === 'voted')}
            season={season}
            dataManager={dataManager}
            loading={dataLoading}
          />
        </TabsContent>

        <TabsContent value="gallery">
          <AwardsGallery
            awards={awards}
            season={season}
            loading={dataLoading}
          />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="admin">
            <AwardsAdmin
              awards={awards}
              season={season}
              dataManager={dataManager}
              onUpdate={loadAwardsData}
              loading={dataLoading}
              teamOwnerNames={teamOwnerNames}
              unlockStatus={unlockStatus}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default AwardsManager;

