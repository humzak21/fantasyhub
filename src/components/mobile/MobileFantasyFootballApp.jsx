import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Trophy, Calendar, BarChart3, Users, Settings, Target, Download, Menu, X, User, Save, CheckCircle, AlertCircle, Shield, Award } from 'lucide-react';
import { useAuth } from '../../../src/contexts/AuthContext.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import {
  useLeagueData,
  useLeagueMutations,
  useViewedWeek,
  useViewedWeekRankings
} from '../../../hooks/queries/index.js';
import { supabase } from '../../../services/supabaseClient.js';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import MobileNavigation from './MobileNavigation.jsx';
import MobileWeekSelector from './MobileWeekSelector.jsx';

// The feature components are the shared, responsive ones. Only the shell —
// navigation, the week selector and the touch primitives — stays mobile-only.
// Each of these replaced a Mobile* twin that reimplemented the same feature.
import PowerRankingsTable from '../power-rankings/PowerRankingsTable.jsx';

// One chunk per tab, same as the desktop shell. The landing tab's
// table stays eager so the first paint needs no chunk.
const StatisticsPanel = lazy(() => import('../dashboard/StatisticsPanel.jsx'));
const ScheduleManager = lazy(() => import('../schedule/ScheduleManager.jsx'));
const TeamsAndRosters = lazy(() => import('../teams/TeamsAndRosters.jsx'));
const PickEmsManager = lazy(() => import('../pickems/PickEmsManager.jsx'));
const AwardsManager = lazy(() => import('../awards/AwardsManager.jsx'));
import MobileUserSettingsPage from './MobileUserSettingsPage.jsx';
import { MobileInput } from './MobileInput.jsx';
import MobileButton from './MobileButton.jsx';
import {
  MobileLoadingState,
  MobileErrorBoundary,
  useMobilePerformance,
  useMobileDebounce,
  mobilePrefetch
} from '../../../utils/mobilePerformance.jsx';
import {
  MobileFadeIn,
  MobileSlideIn,
  useMobileAnimation
} from '../../../utils/mobileAnimations.jsx';
import { MobileTouchButton, useMobileTouch } from '../../../utils/mobileTouch.jsx';

// Import mobile-specific styles
import '../../../styles/mobile.css';

