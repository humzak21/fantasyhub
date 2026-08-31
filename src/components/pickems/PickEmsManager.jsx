import React, { useState, useEffect, useCallback } from 'react';
import { SkeletonCards } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';
import PageHeader from '../layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { Target, Trophy, Settings, AlertCircle, Clock, UserCheck } from 'lucide-react';

import PickEmsSubmission from './PickEmsSubmission';
import PickEmsResults from './PickEmsResults';
import PickEmsAdminSubmissions from './PickEmsAdminSubmissions';
import PickEmsSeasonStandings from './PickEmsSeasonStandings';
import { getDb } from '../../../services/db/index.js';
import { useViewer } from '../../contexts/ViewerContext.jsx';

const PickEmsManager = ({
  season,
  currentWeek,
  loading = false,
  isAuthenticated = false,
  initializing = false,
  preloadedData = null,
  preloadingInProgress = false,
}) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const [activeTab, setActiveTab] = useState('picks');
  const [pickEmWeek, setPickEmWeek] = useState(null);
  const [games, setGames] = useState([]);
  const [userPicks, setUserPicks] = useState([]);
  const [allPicks, setAllPicks] = useState([]);
  const [seasonPicks, setSeasonPicks] = useState([]);
  const [weeklyScores, setWeeklyScores] = useState([]);
  const [seasonStandings, setSeasonStandings] = useState([]);
  const [pickEmStatus, setPickEmStatus] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load pick'em data for current week
  const loadPickEmData = useCallback(async () => {
    if (!season || !currentWeek) return;

    setDataLoading(true);
    setError(null);

    try {
      // Load pick'em week data
      const [pickEmWeekData, gamesData, statusData] = await Promise.all([
        getDb().pickems.getPickEmWeek(season.id, currentWeek),
        getDb().pickems.getPickEmGameData(season.id, currentWeek),
        getDb().pickems.getPickEmStatus(season.id)
      ]);

      setPickEmWeek(pickEmWeekData);
      setGames(gamesData || []);

      // Find status for current week
      const currentWeekStatus = statusData?.find(s => s.weekNumber === currentWeek);
      setPickEmStatus(currentWeekStatus);

      // Load user picks if pick'em week exists
      if (pickEmWeekData) {
        const userPicksData = await getDb().pickems.getUserPicksForWeek(pickEmWeekData.id);
        setUserPicks(userPicksData || []);

        // Always load season standings and season picks
        const [seasonStandingsData, seasonPicksData] = await Promise.all([
          getDb().pickems.getSeasonPickEmStandings(season.id),
          getDb().pickems.getAllSeasonPicks(season.id)
        ]);

        setSeasonStandings(seasonStandingsData || []);
        setSeasonPicks(seasonPicksData || []);

        // Load results data if available
        if (currentWeekStatus?.resultsAvailable) {
          const [allPicksData, weeklyScoresData] = await Promise.all([
            getDb().pickems.getAllPicksForWeek(pickEmWeekData.id),
            getDb().pickems.getWeeklyPickEmScores(pickEmWeekData.id)
          ]);

          setAllPicks(allPicksData || []);
          setWeeklyScores(weeklyScoresData || []);
        } else {
          setAllPicks([]);
          setWeeklyScores([]);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load pick\'em data');
    } finally {
      setDataLoading(false);
    }
  }, [season,currentWeek]);

  // Use preloaded data when available
  useEffect(() => {
    if (preloadedData) {
      setPickEmWeek(preloadedData.pickEmWeek);
      setGames(preloadedData.games || []);
      setPickEmStatus(preloadedData.status?.find(s => s.weekNumber === currentWeek) || null);
      setUserPicks(preloadedData.userPicks || []);
      setSeasonStandings(preloadedData.standings || []);
      setSeasonPicks(preloadedData.allSeasonPicks || []);
      setAllPicks(preloadedData.allPicks || []);
      setWeeklyScores(preloadedData.scores || []);
      setDataLoading(false);
    }
  }, [preloadedData, currentWeek]);

  // Load data when dependencies change (fallback if preloaded data not available)
  useEffect(() => {
    // Only load data if we don't have preloaded data
    if (!preloadedData && !preloadingInProgress) {
      loadPickEmData();
    }
  }, [preloadedData, preloadingInProgress, loadPickEmData]);

  // Switch to results tab when results become available and user is on picks tab
  useEffect(() => {
    if (pickEmStatus?.resultsAvailable && activeTab === 'picks') {
      setActiveTab('results');
    }
  }, [pickEmStatus?.resultsAvailable, activeTab]);

  // Handle pick submission
  const handleSubmitPicks = useCallback(async (pickEmWeekId, picks) => {
    try {
      await getDb().pickems.submitPickEmPicks(pickEmWeekId, picks);
      // Reload user picks after submission
      const userPicksData = await getDb().pickems.getUserPicksForWeek(pickEmWeekId);
      setUserPicks(userPicksData || []);
    } catch (err) {
      throw new Error(err.message || 'Failed to submit picks');
    }
  }, []);

  // Handle creating pick'em week (admin only)
  const handleCreatePickEmWeek = useCallback(async () => {
    if (!isAdmin || !season) return;

    setDataLoading(true);
    try {
      await getDb().pickems.createPickEmWeek(season.id, currentWeek);
      await loadPickEmData(); // Reload data
    } catch (err) {
      setError(err.message || 'Failed to create pick\'em week');
    } finally {
      setDataLoading(false);
    }
  }, [isAdmin, season, currentWeek,loadPickEmData]);

  // Handle calculating results (admin only)
  const handleCalculateResults = useCallback(async () => {
    if (!isAdmin || !pickEmWeek) return;

    setDataLoading(true);
    try {
      await getDb().pickems.calculatePickEmResults(pickEmWeek.id);
      await loadPickEmData(); // Reload data to show results
      setActiveTab('results'); // Switch to results tab
    } catch (err) {
      setError(err.message || 'Failed to calculate results');
    } finally {
      setDataLoading(false);
    }
  }, [isAdmin, pickEmWeek,loadPickEmData]);

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

  // A skeleton, not `null`. The comment this replaces said the full-screen
  // overlay was covering the wait — that overlay was removed for blocking the
  // whole page on every mutation, which left this branch rendering an entirely
  // blank tab for as long as the fetch took.
  if (initializing || dataLoading) {
    return (
      <>
        <PageHeader icon={Target} title="Pick'ems" />
        <SkeletonCards count={4} columns={1} />
      </>
    );
  }

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
        {isAdmin && (
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

                {/* {pickEmWeek && pickEmStatus?.status === 'closed' && (
                  <Button
                    onClick={handleCalculateResults}
                    disabled={dataLoading}
                    size="sm"
                    variant="outline"
                  >
                    Calculate Results
                  </Button>
                )} */}
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
          {/* The admin sentence used to be an `&apos;` inside a JavaScript
              string literal rather than JSX text, so it reached the page
              undecoded and the reader saw "pick&apos;em week". */}
          <EmptyState
            icon={Target}
            title="No pick'ems this week"
            description={
              isAdmin
                ? `Week ${currentWeek} has no pick'em week yet. Create one with the admin controls above.`
                : `Week ${currentWeek} has no pick'em week yet.`
            }
          />
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid w-full ${
            isAdmin 
              ? (pickEmStatus?.resultsAvailable ? 'grid-cols-3' : 'grid-cols-3')
              : (pickEmStatus?.resultsAvailable ? 'grid-cols-2' : 'grid-cols-2')
          }`}>
            {!pickEmStatus?.resultsAvailable && (
              <TabsTrigger value="picks" className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Make Picks
              </TabsTrigger>
            )}
            {pickEmStatus?.resultsAvailable && (
              <TabsTrigger value="results" className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Results
              </TabsTrigger>
            )}
            <TabsTrigger value="standings" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Standings
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" className="flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Submissions
              </TabsTrigger>
            )}
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
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          </TabsContent>

          <TabsContent value="results">
            <PickEmsResults
              season={season}
              currentWeek={currentWeek}
              pickEmWeek={pickEmWeek}
              weeklyScores={weeklyScores}
              allPicks={allPicks}
              loading={dataLoading}
              resultsAvailable={pickEmStatus?.resultsAvailable || false}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          </TabsContent>

          <TabsContent value="standings">
            <PickEmsSeasonStandings
              season={season}
              currentWeek={currentWeek}
              seasonStandings={seasonStandings}
              seasonPicks={seasonPicks}
              loading={dataLoading}
              resultsAvailable={pickEmStatus?.resultsAvailable || false}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="admin">
              <PickEmsAdminSubmissions
                currentWeek={currentWeek}
                pickEmWeek={pickEmWeek}
                loading={dataLoading}
                user={user}
                isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
              />
            </TabsContent>
          )}
        </Tabs>
      )}

    </div>
  );
};

export default PickEmsManager;