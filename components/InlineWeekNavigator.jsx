import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { getWeekLabel, canNavigateWeek, getNextWeek, normalizeWeek } from '../utils/weekLabelUtils';
import { getCurrentWeek } from '../utils/weekCalculator';
import ExpandedWeekModal from './ExpandedWeekModal';

const InlineWeekNavigator = ({
  currentWeek,
  totalWeeks,
  regularSeasonWeeks,
  onWeekChange,
  completedWeeks = [],
  season = null,
  className = ''
}) => {
  const containerRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Validate and normalize current week
  const validCurrentWeek = normalizeWeek(currentWeek, totalWeeks);
  
  // Check if we're viewing the actual current week
  const actualCurrentWeek = getCurrentWeek();
  const isViewingCurrentWeek = validCurrentWeek === actualCurrentWeek;
  
  const canGoToPreviousWeek = canNavigateWeek(validCurrentWeek, totalWeeks, 'previous');
  const canGoToNextWeek = canNavigateWeek(validCurrentWeek, totalWeeks, 'next');

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Only handle keyboard events when the container is focused or contains focus
      if (!containerRef.current || !containerRef.current.contains(document.activeElement)) {
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
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [validCurrentWeek, totalWeeks, canGoToPreviousWeek, canGoToNextWeek, onWeekChange]);

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

  // Handle expanding to modal view
  const handleExpand = useCallback(() => {
    setIsExpanded(true);
  }, []);

  // Handle collapsing back from modal view
  const handleCollapse = useCallback(() => {
    setIsExpanded(false);
  }, []);

  // Handle week change from modal
  const handleWeekChangeFromModal = useCallback((newWeek) => {
    if (onWeekChange && typeof onWeekChange === 'function') {
      onWeekChange(newWeek);
    }
  }, [onWeekChange]);

  return (
    <>
      <div 
        ref={containerRef}
        role="navigation"
        aria-label="Week navigation control"
        className={`
          flex items-center gap-1
          bg-white/90 backdrop-blur-sm
          border border-gray-200
          rounded-lg
          px-2 py-1
          shadow-sm
          ${className}
        `}
      >
        {/* Previous Week Button */}
        <Button
          onClick={handlePreviousWeek}
          disabled={!canGoToPreviousWeek}
          variant="ghost"
          size="sm"
          aria-label={`Go to previous week${canGoToPreviousWeek ? ` (Week ${getNextWeek(validCurrentWeek, totalWeeks, 'previous')})` : ' (not available)'}`}
          className="
            h-7 w-7 
            p-0 rounded-md 
            hover:bg-gray-100 disabled:opacity-50
            transition-all duration-150 ease-out
            disabled:cursor-not-allowed
          "
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>

        {/* Current Week Display - Clickable */}
        <button
          onClick={handleExpand}
          className={`
            flex items-center gap-1
            px-2 py-1 
            min-w-[70px]
            justify-center
            text-sm font-medium
            hover:bg-gray-100
            rounded-md
            transition-colors duration-150
            cursor-pointer
            ${isViewingCurrentWeek 
              ? 'text-blue-700 bg-blue-50 hover:bg-blue-100' 
              : 'text-gray-700'
            }
          `}
          role="button"
          aria-label={`${isViewingCurrentWeek ? 'Current' : 'Selected'} week: ${getWeekLabel(validCurrentWeek, regularSeasonWeeks, totalWeeks)}. Click to open week selector.`}
        >
          {isViewingCurrentWeek ? (
            <Clock className="h-3 w-3 text-blue-600" aria-hidden="true" />
          ) : (
            <Calendar className="h-3 w-3 text-gray-500" aria-hidden="true" />
          )}
          <span className="whitespace-nowrap text-xs">
            {getWeekLabel(validCurrentWeek, regularSeasonWeeks, totalWeeks)}
          </span>
        </button>

        {/* Next Week Button */}
        <Button
          onClick={handleNextWeek}
          disabled={!canGoToNextWeek}
          variant="ghost"
          size="sm"
          aria-label={`Go to next week${canGoToNextWeek ? ` (Week ${getNextWeek(validCurrentWeek, totalWeeks, 'next')})` : ' (not available)'}`}
          className="
            h-7 w-7 
            p-0 rounded-md 
            hover:bg-gray-100 disabled:opacity-50
            transition-all duration-150 ease-out
            disabled:cursor-not-allowed
          "
        >
          <ChevronRight className="h-3 w-3" />
        </Button>

        {/* Go to Current Week Button - Only show when not viewing current week */}
        {!isViewingCurrentWeek && (
          <Button
            onClick={() => onWeekChange && onWeekChange(actualCurrentWeek)}
            variant="ghost"
            size="sm"
            title={`Go to current week (Week ${actualCurrentWeek})`}
            aria-label={`Go to current week (Week ${actualCurrentWeek})`}
            className="
              h-7 w-7 
              p-0 rounded-md 
              hover:bg-blue-100 
              text-blue-600 hover:text-blue-700
              transition-all duration-150 ease-out
              ml-1
            "
          >
            <Clock className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Expanded Modal Overlay - Rendered at document root using portal */}
      {isExpanded && createPortal(
        <ExpandedWeekModal
          isOpen={isExpanded}
          onClose={handleCollapse}
          currentWeek={validCurrentWeek}
          totalWeeks={totalWeeks}
          regularSeasonWeeks={regularSeasonWeeks}
          onWeekChange={handleWeekChangeFromModal}
          completedWeeks={completedWeeks}
          season={season}
        />,
        document.body
      )}
    </>
  );
};

export default InlineWeekNavigator;