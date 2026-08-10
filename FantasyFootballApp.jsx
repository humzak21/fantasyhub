import { useState, useMemo, lazy, Suspense } from 'react';
import { Trophy, Calendar, BarChart3, Users, Target, Award, TrendingUp, History } from 'lucide-react';
import {
  useLeagueData,
  useLeagueMutations,
  useViewedWeek,
  useViewedWeekRankings,
  useHasSubmittedPicks,
  useAwardsUnlockStatus,
  useSeasonConfig
} from './hooks/queries/index.js';
import { arePickEmsOpen, areAwardsReleased } from './utils/seasonConfig.js';
import { useViewer } from './src/contexts/ViewerContext.jsx';
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

import InlineWeekNavigator from './src/components/week-controls/InlineWeekNavigator.jsx';

import StandingsDrawer from './src/components/standings/StandingsDrawer.jsx';
import ResponsiveNavigation from './src/components/navigation/ResponsiveNavigation.jsx';
import { ErrorFallback } from './utils/errorBoundary.jsx';

// One chunk per tab. Every tab, both app shells and recharts used to ship in
// the initial bundle; only the landing tab's table is eager now.
const StatisticsPanel = lazy(() => import('./src/components/dashboard/StatisticsPanel.jsx'));
const ScheduleManager = lazy(() => import('./src/components/schedule/ScheduleManager.jsx'));
const TeamsAndRosters = lazy(() => import('./src/components/teams/TeamsAndRosters.jsx'));
const PowerRankingsVisualization = lazy(() => import('./src/components/power-rankings/PowerRankingsVisualization.jsx'));
const PickEmsManager = lazy(() => import('./src/components/pickems/PickEmsManager.jsx'));
const AwardsManager = lazy(() => import('./src/components/awards/AwardsManager.jsx'));
const PlayoffsBracketManager = lazy(() => import('./src/components/playoffs/PlayoffsBracketManager.jsx'));
const LeagueHistoryManager = lazy(() => import('./src/components/history/LeagueHistoryManager.jsx'));

/** Shown while a tab's chunk is in flight. */
const TabFallback = () => (
  <Card className="p-8">
    <CardContent className="flex items-center justify-center gap-3 text-muted-foreground">
      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
      <span>Loading…</span>
    </CardContent>
  </Card>
);

