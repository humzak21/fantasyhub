import { useState, useEffect, useMemo } from 'react';
import { Trophy, Calendar, BarChart3, Users, Target, RefreshCw, Award, TrendingUp, History } from 'lucide-react';
import { useAuth } from './src/contexts/AuthContext';
import { useSupabaseFantasyData } from './hooks/useSupabaseFantasyData.js';
import { getCurrentWeek } from './utils/weekCalculator.js';
import { getTeamOwnerNames } from './src/utils/displayNameUtils';
import { Button } from './src/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './src/components/ui/card';
import { Switch } from './src/components/ui/switch';
import { Label } from './src/components/ui/label';
import { Badge } from './src/components/ui/badge';
import { LoginDropdown } from './src/components/auth/LoginDropdown.jsx';
import ErrorBoundary from './utils/errorBoundary.jsx';

// Import global styles
import './globals.css';

// Components
import PowerRankingsTable from './src/components/power-rankings/PowerRankingsTable.jsx';
import useAnalyticsData from './hooks/useAnalyticsData.js';

import StatisticsPanel from './src/components/dashboard/StatisticsPanel.jsx';
import InlineWeekNavigator from './src/components/week-controls/InlineWeekNavigator.jsx';
import ScheduleManager from './src/components/schedule/ScheduleManager.jsx';
import TeamsAndRosters from './src/components/teams/TeamsAndRosters.jsx';
import PowerRankingsVisualization from './src/components/power-rankings/PowerRankingsVisualization.jsx';

import StandingsDrawer from './src/components/standings/StandingsDrawer.jsx';
import PickEmsManager from './src/components/pickems/PickEmsManager.jsx';
import AwardsManager from './src/components/awards/AwardsManager.jsx';
import ProjectionsManager from './src/components/projections/ProjectionsManager.jsx';
import ResponsiveNavigation from './src/components/navigation/ResponsiveNavigation.jsx';
import { ErrorFallback } from './utils/errorBoundary.jsx';
import LeagueHistoryManager from './src/components/history/LeagueHistoryManager.jsx';

