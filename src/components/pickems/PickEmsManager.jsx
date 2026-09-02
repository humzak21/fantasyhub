import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import RouteLoading from '../layout/RouteLoading';
import { EmptyState } from '../ui/empty-state';
import PageHeader from '../layout/PageHeader';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Alert, AlertDescription } from '../ui/alert';
import { Target, Trophy, AlertCircle, Clock, UserCheck, Crosshair } from 'lucide-react';

import PickEmsSubmission from './PickEmsSubmission';
import PickEmsResults from './PickEmsResults';
import PickEmsAdminSubmissions from './PickEmsAdminSubmissions';
import PickEmsSeasonStandings from './PickEmsSeasonStandings';

// The commissioner view is two people's tab, so it is not in everyone's
// pick'ems chunk. It used to be its own lazy route on the app shell; moving it
// here must not undo that.
const ParlayCommissionerDashboard = lazy(() => import('../parlay/ParlayCommissionerDashboard.jsx'));
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
  const { user, isAdmin, teamOwnerNames, isParlayCommissioner } = useViewer();
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

  // A loader, not `null`. The comment this replaces said the full-screen
  // overlay was covering the wait — that overlay was removed for blocking the
  // whole page on every mutation, which left this branch rendering an entirely
  // blank tab for as long as the fetch took. The header stays up so the page
  // has an identity while its data arrives.
  if (initializing || dataLoading) {
    return (
      <>
        <PageHeader icon={Target} title="Pick'ems" />
        <RouteLoading />
      </>
    );
  }

  if (!season) {
    return (
      <>
        <PageHeader icon={Target} title="Pick'ems" />
        <Card>
          <EmptyState
            icon={Target}
            title="No season available"
            description="Pick'ems need an active season to be configured."
          />
        </Card>
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* The same header the loading branch above renders, so the page does
          not swap one header for another when the data lands — that swap was
          a visible flash on every visit. The week's status is the badge, the
          deadline sits beside the actions, and the admin's one control is the
          action itself rather than a labelled "Admin Controls" strip. */}
      <PageHeader
        icon={Target}
        title="Pick'ems"
        description={`Week ${currentWeek} — predict matchup winners and compete with your leaguemates.`}
        badge={getStatusBadge()}
        actions={
          pickEmStatus?.timeInfo || (isAdmin && !pickEmWeek) ? (
            <>
              {pickEmStatus?.timeInfo && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {pickEmStatus.timeInfo}
                </span>
              )}
              {isAdmin && !pickEmWeek && (
                <Button
                  onClick={handleCreatePickEmWeek}
                  disabled={dataLoading}
                  size="sm"
                  variant="outline"
                >
                  Create pick'em week
                </Button>
              )}
            </>
          ) : null
        }
      />

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
                ? `Week ${currentWeek} has no pick'em week yet. Create one with the button above.`
                : `Week ${currentWeek} has no pick'em week yet.`
            }
          />
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* No `grid grid-cols-N` any more. The strip is four tabs wide for
              the commissioner, and a grid divides the width by the tab count
              regardless of how long "Submissions" is; TabsList scrolls and
              collapses each label to its icon below sm: on its own. */}
          <TabsList className="w-full">
            {!pickEmStatus?.resultsAvailable && (
              <TabsTrigger value="picks" icon={<Target />}>
                Make Picks
              </TabsTrigger>
            )}
            {pickEmStatus?.resultsAvailable && (
              <TabsTrigger value="results" icon={<Trophy />}>
                Results
              </TabsTrigger>
            )}
            <TabsTrigger value="standings" icon={<Trophy />}>
              Standings
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" icon={<UserCheck />}>
                Submissions
              </TabsTrigger>
            )}
            {/* The league-wide parlay view. `isParlayCommissioner` already
                folds the admin in — do not add `isAdmin ||` here, which is the
                substitution that keeps the role separate from the admin's
                write paths. */}
            {isParlayCommissioner && (
              <TabsTrigger value="parlay" icon={<Crosshair />}>
                TD Parlay
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

          {isParlayCommissioner && (
            <TabsContent value="parlay">
              <Suspense fallback={<RouteLoading />}>
                <ParlayCommissionerDashboard season={season} embedded />
              </Suspense>
            </TabsContent>
          )}
        </Tabs>
      )}

    </div>
  );
};

export default PickEmsManager;