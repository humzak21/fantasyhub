import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { ChartContainer, useMobileAxis } from '../../ui/chart';
import { EMPTY, formatPoints } from '../../../utils/format';
import { STAT_GROUPS } from '../../../../utils/playerProfile/statCatalog.js';
import { ESPN_STAT_IDS } from '../../../../services/db/espnMapping.js';
import { rankTicks } from './sectionFormat.js';

/**
 * The player page's charts (Contract 5, item 6). A lazy chunk: the body loads
 * this file with `React.lazy`, so recharts stays out of every page that never
 * opens a player.
 *
 * Two modes, both drawn from the profile `buildPlayerProfile` returns:
 *
 * - `season` — one `SeasonSummary`: points by week, cumulative points, weekly
 *   position rank, and one category chart chosen by position.
 * - `all` — season-by-season points per game and total points, and the career
 *   running total. No category chart: a career of weekly categories is the
 *   game log's job.
 *
 * Unknown is absent, never zero: a week he did not appear draws no bar and
 * breaks the rank line, and a chart with nothing in the span says so in a
 * line rather than drawing an empty axis.
 *
 * `maskName(franchiseRef) => string` names the franchise in a tooltip; without
 * it the tooltip names none, since an unmasked name is the one thing this file
 * must not invent. `onOpenWeek(line)` is called when a week's bar is pressed.
 */

const SERIES = 'var(--chart-1)';
const SECOND = 'var(--chart-2)';
const MUTED = 'var(--muted-foreground)';
const CHART_CLASS = 'h-[180px] w-full sm:h-[200px]';
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
const TICK = { fontSize: 11 };

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const played = (w) => w.appeared && isNumber(w.actualPoints);

/** A catalog stat by its label, so no stat id is restated here. */
const catalogStat = (group, label) => STAT_GROUPS[group].stats.find((s) => s.label === label);

const RUSH_YDS = catalogStat('rushing', 'Rushing yards');
const REC_YDS = catalogStat('receiving', 'Receiving yards');
const PASS_YDS = catalogStat('passing', 'Passing yards');
const PASS_TD = STAT_GROUPS.passing.stats.find((s) => s.id === ESPN_STAT_IDS.PASSING_TD);
const FG_SHORT = catalogStat('kicking', 'FG 0–39 made');
const FG_MID = catalogStat('kicking', 'FG 40–49 made');
const FG_LONG = catalogStat('kicking', 'FG 50+ made');
const POINTS_ALLOWED = catalogStat('defense', 'Points allowed');

const statOf = (w, stat) => (played(w) && w.stats && isNumber(w.stats[stat.id]) ? w.stats[stat.id] : null);

function ChartBlock({ title, caption, empty, emptyText, children }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-1 text-sm font-semibold text-foreground">{title}</h4>
      {empty ? (
        <p className="py-6 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          {children}
          {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
        </>
      )}
    </div>
  );
}

const rankText = (w) =>
  w.rank && isNumber(w.rank.positional)
    ? `${w.position ?? ''}${w.rank.positional}${isNumber(w.rank.positionalOf) ? ` of ${w.rank.positionalOf}` : ''}`
    : null;

function WeekTooltip({ active, payload, maskName }) {
  if (!active || !payload?.length) return null;
  const w = payload[0].payload?.line;
  if (!w) return null;
  const franchise = maskName && w.franchise ? maskName(w.franchise) : null;
  const rank = rankText(w);
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground">{w.year ? `${w.year} · ` : ''}{w.label}</div>
      <div className="text-muted-foreground tabular">
        {played(w) ? `${formatPoints(w.actualPoints)} pts` : w.actualPoints != null ? 'Did not play' : 'No result'}
        {' · '}
        {w.started ? 'started' : 'bench'}
      </div>
      {isNumber(w.projectedPoints) && (
        <div className="text-muted-foreground tabular">Projected {formatPoints(w.projectedPoints)}</div>
      )}
      {franchise && <div className="text-muted-foreground">{franchise}</div>}
      {rank && <div className="text-muted-foreground tabular">{rank}</div>}
    </div>
  );
}

function SeasonTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground">{row.year}</div>
      <div className="text-muted-foreground tabular">
        {formatPoints(row.ppg)} per game · {formatPoints(row.total)} total
      </div>
      <div className="text-muted-foreground tabular">
        {row.games} {row.games === 1 ? 'game' : 'games'} played
      </div>
    </div>
  );
}