const FantasyFootballApp = () => {
  // Viewer identity and what they may see. `isTeamOwner` replaces an inline
  // `teamOwnerNames.includes(user.user_metadata.display_name)` that decided
  // History-tab access from the shell.
  const { user, isAuthenticated, isAdmin, isTeamOwner } = useViewer();

  // One query per thing, each with its own loading state. Replaces the
  // 60-callback mega-hook whose every mutation refetched the entire league.
  const {
    activeSeason,
    divisions,
    standings,
    rosters,
    completedWeeks,
    isLoading,
    error
  } = useLeagueData();

  const seasonId = activeSeason?.id ?? null;
  const seasonConfig = useSeasonConfig();

  // `viewedWeek` is UI state the user owns; `actualWeek` is derived from the
  // season start date. Neither writes to the other — see hooks/queries/useWeek.
  const { viewedWeek, setViewedWeek, actualWeek } = useViewedWeek();

  const {
    addTeam,
    updateTeam,
    removeTeam,
    addGame,
    createDivision,
    renameDivision,
    assignTeamToDivision
  } = useLeagueMutations(seasonId);

  const { data: weeklyRankings = [], isPending: rankingsLoading } =
    useViewedWeekRankings(seasonId);

  // The nav dot asks "have you submitted *this week's* picks", so it follows the
  // actual week. Browsing back to week 3 must not light it up. The pick'ems tab
  // itself still follows `viewedWeek`.
  const { hasSubmitted: hasUserSubmittedPicks, isLoading: pickemNotificationLoading } =
    useHasSubmittedPicks(seasonId, actualWeek, { enabled: isAuthenticated && Boolean(user) });

  const { status: awardsUnlockStatus } = useAwardsUnlockStatus(seasonId);


  const [activeTab, setActiveTab] = useState('rankings');
  const [rankingsView, setRankingsView] = useState('table'); // 'table' or 'analysis'
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);

  // Check if awards are accessible
  const isAwardsAccessible = () => {
    // Admins always have access
    if (isAdmin) return true;

    // Check if voting is open to all authenticated users
    if (isAuthenticated && awardsUnlockStatus?.votingOpenToAll) return true;

    // Otherwise the season's own release date decides.
    return areAwardsReleased(seasonConfig);
  };

  // Check if pickems are still open. The window comes from the season row
  // (open Tuesday 04:00, close Thursday 20:00 in the league's time zone),
  // not from a weekday/hour rule duplicated in the view layer.
  const arePickemsOpen = () => arePickEmsOpen(seasonConfig, actualWeek);

  // Main navigation tabs - use useMemo to recalculate when dependencies change
  const mainTabs = useMemo(() => {
    const awardsAccessible = isAwardsAccessible();

    return [
      { id: 'rankings', label: 'Power Rankings', icon: Trophy, requiresSeason: true, requiresAuth: false },
      { id: 'statistics', label: 'Statistics', icon: BarChart3, requiresSeason: true, requiresAuth: false },
      { id: 'schedule', label: 'Schedule', icon: Calendar, requiresSeason: true, requiresAuth: false },
      { id: 'teams', label: 'Teams & Rosters', icon: Users, requiresSeason: true, requiresAuth: false },
      // The admin is let through explicitly, the way every `getMasked*` helper
      // already treats them — owning a team is not a prerequisite for running
      // the league.
      { id: 'history', label: 'History', icon: History, requiresSeason: false, requiresAuth: false, customAccess: isAdmin || isTeamOwner },
      { id: 'pickems', label: 'Pick\'ems', icon: Target, requiresSeason: true, requiresAuth: false },
      { id: 'playoffs', label: 'Playoffs', icon: TrendingUp, requiresSeason: true, requiresAuth: false },
      { id: 'awards', label: 'Awards', icon: Award, requiresSeason: true, requiresAuth: false, customAccess: awardsAccessible }
    ];
  }, [isAuthenticated, isAdmin, awardsUnlockStatus, user, isTeamOwner]);



  // Mutations arrive as TanStack objects; the tab components still take plain
  // callbacks, so adapt at the boundary rather than rewriting every child.
  const handleGameUpdate = (week, team1Id, team2Id, team1Score, team2Score) =>
    addGame.mutateAsync({ week, team1Id, team2Id, team1Score, team2Score });

  const handleAddTeam = (name, owner) => addTeam.mutateAsync({ name, owner });
  const handleUpdateTeam = (teamId, updates) => updateTeam.mutateAsync({ teamId, updates });
  const handleRemoveTeam = (teamId) => removeTeam.mutateAsync(teamId);
  const handleCreateDivision = (name, displayOrder) =>
    createDivision.mutateAsync({ name, displayOrder });
  const handleRenameDivision = (divisionId, name) =>
    renameDivision.mutateAsync({ divisionId, name });
  const handleTeamDivisionChange = (teamId, divisionId) =>
    assignTeamToDivision.mutateAsync({ teamId, divisionId });


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
                      currentWeek={viewedWeek}
                      totalWeeks={activeSeason.totalWeeks}
                      regularSeasonWeeks={activeSeason.regularSeasonWeeks}
                      onWeekChange={setViewedWeek}
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
                      currentWeek={viewedWeek}
                      totalWeeks={activeSeason.totalWeeks}
                      regularSeasonWeeks={activeSeason.regularSeasonWeeks}
                      onWeekChange={setViewedWeek}
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
                      currentWeek={viewedWeek}
                      totalWeeks={activeSeason.totalWeeks}
                      regularSeasonWeeks={activeSeason.regularSeasonWeeks}
                      onWeekChange={setViewedWeek}
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
                  // Check custom access (can be boolean or function for backwards compatibility)
                  if (tab.customAccess !== undefined) {
                    const hasAccess = typeof tab.customAccess === 'function' ? tab.customAccess() : tab.customAccess;
                    if (!hasAccess) return false;
                  }
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

          {/* Tab Content. One Suspense boundary covers every lazy tab; the
              landing tab's table is eager so the first paint needs no chunk. */}
          <div className="space-y-6">
            <Suspense fallback={<TabFallback />}>
            {activeTab === 'rankings' && (
              <ErrorBoundary key="rankings-error-boundary">
                <div className="space-y-6">
                  <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CardTitle>Week {viewedWeek} Power Rankings</CardTitle>
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
                            currentWeek={viewedWeek}
                            showAdvanced={showAdvancedStats}
                            loading={rankingsLoading}
                            initializing={isLoading}
                          />
                        ) : (
                          <PowerRankingsVisualization
                            rankings={weeklyRankings}
                            currentWeek={viewedWeek}
                            loading={rankingsLoading}
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
                        currentWeek={viewedWeek}
                        season={activeSeason}
                        loading={rankingsLoading}
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
                    currentWeek={viewedWeek}
                    onUpdateGame={isAdmin ? handleGameUpdate : null}
                    onDeleteGame={null}
                    onWeekChange={setViewedWeek}
                    loading={isLoading}
                    isAuthenticated={isAdmin}
                    powerRankings={weeklyRankings}
                    rosters={rosters}
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
                    onAddTeam={isAdmin ? handleAddTeam : null}
                    onUpdateTeam={isAdmin ? handleUpdateTeam : null}
                    onRemoveTeam={isAdmin ? handleRemoveTeam : null}
                    loading={isLoading}
                    powerRankings={weeklyRankings}
                    isAuthenticated={isAdmin}
                  />
                </div>
              </ErrorBoundary>
            )}

            {activeTab === 'pickems' && (
              <ErrorBoundary key="pickems-error-boundary">
                <div className="space-y-6">
                  <PickEmsManager
                    season={activeSeason}
                    currentWeek={viewedWeek}
                    loading={isLoading}
                    isAuthenticated={isAuthenticated}
                    initializing={isLoading}
                  />
                </div>
              </ErrorBoundary>
            )}

            {activeTab === 'awards' && (
              <ErrorBoundary key="awards-error-boundary">
                <div className="space-y-6">
                  <AwardsManager
                    season={activeSeason}
                    currentWeek={viewedWeek}
                    loading={isLoading}
                    isAuthenticated={isAuthenticated}
                  />
                </div>
              </ErrorBoundary>
            )}

            {activeTab === 'playoffs' && (
              <ErrorBoundary key="playoffs-error-boundary">
                <div className="space-y-6">
                  <PlayoffsBracketManager
                    season={activeSeason}
                    currentWeek={viewedWeek}
                    loading={isLoading}
                    isAuthenticated={isAuthenticated}
                  />
                </div>
              </ErrorBoundary>
            )}

            {activeTab === 'history' && (
              <ErrorBoundary key="history-error-boundary">
                <div className="space-y-6">
                  <LeagueHistoryManager
                    activeSeason={activeSeason}
                  />
                </div>
              </ErrorBoundary>
            )}
            </Suspense>
          </div>
        </main>

        {/* Standings Drawer */}
        {activeSeason && (
          <StandingsDrawer
            teams={activeSeason.teams || []}
            divisions={divisions}
            standings={standings}
            currentWeek={viewedWeek}
            loading={isLoading}
            isAuthenticated={isAdmin}
            onDivisionRename={handleRenameDivision}
            onTeamDivisionChange={handleTeamDivisionChange}
            onCreateDivision={handleCreateDivision}
            games={activeSeason.schedule || []}
          />
        )}

        {/*
          First load only. This used to be `{loading && ...}` on the mega-hook's
          single flag, which every mutation set — so saving one score blacked out
          the whole page behind a modal until seasons, teams, games, rosters,
          divisions and standings had all been refetched. Widgets now show their
          own loading state and the page stays usable.
        */}
        {isLoading && !activeSeason && (
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