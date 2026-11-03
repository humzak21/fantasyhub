import { Label } from '../ui/label';
import { LiveDot } from '../ui/live-dot';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { STANDINGS_VIEW } from '../../../utils/standings/standingsView.js';

/**
 * Live · Official · Week. Tabs rather than a new segmented control, because
 * `TabsList` is the closest primitive there is. The week itself is a picker
 * beside them, offered only while that view is on.
 *
 * Renders no tabs with a single choice: a past season's table is just the table.
 * `action` sits at the end of the row either way.
 *
 * @param {object} props
 * @param {'live'|'official'|'week'} props.mode
 * @param {(mode: string) => void} props.onModeChange
 * @param {boolean} props.hasLive - there is a live week to show
 * @param {boolean} props.gameOn - a game is on, so the dot pulses
 * @param {number[]} props.weeks - the scored weeks, newest first
 * @param {number|null} props.week
 * @param {(week: number) => void} props.onWeekChange
 * @param {React.ReactNode} [props.action] - beside the tabs, at the row's end
 */
export function StandingsViewToggle({ mode, onModeChange, hasLive, gameOn, weeks, week, onWeekChange, action = null }) {
  const hasChoice = hasLive || weeks.length > 0;
  if (!hasChoice && !action) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      {hasChoice && (
        <Tabs value={mode} onValueChange={onModeChange}>
          <TabsList aria-label="Which standings" className="h-9">
            {hasLive && (
              <TabsTrigger value={STANDINGS_VIEW.LIVE} className="py-1">
                <LiveDot done={!gameOn} className="text-success" />
                Live
              </TabsTrigger>
            )}
            <TabsTrigger value={STANDINGS_VIEW.OFFICIAL} className="py-1">
              Official
            </TabsTrigger>
            {weeks.length > 0 && (
              <TabsTrigger value={STANDINGS_VIEW.WEEK} className="py-1">
                Week
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      )}

      {mode === STANDINGS_VIEW.WEEK && (
        <>
          <Label htmlFor="standings-week" className="sr-only">
            Standings as of week
          </Label>
          <Select value={String(week ?? '')} onValueChange={(value) => onWeekChange(Number(value))}>
            <SelectTrigger id="standings-week" className="h-9 w-auto min-w-[6.5rem] text-sm">
              <SelectValue placeholder="Week" />
            </SelectTrigger>
            <SelectContent>
              {weeks.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  Week {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

export default StandingsViewToggle;
