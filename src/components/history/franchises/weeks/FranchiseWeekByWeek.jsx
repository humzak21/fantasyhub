import { forwardRef, useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';

import { Button } from '../../../ui/button';
import { EmptyState } from '../../../ui/empty-state';
import { ScrollHint } from '../../../ui/scroll-hint';
import { SectionHeading } from '../../../ui/section-heading';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/select';
import { ChartContainer, useMobileAxis } from '../../../ui/chart';
import { cn } from '../../../../lib/utils';
import { formatOrdinal } from '../../../../utils/format';
import { useSeasonWeeks } from '../../../../../hooks/queries/index.js';
import {
  buildWeekDossier,
  defaultWeek,
  franchiseWeekStrip,
  seasonArc
} from '../../../../../utils/franchiseWeeks.js';
import WeekDossier from './WeekDossier';
import PlayerSheet from './PlayerSheet';

const SERIES = 'var(--chart-1)';

/**
 * The franchise profile's week view: pick a season, pick a week, and see the
 * franchise as it stood then — result, rank, lineup, why it ranked where it
 * did, and the moves it made. Any viewer can open any franchise's weeks.
 *
 * Nothing here is year-gated. The season list is the franchise's own season
 * history, the weeks come from the season row plus whatever rows exist, and
 * each part of a week appears when its table has a row for it — so a season
 * the sync writes next year shows up with no change here.
 *
 * `seasons` is `[{ id, year, isCurrent }]`, newest first.
 */
const FranchiseWeekByWeek = forwardRef(function FranchiseWeekByWeek(
  { franchiseId, seasons, seasonId, onSeasonChange, viewer },
  ref
) {
  const season = seasons.find((s) => s.id === seasonId) ?? null;
  const { data: index, isLoading, isError } = useSeasonWeeks(seasonId, {
    isCompleted: season ? !season.isCurrent : false
  });

  return (
    <section ref={ref} className="scroll-mt-24 space-y-4" aria-label="Week by week">
      <SectionHeading
        icon={CalendarRange}
        aside={
          seasons.length > 0 && (
            <Select value={seasonId ?? undefined} onValueChange={onSeasonChange}>
              <SelectTrigger className="h-8 w-[104px]" aria-label="Season">
                <SelectValue placeholder="Season" />
              </SelectTrigger>
              <SelectContent>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      >
        Week by week
      </SectionHeading>

      {!seasonId ? (
        <EmptyState icon={CalendarRange} title="No seasons yet" description="This franchise has no seasons to look back on." />
      ) : isLoading ? (
        <WeekSkeleton />
      ) : isError ? (
        <EmptyState icon={CalendarRange} title="Couldn't load this season" description="Try again in a moment." />
      ) : !index ? (
        <EmptyState icon={CalendarRange} title="Season not found" />
      ) : (
        // Keyed so a different franchise or season opens on its own default week.
        <WeekBrowser key={`${franchiseId}:${seasonId}`} index={index} franchiseId={franchiseId} viewer={viewer} />
      )}
    </section>
  );
});

function WeekBrowser({ index, franchiseId, viewer }) {
  const strip = useMemo(() => franchiseWeekStrip(index, franchiseId), [index, franchiseId]);
  const arc = useMemo(() => seasonArc(index, franchiseId), [index, franchiseId]);
  const [picked, setPicked] = useState(null);
  const week = picked ?? defaultWeek(strip);
  const dossier = useMemo(
    () => (week != null ? buildWeekDossier(index, franchiseId, week) : null),
    [index, franchiseId, week]
  );

  // The sheet keeps its player while it animates closed.
  const [sheetPlayer, setSheetPlayer] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const openPlayer = (row) => {
    setSheetPlayer(row);
    setSheetOpen(true);
  };

  if (strip.length === 0 || !dossier) {
    return (
      <EmptyState
        icon={CalendarRange}
        title={`No team in ${index.season.year}`}
        description="This franchise did not play that season."
      />
    );
  }

  const position = strip.findIndex((w) => w.week === week);
  const step = (delta) => {
    const next = strip[position + delta];
    if (next) setPicked(next.week);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => step(-1)}
          disabled={position <= 0}
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <ScrollHint className="min-w-0 flex-1" hint="Swipe for more weeks" desktopHint="Scroll for more weeks">
          <div className="flex gap-1.5 py-0.5" role="group" aria-label="Weeks">
            {strip.map((w) => (
              <WeekChip key={w.week} week={w} selected={w.week === week} onSelect={() => setPicked(w.week)} />
            ))}
          </div>
        </ScrollHint>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => step(1)}
          disabled={position >= strip.length - 1}
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <SeasonArc arc={arc} week={week} teamCount={index.teams?.length ?? null} onSelect={setPicked} />

      <WeekDossier dossier={dossier} nflSeasonYear={index.season.nflSeasonYear} viewer={viewer} onPlayer={openPlayer} />

      <PlayerSheet
        player={sheetPlayer}
        week={week}
        index={index}
        viewer={viewer}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}

const RESULT_TEXT = { W: 'Won', L: 'Lost', T: 'Tied' };

function WeekChip({ week, selected, onSelect }) {
  const mark = week.result ?? (week.isBye ? 'Bye' : null);
  const state = week.result ? RESULT_TEXT[week.result] : week.isBye ? 'Bye' : 'Not played';
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${week.label}: ${state}`}
      title={week.label}
      className={cn(
        'flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-md border text-xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-primary bg-primary/15 text-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-muted',
        !week.hasData && !selected && 'opacity-50'
      )}
    >
      <span className={cn('font-medium tabular', selected && 'text-primary')}>
        {week.isPostseason ? `P${week.week}` : week.week}
      </span>
      <span
        className={cn(
          'text-[11px] font-semibold leading-tight',
          week.result === 'W' && 'text-success',
          week.result === 'L' && 'text-destructive',
          !week.result && 'text-muted-foreground'
        )}
      >
        {mark ?? '–'}
      </span>
    </button>
  );
}

function ArcTooltip({ active, payload, field }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const value = row[field];
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground">{row.label}</div>
      <div className="text-muted-foreground">
        {value != null ? `${field === 'powerRank' ? `#${value} power rank` : `${formatOrdinal(value)} by record`}` : 'No rank'}
        {row.result ? ` · ${RESULT_TEXT[row.result]}` : ''}
      </div>
    </div>
  );
}

/**
 * The season in one line: power rank where a snapshot exists, otherwise the
 * standing by record — the caption says which. Clicking a week opens it.
 */
function SeasonArc({ arc, week, teamCount, onSelect }) {
  const axis = useMobileAxis();
  const field = arc.some((a) => a.powerRank != null) ? 'powerRank' : 'standing';
  const plotted = arc.filter((a) => a[field] != null);
  if (plotted.length < 2) return null;

  const worst = Math.max(teamCount ?? 0, ...plotted.map((a) => a[field]));
  const caption = field === 'powerRank' ? 'Power rank by week' : 'Standing by week, by record';

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)] sm:p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{caption}</h3>
        <span className="text-xs text-muted-foreground">Tap a week to open it</span>
      </div>
      <ChartContainer config={{}} className="h-[140px] w-full sm:h-[170px]">
        <LineChart
          data={arc}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          onClick={(state) => {
            const next = Number(state?.activeLabel);
            if (Number.isFinite(next)) onSelect(next);
          }}
          className="cursor-pointer"
          {...axis.chart}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week" tickLine={false} tick={{ fontSize: 11 }} {...axis.x} />
          <YAxis
            reversed
            domain={[1, Math.max(worst, 2)]}
            allowDecimals={false}
            width={32}
            tickLine={false}
            tickFormatter={(v) => `#${v}`}
            tick={{ fontSize: 11 }}
            {...axis.y}
          />
          <Tooltip cursor={{ stroke: 'var(--border)' }} content={<ArcTooltip field={field} />} />
          <ReferenceLine x={week} stroke="var(--primary)" strokeOpacity={0.6} />
          <Line
            type="linear"
            dataKey={field}
            stroke={SERIES}
            strokeWidth={2}
            connectNulls
            dot={{ r: 3, fill: SERIES, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

function WeekSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading weeks">
      <div className="h-12 animate-pulse rounded-md bg-muted" />
      <div className="h-[150px] animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

export default FranchiseWeekByWeek;
