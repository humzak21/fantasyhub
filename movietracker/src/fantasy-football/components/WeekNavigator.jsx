import React from 'react';
import { ChevronLeft, ChevronRight, Calendar, Play, CheckCircle, Clock } from 'lucide-react';

const WeekNavigator = ({ 
  currentWeek, 
  totalWeeks, 
  regularSeasonWeeks,
  onWeekChange, 
  completedWeeks = [],
  season = null 
}) => {
  const isWeekCompleted = (week) => {
    return completedWeeks.includes(week);
  };

  const getWeekStatus = (week) => {
    if (isWeekCompleted(week)) return 'completed';
    if (week === currentWeek) return 'current';
    if (week < currentWeek) return 'incomplete';
    return 'future';
  };

  const getWeekIcon = (week) => {
    const status = getWeekStatus(week);
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'current':
        return <Play size={16} className="text-blue-600" />;
      case 'incomplete':
        return <Clock size={16} className="text-orange-600" />;
      default:
        return <Calendar size={16} className="text-gray-400" />;
    }
  };

  const getWeekColor = (week) => {
    const status = getWeekStatus(week);
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'current':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'incomplete':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-300';
    }
  };

  const isPlayoffWeek = (week) => {
    return week > regularSeasonWeeks;
  };

  const getWeekLabel = (week) => {
    if (isPlayoffWeek(week)) {
      const playoffWeek = week - regularSeasonWeeks;
      const totalPlayoffWeeks = totalWeeks - regularSeasonWeeks;
      
      if (totalPlayoffWeeks === 1) return 'Championship';
      if (playoffWeek === totalPlayoffWeeks) return 'Championship';
      if (playoffWeek === totalPlayoffWeeks - 1) return 'Semifinals';
      if (playoffWeek === 1) return 'Playoffs R1';
      return `Playoffs R${playoffWeek}`;
    }
    return `Week ${week}`;
  };

  const canGoToPreviousWeek = currentWeek > 1;
  const canGoToNextWeek = currentWeek < totalWeeks;

  // Generate week buttons - show current week and surrounding weeks
  const getVisibleWeeks = () => {
    const weeks = [];
    const startWeek = Math.max(1, currentWeek - 2);
    const endWeek = Math.min(totalWeeks, currentWeek + 2);
    
    for (let week = startWeek; week <= endWeek; week++) {
      weeks.push(week);
    }
    return weeks;
  };

  const visibleWeeks = getVisibleWeeks();

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Calendar className="text-blue-600" size={20} />
          Week Navigation
        </h3>
        
        {season && (
          <div className="text-sm text-gray-600">
            {season.year} Season • {season.leagueSize} Teams
          </div>
        )}
      </div>

      {/* Main navigation controls */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button
          onClick={() => onWeekChange(currentWeek - 1)}
          disabled={!canGoToPreviousWeek}
          className={`p-2 rounded-lg transition-colors ${
            canGoToPreviousWeek
              ? 'text-blue-600 hover:bg-blue-50 border border-blue-300'
              : 'text-gray-400 cursor-not-allowed border border-gray-200'
          }`}
          title="Previous week"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg min-w-[140px] justify-center">
          {getWeekIcon(currentWeek)}
          <span className="font-semibold text-lg">
            {getWeekLabel(currentWeek)}
          </span>
        </div>

        <button
          onClick={() => onWeekChange(currentWeek + 1)}
          disabled={!canGoToNextWeek}
          className={`p-2 rounded-lg transition-colors ${
            canGoToNextWeek
              ? 'text-blue-600 hover:bg-blue-50 border border-blue-300'
              : 'text-gray-400 cursor-not-allowed border border-gray-200'
          }`}
          title="Next week"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Week selection buttons */}
      <div className="flex flex-wrap gap-2 justify-center mb-4">
        {/* Show first week if not visible */}
        {visibleWeeks[0] > 1 && (
          <>
            <button
              onClick={() => onWeekChange(1)}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${getWeekColor(1)}`}
            >
              {getWeekLabel(1)}
            </button>
            {visibleWeeks[0] > 2 && (
              <span className="px-2 py-2 text-gray-400">...</span>
            )}
          </>
        )}

        {/* Visible weeks */}
        {visibleWeeks.map(week => (
          <button
            key={week}
            onClick={() => onWeekChange(week)}
            className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              week === currentWeek 
                ? 'ring-2 ring-blue-400 ' + getWeekColor(week)
                : getWeekColor(week)
            } hover:opacity-80`}
            title={`Go to ${getWeekLabel(week)}`}
          >
            <div className="flex items-center gap-1">
              {getWeekIcon(week)}
              <span>{getWeekLabel(week)}</span>
            </div>
          </button>
        ))}

        {/* Show last week if not visible */}
        {visibleWeeks[visibleWeeks.length - 1] < totalWeeks && (
          <>
            {visibleWeeks[visibleWeeks.length - 1] < totalWeeks - 1 && (
              <span className="px-2 py-2 text-gray-400">...</span>
            )}
            <button
              onClick={() => onWeekChange(totalWeeks)}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${getWeekColor(totalWeeks)}`}
            >
              {getWeekLabel(totalWeeks)}
            </button>
          </>
        )}
      </div>

      {/* Quick jump to key weeks */}
      <div className="flex justify-center gap-2 text-sm">
        <button
          onClick={() => onWeekChange(1)}
          className="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
        >
          First Week
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => onWeekChange(regularSeasonWeeks)}
          className="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
        >
          Last Regular
        </button>
        {totalWeeks > regularSeasonWeeks && (
          <>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => onWeekChange(regularSeasonWeeks + 1)}
              className="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
            >
              Playoffs
            </button>
          </>
        )}
        <span className="text-gray-300">|</span>
        <button
          onClick={() => onWeekChange(totalWeeks)}
          className="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
        >
          Final Week
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
          <span>Season Progress</span>
          <span>{Math.min(currentWeek, totalWeeks)}/{totalWeeks} weeks</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(Math.min(currentWeek, totalWeeks) / totalWeeks) * 100}%` }}
          />
        </div>
        
        {/* Regular season vs playoffs indicator */}
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Regular Season ({regularSeasonWeeks} weeks)</span>
          {totalWeeks > regularSeasonWeeks && (
            <span>Playoffs ({totalWeeks - regularSeasonWeeks} weeks)</span>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <div className="text-xs font-medium text-gray-700 mb-2">Legend:</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="flex items-center gap-1">
            <CheckCircle size={12} className="text-green-600" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-1">
            <Play size={12} className="text-blue-600" />
            <span>Current</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={12} className="text-orange-600" />
            <span>Incomplete</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar size={12} className="text-gray-400" />
            <span>Future</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeekNavigator;