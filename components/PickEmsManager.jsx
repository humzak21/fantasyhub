import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Separator } from './ui/separator';
import { Target, Trophy, Settings, AlertCircle, Clock } from 'lucide-react';

import PickEmsSubmission from './PickEmsSubmission';
import PickEmsResults from './PickEmsResults';

const PickEmsManager = ({
  season,
  currentWeek,
  dataManager,
  loading = false,
  isAuthenticated = false
}) => {
  const [activeTab, setActiveTab] = useState('picks');
  const [pickEmWeek, setPickEmWeek] = useState(null);
  const [games, setGames] = useState([]);
  const [userPicks, setUserPicks] = useState([]);
  const [allPicks, setAllPicks] = useState([]);
  const [weeklyScores, setWeeklyScores] = useState([]);
  const [seasonStandings, setSeasonStandings] = useState([]);
  const [pickEmStatus, setPickEmStatus] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load pick'em data for current week
  const loadPickEmData = useCallback(async () => {
    if (!season || !dataManager || !currentWeek) return;

    setDataLoading(true);
    setError(null);

    try {
      // Load pick'em week data
      const [pickEmWeekData, gamesData, statusData] = await Promise.all([
        dataManager.getPickEmWeek(season.id, currentWeek),
        dataManager.getPickEmGameData(season.id, currentWeek),
        dataManager.getPickEmStatus(season.id)
      ]);

      setPickEmWeek(pickEmWeekData);
      setGames(gamesData || []);

      // Find status for current week
      const currentWeekStatus = statusData?.find(s => s.weekNumber === currentWeek);
      setPickEmStatus(currentWeekStatus);

      // Load user picks if pick'em week exists
      if (pickEmWeekData) {
        console.log('📥 Loading user picks for pickEmWeekId:', pickEmWeekData.id);
        const userPicksData = await dataManager.getUserPicksForWeek(pickEmWeekData.id);
        console.log('📊 Loaded user picks data:', userPicksData);
        setUserPicks(userPicksData || []);

        // Load results data if available
        if (currentWeekStatus?.resultsAvailable) {
          const [allPicksData, weeklyScoresData, seasonStandingsData] = await Promise.all([
            dataManager.getAllPicksForWeek(pickEmWeekData.id),
            dataManager.getWeeklyPickEmScores(pickEmWeekData.id),
            dataManager.getSeasonPickEmStandings(season.id)
          ]);

          setAllPicks(allPicksData || []);
          setWeeklyScores(weeklyScoresData || []);
          setSeasonStandings(seasonStandingsData || []);
        } else {
          setAllPicks([]);
          setWeeklyScores([]);
        }
      }
    } catch (err) {
      console.error('Error loading pick\'em data:', err);
      setError(err.message || 'Failed to load pick\'em data');
    } finally {
      setDataLoading(false);
    }
  }, [season, dataManager, currentWeek]);

  // Load data when dependencies change
  useEffect(() => {
    loadPickEmData();
  }, [loadPickEmData]);

  // Handle pick submission
  const handleSubmitPicks = useCallback(async (pickEmWeekId, picks) => {
    try {
      await dataManager.submitPickEmPicks(pickEmWeekId, picks);
      // Reload user picks after submission
      const userPicksData = await dataManager.getUserPicksForWeek(pickEmWeekId);
      setUserPicks(userPicksData || []);
    } catch (err) {
      throw new Error(err.message || 'Failed to submit picks');
    }
  }, [dataManager]);

  // Handle creating pick'em week (admin only)
  const handleCreatePickEmWeek = useCallback(async () => {
    if (!isAuthenticated || !season) return;

    setDataLoading(true);
    try {
      await dataManager.createPickEmWeek(season.id, currentWeek);
      await loadPickEmData(); // Reload data
    } catch (err) {
      setError(err.message || 'Failed to create pick\'em week');
    } finally {
      setDataLoading(false);
    }
  }, [isAuthenticated, season, currentWeek, dataManager, loadPickEmData]);

  // Handle calculating results (admin only)
  const handleCalculateResults = useCallback(async () => {
    if (!isAuthenticated || !pickEmWeek) return;

    setDataLoading(true);
    try {
      await dataManager.calculatePickEmResults(pickEmWeek.id);
      await loadPickEmData(); // Reload data to show results
      setActiveTab('results'); // Switch to results tab
    } catch (err) {
      setError(err.message || 'Failed to calculate results');
    } finally {
      setDataLoading(false);
    }
  }, [isAuthenticated, pickEmWeek, dataManager, loadPickEmData]);

  const getStatusBadge = () => {
    if (!pickEmStatus) return null;

    const variants = {
      upcoming: 'secondary',
      open: 'default',
      closed: 'destructive',
      completed: 'outline'
    };

    return (
      <Badge variant={variants[pickEmStatus.status] || 'outline'}>
        {pickEmStatus.status.charAt(0).toUpperCase() + pickEmStatus.status.slice(1)}
      </Badge>
    );
  };

  if (!season) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Season Available</h3>
          <p className="text-muted-foreground">
            Pick'ems require an active season to be configured.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Pick'ems - Week {currentWeek}
              </CardTitle>
              <CardDescription>
                Predict matchup winners and compete with your leaguemates
              </CardDescription>
            </div>

            <div className="flex items-center gap-3">
              {getStatusBadge()}

              {pickEmStatus?.timeInfo && (
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {pickEmStatus.timeInfo}
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Admin controls */}
        {isAuthenticated && (
          <CardContent>
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span className="font-medium">Admin Controls:</span>
              </div>

              <div className="flex items-center gap-2">
                {!pickEmWeek && (
                  <Button
                    onClick={handleCreatePickEmWeek}
                    disabled={dataLoading}
                    size="sm"
                    variant="outline"
                  >
                    Create Pick'em Week
                  </Button>
                )}

                {pickEmWeek && pickEmStatus?.status === 'closed' && (
                  <Button
                    onClick={handleCalculateResults}
                    disabled={dataLoading}
                    size="sm"
                    variant="outline"
                  >
                    Calculate Results
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Error display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main content */}
      {!pickEmWeek ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Pick&apos;ems Not Available</h3>
            <p className="text-muted-foreground">
              Pick&apos;ems have not been set up for week {currentWeek} yet.
              {isAuthenticated && ' Use the admin controls above to create a pick&apos;em week.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="picks" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Make Picks
            </TabsTrigger>
            <TabsTrigger value="results" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Results
            </TabsTrigger>
          </TabsList>

          <TabsContent value="picks">
            <PickEmsSubmission
              season={season}
              currentWeek={currentWeek}
              pickEmWeek={pickEmWeek}
              games={games}
              userPicks={userPicks}
              onSubmitPicks={handleSubmitPicks}
              loading={dataLoading}
              canSubmit={pickEmStatus?.canSubmit || false}
              timeRemaining={pickEmWeek?.submissionClosesAt}
            />
          </TabsContent>

          <TabsContent value="results">
            <PickEmsResults
              season={season}
              currentWeek={currentWeek}
              pickEmWeek={pickEmWeek}
              weeklyScores={weeklyScores}
              seasonStandings={seasonStandings}
              allPicks={allPicks}
              userPicks={userPicks}
              loading={dataLoading}
              resultsAvailable={pickEmStatus?.resultsAvailable || false}
            />
          </TabsContent>
        </Tabs>
      )}

    </div>
  );
};

export default PickEmsManager;