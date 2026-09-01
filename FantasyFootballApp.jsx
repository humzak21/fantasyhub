import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Trophy, Calendar, BarChart3, Users, Target, Award, TrendingUp, History, Flame } from 'lucide-react';
import {
  useLeagueData,
  useLeagueMutations,
  useViewedWeek,
  useViewedWeekRankings,
  useHasSubmittedPicks,
  useAwardsUnlockStatus,
  useAwardBallotSeasons,
  useSeasonConfig
} from './hooks/queries/index.js';
import { arePickEmsOpen, areAwardsReleased } from './utils/seasonConfig.js';
import { useViewer } from './src/contexts/ViewerContext.jsx';
import { viewableResultSeasons } from './src/components/awards/resultsAccess.js';
import { Card, CardContent } from './src/components/ui/card';
import { LoginDropdown } from './src/components/auth/LoginDropdown.jsx';
import ErrorBoundary from './utils/errorBoundary.jsx';

// Import global styles
import './globals.css';

// Components
import PowerRankingsTable from './src/components/power-rankings/PowerRankingsTable.jsx';

import InlineWeekNavigator from './src/components/week-controls/InlineWeekNavigator.jsx';

import StandingsDrawer, { StandingsTrigger } from './src/components/standings/StandingsDrawer.jsx';
import { HeaderNav, MobileTabBar } from './src/components/navigation/ResponsiveNavigation.jsx';
import PageContainer from './src/components/layout/PageContainer.jsx';
import RouteLoading from './src/components/layout/RouteLoading.jsx';
import RankingsHeader from './src/components/power-rankings/RankingsHeader.jsx';
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
const TakesManager = lazy(() => import('./src/components/takes/TakesManager.jsx'));

/** The tab `/` resolves to. Also where an unknown or forbidden tab lands. */
const DEFAULT_TAB = 'rankings';

/** Shown while a tab's chunk is in flight — see RouteLoading for why this is
 *  not a skeleton. Skeletons belong where the shape is known; a route-level
 *  fallback does not know what it is standing in for. */
const TabFallback = () => <RouteLoading />;

const FantasyFootballApp = () => {
  // Viewer identity and what they may see. `isTeamOwner` replaces an inline
  // `teamOwnerNames.includes(user.user_metadata.display_name)` that decided
  // History-tab access from the shell.
  const {
    user,
    isAuthenticated,
    isAuthLoading,
    isAdmin,
    isTeamOwner
  } = useViewer();

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
    deleteDivision,
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

  // Awards outlive the season that produced them. The tab used to be gated
  // solely on the *active* season's release date and voting flag — both off for
  // a season that has not run its ballot yet — which sealed the tab over every
  // past season's results, for everyone but the admin.
  const { data: ballotSeasons, isPending: ballotSeasonsLoading } = useAwardBallotSeasons();
  const hasViewableAwardResults = useMemo(
    () =>
      viewableResultSeasons(ballotSeasons, {
        isAdmin,
        activeSeasonResultsReleased: Boolean(awardsUnlockStatus?.resultsReleased)
      }).length > 0,
    [ballotSeasons, isAdmin, awardsUnlockStatus]
  );

  // The tab is the URL, not component state. It used to be `useState`, which
  // meant the phone's back button left the site instead of walking back a tab,
  // and no tab could be linked to or survive a refresh.
  const navigate = useNavigate();
  const { tab } = useParams();
  const activeTab = tab || DEFAULT_TAB;
  const setActiveTab = useCallback((id) => navigate(`/${id}`), [navigate]);

  const [rankingsView, setRankingsView] = useState('table'); // 'table' or 'analysis'
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);
  const [standingsOpen, setStandingsOpen] = useState(false);

  // Check if awards are accessible
  const isAwardsAccessible = () => {
    // Admins always have access
    if (isAdmin) return true;

    // Check if voting is open to all authenticated users
    if (isAuthenticated && awardsUnlockStatus?.votingOpenToAll) return true;

    // A past season that was voted on is reachable on its own account — see
    // `src/components/awards/resultsAccess.js`, which the Results tab's picker
    // reads too so the two cannot disagree about what is in there.
    if (hasViewableAwardResults) return true;

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
      // `shortLabel` is what the phone tab bar shows. A 72px tab cannot hold
      // "Power Rankings", and a truncated label — "Power Ran…" — is a worse
      // affordance than the icon alone.
      { id: 'rankings', label: 'Power Rankings', shortLabel: 'Rankings', icon: Trophy, requiresSeason: true, requiresAuth: false },
      { id: 'statistics', label: 'Statistics', shortLabel: 'Stats', icon: BarChart3, requiresSeason: true, requiresAuth: false },
      { id: 'schedule', label: 'Schedule', icon: Calendar, requiresSeason: true, requiresAuth: false },
      { id: 'teams', label: 'Teams & Rosters', shortLabel: 'Teams', icon: Users, requiresSeason: true, requiresAuth: false },
      // The admin is let through explicitly, the way every `getMasked*` helper
      // already treats them — owning a team is not a prerequisite for running
      // the league.
      { id: 'history', label: 'History', icon: History, requiresSeason: false, requiresAuth: false, customAccess: isAdmin || isTeamOwner },
      { id: 'pickems', label: 'Pick\'ems', icon: Target, requiresSeason: true, requiresAuth: false },
      // Members only. `requiresAuth` is *not* the flag for this — despite the
      // name it means admin-only (`requiresAuth && !isAdmin`), which would hide
      // the board from the fourteen people it is for. `customAccess` is how
      // History already expresses a non-admin audience.
      { id: 'takes', label: 'Takes', icon: Flame, requiresSeason: true, requiresAuth: false, customAccess: isAuthenticated },
      { id: 'playoffs', label: 'Playoffs', icon: TrendingUp, requiresSeason: true, requiresAuth: false },
      // The league-wide TD parlay view is not a destination of its own. It
      // lives inside Pick'ems, next to Submissions, beside the form the picks
      // it reports on are entered in — two people can open it, which is thin
      // grounds for a nav item every other layout has to make room for.
      { id: 'awards', label: 'Awards', icon: Award, requiresSeason: true, requiresAuth: false, customAccess: awardsAccessible }
    ];
  }, [isAuthenticated, isAdmin, awardsUnlockStatus, user, isTeamOwner, seasonConfig, hasViewableAwardResults]);

  // One definition of "may this viewer see this tab", shared by the nav and by
  // the route guard below — they must not be able to disagree.
  const shouldShowTab = useCallback((t) => {
    if (t.requiresAuth && !isAdmin) return false;
    if (t.customAccess !== undefined) {
      const hasAccess = typeof t.customAccess === 'function' ? t.customAccess() : t.customAccess;
      if (!hasAccess) return false;
    }
    return true;
  }, [isAdmin]);

  const activeTabDef = mainTabs.find((t) => t.id === activeTab);

  // What the nav actually renders: the tab list plus the one piece of state
  // that is the shell's to know — whether a tab is waiting on the viewer.
  //
  // Nothing is disabled for a missing season any more. That rule used to read
  // `isAdmin && tab.requiresSeason && !activeSeason`, so the admin got greyed-
  // out tabs while everyone else got working ones — the inversion of what was
  // presumably meant, and either way it contradicts the design directly above:
  // every tab renders its own "no season yet" state, which explains the
  // situation, where a dead nav item explains nothing.
  const needsPicks =
    isAuthenticated && !hasUserSubmittedPicks && !pickemNotificationLoading && arePickemsOpen();
  const navTabs = useMemo(
    () =>
      mainTabs.map((tab) => ({
        ...tab,
        showNotification: tab.id === 'pickems' && needsPicks,
      })),
    [mainTabs, needsPicks]
  );

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
  const handleDeleteDivision = (divisionId) => deleteDivision.mutateAsync(divisionId);
  const handleTeamDivisionChange = (teamId, divisionId) =>
    assignTeamToDivision.mutateAsync({ teamId, divisionId });


  // Note: Allow users to stay on any tab even without an active season
  // Each tab will show appropriate "no season available" messages

  // A URL naming a tab that does not exist is wrong right away. A URL naming a
  // tab this viewer may not open is only knowable once the league data that
  // access depends on has arrived — redirecting before then would bounce a
  // legitimate deep link to /awards or /history on every cold load.
  //
  // The session is the other half of that answer, and it resolves on its own
  // schedule: `isAuthenticated` reads false while a stored session is still
  // being read back, which is indistinguishable from signed out. Waiting for
  // `isAuthLoading` is what lets a member's bookmarked /takes survive a cold
  // load — and it fixes the same latent bounce on /history, whose access runs
  // through `isTeamOwner` and so was already exposed to it.
  //
  // The ballot-season list is the third such input, and for the same reason:
  // while it is in flight `hasViewableAwardResults` is false, which is
  // indistinguishable from "no past season has results" — so a bookmarked
  // /awards would bounce on every cold load without this.
  if (!activeTabDef) return <Navigate to={`/${DEFAULT_TAB}`} replace />;
  if (!isLoading && !isAuthLoading && !ballotSeasonsLoading && !shouldShowTab(activeTabDef)) {
    return <Navigate to={`/${DEFAULT_TAB}`} replace />;
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background">
        {/* Header - Responsive Design */}
        <header className="sticky top-0 z-50 w-full border-b bg-card/80 backdrop-blur-sm">
          <PageContainer>
            {/* Not `justify-between`.
                That pushed the two groups to opposite edges and parked all the
                slack in one visible void between the standings button and the
                first nav item — 159px of it at 1536. The row is a single flex
                line with one gap now: navigation sits directly after the
                controls it belongs with, and the leftover space collects in
                front of the account control, in the corner, where it reads as
                margin rather than as a hole. */}
            <div className="flex h-14 items-center gap-2 sm:h-16 sm:gap-3">
              {/* LEFT — the constant side: who and when.
                  Identity, the week being viewed, and the standings. These are
                  the controls that are on every page and mean the same thing
                  on every page, so they hold one position the eye can learn.
                  Keeping them together also frees the right-hand side to grow:
                  navigation is what changes as the app gains tabs, and it can
                  do that without shunting the week control around.

                  The season name reads at every width — it used to be the
                  first thing sacrificed to make room for the hamburger, so a
                  phone user could not tell which season they were looking at.
                  Below lg the brand *may* shrink: there is no nav on this row
                  to protect, and a signed-out "Login" button is wider than a
                  signed-in avatar, which is what once pushed a 375px header
                  3px past the viewport. Truncating the league name is the
                  right thing to give up there. */}
              <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3 lg:shrink-0">
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg">
                    <img src="og jits logo.jpg" alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="truncate font-display text-lg font-semibold leading-tight tracking-tight sm:text-xl">
                      og jits
                    </h1>
                    {activeSeason && (
                      <p className="truncate text-xs leading-tight text-muted-foreground">
                        {activeSeason.name || `${activeSeason.year} Season`}
                      </p>
                    )}
                  </div>
                </div>

                {activeSeason && (
                  <>
                    {/* A hairline between the brand and the controls, so the
                        two read as identity *and* tools rather than as one
                        undifferentiated cluster. */}
                    <span className="hidden h-6 w-px shrink-0 bg-border sm:block" aria-hidden="true" />
                    <InlineWeekNavigator
                      currentWeek={viewedWeek}
                      totalWeeks={activeSeason.totalWeeks}
                      regularSeasonWeeks={activeSeason.regularSeasonWeeks}
                      onWeekChange={setViewedWeek}
                      completedWeeks={completedWeeks}
                      season={activeSeason}
                    />
                    <StandingsTrigger onClick={() => setStandingsOpen(true)} />
                  </>
                )}
              </div>

              {/* RIGHT — the side that grows: where to go, and who you are.
                  Navigation lives here because it is the part of the header
                  that gains items over time; anything new belongs on this
                  side, where it pushes against the account control rather
                  than against the week. */}
              {/* The nav takes the remaining width and lays its items out from
                  the left, so the distance from the standings button to the
                  first tab is the row's own gap and nothing more. Growing the
                  tab list consumes this space outwards instead of re-centring
                  everything; when it runs out, the nav scrolls rather than
                  pushing the page wider. */}
              <div className="flex min-w-0 flex-1 items-center">
                <HeaderNav
                  tabs={navTabs}
                  activeTab={activeTab}
                  shouldShowTab={shouldShowTab}
                />
              </div>

              <div className="flex shrink-0 items-center">
                <LoginDropdown />
              </div>
            </div>
          </PageContainer>
        </header>

        {/* Main content.
            The bottom padding clears the phone tab bar: it is `fixed`, so it
            does not occupy layout space, and without this the last row of
            every page sits under it. `pb-safe` handles the home indicator
            below that. */}
        <PageContainer
          as="main"
          className="py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:py-8 sm:pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:py-10 lg:pb-10"
        >


          {/* Error Display */}
          {/* `{error}` — not `{error.message}` — was rendering an Error object
              as a React child, which is React error #31 and takes down the
              whole tree. So the one branch that exists to *report* a failed
              load was itself the thing that turned a failed load into
              "Something went wrong", with the real message lost. Any data
              error did this; it needed no exotic conditions, only a request
              that did not succeed. */}
          {error && (
            <Card className="mb-6 border-destructive">
              <CardContent className="p-4">
                <p className="text-destructive">
                  {error instanceof Error ? error.message : String(error)}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Tab Content. One Suspense boundary covers every lazy tab; the
              landing tab's table is eager so the first paint needs no chunk. */}
          <div className="space-y-6">
            <Suspense fallback={<TabFallback />}>
            {activeTab === 'rankings' && (
              <ErrorBoundary key="rankings-error-boundary">
                <div>
                  <RankingsHeader
                    week={viewedWeek}
                    view={rankingsView}
                    onViewChange={setRankingsView}
                    showAdvanced={showAdvancedStats}
                    onShowAdvancedChange={setShowAdvancedStats}
                  />
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
                </div>
              </ErrorBoundary>
            )}


            {activeTab === 'statistics' && (
              <ErrorBoundary key="statistics-error-boundary">
                <StatisticsPanel
                  rankings={weeklyRankings}
                  currentWeek={viewedWeek}
                  season={activeSeason}
                  loading={rankingsLoading}
                />
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
                    season={activeSeason}
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

            {activeTab === 'takes' && (
              <ErrorBoundary key="takes-error-boundary">
                <div className="space-y-6">
                  <TakesManager
                    season={activeSeason}
                    currentWeek={viewedWeek}
                    /* Auth counts as loading here. Until the session resolves
                       the page cannot tell a member from a visitor, and the
                       honest answer to "who is this" is not yet, rather than a
                       board that flashes its signed-out state and then flips. */
                    loading={isLoading || isAuthLoading}
                    isAuthenticated={isAuthenticated}
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
        </PageContainer>

        {/* The phone tab bar is a sibling of the header, not a child of it.
            The header carries `backdrop-blur`, and backdrop-filter makes an
            element the containing block for `position: fixed` descendants —
            nested inside it, `bottom-0` resolved against the header and the
            bar rendered directly beneath it at the top of the screen. */}
        <MobileTabBar tabs={navTabs} activeTab={activeTab} shouldShowTab={shouldShowTab} />

        {/* Standings Drawer */}
        {activeSeason && (
          <StandingsDrawer
            open={standingsOpen}
            onOpenChange={setStandingsOpen}
            seasonId={activeSeason.id}
            teams={activeSeason.teams || []}
            divisions={divisions}
            standings={standings}
            currentWeek={viewedWeek}
            seasonYear={activeSeason.year}
            loading={isLoading}
            isAuthenticated={isAdmin}
            onDivisionRename={handleRenameDivision}
            onTeamDivisionChange={handleTeamDivisionChange}
            onCreateDivision={handleCreateDivision}
            onDivisionDelete={handleDeleteDivision}
            games={activeSeason.schedule || []}
          />
        )}

        {/*
          There is no full-screen loading overlay any more.
          It was already halfway to being removed: a previous pass narrowed it
          from "any loading" to "first load with no season", because every
          mutation used to black out the page behind a modal. The remaining
          case was still wrong, and CI proved it — a fixed `inset-0` panel at
          z-50 sits *above* the z-40 tab bar, so whenever the league data does
          not arrive the app is not merely blank, it is unusable: navigation is
          covered, and no tab can be reached to see what else works.

          "Does not arrive" is not hypothetical. It is a dropped connection, an
          outage, a bad anon key — and in those cases the shell, the nav and
          every page's own empty state are exactly what the reader needs. Each
          surface already owns its loading state (RouteLoading, per-page empty
          states), so nothing here needs a modal on top of them.
        */}
      </div>
    </ErrorBoundary>
  );
};

export default FantasyFootballApp;