const MobileFantasyFootballApp = () => {
  const { user, isAuthenticated, isAdmin } = useViewer();

  // Same query layer as the desktop shell, so both read one cache: switching
  // between them (or resizing across the breakpoint) refetches nothing.
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

  const { viewedWeek, setViewedWeek } = useViewedWeek();
  const { addTeam, updateTeam, removeTeam, addGame } = useLeagueMutations(seasonId);
  const { data: weeklyRankings = [], isPending: rankingsLoading } =
    useViewedWeekRankings(seasonId);


  const handleAddTeam = (name, owner) => addTeam.mutateAsync({ name, owner });
  const handleUpdateTeam = (teamId, updates) => updateTeam.mutateAsync({ teamId, updates });
  const handleRemoveTeam = (teamId) => removeTeam.mutateAsync(teamId);

  // Was `dataManager?.updateGame`, a method that has never existed on the data
  // manager — so mobile score editing has been passing `undefined` and throwing
  // on save. Same mutation the desktop shell uses.
  const handleGameUpdate = (week, team1Id, team2Id, team1Score, team2Score) =>
    addGame.mutateAsync({ week, team1Id, team2Id, team1Score, team2Score });

  const [activeTab, setActiveTab] = useState('rankings');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showWeekSelector, setShowWeekSelector] = useState(false);
  const weekButtonRef = useRef(null);
  const [progressiveLoadingStep, setProgressiveLoadingStep] = useState(0);

  // Mobile performance monitoring
  const { metrics, logPerformance } = useMobilePerformance();

  // Debounced active tab for performance
  const debouncedActiveTab = useMobileDebounce(activeTab, 150);

  // Progressive loading initialization
  useEffect(() => {
    setProgressiveLoadingStep(1);

    const initTimer = setTimeout(() => {
      setProgressiveLoadingStep(2);
    }, 100);

    return () => clearTimeout(initTimer);
  }, []);

  // Prefetch next likely tab components
  useEffect(() => {
    if (activeTab === 'rankings') {
      mobilePrefetch.route('../components/MobileStatistics.jsx');
    } else if (activeTab === 'statistics') {
      mobilePrefetch.route('../components/MobilePowerRankings.jsx');
    }
  }, [activeTab]);

  // The week-seeding effect, the hourly override effect and the rankings fetch
  // effect that used to live here are gone: week derivation is now a pure
  // function of the season row (hooks/queries/useWeek) and rankings are a query.


  const closeMobileMenu = () => setMobileMenuOpen(false);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    closeMobileMenu();
  };

  const handleWeekChange = (week) => {
    setViewedWeek(week);
    setShowWeekSelector(false);
  };

  const handleWeekSelectorToggle = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    setShowWeekSelector(!showWeekSelector);
  };

  const handleWeekSelectorClose = () => {
    setShowWeekSelector(false);
  };

  return (
    <MobileErrorBoundary>
      <div className="mobile-app min-h-screen bg-gradient-to-br from-slate-50 to-slate-100" style={{
        opacity: progressiveLoadingStep >= 2 ? 1 : 0.8,
        transition: 'opacity 0.3s ease-in-out'
      }}>
      {/* Mobile Header */}
      <header className="mobile-header sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between px-4">
          {/* Logo and Title */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
              <img src="og jits logo.jpg" alt="og jits logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">og jits</h1>
              {activeSeason && (
                <p className="text-sm text-muted-foreground">
                  {activeSeason.name || `${activeSeason.year} Season`}
                </p>
              )}
            </div>
          </div>

          {/* Week Display and Selector */}
          {activeSeason && (
            <div className="relative flex items-center space-x-2">
              <MobileTouchButton
                ref={weekButtonRef}
                onPress={handleWeekSelectorToggle}
                className="touch-target border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3 inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors"
                hapticFeedback={true}
              >
                <span className="text-sm font-medium">Week {viewedWeek}</span>
              </MobileTouchButton>

              {/* Week Selector Dropdown */}
              <MobileWeekSelector
                isOpen={showWeekSelector}
                onClose={handleWeekSelectorClose}
                currentWeek={viewedWeek}
                totalWeeks={activeSeason.totalWeeks}
                regularSeasonWeeks={activeSeason.regularSeasonWeeks || 14}
                onWeekChange={handleWeekChange}
                completedWeeks={completedWeeks}
                anchorRef={weekButtonRef}
              />
            </div>
          )}

          {/* Mobile Menu Button */}
          <MobileTouchButton
            onPress={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="mobile-menu-trigger touch-target mobile-ripple p-2 rounded-md hover:bg-gray-100 transition-colors"
            hapticFeedback={true}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </MobileTouchButton>
        </div>
      </header>

      {/* Mobile Navigation */}
      <MobileNavigation
        isOpen={mobileMenuOpen}
        onClose={closeMobileMenu}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isAuthenticated={isAuthenticated}
        activeSeason={activeSeason}
        currentWeek={viewedWeek}
      />


      {/* Main Content */}
      <main className="mobile-main mobile-optimized">
        {/* Error Display */}
        {error && (
          <Card className="mb-4 border-destructive">
            <CardContent className="p-4">
              <p className="text-destructive text-sm">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && !activeSeason ? (
          <MobileLoadingState
            type="spinner"
            size="lg"
            message="Preparing your fantasy football experience"
            className="min-h-[400px]"
          />
        ) : (
          <div className="space-y-4">
            {/* Mobile Content Area */}
            <MobileSlideIn direction="up" delay={200}>
              <Card className="min-h-[400px] mobile-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl flex items-center space-x-2">
                      {activeTab === 'rankings' && <><Trophy className="h-5 w-5 text-primary" /><span>Power Rankings</span></>}
                      {activeTab === 'teams' && <><Users className="h-5 w-5 text-primary" /><span>Teams & Rosters</span></>}
                      {activeTab === 'pickems' && <><Target className="h-5 w-5 text-primary" /><span>Pick'ems</span></>}
                      {activeTab === 'awards' && <><Award className="h-5 w-5 text-primary" /><span>Awards</span></>}
                      {activeTab === 'settings' && <><Settings className="h-5 w-5 text-primary" /><span>Settings</span></>}
                      {activeTab === 'seasons' && <><Settings className="h-5 w-5 text-primary" /><span>Season Management</span></>}
                      {activeTab === 'import' && <><Download className="h-5 w-5 text-primary" /><span>Import Schedule</span></>}
                    </CardTitle>
                  </div>
                  
                  {/* Quick Actions */}
                  <div className="flex items-center space-x-2">
                    {activeSeason && activeTab === 'rankings' && (
                      <Badge variant="outline" className="text-xs">
                        Week {viewedWeek}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                {/* No Season State */}
                {!activeSeason && activeTab !== 'seasons' && activeTab !== 'import' ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center mb-4">
                      <Trophy className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No Season Available</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      There are currently no active seasons to display {activeTab} for.
                    </p>
                    {!isAdmin && (
                      <p className="text-xs text-muted-foreground">
                        Please contact an administrator to set up a season.
                      </p>
                    )}
                    {isAdmin && (
                      <Button
                        onClick={() => handleTabChange('seasons')}
                        className="touch-target"
                      >
                        Manage Seasons
                      </Button>
                    )}
                  </div>
                ) : (
                  /* Feature content — shared responsive components */
                  <Suspense
                    fallback={
                      <Card className="p-6">
                        <CardContent className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                          <span>Loading…</span>
                        </CardContent>
                      </Card>
                    }
                  >
                  <div>
                    {/* Power Rankings */}
                    {activeTab === 'rankings' && (
                      <PowerRankingsTable
                        rankings={weeklyRankings}
                        currentWeek={viewedWeek}
                        loading={rankingsLoading}
                        showAdvanced={true}
                        analyticsData={{}}
                        showAnalytics={false}
                      />
                    )}

                    {/* Statistics */}
                    {activeTab === 'statistics' && (
                      <StatisticsPanel
                        rankings={weeklyRankings}
                        currentWeek={viewedWeek}
                        season={activeSeason}
                      />
                    )}

                    {/* Schedule */}
                    {activeTab === 'schedule' && (
                      <ScheduleManager
                        season={activeSeason}
                        schedule={activeSeason?.schedule || []}
                        currentWeek={viewedWeek}
                        onUpdateGame={isAdmin ? handleGameUpdate : null}
                        onDeleteGame={null}
                        loading={isLoading}
                        isAuthenticated={isAdmin}
                        powerRankings={weeklyRankings}
                        rosters={rosters}
                      />
                    )}

                    {/* Teams & Rosters */}
                    {activeTab === 'teams' && (
                      <TeamsAndRosters
                        teams={activeSeason?.teams || []}
                        rosters={rosters}
                        onAddTeam={handleAddTeam}
                        onUpdateTeam={handleUpdateTeam}
                        onRemoveTeam={handleRemoveTeam}
                        loading={isLoading}
                        powerRankings={weeklyRankings}
                        isAuthenticated={isAdmin}
                      />
                    )}

                    {/* Pick'ems */}
                    {activeTab === 'pickems' && (
                      <PickEmsManager
                        season={activeSeason}
                        currentWeek={viewedWeek}
                        loading={isLoading}
                        isAuthenticated={isAuthenticated}
                      />
                    )}

                    {activeTab === 'awards' && (
                      <AwardsManager
                        season={activeSeason}
                        currentWeek={viewedWeek}
                        loading={isLoading}
                        isAuthenticated={isAuthenticated}
                      />
                    )}

                    {/* Mobile Settings */}
                    {activeTab === 'settings' && (
                      <div className="space-y-4">
                        {/* Settings content inline */}
                        <MobileSettingsContent />
                      </div>
                    )}

                    {/* Admin-only tabs live on the settings page, not here.
                        This used to be a build-log placeholder listing which
                        Mobile* components had been written — and because
                        'awards' was missing from its exclusion list, the awards
                        tab rendered the real component *and* a "will be
                        implemented in subsequent tasks" notice underneath it. */}
                    {!['rankings', 'statistics', 'schedule', 'teams', 'pickems', 'awards', 'settings'].includes(activeTab) && (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
                          {activeTab === 'seasons' && <Settings className="h-8 w-8 text-primary" />}
                          {activeTab === 'import' && <Download className="h-8 w-8 text-primary" />}
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Not available on mobile</h3>
                        <p className="text-muted-foreground text-sm">
                          League administration is available on the settings page.
                        </p>
                      </div>
                    )}
                  </div>
                  </Suspense>
                )}
              </CardContent>
              </Card>
            </MobileSlideIn>
          </div>
        )}
      </main>

      {/* First load only — see the note on the desktop shell's overlay. */}
      {isLoading && !activeSeason && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="text-sm">Loading...</span>
            </div>
          </Card>
        </div>
        )}
      </div>
    </MobileErrorBoundary>
  );
};

// Inline Settings Content Component
const MobileSettingsContent = () => {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize display name from user metadata
  useEffect(() => {
    if (user) {
      const currentDisplayName = user.user_metadata?.full_name || user.user_metadata?.name || '';
      setDisplayName(currentDisplayName);
      setHasChanges(false);
    }
  }, [user]);

  // Clear message after a few seconds
  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ type: '', text: '' });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleDisplayNameChange = (value) => {
    setDisplayName(value);
    const currentDisplayName = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
    setHasChanges(value.trim() !== currentDisplayName);
    setMessage({ type: '', text: '' });
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      setMessage({ type: 'error', text: 'Full name cannot be empty' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: displayName.trim(),
          name: displayName.trim()
        }
      });

      if (error) {
        throw error;
      }

      setMessage({
        type: 'success',
        text: 'Full name updated successfully!'
      });
      setHasChanges(false);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Failed to update full name.'
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (!user) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">Please sign in to access settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Profile Settings */}
      <div className="bg-white rounded-lg p-4 border border-gray-100">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Profile Information</h3>
            <p className="text-sm text-gray-600">Update your profile details</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <MobileInput
              label="Full Name (First Last)"
              placeholder="Enter your full name"
              value={displayName}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              clearable
            />
            <p className="text-xs text-gray-500 mt-1">
              We use your full name to match you with your team in the league.
            </p>
          </div>

          <div>
            <MobileInput
              label="Email Address"
              value={user?.email || ''}
              disabled
              type="email"
            />
            <p className="text-xs text-gray-500 mt-1">
              Email cannot be changed from here.
            </p>
          </div>

          {message.text && (
            <div className={`p-3 rounded-lg border text-sm ${
              message.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-green-50 border-green-200 text-green-700'
            }`}>
              <div className="flex items-center space-x-2">
                {message.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                )}
                <span>{message.text}</span>
              </div>
            </div>
          )}

          <div className="flex space-x-2">
            <MobileButton
              onClick={handleSave}
              disabled={loading || !hasChanges}
              loading={loading}
              variant="primary"
              className="flex-1"
              icon={Save}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </MobileButton>
            {hasChanges && (
              <MobileButton
                onClick={() => {
                  const currentDisplayName = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
                  setDisplayName(currentDisplayName);
                  setHasChanges(false);
                  setMessage({ type: '', text: '' });
                }}
                variant="secondary"
                className="flex-1"
              >
                Cancel
              </MobileButton>
            )}
          </div>
        </div>
      </div>

      {/* Account Information */}
      <div className="bg-white rounded-lg p-4 border border-gray-100">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <Shield className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Account Information</h3>
            <p className="text-sm text-gray-600">View your account details</p>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Account Created</span>
            <span className="font-medium">{formatDate(user?.created_at)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Last Sign In</span>
            <span className="font-medium">{formatDate(user?.last_sign_in_at)}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-gray-600">Email Verified</span>
            <span className={`font-medium ${user?.email_confirmed_at ? 'text-green-600' : 'text-orange-600'}`}>
              {user?.email_confirmed_at ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileFantasyFootballApp;