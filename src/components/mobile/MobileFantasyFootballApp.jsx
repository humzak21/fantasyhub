import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Calendar, BarChart3, Users, Settings, Target, Download, Menu, X } from 'lucide-react';
import { useAuth } from '../../../src/contexts/AuthContext.jsx';
import { useSupabaseFantasyData } from '../../../hooks/useSupabaseFantasyData.js';
import { getCurrentWeek } from '../../../utils/weekCalculator.js';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import MobileNavigation from './MobileNavigation.jsx';
import MobilePowerRankings from './MobilePowerRankings.jsx';
import MobileStatistics from './MobileStatistics.jsx';
import MobileSchedule from './MobileSchedule.jsx';
import MobileTeamsAndRosters from './MobileTeamsAndRosters.jsx';
import MobileWeekSelector from './MobileWeekSelector.jsx';
import MobilePickEms from './MobilePickEms.jsx';
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
  const { isAuthenticated, isAdmin } = useAuth();

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [weeklyRankings, setWeeklyRankings] = useState([]);
  const [rankingsLoading, setRankingsLoading] = useState(false);
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

  // Initialize current week based on calendar date
  useEffect(() => {
    const calendarWeek = getCurrentWeek();
    if (calendarWeek !== currentWeek) {
      setCurrentWeek(calendarWeek);
    }

    const weekCheckInterval = setInterval(() => {
      const newCalendarWeek = getCurrentWeek();
      if (newCalendarWeek !== currentWeek) {
        setCurrentWeek(newCalendarWeek);
      }
    }, 60 * 60 * 1000);

    return () => clearInterval(weekCheckInterval);
  }, []);

  // Prefetch next likely tab components
  useEffect(() => {
    if (activeTab === 'rankings') {
      mobilePrefetch.route('../components/MobileStatistics.jsx');
    } else if (activeTab === 'statistics') {
      mobilePrefetch.route('../components/MobilePowerRankings.jsx');
    }
  }, [activeTab]);

  // Force calendar week after data loads
  useEffect(() => {
    if (activeSeason && !loading) {
      const calendarWeek = getCurrentWeek();
      if (calendarWeek !== currentWeek) {
        setCurrentWeek(calendarWeek);
      }
    }
  }, [activeSeason, loading]);

  // Fetch week-specific power rankings
  useEffect(() => {
    const fetchWeeklyRankings = async () => {
      if (!activeSeason || !currentWeek) {
        setWeeklyRankings([]);
        return;
      }

      setRankingsLoading(true);
      try {
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



  const closeMobileMenu = () => setMobileMenuOpen(false);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    closeMobileMenu();
  };

  const handleWeekChange = (week) => {
    setCurrentWeek(week);
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

  const getCompletedWeeks = () => {
    return activeSeason?.weeks
      ?.filter(week => week.isCompleted)
      ?.map(week => week.weekNumber) || [];
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
                <span className="text-sm font-medium">Week {currentWeek}</span>
              </MobileTouchButton>

              {/* Week Selector Dropdown */}
              <MobileWeekSelector
                isOpen={showWeekSelector}
                onClose={handleWeekSelectorClose}
                currentWeek={currentWeek}
                totalWeeks={activeSeason.totalWeeks}
                regularSeasonWeeks={activeSeason.regularSeasonWeeks || 14}
                onWeekChange={handleWeekChange}
                completedWeeks={getCompletedWeeks()}
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
        isAdmin={isAdmin}
        activeSeason={activeSeason}
        currentWeek={currentWeek}
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
        {!initialized || (loading && !activeSeason) ? (
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
                      {activeTab === 'seasons' && <><Settings className="h-5 w-5 text-primary" /><span>Season Management</span></>}
                      {activeTab === 'import' && <><Download className="h-5 w-5 text-primary" /><span>Import Schedule</span></>}
                    </CardTitle>
                  </div>
                  
                  {/* Quick Actions */}
                  <div className="flex items-center space-x-2">
                    {activeSeason && activeTab === 'rankings' && (
                      <Badge variant="outline" className="text-xs">
                        Week {currentWeek}
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
                  /* Mobile Content Components */
                  <div>
                    {/* Mobile Power Rankings */}
                    {activeTab === 'rankings' && (
                      <MobilePowerRankings
                        rankings={weeklyRankings}
                        currentWeek={currentWeek}
                        loading={rankingsLoading}
                        showAdvanced={true}
                        analyticsData={{}}
                        showAnalytics={false}
                      />
                    )}

                    {/* Mobile Statistics */}
                    {activeTab === 'statistics' && (
                      <MobileStatistics
                        rankings={weeklyRankings}
                        currentWeek={currentWeek}
                        season={activeSeason}
                      />
                    )}

                    {/* Mobile Schedule */}
                    {activeTab === 'schedule' && (
                      <MobileSchedule
                        season={activeSeason}
                        schedule={activeSeason?.schedule || []}
                        currentWeek={currentWeek}
                        loading={loading}
                      />
                    )}

                    {/* Mobile Teams & Rosters */}
                    {activeTab === 'teams' && (
                      <MobileTeamsAndRosters
                        teams={activeSeason?.teams || []}
                        rosters={rosters}
                        onAddTeam={addTeam}
                        onUpdateTeam={updateTeam}
                        onRemoveTeam={removeTeam}
                        loading={loading}
                        powerRankings={weeklyRankings}
                        isAuthenticated={isAdmin}
                      />
                    )}

                    {/* Mobile Pick'ems */}
                    {activeTab === 'pickems' && (
                      <MobilePickEms
                        season={activeSeason}
                        currentWeek={currentWeek}
                        dataManager={dataManager}
                        loading={loading}
                        isAuthenticated={isAuthenticated}
                        isAdmin={isAdmin}
                      />
                    )}

                    {/* Placeholder for other tabs */}
                    {!['rankings', 'statistics', 'schedule', 'teams', 'pickems'].includes(activeTab) && (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
                          {activeTab === 'pickems' && <Target className="h-8 w-8 text-primary" />}
                          {activeTab === 'seasons' && <Settings className="h-8 w-8 text-primary" />}
                          {activeTab === 'import' && <Download className="h-8 w-8 text-primary" />}
                        </div>
                        <h3 className="text-lg font-semibold mb-2">
                          Mobile {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} View
                        </h3>
                        <p className="text-muted-foreground text-sm mb-4">
                          Mobile-specific {activeTab} component will be implemented in subsequent tasks.
                        </p>
                        <div className="bg-muted/50 rounded-lg p-4 text-left">
                          <p className="text-xs text-muted-foreground font-medium mb-2">
                            Implementation Status:
                          </p>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            <li>✅ Mobile app shell with navigation system</li>
                            <li>✅ Touch-optimized header and menu</li>
                            <li>✅ Mobile-specific layout structure</li>
                            <li>✅ Mobile Power Rankings component</li>
                            <li>✅ Mobile Statistics component</li>
                            <li>✅ Mobile Schedule component</li>
                            <li>✅ Mobile Teams & Rosters component</li>
                            <li>✅ Mobile Pick'ems component</li>
                            <li>⏳ Mobile-specific {activeTab} component (next task)</li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
              </Card>
            </MobileSlideIn>
          </div>
        )}
      </main>

      {/* Loading Overlay */}
      {loading && (
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

export default MobileFantasyFootballApp;