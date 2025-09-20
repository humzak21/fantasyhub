import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Trophy, Calendar, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { getCurrentWeek } from '../../../utils/weekCalculator.js';
import { getWeekLabel, isPlayoffWeek, normalizeWeek, getNextWeek, canNavigateWeek } from '../../../utils/weekLabelUtils';

const ExpandedWeekModal = ({
  isOpen,
  onClose,
  currentWeek,
  totalWeeks,
  regularSeasonWeeks,
  onWeekChange,
  completedWeeks = [],
  season = null
}) => {
  const modalRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [focusedWeek, setFocusedWeek] = useState(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Validate and normalize current week
  const validCurrentWeek = normalizeWeek(currentWeek, totalWeeks);

  // Enhanced auto-scroll functionality
  const scrollToWeek = useCallback((week, behavior = 'smooth') => {
    if (!scrollContainerRef.current) return;
    
    const weekButton = scrollContainerRef.current.querySelector(`[data-week="${week}"]`);
    if (weekButton && typeof weekButton.scrollIntoView === 'function') {
      setIsScrolling(true);
      weekButton.scrollIntoView({
        behavior,
        block: 'nearest',
        inline: 'center'
      });
      
      // Reset scrolling state after animation
      setTimeout(() => setIsScrolling(false), behavior === 'smooth' ? 500 : 0);
    }
  }, []);

  // Check scroll position and update fade indicators
  const updateScrollIndicators = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    
    setShowLeftFade(scrollLeft > 10);
    setShowRightFade(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  // Handle keyboard navigation and focus management
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isOpen) return;

      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          if (focusedWeek !== null) {
            const canGoToPrevious = canNavigateWeek(focusedWeek, totalWeeks, 'previous');
            if (canGoToPrevious) {
              const prevWeek = getNextWeek(focusedWeek, totalWeeks, 'previous');
              if (prevWeek !== null) {
                setFocusedWeek(prevWeek);
                scrollToWeek(prevWeek);
                // Focus the button
                const prevButton = scrollContainerRef.current?.querySelector(`[data-week="${prevWeek}"]`);
                if (prevButton) {
                  prevButton.focus();
                }
              }
            }
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (focusedWeek !== null) {
            const canGoToNext = canNavigateWeek(focusedWeek, totalWeeks, 'next');
            if (canGoToNext) {
              const nextWeek = getNextWeek(focusedWeek, totalWeeks, 'next');
              if (nextWeek !== null) {
                setFocusedWeek(nextWeek);
                scrollToWeek(nextWeek);
                // Focus the button
                const nextButton = scrollContainerRef.current?.querySelector(`[data-week="${nextWeek}"]`);
                if (nextButton) {
                  nextButton.focus();
                }
              }
            }
          }
          break;
        case 'Home':
          event.preventDefault();
          setFocusedWeek(1);
          scrollToWeek(1);
          const firstButton = scrollContainerRef.current?.querySelector(`[data-week="1"]`);
          if (firstButton) {
            firstButton.focus();
          }
          break;
        case 'End':
          event.preventDefault();
          setFocusedWeek(totalWeeks);
          scrollToWeek(totalWeeks);
          const lastButton = scrollContainerRef.current?.querySelector(`[data-week="${totalWeeks}"]`);
          if (lastButton) {
            lastButton.focus();
          }
          break;
        case 'Enter':
        case ' ':
          if (focusedWeek !== null && document.activeElement?.getAttribute('data-week')) {
            event.preventDefault();
            handleWeekSelect(focusedWeek);
          }
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      
      // Focus management: focus the close button when modal opens
      setTimeout(() => {
        if (closeButtonRef.current) {
          closeButtonRef.current.focus();
        }
      }, 100);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, focusedWeek, totalWeeks, scrollToWeek]);

  // Auto-scroll to current week when modal opens and set initial focus
  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      setFocusedWeek(validCurrentWeek);
      
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        scrollToWeek(validCurrentWeek, 'smooth');
        updateScrollIndicators();
      }, 100);
    }
  }, [isOpen, validCurrentWeek, scrollToWeek, updateScrollIndicators]);

  // Update scroll indicators when scrolling
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      updateScrollIndicators();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initial check
    updateScrollIndicators();

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [updateScrollIndicators]);

  // Handle click outside modal
  const handleBackdropClick = (event) => {
    if (modalRef.current && !modalRef.current.contains(event.target)) {
      onClose();
    }
  };

  // Handle modal opening/closing animations
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      // Don't set loading state on open, only on week selection
      setIsLoading(false);
    } else {
      setIsAnimating(false);
    }
  }, [isOpen]);



  const handleWeekSelect = (week) => {
    // Add loading state for week selection
    setIsLoading(true);
    
    // Ensure the selected week remains visible
    scrollToWeek(week, 'smooth');
    
    // Simulate brief loading for smooth transition
    setTimeout(() => {
      if (onWeekChange) {
        onWeekChange(week);
      }
      setIsLoading(false);
      onClose();
    }, 100);
  };

  const handleWeekFocus = (week) => {
    setFocusedWeek(week);
  };

  const getWeekIcon = (week) => {
    const actualCurrentWeek = getCurrentWeek();
    if (week === actualCurrentWeek) {
      return <Calendar size={16} className="text-blue-600" />;
    }
    if (isPlayoffWeek(week, regularSeasonWeeks)) {
      return <Trophy size={16} className="text-yellow-600" />;
    }
    return null;
  };

  // Generate all week buttons
  const generateWeekButtons = () => {
    const weeks = [];
    for (let week = 1; week <= totalWeeks; week++) {
      weeks.push(week);
    }
    return weeks;
  };

  const allWeeks = generateWeekButtons();

  if (!isOpen) return null;

  return (
    <div 
      className="
        fixed inset-0 z-[60] 
        flex items-center justify-center
        p-4 sm:p-6
      "
      onClick={handleBackdropClick}
    >
      {/* Enhanced Backdrop with Animation */}
      <div className={`
        absolute inset-0 
        modal-backdrop
        ${isAnimating ? 'entering' : 'exiting'}
      `} />
      
      {/* Enhanced Modal Content with Animation */}
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`
          relative 
          modal-content
          rounded-lg 
          w-full 
          max-w-sm sm:max-w-2xl lg:max-w-4xl
          max-h-[90vh] sm:max-h-[80vh] 
          overflow-hidden
          shadow-modal
          
          /* Mobile-first responsive sizing */
          mx-2 sm:mx-4
          
          /* Animation classes */
          ${isAnimating ? 'entering' : 'exiting'}
        `}
      >
        {/* Enhanced Header with Loading State */}
        <div className="
          flex items-center justify-between 
          p-3 sm:p-4 
          border-b border-gray-100
          bg-gradient-to-r from-white to-gray-50
        ">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isLoading ? (
              <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 animate-spin flex-shrink-0" />
            ) : (
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0 transition-colors duration-200" />
            )}
            <h2 id="modal-title" className="
              text-base sm:text-lg font-semibold
              truncate
              transition-colors duration-200
              text-gray-900
            ">
              Week Navigation
            </h2>
            {season && (
              <span className="
                text-xs sm:text-sm text-muted-foreground
                hidden sm:inline
                truncate
                transition-opacity duration-200
                ${isLoading ? 'opacity-50' : 'opacity-100'}
              ">
                {season.year} Season • {season.leagueSize} Teams
              </span>
            )}
          </div>
          <Button
            ref={closeButtonRef}
            onClick={onClose}
            variant="ghost"
            size="sm"
            disabled={isLoading}
            className="
              h-9 w-9 sm:h-8 sm:w-8 
              p-0 rounded-full 
              hover:bg-gray-100
              touch-manipulation
              scale-on-hover
              flex-shrink-0
              focus-enhanced
              transition-all duration-150
              disabled:opacity-50
            "
            aria-label="Close week navigation modal"
          >
            <X className="h-5 w-5 sm:h-4 sm:w-4 transition-transform duration-150" />
          </Button>
        </div>

        {/* Scrollable Week Selection */}
        <div className="p-3 sm:p-4">
          <div className="relative">
            {/* Enhanced Left fade indicator */}
            <div className={`
              absolute left-0 top-0 bottom-2 z-10 w-8 sm:w-12
              bg-gradient-to-r from-white via-white/90 to-transparent
              pointer-events-none
              flex items-center justify-start pl-1
              fade-indicator
              ${showLeftFade ? 'visible' : 'hidden'}
            `}>
              <ChevronLeft className="h-4 w-4 text-gray-400 transition-all duration-200 hover:text-gray-600" />
            </div>
            
            {/* Enhanced Right fade indicator */}
            <div className={`
              absolute right-0 top-0 bottom-2 z-10 w-8 sm:w-12
              bg-gradient-to-l from-white via-white/90 to-transparent
              pointer-events-none
              flex items-center justify-end pr-1
              fade-indicator
              ${showRightFade ? 'visible' : 'hidden'}
            `}>
              <ChevronRight className="h-4 w-4 text-gray-400 transition-all duration-200 hover:text-gray-600" />
            </div>
            
            <div 
              ref={scrollContainerRef}
              role="listbox"
              aria-label="Select week"
              aria-activedescendant={focusedWeek ? `week-button-${focusedWeek}` : undefined}
              className="
                flex gap-2 overflow-x-auto pb-2 
                mobile-scroll scrollbar-mobile
                sm:scrollbar-thin sm:scrollbar-thumb-gray-300 sm:scrollbar-track-gray-100
                transition-all duration-200
              "
              style={{ 
                scrollSnapType: 'x proximity'
              }}
            >
            {allWeeks.map(week => {
              const isSelected = week === validCurrentWeek;
              const isCompleted = completedWeeks.includes(week);
              const isCurrentCalendarWeek = week === getCurrentWeek();
              
              return (
                <Button
                  key={week}
                  id={`week-button-${week}`}
                  data-week={week}
                  onClick={() => handleWeekSelect(week)}
                  onFocus={() => handleWeekFocus(week)}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  role="option"
                  aria-selected={isSelected}
                  disabled={isLoading}
                  aria-label={`${getWeekLabel(week, regularSeasonWeeks, totalWeeks)}${isSelected ? ' (currently selected)' : ''}${isCompleted ? ' (completed)' : ''}${isCurrentCalendarWeek ? ' (current calendar week)' : ''}`}
                  className={`
                    flex-shrink-0 gap-1 sm:gap-2 justify-start
                    week-button
                    
                    /* Responsive sizing */
                    min-w-[100px] sm:min-w-[120px]
                    h-10 sm:h-9
                    px-2 sm:px-3
                    text-xs sm:text-sm
                    
                    /* Touch-friendly interactions */
                    touch-manipulation
                    
                    /* Scroll snap for better mobile experience */
                    scroll-snap-align: start
                    
                    /* Enhanced focus and selection styles */
                    focus-enhanced
                    ${isSelected ? 'selected ring-2 ring-blue-500 ring-offset-1 sm:ring-offset-2 shadow-lg' : ''}
                    ${isCompleted ? 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100' : ''}
                    ${isCurrentCalendarWeek && !isSelected ? 'current-week border-blue-300 bg-blue-50 hover:bg-blue-100' : ''}
                    ${isLoading ? 'loading-pulse opacity-75' : ''}
                    
                    /* Disabled state */
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none
                  `}
                >
                  {isLoading && isSelected ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    getWeekIcon(week)
                  )}
                  <span className="font-medium leading-tight transition-colors duration-150">
                    {getWeekLabel(week, regularSeasonWeeks, totalWeeks)}
                  </span>
                  {isCompleted && (
                    <div 
                      className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full ml-auto flex-shrink-0 animate-bounce-subtle" 
                      aria-hidden="true"
                    />
                  )}
                </Button>
              );
            })}
            </div>
          </div>
          
          {/* Scroll hint and keyboard instructions */}
          <div className="
            text-xs text-muted-foreground text-center mt-2
            sm:block
          ">
            <div>
              <span className="sm:hidden">Swipe to see all weeks</span>
              <span className="hidden sm:inline">Scroll horizontally to see all weeks</span>
            </div>
            <div className="mt-1 text-xs opacity-75">
              Use arrow keys to navigate, Enter to select, Escape to close
            </div>
          </div>
        </div>

        {/* Enhanced Footer with current selection info */}
        <div className="border-t border-gray-100 p-3 sm:p-4 bg-gradient-to-r from-gray-50 to-white">
          <div className="
            flex items-center justify-between
            flex-col sm:flex-row
            gap-2 sm:gap-0
          ">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-medium text-gray-700 transition-colors duration-200">
                Selected:
              </span>
              <div className="flex items-center gap-1">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                ) : (
                  getWeekIcon(validCurrentWeek)
                )}
                <span className="font-semibold text-sm sm:text-base text-gray-900 transition-all duration-200">
                  {getWeekLabel(validCurrentWeek, regularSeasonWeeks, totalWeeks)}
                </span>
              </div>
            </div>
            <div className={`
              text-xs sm:text-sm text-muted-foreground
              transition-opacity duration-200
              ${isLoading ? 'opacity-50' : 'opacity-100'}
            `}>
              Week {validCurrentWeek} of {totalWeeks}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpandedWeekModal;