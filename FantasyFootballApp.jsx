import { useState, useEffect } from 'react';
import { Trophy, Calendar, BarChart3, Users, Settings, Target, Download, ChevronDown, RefreshCw } from 'lucide-react';
import { useAuth } from './src/contexts/AuthContext';
import { useSupabaseFantasyData } from './hooks/useSupabaseFantasyData.js';
import { getCurrentWeek } from './utils/weekCalculator.js';
import { Button } from './src/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './src/components/ui/card';

import { Badge } from './src/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './src/components/ui/dropdown-menu';
import { LoginDropdown } from './src/components/auth/LoginDropdown.jsx';

// Import global styles
import './globals.css';

// Components
import PowerRankingsTable from './src/components/power-rankings/PowerRankingsTable.jsx';
import useAnalyticsData from './hooks/useAnalyticsData.js';

import SeasonManager from './src/components/admin/SeasonManager.jsx';
import StatisticsPanel from './src/components/dashboard/StatisticsPanel.jsx';
import InlineWeekNavigator from './src/components/week-controls/InlineWeekNavigator.jsx';
import ScheduleManager from './src/components/schedule/ScheduleManager.jsx';
import ScheduleImportManager from './src/components/schedule/ScheduleImportManager.jsx';
import TeamsAndRosters from './src/components/teams/TeamsAndRosters.jsx';
import PowerRankingsVisualization from './src/components/power-rankings/PowerRankingsVisualization.jsx';

