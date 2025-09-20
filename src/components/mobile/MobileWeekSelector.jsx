import React, { useRef, useEffect } from 'react';
import { Calendar, Clock, Trophy } from 'lucide-react';
import { getCurrentWeek } from '../../../utils/weekCalculator.js';
import { getWeekLabel, isPlayoffWeek, normalizeWeek } from '../../../utils/weekLabelUtils';

const MobileWeekSelector = ({
  isOpen,
  onClose,
  currentWeek,
  totalWeeks,
  regularSeasonWeeks,
  onWeekChange,
  completedWeeks = [],
  anchorRef = null // Reference to the button that triggers the dropdown
}) => {
  const dropdownRef = useRef(null);
  const validCurrentWeek = normalizeWeek(currentWeek, totalWeeks);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        // Also check if click is on the anchor button
        if (anchorRef?.current && !anchorRef.current.contains(event.target)) {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose, anchorRef]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleWeekSelect = (week) => {
    onWeekChange(week);
    onClose();
  };

  const getWeekIcon = (week) => {
    const actualCurrentWeek = getCurrentWeek();
    if (week === actualCurrentWeek) {
      return <Clock size={16} className="text-blue-600" />;
    }
    if (isPlayoffWeek(week, regularSeasonWeeks)) {
      return <Trophy size={16} className="text-yellow-600" />;
    }
    return <Calendar size={16} className="text-gray-500" />;
  };

  // Generate all week options
  const generateWeekOptions = () => {
    const weeks = [];
    for (let week = 1; week <= totalWeeks; week++) {
      weeks.push(week);
    }
    return weeks;
  };

  const allWeeks = generateWeekOptions();

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto w-80 min-w-72"
      style={{ transform: 'translateX(-50%)' }}
      role="listbox"
      aria-label="Week selector"
    >
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2">
        <div className="text-sm font-medium text-gray-700">Select Week</div>
        <div className="text-xs text-gray-500">
          Currently: {getWeekLabel(validCurrentWeek, regularSeasonWeeks, totalWeeks)}
        </div>
      </div>

      {/* Week Options */}
      <div className="py-1">
        {allWeeks.map(week => {
          const isSelected = week === validCurrentWeek;
          const isCompleted = completedWeeks.includes(week);
          const isCurrentCalendarWeek = week === getCurrentWeek();

          return (
            <button
              key={week}
              onClick={() => handleWeekSelect(week)}
              role="option"
              aria-selected={isSelected}
              className={`
                w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none
                flex items-center gap-3 transition-colors duration-150
                ${isSelected ? 'bg-blue-50 text-blue-900' : 'text-gray-900'}
                ${isCompleted && !isSelected ? 'bg-green-50 text-green-800' : ''}
                ${isCurrentCalendarWeek && !isSelected ? 'bg-orange-50 text-orange-800' : ''}
              `}
            >
              {/* Week Icon */}
              <div className="flex-shrink-0">
                {getWeekIcon(week)}
              </div>

              {/* Week Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  {getWeekLabel(week, regularSeasonWeeks, totalWeeks)}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {isCurrentCalendarWeek && 'Current • '}
                  {isCompleted && 'Completed • '}
                  {isPlayoffWeek(week, regularSeasonWeeks) ? 'Playoff' : 'Regular Season'}
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex-shrink-0">
                {isSelected && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                )}
                {isCompleted && !isSelected && (
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                )}
                {isCurrentCalendarWeek && !isSelected && (
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileWeekSelector;