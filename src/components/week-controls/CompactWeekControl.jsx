import React, { useRef, useEffect, forwardRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '../ui/button';
import { getWeekLabel, canNavigateWeek, getNextWeek, normalizeWeek } from '../../../utils/weekLabelUtils';

const CompactWeekControl = forwardRef(({
  currentWeek,
  totalWeeks,
  regularSeasonWeeks,
  onWeekChange,
  onExpand,
  className = ''
}, ref) => {
  const containerRef = useRef(null);
  
  // Validate and normalize current week
  const validCurrentWeek = normalizeWeek(currentWeek, totalWeeks);
  
  const canGoToPreviousWeek = canNavigateWeek(validCurrentWeek, totalWeeks, 'previous');
  const canGoToNextWeek = canNavigateWeek(validCurrentWeek, totalWeeks, 'next');

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Only handle keyboard events when the container is focused or contains focus
      const currentRef = ref?.current || containerRef.current;
      if (!currentRef || !currentRef.contains(document.activeElement)) {
        return;
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          if (canGoToPreviousWeek && onWeekChange) {
            const nextWeek = getNextWeek(validCurrentWeek, totalWeeks, 'previous');
            if (nextWeek !== null) {
              onWeekChange(nextWeek);
            }
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (canGoToNextWeek && onWeekChange) {
            const nextWeek = getNextWeek(validCurrentWeek, totalWeeks, 'next');
            if (nextWeek !== null) {
              onWeekChange(nextWeek);
            }
          }
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          handleExpand();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [validCurrentWeek, totalWeeks, canGoToPreviousWeek, canGoToNextWeek, onWeekChange, onExpand]);

  const handlePreviousWeek = (e) => {
    e.stopPropagation();
    if (canGoToPreviousWeek && onWeekChange) {
      const nextWeek = getNextWeek(validCurrentWeek, totalWeeks, 'previous');
      if (nextWeek !== null) {
        onWeekChange(nextWeek);
      }
    }
  };

  const handleNextWeek = (e) => {
    e.stopPropagation();
    if (canGoToNextWeek && onWeekChange) {
      const nextWeek = getNextWeek(validCurrentWeek, totalWeeks, 'next');
      if (nextWeek !== null) {
        onWeekChange(nextWeek);
      }
    }
  };

  const handleExpand = () => {
    if (onExpand) {
      onExpand();
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleExpand();
    }
  };

  return (
    <div 
      ref={ref || containerRef}
      role="navigation"
      aria-label="Week navigation control"
      tabIndex={0}
      className={`
        fixed z-50 
        floating-control
        rounded-full
        flex items-center gap-1 px-2 py-2
        cursor-pointer
        focus-enhanced
        animate-float-in
        
        /* Mobile positioning and sizing */
        bottom-4 right-4 sm:bottom-6 sm:right-6
        
        /* Touch-friendly sizing on mobile */
        min-h-[48px] sm:min-h-[40px]
        
        /* Responsive gap and padding */
        gap-0.5 sm:gap-1
        px-1.5 sm:px-2
        py-1.5 sm:py-2
        
        /* Ensure it doesn't interfere with mobile UI */
        max-w-[calc(100vw-2rem)] sm:max-w-none
        
        /* Enhanced visual hierarchy */
        shadow-floating hover:shadow-floating-hover
        
        ${className}
      `}
      onClick={handleExpand}
      onKeyDown={handleKeyDown}
    >
      {/* Previous Week Button */}
      <Button
        onClick={handlePreviousWeek}
        disabled={!canGoToPreviousWeek}
        variant="ghost"
        size="sm"
        aria-label={`Go to previous week${canGoToPreviousWeek ? ` (Week ${getNextWeek(validCurrentWeek, totalWeeks, 'previous')})` : ' (not available)'}`}
        className="
          h-10 w-10 sm:h-8 sm:w-8 
          p-0 rounded-full 
          hover:bg-gray-100 disabled:opacity-50
          touch-manipulation
          scale-on-hover
          focus-enhanced
          transition-all duration-150 ease-out
          disabled:cursor-not-allowed
          disabled:hover:transform-none
        "
      >
        <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4 transition-transform duration-150" />
      </Button>

      {/* Current Week Display */}
      <div 
        className="
          flex items-center gap-1 sm:gap-2 
          px-2 sm:px-3 py-1 
          min-w-[80px] sm:min-w-[100px] 
          justify-center
          transition-all duration-200 ease-out
          hover:bg-gray-50 rounded-lg
        "
        role="status"
        aria-live="polite"
        aria-label={`Current week: ${getWeekLabel(validCurrentWeek, regularSeasonWeeks, totalWeeks)}`}
      >
        <Calendar className="h-4 w-4 text-gray-600 hidden xs:block transition-colors duration-200 hover:text-blue-600" aria-hidden="true" />
        <span className="
          font-medium text-xs sm:text-sm 
          whitespace-nowrap
          leading-tight
          transition-colors duration-200
          hover:text-blue-700
        ">
          {getWeekLabel(validCurrentWeek, regularSeasonWeeks, totalWeeks)}
        </span>
      </div>

      {/* Next Week Button */}
      <Button
        onClick={handleNextWeek}
        disabled={!canGoToNextWeek}
        variant="ghost"
        size="sm"
        aria-label={`Go to next week${canGoToNextWeek ? ` (Week ${getNextWeek(validCurrentWeek, totalWeeks, 'next')})` : ' (not available)'}`}
        className="
          h-10 w-10 sm:h-8 sm:w-8 
          p-0 rounded-full 
          hover:bg-gray-100 disabled:opacity-50
          touch-manipulation
          scale-on-hover
          focus-enhanced
          transition-all duration-150 ease-out
          disabled:cursor-not-allowed
          disabled:hover:transform-none
        "
      >
        <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4 transition-transform duration-150" />
      </Button>
    </div>
  );
});

CompactWeekControl.displayName = 'CompactWeekControl';

export default CompactWeekControl;