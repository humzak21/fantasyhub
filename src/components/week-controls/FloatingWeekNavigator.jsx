import React, { useState, useCallback, useRef, useEffect } from 'react';
import CompactWeekControl from './CompactWeekControl';
import ExpandedWeekModal from './ExpandedWeekModal';
import { normalizeWeek } from '../../../utils/weekLabelUtils';

const FloatingWeekNavigator = ({
  currentWeek,
  totalWeeks,
  regularSeasonWeeks,
  onWeekChange,
  completedWeeks = [],
  season = null,
  position = 'bottom-right',
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const compactControlRef = useRef(null);

  // Handle expanding to modal view with animation
  const handleExpand = useCallback(() => {
    setIsAnimating(true);
    setIsExpanded(true);
  }, []);

  // Handle collapsing back to compact view with animation
  const handleCollapse = useCallback(() => {
    setIsAnimating(false);
    // Small delay to allow exit animation
    setTimeout(() => {
      setIsExpanded(false);
      // Return focus to the compact control when modal closes
      setTimeout(() => {
        if (compactControlRef.current) {
          compactControlRef.current.focus();
        }
      }, 100);
    }, 150);
  }, []);

  // Handle animation state cleanup
  useEffect(() => {
    if (!isExpanded) {
      setIsAnimating(false);
    }
  }, [isExpanded]);

  // Handle week change from either component
  const handleWeekChange = useCallback((newWeek) => {
    if (onWeekChange && typeof onWeekChange === 'function') {
      onWeekChange(newWeek);
    }
  }, [onWeekChange]);

  // Validate props
  if (!currentWeek || !totalWeeks || !regularSeasonWeeks) {
    return null;
  }

  // Ensure currentWeek is within valid range using shared utility
  const validCurrentWeek = normalizeWeek(currentWeek, totalWeeks);

  return (
    <>
      {/* Compact Floating Control */}
      <CompactWeekControl
        ref={compactControlRef}
        currentWeek={validCurrentWeek}
        totalWeeks={totalWeeks}
        regularSeasonWeeks={regularSeasonWeeks}
        onWeekChange={handleWeekChange}
        onExpand={handleExpand}
        className={className}
      />

      {/* Expanded Modal Overlay */}
      <ExpandedWeekModal
        isOpen={isExpanded}
        onClose={handleCollapse}
        currentWeek={validCurrentWeek}
        totalWeeks={totalWeeks}
        regularSeasonWeeks={regularSeasonWeeks}
        onWeekChange={handleWeekChange}
        completedWeeks={completedWeeks}
        season={season}
      />
    </>
  );
};

export default FloatingWeekNavigator;