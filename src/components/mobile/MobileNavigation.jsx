import React, { useState, useEffect } from 'react';
import { Trophy, Calendar, BarChart3, Users, Settings, Target, Download, X, ChevronRight, LogIn, LogOut, User, Moon, Sun, Monitor, Check, Award } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useAuth } from '../../../src/contexts/AuthContext.jsx';
import { useDarkMode } from '../../contexts/DarkModeContext.jsx';
import { MobileLoginForm } from './MobileLoginForm.jsx';
import { getDb } from '../../../services/db/index.js';
import { areAwardsReleased, getSeasonConfig } from '../../../utils/seasonConfig.js';

/**
 * Mobile Navigation System
 * Provides mobile-native navigation patterns with smooth transitions
 */
const MobileNavigation = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  isAuthenticated,
  isAdmin,
  activeSeason,
  currentWeek,
}) => {
  const { user, signOut } = useAuth();
  const { isDarkMode, isAutoDetect, getThemeName, setDarkMode, enableAutoDetect } = useDarkMode();
  const [isAnimating, setIsAnimating] = useState(false);
  const [navigationHistory, setNavigationHistory] = useState(['rankings']);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [hasUserSubmittedPicks, setHasUserSubmittedPicks] = useState(false);
  const [pickemNotificationLoading, setPickemNotificationLoading] = useState(false);

  // Check if awards are accessible. This was a hardcoded `2025-12-09` literal —
  // the fourth copy of the awards gate, and the one §4 missed — which would
  // have unlocked the 2026 awards nine months early. The date lives on the
  // season row.
  const isAwardsAccessible = () => {
    if (isAdmin) return true;
    return areAwardsReleased(getSeasonConfig());
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

  // Navigation tabs configuration
  const mainTabs = [
    { id: 'rankings', label: 'Power Rankings', icon: Trophy, requiresSeason: true, requiresAuth: false },
    { id: 'statistics', label: 'Statistics', icon: BarChart3, requiresSeason: true, requiresAuth: false },
    { id: 'schedule', label: 'Schedule', icon: Calendar, requiresSeason: true, requiresAuth: false },
    { id: 'teams', label: 'Teams & Rosters', icon: Users, requiresSeason: true, requiresAuth: false },
    { id: 'pickems', label: 'Pick\'ems', icon: Target, requiresSeason: true, requiresAuth: false },
    { id: 'awards', label: 'Awards', icon: Award, requiresSeason: true, requiresAuth: false, customAccess: isAwardsAccessible }
  ];

  const adminTabs = [
    { id: 'seasons', label: 'Season Management', icon: Settings, requiresAuth: true },
    { id: 'import', label: 'Import Schedule', icon: Download, requiresAuth: true }
  ];

  // Handle navigation with history tracking
  const handleNavigation = (tabId) => {
    setIsAnimating(true);
    
    // Update navigation history
    setNavigationHistory(prev => {
      const newHistory = prev.filter(id => id !== tabId);
      return [tabId, ...newHistory].slice(0, 5); // Keep last 5 items
    });
    
    // Smooth transition
    setTimeout(() => {
      onTabChange(tabId);
      setIsAnimating(false);
      onClose();
    }, 150);
  };

  // Handle overlay click
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Check if user has submitted picks for current week
  const checkUserPicksSubmission = async () => {
    if (!isAuthenticated || !user || !activeSeason || !currentWeek) {
      setHasUserSubmittedPicks(false);
      return;
    }

    setPickemNotificationLoading(true);
    try {
      // Get pick'em week data for current week
      const pickEmWeekData = await getDb().pickems.getPickEmWeek(activeSeason.id, currentWeek);
      if (!pickEmWeekData) {
        setHasUserSubmittedPicks(false);
        return;
      }

      // Get user picks for this week
      const userPicks = await getDb().pickems.getUserPicksForWeek(pickEmWeekData.id);
      const hasSubmitted = userPicks && userPicks.length > 0;
      setHasUserSubmittedPicks(hasSubmitted);
    } catch (err) {
      console.error('Error checking user picks:', err);
      setHasUserSubmittedPicks(false);
    } finally {
      setPickemNotificationLoading(false);
    }
  };

  // Check picks submission when relevant data changes
  useEffect(() => {
    checkUserPicksSubmission();
  }, [isAuthenticated, user, activeSeason, currentWeek]);

  // Prevent body scroll when menu is open.
  // `overflow: hidden` only. Setting `touchAction = 'none'` on <body> also
  // killed touch inside the panel — the panel's own `pan-y` cannot re-enable
  // what an ancestor has turned off — which is the "sidebar doesn't scroll"
  // bug.
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className="mobile-nav-overlay fixed inset-0 z-40 bg-black/50"
      onClick={handleOverlayClick}
      style={{
        animation: 'mobile-backdrop-in 0.2s ease-out'
      }}
    >
      <div
        className="mobile-nav-menu fixed top-16 right-0 w-80 bg-background shadow-xl"
        style={{
          animation: 'mobile-slide-in 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          maxWidth: 'calc(100vw - 32px)',
          height: 'calc(100dvh - 4rem)'
        }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold">Navigation</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="touch-target"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Scrollable Content */}
          <div
            className="flex-1 overflow-y-auto min-h-0"
            style={{
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
              touchAction: 'pan-y'
            }}
          >
            {showLoginForm ? (
              <MobileLoginForm
                onBack={() => setShowLoginForm(false)}
                onSuccess={() => {
                  setShowLoginForm(false);
                  onClose();
                }}
              />
            ) : (
              <div className="p-4 space-y-6">
              {/* User Info Section */}
              <div className="pb-4 border-b">
                {user ? (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {user.user_metadata?.full_name || user.user_metadata?.name || 'No Display Name Set'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {/* Dark Mode Toggle */}
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowThemeMenu(!showThemeMenu)}
                          className="w-full touch-target flex items-center justify-between"
                        >
                          <div className="flex items-center">
                            {isDarkMode ? (
                              <Moon className="h-4 w-4 mr-2" />
                            ) : (
                              <Sun className="h-4 w-4 mr-2" />
                            )}
                            Theme
                          </div>
                          <div className="flex items-center text-xs text-muted-foreground">
                            {getThemeName()}
                            <ChevronRight className={`h-3 w-3 ml-1 transition-transform ${showThemeMenu ? 'rotate-90' : ''}`} />
                          </div>
                        </Button>

                        {showThemeMenu && (
                          <div className="ml-4 space-y-1 border-l border-muted pl-4">
                            {/* DISABLED: Auto (System) option disabled - light mode is forcefully disabled */}
                            {/* <Button
                              variant={isAutoDetect ? "default" : "ghost"}
                              size="sm"
                              onClick={() => {
                                enableAutoDetect();
                                setShowThemeMenu(false);
                              }}
                              className="w-full touch-target justify-start text-sm"
                            >
                              <Monitor className="h-3 w-3 mr-2" />
                              Auto (System)
                              {isAutoDetect && <Check className="ml-auto h-3 w-3" />}
                            </Button> */}

                            {/* DISABLED: Light mode option disabled - light mode is forcefully disabled */}
                            {/* <Button
                              variant={!isAutoDetect && !isDarkMode ? "default" : "ghost"}
                              size="sm"
                              onClick={() => {
                                setDarkMode(false);
                                setShowThemeMenu(false);
                              }}
                              className="w-full touch-target justify-start text-sm"
                            >
                              <Sun className="h-3 w-3 mr-2" />
                              Light
                              {!isAutoDetect && !isDarkMode && <Check className="ml-auto h-3 w-3" />}
                            </Button> */}

                            {/* Dark mode is the only available option */}
                            <Button
                              variant={!isAutoDetect && isDarkMode ? "default" : "ghost"}
                              size="sm"
                              onClick={() => {
                                setDarkMode(true);
                                setShowThemeMenu(false);
                              }}
                              className="w-full touch-target justify-start text-sm"
                            >
                              <Moon className="h-3 w-3 mr-2" />
                              Dark
                              {!isAutoDetect && isDarkMode && <Check className="ml-auto h-3 w-3" />}
                            </Button>
                          </div>
                        )}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleNavigation('settings')}
                        className="w-full touch-target"
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={signOut}
                        className="w-full touch-target"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Guest User</p>
                        <p className="text-xs text-muted-foreground">View Only Mode</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowLoginForm(true)}
                      className="w-full touch-target"
                    >
                      <LogIn className="h-4 w-4 mr-2" />
                      Sign In / Sign Up
                    </Button>
                  </div>
                )}
              </div>

              {/* Main Navigation */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground px-2">
                  Main Sections
                </h3>
                <div className="space-y-1">
                  {mainTabs
                    .filter(tab => {
                      // Check auth requirements
                      if (tab.requiresAuth && !isAdmin) return false;
                      // Check custom access function
                      if (tab.customAccess && !tab.customAccess()) return false;
                      return true;
                    })
                    .map(tab => {
                      const isDisabled = isAdmin && tab.requiresSeason && !activeSeason;
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.id;
                      const wasRecentlyVisited = navigationHistory.includes(tab.id) && !isActive;
                      const showNotification = tab.id === 'pickems' && isAuthenticated && !hasUserSubmittedPicks && !pickemNotificationLoading && arePickemsOpen();

                      return (
                        <Button
                          key={tab.id}
                          variant={isActive ? "default" : "ghost"}
                          size="sm"
                          disabled={isDisabled || isAnimating}
                          onClick={() => handleNavigation(tab.id)}
                          className={`
                            w-full justify-start mobile-nav-item touch-target
                            ${isAnimating ? 'opacity-50' : ''}
                            ${wasRecentlyVisited ? 'bg-muted/50' : ''}
                            ${isActive 
                              ? 'bg-[hsl(217,32.6%,17.5%)] text-white hover:bg-[hsl(217,32.6%,20%)] border-[hsl(217,32.6%,17.5%)]' 
                              : ''
                            }
                          `}
                        >
                          <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
                          <span className="flex-1 text-left">{tab.label}</span>
                          <div className="flex items-center space-x-2">
                            {showNotification && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 bg-red-600 hover:bg-red-700 border-red-600">
                                !
                              </Badge>
                            )}
                            {!isActive && !isDisabled && (
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        </Button>
                      );
                    })}
                </div>
              </div>

              {/* Admin Navigation */}
              {isAdmin && (
                <div className="space-y-3 pt-2 border-t">
                  <h3 className="text-sm font-semibold text-muted-foreground px-2">
                    Administration
                  </h3>
                  <div className="space-y-1">
                    {adminTabs.map(tab => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.id;
                      const wasRecentlyVisited = navigationHistory.includes(tab.id) && !isActive;
                      
                      return (
                        <Button
                          key={tab.id}
                          variant={isActive ? "default" : "ghost"}
                          size="sm"
                          disabled={isAnimating}
                          onClick={() => handleNavigation(tab.id)}
                          className={`
                            w-full justify-start mobile-nav-item touch-target
                            ${isAnimating ? 'opacity-50' : ''}
                            ${wasRecentlyVisited ? 'bg-muted/50' : ''}
                            ${isActive 
                              ? 'bg-[hsl(217,32.6%,17.5%)] text-white hover:bg-[hsl(217,32.6%,20%)] border-[hsl(217,32.6%,17.5%)]' 
                              : ''
                            }
                          `}
                        >
                          <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
                          <span className="flex-1 text-left">{tab.label}</span>
                          <div className="flex items-center space-x-2">
                            {!isActive && (
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}


              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t bg-muted/20">
            <p className="text-xs text-muted-foreground text-center">
              Mobile-optimized fantasy football experience
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};

export default MobileNavigation;