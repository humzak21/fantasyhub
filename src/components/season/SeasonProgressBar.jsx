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

  // Read from the season, not from a literal in the view layer.
  //
  // These were `const tradeDeadlineWeek = 14` and `const rivalryWeeks = [4, 14]`
  // written here — facts about one league in one year, hardcoded into a
  // component that renders every season. A season with a different deadline
  // would have been drawn with this one's, and confidently.
  const tradeDeadlineWeek = season.tradeDeadlineWeek ?? season.trade_deadline_week ?? null;
  const rivalryWeeks = season.rivalryWeeks ?? season.rivalry_weeks ?? [];

  // Calculate completion status for each week
  const getWeekStatus = (week) => {
    const weekGames = schedule.filter(game => game.week === week);
    if (weekGames.length === 0) return 'empty';
    if (weekGames.every(game => game.isCompleted)) return 'completed';
    if (weekGames.some(game => game.isCompleted)) return 'partial';
    return 'scheduled';
  };

  /*
   * The strip is context, not the headline.
   *
   * It used to paint every completed week a saturated green, the current week
   * blue, partial weeks orange, and then ring championship in yellow, rivalry
   * in red and the trade deadline in purple — six hues at full strength, on a
   * control whose entire job is to say "you are here, and here is the shape of
   * the season". Seventeen loud blocks made the most disposable information on
   * the page the loudest thing on it.
   *
   * The rule now: a completed week is the *default* (most of them are), so it
   * recedes to the muted surface. The selected week takes the brand. What is
   * still to come is dimmer than what has happened. Special weeks are marked
   * by a border, not a fill, so the status fill keeps meaning one thing.
   */
  const getWeekClasses = (week) => {
    const status = getWeekStatus(week);
    const isSelected = week === currentWeek;
    const isChampionship = week === championshipWeek;
    const isRivalryWeek = rivalryWeeks.includes(week);
    const isTradeDeadline = week === tradeDeadlineWeek;
    const isPlayoff = week > regularSeasonWeeks;

    let classes =
      'relative flex h-9 min-w-10 flex-1 items-center justify-center gap-1 rounded-lg border text-xs font-medium tabular transition-colors duration-[130ms] cursor-pointer ';

    if (isSelected) {
      // The one thing the strip has to answer at a glance.
      classes += 'border-primary bg-primary text-primary-foreground font-semibold ';
    } else if (status === 'completed') {
      classes += 'border-border bg-muted text-foreground/80 hover:bg-accent ';
    } else if (status === 'partial') {
      classes += 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/15 ';
    } else {
      // Not played yet: present, but plainly ahead of the reader.
      classes += 'border-border/60 bg-transparent text-muted-foreground/70 hover:bg-accent/40 ';
    }

    // Markers, as borders rather than fills, so they can coexist with status.
    if (!isSelected) {
      if (isChampionship) classes += 'border-ff-rank-gold-500/60 ';
      else if (isRivalryWeek) classes += 'border-destructive/40 ';
      else if (isTradeDeadline) classes += 'border-info/40 ';
      else if (isPlayoff) classes += 'border-border-strong ';
    }

    return classes;
  };

  // Only the championship earns a glyph. The 8px and 10px icons this replaces
  // were below the size at which a lucide outline resolves into a shape.
  const getWeekIcon = (week) => {
    if (week === championshipWeek) {
      return <Trophy size={12} className="text-ff-rank-gold-400" aria-hidden="true" />;
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
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em]">
            Week {currentWeek} of {totalWeeks}
          </span>
        </div>
        {/* The swatch legend is gone. Three colour keys for "complete /
            current / upcoming" explained a code that the strip no longer
            needs: the selected week is the only filled chip, played weeks are
            solid, and unplayed ones are dim. A legend that has to be read
            before a control can be used is a sign the control is over-coded. */}
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

        {/* Key dates. Each entry renders only when the season actually has
            that date — the rivalry and trade-deadline lines used to be
            unconditional, so a season without them printed "Weeks : Rivalry"
            and "Week null: Trade Deadline". */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {rivalryWeeks.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users size={14} className="text-destructive" aria-hidden="true" />
              <span>{rivalryWeeks.length === 1 ? 'Week' : 'Weeks'} {rivalryWeeks.join(', ')}: rivalry</span>
            </div>
          )}
          {tradeDeadlineWeek && (
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-info" aria-hidden="true" />
              <span>Week {tradeDeadlineWeek}: trade deadline</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-muted-foreground" aria-hidden="true" />
            <span>Week {playoffStartWeek}+: playoffs</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Trophy size={14} className="text-ff-rank-gold-400" aria-hidden="true" />
            <span>Week {championshipWeek}: championship</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SeasonProgressBar;