import StandingsDrawer from './src/components/standings/StandingsDrawer.jsx';
import PickEmsManager from './src/components/pickems/PickEmsManager.jsx';

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
    createSeason,
    setActiveSeasonById,
    deleteSeason,
    addTeam,
    updateTeam,
    removeTeam,
    addWeekScores,
    getPowerRankingsForWeek,
    exportSeason,
    importSeason,
    setCurrentWeek,
    addGame,
    renameDivision,
    assignTeamToDivision,
    createDivision,
    dataManager
  } = useSupabaseFantasyData();

  const [activeTab, setActiveTab] = useState('rankings');
  const [rankingsView, setRankingsView] = useState('table'); // 'table' or 'analysis'
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);
  

  
  // Week-specific power rankings state
  const [weeklyRankings, setWeeklyRankings] = useState([]);
  const [rankingsLoading, setRankingsLoading] = useState(false);

  // Analytics data integration
  const {
    analyticsData,
    hasAnalyticsData,
    loading: analyticsLoading,
    refreshAnalytics,
    exportAnalyticsData,
    isEnabled: analyticsEnabled
  } = useAnalyticsData(weeklyRankings, currentWeek, true);

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

  // Main navigation tabs
  const mainTabs = [
    { id: 'rankings', label: 'Power Rankings', icon: Trophy, requiresSeason: true, requiresAuth: false },
    { id: 'statistics', label: 'Statistics', icon: BarChart3, requiresSeason: true, requiresAuth: false },
    { id: 'schedule', label: 'Schedule', icon: Calendar, requiresSeason: true, requiresAuth: false },
    { id: 'teams', label: 'Teams & Rosters', icon: Users, requiresSeason: true, requiresAuth: false },
    { id: 'pickems', label: 'Pick\'ems', icon: Target, requiresSeason: true, requiresAuth: false }
  ];

  // Settings dropdown items
  const settingsItems = [
    { id: 'seasons', label: 'Seasons', icon: Settings, requiresAuth: true },
    { id: 'import', label: 'Import Schedule', icon: Download, requiresAuth: true }
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
              
              {/* Inline Week Navigator - Desktop */}
              {activeSeason && (
                <div className="hidden lg:block ml-8">
                  <InlineWeekNavigator
                    currentWeek={currentWeek}
                    totalWeeks={activeSeason.totalWeeks}
                    regularSeasonWeeks={activeSeason.regularSeasonWeeks}
                    onWeekChange={setCurrentWeek}
                    completedWeeks={completedWeeks}
                    season={activeSeason}
                  />
                </div>
              )}
            </div>

            {/* Main Navigation */}
            <nav className="hidden md:flex items-center space-x-1">
              {mainTabs
                .filter(tab => !tab.requiresAuth || isAdmin)
                .map(tab => {
                  const isDisabled = isAdmin && tab.requiresSeason && !activeSeason;
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  
                  return (
                    <Button
                      key={tab.id}
                      variant={isActive ? "default" : "ghost"}
                      size="sm"
                      disabled={isDisabled}
                      onClick={() => setActiveTab(tab.id)}
                      className="flex items-center space-x-2 h-9"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </Button>
                  );
                })}
            </nav>

            {/* Right Section: Week Navigator (tablet), Settings, and Login */}
            <div className="flex items-center space-x-2">
              {/* Week Navigator - Tablet */}
              {activeSeason && (
                <div className="hidden md:block lg:hidden mr-4">
                  <InlineWeekNavigator
                    currentWeek={currentWeek}
                    totalWeeks={activeSeason.totalWeeks}
                    regularSeasonWeeks={activeSeason.regularSeasonWeeks}
                    onWeekChange={setCurrentWeek}
                    completedWeeks={completedWeeks}
                    season={activeSeason}
                  />
                </div>
              )}

              {/* Settings Dropdown */}
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="flex items-center space-x-1">
                      <Settings className="h-4 w-4" />
                      <span className="hidden lg:inline">Settings</span>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {settingsItems.map(item => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      
                      return (
                        <DropdownMenuItem
                          key={item.id}
                          onClick={() => setActiveTab(item.id)}
                          className={isActive ? "bg-accent" : ""}
                        >
                          <Icon className="h-4 w-4 mr-2" />
                          {item.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              
              {/* Week Navigator - Mobile */}
              {activeSeason && (
                <div className="md:hidden">
                  <InlineWeekNavigator
                    currentWeek={currentWeek}
                    totalWeeks={activeSeason.totalWeeks}
                    regularSeasonWeeks={activeSeason.regularSeasonWeeks}
                    onWeekChange={setCurrentWeek}
                    completedWeeks={completedWeeks}
                    season={activeSeason}
                    className="scale-90"
                  />
                </div>
              )}

              <LoginDropdown />

              {/* Mobile Navigation Menu */}
              <div className="md:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <BarChart3 className="h-4 w-4" />
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {mainTabs
                      .filter(tab => !tab.requiresAuth || isAdmin)
                      .map(tab => {
                        const isDisabled = isAdmin && tab.requiresSeason && !activeSeason;
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        
                        return (
                          <DropdownMenuItem
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            disabled={isDisabled}
                            className={isActive ? "bg-accent" : ""}
                          >
                            <Icon className="h-4 w-4 mr-2" />
                            {tab.label}
                          </DropdownMenuItem>
                        );
                      })}
                    {isAdmin && settingsItems.map(item => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      
                      return (
                        <DropdownMenuItem
                          key={item.id}
                          onClick={() => setActiveTab(item.id)}
                          className={isActive ? "bg-accent" : ""}
                        >
                          <Icon className="h-4 w-4 mr-2" />
                          {item.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
            <div className="space-y-6">
            {!initialized || (loading && !activeSeason) ? (
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  <span>Loading...</span>
                </div>
              </div>
            ) : /* !activeSeason ? (
              <Card>
                <CardContent className="p-8">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                      <Trophy className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">No Season Available</h3>
                      <p className="text-muted-foreground">
                        There are currently no active seasons to display power rankings for.
                        {!isAdmin && " Please contact an administrator to set up a season."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : */ (
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
                              <input
                                type="checkbox"
                                id="advanced-stats"
                                checked={showAdvancedStats}
                                onChange={(e) => setShowAdvancedStats(e.target.checked)}
                                className="rounded border-gray-300"
                              />
                              <label htmlFor="advanced-stats" className="text-sm font-medium">
                                Advanced Stats
                              </label>
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
                        
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => setRankingsView('table')}
                            variant={rankingsView === 'table' ? 'default' : 'outline'}
                            size="sm"
                            className="text-xs"
                          >
                            Rankings Table
                          </Button>
                          <Button
                            onClick={() => setRankingsView('analysis')}
                            variant={rankingsView === 'analysis' ? 'default' : 'outline'}
                            size="sm"
                            className="text-xs"
                          >
                            Advanced Analysis
                          </Button>
                        </div>
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
                      />
                    ) : (
                      <PowerRankingsVisualization
                        rankings={weeklyRankings}
                        currentWeek={currentWeek}
                        loading={rankingsLoading || analyticsLoading}
                        showAnalyticsSection={analyticsEnabled && hasAnalyticsData}
                        analyticsData={analyticsData}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
            </div>
          )}


          {activeTab === 'statistics' && (
            <div className="space-y-6">
            {!initialized || (loading && !activeSeason) ? (
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  <span>Loading...</span>
                </div>
              </div>
            ) : /* !activeSeason ? (
              <Card>
                <CardContent className="p-8">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                      <BarChart3 className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">No Season Available</h3>
                      <p className="text-muted-foreground">
                        There are currently no active seasons to display statistics for.
                        {!isAdmin && " Please contact an administrator to set up a season."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : */ (
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
                  />
                </CardContent>
              </Card>
            )}
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-6">
            {!initialized || (loading && !activeSeason) ? (
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  <span>Loading...</span>
                </div>
              </div>
            ) : /* !activeSeason ? (
              <Card>
                <CardContent className="p-8">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                      <Calendar className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">No Season Available</h3>
                      <p className="text-muted-foreground">
                        There are currently no active seasons to display schedules for.
                        {!isAdmin && " Please contact an administrator to set up a season."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : */ (
              <ScheduleManager
                season={activeSeason}
                schedule={activeSeason?.schedule || []}
                currentWeek={currentWeek}
                onUpdateGame={isAdmin ? handleGameUpdate : null}
                onDeleteGame={isAdmin ? handleGameDelete : null}
                loading={loading}
                isAuthenticated={isAdmin}
                user={user}
              />
            )}
            </div>
          )}

          {activeTab === 'teams' && (
            <div className="space-y-6">
            {!initialized || (loading && !activeSeason) ? (
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  <span>Loading...</span>
                </div>
              </div>
            ) : /* !activeSeason ? (
              <Card>
                <CardContent className="p-8">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                      <Users className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">No Season Available</h3>
                      <p className="text-muted-foreground">
                        There are currently no active seasons to display teams for.
                        {!isAuthenticated && " Please contact an administrator to set up a season."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : */ (
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
              />
            )}
            </div>
          )}

          {activeTab === 'pickems' && (
            <div className="space-y-6">
            <PickEmsManager
              season={activeSeason}
              currentWeek={currentWeek}
              dataManager={dataManager}
              loading={loading}
              isAuthenticated={isAuthenticated}
              isAdmin={isAdmin}
              user={user}
            />
            </div>
          )}

          {activeTab === 'import' && (
            <div className="space-y-6">
            {isAdmin ? (
              <ScheduleImportManager />
            ) : (
              <Card>
                <CardContent className="p-8">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                      <Download className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">Authentication Required</h3>
                      <p className="text-muted-foreground">
                        Please log in to import and manage ESPN schedules.
                      </p>
                    </div>
                    <Button onClick={() => window.location.reload()}>
                      Log In to Continue
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            </div>
          )}

          {activeTab === 'seasons' && (
            <div className="space-y-6">
            <SeasonManager
              seasons={seasons}
              activeSeason={activeSeason}
              onCreateSeason={isAdmin ? createSeason : null}
              onSetActiveSeason={isAdmin ? setActiveSeasonById : null}
              onDeleteSeason={isAdmin ? deleteSeason : null}
              onExportSeason={exportSeason}
              onImportSeason={isAdmin ? importSeason : null}
              loading={loading}
              isAuthenticated={isAdmin}
            />
            </div>
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
          onDivisionRename={renameDivision}
          onTeamDivisionChange={assignTeamToDivision}
          onCreateDivision={createDivision}
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
  );
};

export default FantasyFootballApp;