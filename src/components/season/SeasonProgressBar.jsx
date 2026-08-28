import React, { useEffect, useRef } from 'react';
import { Trophy, Calendar, Users, AlertCircle, Clock } from 'lucide-react';
import { ScrollHint } from '../ui/scroll-hint';

const SeasonProgressBar = ({
  season,
  schedule = [],
  currentWeek = 1,
  onWeekChange
}) => {
  if (!season) {
    return null;
  }

  const { totalWeeks, regularSeasonWeeks } = season;
  const playoffStartWeek = regularSeasonWeeks + 1;
  const championshipWeek = totalWeeks;
  const tradeDeadlineWeek = 14; // After week 13, before week 14
  const rivalryWeeks = [4, 14];

  // Calculate completion status for each week
  const getWeekStatus = (week) => {
    const weekGames = schedule.filter(game => game.week === week);
    if (weekGames.length === 0) return 'empty';
    if (weekGames.every(game => game.isCompleted)) return 'completed';
    if (weekGames.some(game => game.isCompleted)) return 'partial';
    return 'scheduled';
  };

  const getWeekClasses = (week) => {
    const status = getWeekStatus(week);
    const isCurrentWeek = week === currentWeek;
    const isChampionship = week === championshipWeek;
    const isRivalryWeek = rivalryWeeks.includes(week);
    const isTradeDeadline = week === tradeDeadlineWeek;
    const isPlayoff = week > regularSeasonWeeks;

    let classes = 'relative flex items-center justify-center text-xs font-medium transition-all duration-200 cursor-pointer flex-1 hover:opacity-80 ';

    // Size classes - making them bigger and more consistent
    if (isChampionship) {
      classes += 'h-10 min-w-14 text-sm ';
    } else if (isRivalryWeek || isTradeDeadline) {
      classes += 'h-9 min-w-12 ';
    } else {
      classes += 'h-8 min-w-10 ';
    }

    // Status-based styling
    if (status === 'completed') {
      classes += 'bg-green-500 text-white shadow-md ';
    } else if (isCurrentWeek) {
      // Always make current week blue regardless of status
      classes += 'bg-blue-500 text-white shadow-sm ';
    } else if (status === 'partial') {
      classes += 'bg-orange-400 text-white shadow-sm ';
    } else if (week < currentWeek) {
      classes += 'bg-blue-500 text-white shadow-sm ';
    } else {
      classes += 'bg-muted text-muted-foreground hover:bg-muted ';
    }

    // Special week styling
    if (isChampionship) {
      classes += 'rounded-lg border-2 border-yellow-400 shadow-lg hover:shadow-xl ';
      if (status !== 'completed') {
        classes += 'ring-2 ring-yellow-300 ring-opacity-50 ';
      }
    } else if (isRivalryWeek) {
      classes += 'rounded-lg border-2 border-red-400 ';
    } else if (isTradeDeadline) {
      classes += 'rounded-lg border-2 border-purple-400 ';
    } else if (isPlayoff) {
      classes += 'rounded-lg border border-border ';
    } else {
      classes += 'rounded ';
    }

    // Current week emphasis
    if (isCurrentWeek) {
      classes += 'ring-2 ring-blue-300 ring-opacity-70 ';
    }

    return classes;
  };

  const getWeekIcon = (week) => {
    if (week === championshipWeek) {
      return <Trophy size={12} className="text-yellow-400" />;
    }
    if (rivalryWeeks.includes(week)) {
      return <Users size={10} className="text-red-400" />;
    }
    if (week === tradeDeadlineWeek) {
      return <Clock size={10} className="text-purple-400" />;
    }
    if (week > regularSeasonWeeks) {
      return <Calendar size={8} className="text-muted-foreground" />;
    }
    return null;
  };

  const getWeekTooltip = (week) => {
    const status = getWeekStatus(week);
    let tooltip = `Week ${week}`;

    if (week === championshipWeek) {
      tooltip += ' - Championship Week 🏆';
    } else if (rivalryWeeks.includes(week)) {
      tooltip += ' - Rivalry Week 🔥';
    } else if (week === tradeDeadlineWeek) {
      tooltip += ' - Trade Deadline';
    } else if (week > regularSeasonWeeks) {
      tooltip += ' - Playoffs';
    }

    if (status === 'completed') {
      tooltip += ' (Completed)';
    } else if (status === 'partial') {
      tooltip += ' (In Progress)';
    } else if (status === 'scheduled') {
      tooltip += ' (Scheduled)';
    }

    return tooltip;
  };

  const handleWeekClick = (week) => {
    if (onWeekChange) {
      onWeekChange(week);
    }
  };

  /*
   * Bring the selected week into view.
   *
   * The strip is 17 chips at a 40px floor plus gaps — roughly 760px, which is
   * more than twice an iPhone SE's usable width no matter how it is laid out.
   * It scrolls now instead of overflowing, and a scroller that opens at week 1
   * while you are looking at week 14 is worse than no scroller, so it starts
   * where the reader is.
   *
   * `block: 'nearest'` matters: without it this also scrolls the *page*
   * vertically to the strip on every week change.
   */
  const currentWeekRef = useRef(null);
  useEffect(() => {
    currentWeekRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [currentWeek]);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="font-medium">Week {currentWeek} of {totalWeeks}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 bg-green-500 rounded"></div>
            <span className="text-xs">Complete</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 bg-blue-500 rounded"></div>
            <span className="text-xs">Current</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 bg-muted rounded"></div>
            <span className="text-xs">Upcoming</span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative w-full">
        <ScrollHint
          snap
          hint="Swipe to see all weeks"
          desktopHint="Scroll horizontally to see all weeks"
          contentClassName="py-1"
        >
          {/* `w-max` below sm: lets the chips keep their real size and the
              container scroll. From sm: up it is `w-full` again and `flex-1`
              spreads them across the row exactly as before. */}
          <div className="flex w-max items-center gap-1 px-2 sm:w-full">
            {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(week => (
            <React.Fragment key={week}>
              <div
                ref={week === currentWeek ? currentWeekRef : undefined}
                className={`${getWeekClasses(week)} snap-center`}
                title={getWeekTooltip(week)}
                onClick={() => handleWeekClick(week)}
              >
                <div className="flex flex-col items-center justify-center relative">
                  {getWeekIcon(week)}
                  <span className={`${getWeekIcon(week) ? 'text-xs' : ''}`}>
                    {week}
                  </span>
                </div>
              </div>
              {/* Trade Deadline Separator after Week 13.
                  `relative` on this wrapper is load-bearing: without it the
                  absolutely-positioned clock resolved against the progress
                  bar's outer `relative` container, which sits *outside* the
                  scroller — so the icon escaped the clip and dragged the whole
                  document 242px wider than the viewport, while every other
                  element measured as fitting. */}
              {week === 13 && (
                <div className="relative flex flex-col items-center justify-center px-1" title="Trade Deadline">
                  <div className="w-px h-8 bg-purple-400"></div>
                  <div className="absolute">
                    <Clock size={16} className="text-purple-500 bg-card rounded-full" />
                  </div>
                </div>
              )}
            </React.Fragment>
            ))}
          </div>
        </ScrollHint>

        {/* Key Events - ordered from smallest week to largest */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users size={12} className="text-red-500" />
            <span>Weeks {rivalryWeeks.join(', ')}: Rivalry</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={12} className="text-purple-500" />
            <span>Week {tradeDeadlineWeek}: Trade Deadline</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar size={12} className="text-muted-foreground" />
            <span>Week {playoffStartWeek}+: Playoffs</span>
          </div>
          <div className="flex items-center gap-1">
            <Trophy size={12} className="text-yellow-500" />
            <span>Week {championshipWeek}: Championship</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SeasonProgressBar;