function PointsByWeek({ rows, average, maskName, onOpenWeek }) {
  const axis = useMobileAxis();
  const hasProjection = rows.some((r) => r.projected != null);
  const empty = !rows.some((r) => r.points != null);
  return (
    <ChartBlock
      title="Points by week"
      empty={empty}
      emptyText="No games played this season."
      caption={
        average != null
          ? `Dashed line: his average, ${formatPoints(average)}, over the weeks he played. Faded bars are bench weeks${hasProjection ? '; the thin line is his projection' : ''}.`
          : null
      }
    >
      <ChartContainer config={{}} className={CHART_CLASS}>
        <ComposedChart data={rows} margin={MARGIN} {...axis.chart}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week" tickLine={false} tick={TICK} {...axis.x} />
          <YAxis width={32} tickLine={false} allowDecimals={false} tick={TICK} {...axis.y} />
          <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.3 }} content={<WeekTooltip maskName={maskName} />} />
          {average != null && (
            <ReferenceLine y={average} stroke={MUTED} strokeDasharray="4 4" strokeOpacity={0.7} />
          )}
          <Bar
            dataKey="points"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            onClick={onOpenWeek ? (entry) => entry?.payload?.line && onOpenWeek(entry.payload.line) : undefined}
            className={onOpenWeek ? 'cursor-pointer' : undefined}
          >
            {rows.map((r) => (
              <Cell key={r.week} fill={SERIES} fillOpacity={r.line.started ? 1 : 0.4} />
            ))}
          </Bar>
          {hasProjection && (
            <Line
              type="linear"
              dataKey="projected"
              stroke={MUTED}
              strokeWidth={1}
              strokeOpacity={0.8}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ChartContainer>
    </ChartBlock>
  );
}

function CumulativePoints({ rows, average, maskName }) {
  const axis = useMobileAxis();
  const empty = !rows.some((r) => r.points != null);
  return (
    <ChartBlock
      title="Points so far"
      empty={empty}
      emptyText="No points this season yet."
      caption={average != null ? 'Dashed line: where he would be had he scored his average every game he played.' : null}
    >
      <ChartContainer config={{}} className={CHART_CLASS}>
        <LineChart data={rows} margin={MARGIN} {...axis.chart}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week" tickLine={false} tick={TICK} {...axis.x} />
          <YAxis width={36} tickLine={false} allowDecimals={false} tick={TICK} {...axis.y} />
          <Tooltip cursor={{ stroke: 'var(--border)' }} content={<WeekTooltip maskName={maskName} />} />
          {average != null && (
            <Line
              type="linear"
              dataKey="pace"
              stroke={MUTED}
              strokeDasharray="4 4"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
          )}
          <Line
            type="linear"
            dataKey="cumulative"
            stroke={SERIES}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </ChartBlock>
  );
}

function RankByWeek({ rows, position, maskName }) {
  const axis = useMobileAxis();
  const ranks = rows.map((r) => r.rank).filter(isNumber);
  const worst = ranks.length ? Math.max(...ranks) : 1;
  return (
    <ChartBlock
      title={`Weekly ${position ?? 'position'} rank`}
      empty={!ranks.length}
      emptyText="No ranked weeks this season."
      caption="Among players on a league roster that week. The line breaks where he did not play."
    >
      <ChartContainer config={{}} className={CHART_CLASS}>
        <LineChart data={rows} margin={{ ...MARGIN, right: 12 }} {...axis.chart}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week" tickLine={false} tick={TICK} {...axis.x} />
          <YAxis
            reversed
            domain={[1, Math.max(worst, 2)]}
            ticks={rankTicks(worst)}
            interval={0}
            allowDecimals={false}
            width={36}
            tickLine={false}
            tickFormatter={(v) => `#${v}`}
            tick={TICK}
            {...axis.y}
          />
          <Tooltip cursor={{ stroke: 'var(--border)' }} content={<WeekTooltip maskName={maskName} />} />
          <Line
            type="linear"
            dataKey="rank"
            stroke={SERIES}
            strokeWidth={2}
            connectNulls={false}
            dot={{ r: 3, fill: SERIES, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </ChartBlock>
  );
}

/** Which category chart a position gets, or null for none. */
function categorySpec(position) {
  switch (position) {
    case 'RB':
    case 'WR':
    case 'TE':
      return {
        kind: 'stacked',
        title: 'Yards by week',
        caption: 'Rushing and receiving yards, stacked.',
        series: [
          { stat: RUSH_YDS, name: 'Rushing', color: SERIES },
          { stat: REC_YDS, name: 'Receiving', color: SECOND }
        ]
      };
    case 'QB':
      return {
        kind: 'passing',
        title: 'Passing by week',
        caption: 'Bars: passing yards. Line: passing TDs, on the right axis.',
        series: [
          { stat: PASS_YDS, name: 'Passing yards', color: SERIES },
          { stat: PASS_TD, name: 'Passing TDs', color: SECOND }
        ]
      };
    case 'K':
      return {
        kind: 'stacked',
        title: 'Field goals by distance',
        caption: 'Field goals made, stacked by distance.',
        series: [
          { stat: FG_SHORT, name: '0–39', color: SERIES },
          { stat: FG_MID, name: '40–49', color: SECOND },
          { stat: FG_LONG, name: '50+', color: 'var(--chart-3)' }
        ]
      };
    case 'D/ST':
      return {
        kind: 'stacked',
        title: 'Points allowed by week',
        caption: null,
        series: [{ stat: POINTS_ALLOWED, name: 'Points allowed', color: SERIES }]
      };
    default:
      return null;
  }
}

/** Which colour is which, for a chart with more than one series. */
function SeriesLegend({ series, caption }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {series.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
      {caption && <span>{caption}</span>}
    </span>
  );
}

function CategoryChart({ weeks, position, maskName }) {
  const axis = useMobileAxis();
  const spec = useMemo(() => categorySpec(position), [position]);
  const rows = useMemo(
    () =>
      spec
        ? weeks.map((w) => {
            const row = { week: w.week, line: w };
            for (const s of spec.series) row[s.stat.id] = statOf(w, s.stat);
            return row;
          })
        : [],
    [weeks, spec]
  );
  if (!spec) return null;
  const empty = !rows.some((r) => spec.series.some((s) => r[s.stat.id] != null));
  const stacked = spec.kind === 'stacked' && spec.series.length > 1;

  return (
    <ChartBlock
      title={spec.title}
      caption={spec.series.length > 1 ? <SeriesLegend series={spec.series} caption={spec.caption} /> : spec.caption}
      empty={empty}
      emptyText="No stat lines stored for this season."
    >
      <ChartContainer config={{}} className={CHART_CLASS}>
        <ComposedChart data={rows} margin={MARGIN} {...axis.chart}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week" tickLine={false} tick={TICK} {...axis.x} />
          <YAxis yAxisId="left" width={36} tickLine={false} allowDecimals={false} tick={TICK} {...axis.y} />
          {spec.kind === 'passing' && (
            <YAxis
              yAxisId="right"
              orientation="right"
              width={24}
              tickLine={false}
              allowDecimals={false}
              tick={TICK}
              {...axis.y}
            />
          )}
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
            content={<CategoryTooltip series={spec.series} maskName={maskName} />}
          />
          {spec.kind === 'passing' ? (
            <>
              <Bar yAxisId="left" dataKey={spec.series[0].stat.id} name={spec.series[0].name} fill={spec.series[0].color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line
                yAxisId="right"
                type="linear"
                dataKey={spec.series[1].stat.id}
                name={spec.series[1].name}
                stroke={spec.series[1].color}
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 3, fill: spec.series[1].color, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </>
          ) : (
            spec.series.map((s, i) => (
              <Bar
                key={s.stat.id}
                yAxisId="left"
                dataKey={s.stat.id}
                name={s.name}
                stackId={stacked ? 'category' : undefined}
                fill={s.color}
                radius={i === spec.series.length - 1 ? [4, 4, 0, 0] : undefined}
                isAnimationActive={false}
              />
            ))
          )}
        </ComposedChart>
      </ChartContainer>
    </ChartBlock>
  );
}

function CategoryTooltip({ active, payload, series, maskName }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const w = row?.line;
  if (!w) return null;
  const franchise = maskName && w.franchise ? maskName(w.franchise) : null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground">{w.label}</div>
      {series.map((s) => (
        <div key={s.stat.id} className="text-muted-foreground tabular">
          {s.name}: {row[s.stat.id] ?? EMPTY}
        </div>
      ))}
      {franchise && <div className="text-muted-foreground">{franchise}</div>}
    </div>
  );
}

function SeasonBars({ rows, dataKey, title, caption }) {
  const axis = useMobileAxis();
  const empty = !rows.some((r) => r[dataKey] != null);
  return (
    <ChartBlock title={title} caption={caption} empty={empty} emptyText="No games played in this league yet.">
      <ChartContainer config={{}} className={CHART_CLASS}>
        <BarChart data={rows} margin={{ ...MARGIN, top: 18 }} {...axis.chart}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="year" tickLine={false} tick={TICK} {...axis.x} />
          <YAxis width={36} tickLine={false} allowDecimals={false} tick={TICK} {...axis.y} />
          <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.3 }} content={<SeasonTooltip />} />
          <Bar dataKey={dataKey} fill={SERIES} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="gamesLabel"
              position="top"
              style={{ fontSize: 10, fill: MUTED }}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartBlock>
  );
}