const FantasyFootballApp = () => {
  const { user, isAuthenticated, isAdmin } = useAuth();
  // Allow viewing without auth, but only admin can edit
  
  const {
    seasons,
    activeSeason,
    currentWeek,
    loading,
    error,
    initialized,
    powerRankings,
    rosters,
    divisions,
    standings,
    addTeam,
    updateTeam,
    removeTeam,
    addWeekScores,
    getPowerRankingsForWeek,
    setCurrentWeek,
    addGame,
    renameDivision,
    assignTeamToDivision,
    createDivision,
    dataManager
  } = useSupabaseFantasyData();

  // Extract team owner names from active season for mask authentication
  const teamOwnerNames = useMemo(() => {
    return getTeamOwnerNames(activeSeason);
  }, [activeSeason]);

  const [activeTab, setActiveTab] = useState('rankings');
  const [rankingsView, setRankingsView] = useState('table'); // 'table' or 'analysis'
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);
  const [hasUserSubmittedPicks, setHasUserSubmittedPicks] = useState(false);
  const [pickemNotificationLoading, setPickemNotificationLoading] = useState(false);

  // Pickems preloading state
  const [preloadedPickemsData, setPreloadedPickemsData] = useState(null);
  const [pickemPreloadingInProgress, setPickemPreloadingInProgress] = useState(false);


  // Week-specific power rankings state
  const [weeklyRankings, setWeeklyRankings] = useState([]);
  const [rankingsLoading, setRankingsLoading] = useState(true);

  // Check if user has submitted picks for current week
  const checkUserPicksSubmission = async () => {
    if (!isAuthenticated || !user || !activeSeason || !currentWeek || !dataManager) {
      setHasUserSubmittedPicks(false);
      return;
    }

    setPickemNotificationLoading(true);
    try {
      // Get pick'em week data for current week
      const pickEmWeekData = await dataManager.getPickEmWeek(activeSeason.id, currentWeek);
      if (!pickEmWeekData) {
        setHasUserSubmittedPicks(false);
        return;
      }

      // Get user picks for this week
      const userPicks = await dataManager.getUserPicksForWeek(pickEmWeekData.id);
      const hasSubmitted = userPicks && userPicks.length > 0;
      setHasUserSubmittedPicks(hasSubmitted);
    } catch (err) {
      console.error('Error checking user picks:', err);
      setHasUserSubmittedPicks(false);
    } finally {
      setPickemNotificationLoading(false);
    }
  };

  // Analytics data integration
  const {
    analyticsData,
    hasAnalyticsData,
    loading: analyticsLoading,
    refreshAnalytics,
    exportAnalyticsData,
    isEnabled: analyticsEnabled
  } = useAnalyticsData(weeklyRankings, currentWeek, true);

  // Check picks submission when relevant data changes
  useEffect(() => {
    checkUserPicksSubmission();
  }, [isAuthenticated, user, activeSeason, currentWeek, dataManager]);

  // Preload pickems data in the background when season loads
  useEffect(() => {
    const preloadPickemsData = async () => {
      if (!activeSeason || !dataManager || !initialized) {
        return;
      }

      setPickemPreloadingInProgress(true);
      try {
        // Load pick'em data for current week
        const pickEmWeekData = await dataManager.getPickEmWeek(activeSeason.id, currentWeek);

        if (!pickEmWeekData) {
          setPickemPreloadingInProgress(false);
          return;
        }

        // Load the data in parallel
        const [gameData, statusData] = await Promise.all([
          dataManager.getPickEmGameData(activeSeason.id, currentWeek),
          dataManager.getPickEmStatus(activeSeason.id)
        ]);

        // Load additional data (standings, picks, etc)
        const [standingsData, allSeasonPicksData] = await Promise.all([
          dataManager.getSeasonPickEmStandings(activeSeason.id),
          dataManager.getAllSeasonPicks(activeSeason.id)
        ]);

        // Check if results are available
        const resultsAvailable = statusData?.find(s => s.weekNumber === currentWeek)?.resultsAvailable || false;

        let allPicksData = null;
        let scoresData = null;

        // If results are available, load those too
        if (resultsAvailable) {
          [allPicksData, scoresData] = await Promise.all([
            dataManager.getAllPicksForWeek(pickEmWeekData.id),
            dataManager.getWeeklyPickEmScores(pickEmWeekData.id)
          ]);
        }

        // Load user picks if authenticated
        let userPicksData = null;
        if (isAuthenticated && user) {
          userPicksData = await dataManager.getUserPicksForWeek(pickEmWeekData.id);
        }

        // Store all preloaded data
        setPreloadedPickemsData({
          pickEmWeek: pickEmWeekData,
          games: gameData,
          status: statusData,
          standings: standingsData,
          allSeasonPicks: allSeasonPicksData,
          allPicks: allPicksData,
          scores: scoresData,
          userPicks: userPicksData,
          resultsAvailable: resultsAvailable
        });

        setPickemPreloadingInProgress(false);
      } catch (err) {
        console.error('Error preloading pickems data:', err);
        setPickemPreloadingInProgress(false);
        // Don't fail - let PickEmsManager load data normally if preload fails
      }
    };

    preloadPickemsData();
  }, [activeSeason, dataManager, initialized, currentWeek, isAuthenticated, user]);

  // Initialize current week based on calendar date and keep it updated
  useEffect(() => {
    // Set initial week
    const calendarWeek = getCurrentWeek();

    if (calendarWeek !== currentWeek) {
      setCurrentWeek(calendarWeek);
    }

    // Set up interval to check for week changes every hour
    const weekCheckInterval = setInterval(() => {
      const newCalendarWeek = getCurrentWeek();
      if (newCalendarWeek !== currentWeek) {
        setCurrentWeek(newCalendarWeek);
      }
    }, 60 * 60 * 1000); // Check every hour

    // Cleanup interval on unmount
    return () => clearInterval(weekCheckInterval);
  }, []); // Only run on mount to avoid interfering with manual navigation

  // Force calendar week after data loads (override database value)
  useEffect(() => {
    if (activeSeason && !loading) {
      const calendarWeek = getCurrentWeek();
      
      if (calendarWeek !== currentWeek) {
        setCurrentWeek(calendarWeek);
      }
    }
  }, [activeSeason, loading]); // Run when season loads

  // Fetch week-specific power rankings when week or season changes
  useEffect(() => {
    const fetchWeeklyRankings = async () => {
      if (!activeSeason || !currentWeek) {
        setWeeklyRankings([]);
        return;
      }

      setRankingsLoading(true);
      try {
        // Pass the viewing week to get historical data correctly
        // When viewing week 3, we want rankings based on weeks 1-2 data
        const rankings = await getPowerRankingsForWeek(currentWeek, currentWeek);
        setWeeklyRankings(rankings);
      } catch (err) {
        setWeeklyRankings([]);
      } finally {
        setRankingsLoading(false);
      }
    };

    fetchWeeklyRankings();
  }, [activeSeason, currentWeek, getPowerRankingsForWeek]);


  // Get completed weeks for navigation
  const completedWeeks = activeSeason?.weeks
    ?.filter(week => week.isCompleted)
    ?.map(week => week.weekNumber) || [];

  // Check if awards are accessible (Dec 9th midnight or admin)
  const isAwardsAccessible = () => {
    if (isAdmin) return true;
    
    const now = new Date();
    const awardsReleaseDate = new Date('2025-12-09T00:00:00');
    return now >= awardsReleaseDate;
  };

  // Check if pickems are still open (closes at 8:10 PM on Thursdays)
  const arePickemsOpen = () => {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 4 = Thursday
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // If it's Thursday (day 4)
    if (day === 4) {
      // Check if time is after 8:10 PM (20:10)
      if (hours > 20 || (hours === 20 && minutes >= 10)) {
        return false; // Pickems are closed
      }
    }
    // If it's Friday or Saturday (5, 6), pickems are definitely closed
    if (day === 5 || day === 6) {
      return false;
    }
    
    return true; // Pickems are open
  };

  // Main navigation tabs
  const mainTabs = [
    { id: 'rankings', label: 'Power Rankings', icon: Trophy, requiresSeason: true, requiresAuth: false },
    { id: 'projections', label: 'Projections', icon: TrendingUp, requiresSeason: true, requiresAuth: false },
    { id: 'statistics', label: 'Statistics', icon: BarChart3, requiresSeason: true, requiresAuth: false },
    { id: 'schedule', label: 'Schedule', icon: Calendar, requiresSeason: true, requiresAuth: false },
    { id: 'teams', label: 'Teams & Rosters', icon: Users, requiresSeason: true, requiresAuth: false },
    { id: 'history', label: 'History', icon: History, requiresSeason: false, requiresAuth: true },
    { id: 'pickems', label: 'Pick\'ems', icon: Target, requiresSeason: true, requiresAuth: false },
    { id: 'awards', label: 'Awards', icon: Award, requiresSeason: true, requiresAuth: false, customAccess: isAwardsAccessible }
  ];



  const handleGameUpdate = async (week, team1Id, team2Id, team1Score, team2Score) => {
    await addGame(week, team1Id, team2Id, team1Score, team2Score);
  };

  const handleGameDelete = async (gameId) => {
    alert('Game deletion not yet implemented');
  };


  // Note: Allow users to stay on any tab even without an active season
  // Each tab will show appropriate "no season available" messages

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header - Responsive Design */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Left Section: Logo, Title, and Week Navigator */}
            <div className="flex items-center">
              {/* Logo and Title */}
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
                  <img src="og jits logo.jpg" alt="og jits logo" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight">
                    og jits
                  </h1>
                  {activeSeason && (
                    <p className="text-sm text-muted-foreground">
                      {activeSeason.name || `${activeSeason.year} Season`}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Inline Week Navigator - Desktop (Full) */}
              {activeSeason && (
                <div className="hidden xl:block ml-8">
                  <InlineWeekNavigator
                    currentWeek={currentWeek}
                    totalWeeks={activeSeason.totalWeeks}
                    regularSeasonWeeks={activeSeason.regularSeasonWeeks}
                    onWeekChange={setCurrentWeek}
                    completedWeeks={completedWeeks}
                    season={activeSeason}
                    condensed={false}
                  />
                </div>
              )}

              {/* Inline Week Navigator - Tablet/Mobile (Condensed) */}
              {activeSeason && (
                <div className="hidden sm:block xl:hidden ml-4">
                  <InlineWeekNavigator
                    currentWeek={currentWeek}
                    totalWeeks={activeSeason.totalWeeks}
                    regularSeasonWeeks={activeSeason.regularSeasonWeeks}
                    onWeekChange={setCurrentWeek}
                    completedWeeks={completedWeeks}
                    season={activeSeason}
                    condensed={true}
                  />
                </div>
              )}

              {/* Inline Week Navigator - Mobile Only (Condensed) */}
              {activeSeason && (
                <div className="sm:hidden ml-2">
                  <InlineWeekNavigator
                    currentWeek={currentWeek}
                    totalWeeks={activeSeason.totalWeeks}
                    regularSeasonWeeks={activeSeason.regularSeasonWeeks}
                    onWeekChange={setCurrentWeek}
                    completedWeeks={completedWeeks}
                    season={activeSeason}
                    condensed={true}
                  />
                </div>
              )}
            </div>

            {/* Main Navigation - Responsive */}
            <ResponsiveNavigation
              tabs={mainTabs.map(tab => ({
                ...tab,
                isDisabled: isAdmin && tab.requiresSeason && !activeSeason,
                showNotification: tab.id === 'pickems' && isAuthenticated && !hasUserSubmittedPicks && !pickemNotificationLoading && arePickemsOpen()
              }))}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              shouldShowTab={(tab) => {
                // Check auth requirements
                if (tab.requiresAuth && !isAdmin) return false;
                // Check custom access function
                if (tab.customAccess && !tab.customAccess()) return false;
                return true;
              }}
            />

            {/* Right Section: Login */}
            <div className="flex items-center space-x-2">
              <LoginDropdown />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">


        {/* Error Display */}
        {error && (
          <Card className="mb-6 border-destructive">
            <CardContent className="p-4">
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'rankings' && (
            <ErrorBoundary key="rankings-error-boundary">
            <div className="space-y-6">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle>Week {currentWeek} Power Rankings</CardTitle>
                        <Badge variant="outline">
                          {new Date().toLocaleDateString()}
                        </Badge>
                      </div>
                      
                      {/* View Switcher */}
                      <div className="flex items-center gap-4">
                        {rankingsView === 'table' && (
                          <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2">
                              <Switch
                                id="advanced-stats"
                                checked={showAdvancedStats}
                                onCheckedChange={setShowAdvancedStats}
                              />
                              <Label htmlFor="advanced-stats" className="cursor-pointer">
                                Advanced Stats
                              </Label>
                            </div>
                            
                            {analyticsEnabled && (
                              <div className="flex items-center space-x-2">
                                {(analyticsLoading || hasAnalyticsData) && (
                                  <Badge
                                    variant={hasAnalyticsData ? "default" : "secondary"}
                                    className="text-xs"
                                  >
                                    {analyticsLoading ? "Loading..." : "Analytics Active"}
                                  </Badge>
                                )}
                                {hasAnalyticsData && (
                                  <Button
                                    onClick={refreshAnalytics}
                                    variant="outline"
                                    size="sm"
                                    disabled={analyticsLoading}
                                    className="text-xs flex items-center gap-1"
                                  >
                                    <RefreshCw className={`h-3 w-3 ${analyticsLoading ? 'animate-spin' : ''}`} />
                                    Refresh
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        
                        <Button
                          onClick={() => setRankingsView(rankingsView === 'table' ? 'analysis' : 'table')}
                          variant="outline"
                          size="sm"
                          className="text-xs font-medium"
                        >
                          {rankingsView === 'table' ? 'Advanced Analysis' : 'Rankings Table'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {rankingsView === 'table' ? (
                      <PowerRankingsTable
                        rankings={weeklyRankings}
                        currentWeek={currentWeek}
                        showAdvanced={showAdvancedStats}
                        loading={rankingsLoading || analyticsLoading}
                        showAnalytics={analyticsEnabled && hasAnalyticsData}
                        analyticsData={analyticsData}
                        onExportAnalytics={exportAnalyticsData}
                        user={user}
                        isAdmin={isAdmin}
                        teamOwnerNames={teamOwnerNames}
                        initializing={!initialized}
                      />
                    ) : (
                      <PowerRankingsVisualization
                        rankings={weeklyRankings}
                        currentWeek={currentWeek}
                        loading={rankingsLoading || analyticsLoading}
                        showAnalyticsSection={analyticsEnabled && hasAnalyticsData}
                        analyticsData={analyticsData}
                        user={user}
                        teamOwnerNames={teamOwnerNames}
                        isAdmin={isAdmin}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
            </ErrorBoundary>
          )}


          {activeTab === 'statistics' && (
            <ErrorBoundary key="statistics-error-boundary">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>League Analytics</CardTitle>
                  <CardDescription>
                    Comprehensive statistics and insights for your league
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <StatisticsPanel
                    rankings={weeklyRankings}
                    currentWeek={currentWeek}
                    season={activeSeason}
                    loading={rankingsLoading}
                    user={user}
                    isAdmin={isAdmin}
                    teamOwnerNames={teamOwnerNames}
                  />
                </CardContent>
              </Card>
            </div>
            </ErrorBoundary>
          )}

          {activeTab === 'schedule' && (
            <ErrorBoundary key="schedule-error-boundary">
            <div className="space-y-6">
              <ScheduleManager
                season={activeSeason}
                schedule={activeSeason?.schedule || []}
                currentWeek={currentWeek}
                onUpdateGame={isAdmin ? handleGameUpdate : null}
                onDeleteGame={isAdmin ? handleGameDelete : null}
                onWeekChange={setCurrentWeek}
                loading={loading}
                isAuthenticated={isAdmin}
                user={user}
                isAdmin={isAdmin}
                powerRankings={powerRankings}
                rosters={rosters}
                teamOwnerNames={teamOwnerNames}
              />
            </div>
            </ErrorBoundary>
          )}

          {activeTab === 'teams' && (
            <ErrorBoundary key="teams-error-boundary">
            <div className="space-y-6">
              <TeamsAndRosters
                teams={activeSeason?.teams || []}
                rosters={rosters}
                onAddTeam={isAdmin ? addTeam : null}
                onUpdateTeam={isAdmin ? updateTeam : null}
                onRemoveTeam={isAdmin ? removeTeam : null}
                loading={loading}
                powerRankings={powerRankings}
                isAuthenticated={isAdmin}
                user={user}
                isAdmin={isAdmin}
                teamOwnerNames={teamOwnerNames}
              />
            </div>
            </ErrorBoundary>
          )}

          {activeTab === 'projections' && (
            <ErrorBoundary key="projections-error-boundary">
            <div className="space-y-6">
              <ProjectionsManager
                season={activeSeason}
                teams={activeSeason?.teams || []}
                games={activeSeason?.schedule || []}
                divisions={divisions}
                currentWeek={currentWeek}
                loading={loading}
                user={user}
                isAdmin={isAdmin}
                teamOwnerNames={teamOwnerNames}
              />
            </div>
            </ErrorBoundary>
          )}

          {activeTab === 'pickems' && (
            <ErrorBoundary key="pickems-error-boundary">
            <div className="space-y-6">
            <PickEmsManager
              season={activeSeason}
              currentWeek={currentWeek}
              dataManager={dataManager}
              loading={loading}
              isAuthenticated={isAuthenticated}
              isAdmin={isAdmin}
              user={user}
              initializing={!initialized}
              preloadedData={preloadedPickemsData}
              preloadingInProgress={pickemPreloadingInProgress}
              teamOwnerNames={teamOwnerNames}
            />
            </div>
            </ErrorBoundary>
          )}

          {activeTab === 'awards' && (
            <ErrorBoundary key="awards-error-boundary">
            <div className="space-y-6">
            <AwardsManager
              season={activeSeason}
              currentWeek={currentWeek}
              dataManager={dataManager}
              loading={loading}
              isAuthenticated={isAuthenticated}
              isAdmin={isAdmin}
              user={user}
            />
            </div>
            </ErrorBoundary>
          )}

          {activeTab === 'history' && (
            <ErrorBoundary key="history-error-boundary">
            <div className="space-y-6">
            <LeagueHistoryManager
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
              activeSeason={activeSeason}
            />
            </div>
            </ErrorBoundary>
          )}

        </div>
      </main>

      {/* Standings Drawer */}
      {activeSeason && (
        <StandingsDrawer
          teams={activeSeason.teams || []}
          divisions={divisions}
          standings={standings}
          currentWeek={currentWeek}
          loading={loading}
          isAuthenticated={isAdmin}
          user={user}
          isAdmin={isAdmin}
          onDivisionRename={renameDivision}
          onTeamDivisionChange={assignTeamToDivision}
          onCreateDivision={createDivision}
          games={activeSeason.schedule || []}
          teamOwnerNames={teamOwnerNames}
        />
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span>Loading...</span>
            </div>
          </Card>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
};

export default FantasyFootballApp;