function CareerCumulative({ rows }) {
  const axis = useMobileAxis();
  const empty = !rows.some((r) => r.total != null);
  return (
    <ChartBlock
      title="Career points"
      caption="Running total at the end of each season in this league."
      empty={empty}
      emptyText="No games played in this league yet."
    >
      <ChartContainer config={{}} className={CHART_CLASS}>
        <LineChart data={rows} margin={{ ...MARGIN, right: 12 }} {...axis.chart}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="year" tickLine={false} tick={TICK} {...axis.x} />
          <YAxis width={40} tickLine={false} allowDecimals={false} tick={TICK} {...axis.y} />
          <Tooltip cursor={{ stroke: 'var(--border)' }} content={<SeasonTooltip />} />
          <Line
            type="linear"
            dataKey="cumulative"
            stroke={SERIES}
            strokeWidth={2}
            dot={{ r: 3, fill: SERIES, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </ChartBlock>
  );
}

/** One row per week of a season, with the running totals the line charts read. */
function seasonRows(season) {
  const average = season?.totals?.pointsPerGame ?? null;
  let cumulative = 0;
  let games = 0;
  return (season?.weeks ?? []).map((w) => {
    const points = played(w) ? w.actualPoints : null;
    if (points != null) {
      cumulative += points;
      games += 1;
    }
    return {
      week: w.week,
      line: w,
      points,
      projected: isNumber(w.projectedPoints) ? w.projectedPoints : null,
      rank: w.rank && isNumber(w.rank.positional) ? w.rank.positional : null,
      cumulative: games ? cumulative : null,
      pace: games && average != null ? average * games : null
    };
  });
}

/** One row per season, oldest first. */
function careerRows(seasons = []) {
  let cumulative = 0;
  return [...seasons]
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
    .map((s) => {
      const total = s.totals?.totalPoints ?? null;
      const games = s.totals?.gamesPlayed ?? 0;
      if (total != null) cumulative += total;
      return {
        year: s.year,
        ppg: s.totals?.pointsPerGame ?? null,
        total,
        games,
        gamesLabel: `${games} gp`,
        cumulative
      };
    });
}

export default function PlayerCharts({ profile, season, mode, maskName, onOpenWeek }) {
  const position = profile?.player?.position ?? null;
  const rows = useMemo(() => (mode === 'season' ? seasonRows(season) : []), [mode, season]);
  const career = useMemo(() => (mode === 'all' ? careerRows(profile?.seasons) : []), [mode, profile]);

  if (!profile) return null;

  if (mode === 'all') {
    return (
      <div className="grid gap-4 @xl:grid-cols-2">
        <SeasonBars rows={career} dataKey="ppg" title="Points per game by season" caption="Labels: games played that season." />
        <SeasonBars rows={career} dataKey="total" title="Total points by season" caption="Labels: games played that season." />
        <CareerCumulative rows={career} />
      </div>
    );
  }

  const average = season?.totals?.pointsPerGame ?? null;
  return (
    <div className="grid gap-4 @xl:grid-cols-2">
      <PointsByWeek rows={rows} average={average} maskName={maskName} onOpenWeek={onOpenWeek} />
      <CumulativePoints rows={rows} average={average} maskName={maskName} />
      <RankByWeek rows={rows} position={position} maskName={maskName} />
      <CategoryChart weeks={season?.weeks ?? []} position={position} maskName={maskName} />
    </div>
  );
}
