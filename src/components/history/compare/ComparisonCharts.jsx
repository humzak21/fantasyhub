import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis
} from 'recharts';

import { ChartContainer, teamChartColor, useMobileAxis } from '../../ui/chart';
import { formatStatTick, formatStatValue } from './statFormat';

/** Beyond this many lines, per-point dots turn the chart into confetti. */
const DOTTED_SERIES = 4;
const TOOLTIP_ROWS = 10;
const MAX_TICK_NAME = 14;

const colorOf = (franchiseId) => teamChartColor({ franchiseId });
const shortName = (name) => (name.length > MAX_TICK_NAME ? `${name.slice(0, MAX_TICK_NAME - 1)}…` : name);

/**
 * The chart's height follows how many bars it has to fit: fourteen franchises
 * in 260px is a bar every 18px, which is a barcode.
 */
const barHeight = (count) =>
  count > 8 ? 'h-[440px] w-full sm:h-[480px]' : count > 4 ? 'h-[300px] w-full sm:h-[360px]' : 'h-[200px] w-full sm:h-[240px]';

const tooltipBox = 'min-w-40 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg';

const Swatch = ({ color }) => (
  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
);

// ---------------------------------------------------------------------------
// Ranked bars: one figure per franchise
// ---------------------------------------------------------------------------

export const RankedBarChart = ({ rows, stat, averaged, nameOf }) => {
  const axis = useMobileAxis();
  const data = rows.map((row) => ({ ...row, name: nameOf(row.franchiseId) }));
  const hasNegative = data.some((row) => row.value < 0);

  return (
    <ChartContainer config={{}} className={barHeight(data.length)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} {...axis.chart}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          domain={hasNegative ? ['auto', 'auto'] : [0, 'auto']}
          tickFormatter={(value) => formatStatTick(stat, value)}
          tickLine={false}
          tick={{ fontSize: 11 }}
          {...axis.x}
        />
        {/* A category axis in a horizontal layout: every name, and room for
            it — `axis.y`'s narrow numeric gutter would clip them. Every tick
            is safe at 375px because the chart's height grows with the number
            of bars (`barHeight`), so the names never share a row. */}
        <YAxis
          type="category"
          dataKey="name"
          interval={0}
          tickFormatter={shortName}
          tickLine={false}
          width={axis.isMobile ? 92 : 132}
          tick={{ fontSize: axis.isMobile ? 10 : 11 }}
        />
        {hasNegative && <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />}
        <Tooltip cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }} content={<BarTooltip stat={stat} averaged={averaged} />} />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={22} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.franchiseId} fill={colorOf(row.franchiseId)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
};

const BarTooltip = ({ active, payload, stat, averaged }) => {
  const row = active ? payload?.[0]?.payload : null;
  if (!row) return null;
  return (
    <div className={tooltipBox}>
      <p className="flex items-center gap-2 font-medium text-foreground">
        <Swatch color={colorOf(row.franchiseId)} />
        {row.name}
      </p>
      <p className="mt-1 tabular text-foreground">
        {stat.label}: <span className="font-semibold">{formatStatValue(stat, row.value, { averaged })}</span>
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lines: one per franchise, over weeks or over seasons
// ---------------------------------------------------------------------------

export const TrendLineChart = ({ rows, series, xKey, stat, nameOf, inProgressYears = [] }) => {
  const axis = useMobileAxis();
  const dotted = xKey === 'year' || series.length <= DOTTED_SERIES;
  const xLabel = (value) =>
    xKey === 'year' ? String(value) : `Week ${value}`;

  return (
    <ChartContainer config={{}} className="h-[260px] w-full sm:h-[360px]">
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} {...axis.chart}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          tick={{ fontSize: 11 }}
          tickFormatter={(value) => (xKey === 'year' && inProgressYears.includes(value) ? `${value}*` : String(value))}
          {...axis.x}
        />
        <YAxis
          domain={['auto', 'auto']}
          tickFormatter={(value) => formatStatTick(stat, value)}
          tickLine={false}
          width={44}
          tick={{ fontSize: 11 }}
          {...axis.y}
        />
        {stat.signed && <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />}
        <Tooltip
          cursor={{ stroke: 'var(--border)' }}
          content={<LineTooltip stat={stat} nameOf={nameOf} xLabel={xLabel} />}
        />
        {series.map((line) => (
          <Line
            key={line.franchiseId}
            type="linear"
            dataKey={line.franchiseId}
            name={nameOf(line.franchiseId)}
            stroke={colorOf(line.franchiseId)}
            strokeWidth={2}
            dot={dotted ? { r: 2.5, fill: colorOf(line.franchiseId), strokeWidth: 0 } : false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
            // A season the franchise did not play is a gap, not a slope.
            connectNulls={xKey === 'week'}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
};

/**
 * Every line's figure at the hovered week or season, best first. Hand-written
 * because `ChartTooltipContent` hides a value of 0, which luck and differential
 * are often exactly.
 */
const LineTooltip = ({ active, payload, label, stat, nameOf, xLabel }) => {
  if (!active || !payload?.length) return null;

  const rows = payload
    .filter((entry) => Number.isFinite(entry.value))
    .sort((a, b) => (stat.better === 'lower' ? a.value - b.value : b.value - a.value));
  if (rows.length === 0) return null;

  const shown = rows.slice(0, TOOLTIP_ROWS);
  return (
    <div className={tooltipBox}>
      <p className="mb-1.5 font-medium text-foreground">{xLabel(label)}</p>
      <ul className="space-y-1">
        {shown.map((entry) => (
          <li key={entry.dataKey} className="flex items-center gap-2">
            <Swatch color={colorOf(entry.dataKey)} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{nameOf(entry.dataKey)}</span>
            <span className="tabular font-medium text-foreground">{formatStatValue(stat, entry.value)}</span>
          </li>
        ))}
      </ul>
      {rows.length > shown.length && <p className="mt-1.5 text-muted-foreground">+{rows.length - shown.length} more</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Scatter: one stat against another
// ---------------------------------------------------------------------------

export const StatScatterChart = ({ points, average, statX, statY, averaged, nameOf }) => {
  const axis = useMobileAxis();
  const data = points.map((point) => ({ ...point, name: nameOf(point.franchiseId) }));

  return (
    <ChartContainer config={{}} className="h-[300px] w-full sm:h-[400px]">
      <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: 0 }} {...axis.chart}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          name={statX.label}
          domain={['auto', 'auto']}
          tickFormatter={(value) => formatStatTick(statX, value)}
          tickLine={false}
          tick={{ fontSize: 11 }}
          {...axis.x}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={statY.label}
          domain={['auto', 'auto']}
          tickFormatter={(value) => formatStatTick(statY, value)}
          tickLine={false}
          width={44}
          tick={{ fontSize: 11 }}
          {...axis.y}
        />
        <ZAxis range={[70, 70]} />
        {/* League-average guides split the plot into quadrants: above both,
            below both, and the two interesting corners. */}
        {Number.isFinite(average.x) && (
          <ReferenceLine x={average.x} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeDasharray="4 4" />
        )}
        {Number.isFinite(average.y) && (
          <ReferenceLine y={average.y} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeDasharray="4 4" />
        )}
        <Tooltip
          cursor={{ strokeDasharray: '3 3', stroke: 'var(--border)' }}
          content={<ScatterTooltip statX={statX} statY={statY} averaged={averaged} />}
        />
        <Scatter data={data} isAnimationActive={false}>
          {data.map((point) => (
            <Cell
              key={`${point.franchiseId}:${point.year ?? 'all'}`}
              fill={colorOf(point.franchiseId)}
              fillOpacity={0.85}
            />
          ))}
        </Scatter>
      </ScatterChart>
    </ChartContainer>
  );
};

const ScatterTooltip = ({ active, payload, statX, statY, averaged }) => {
  const point = active ? payload?.[0]?.payload : null;
  if (!point) return null;
  return (
    <div className={tooltipBox}>
      <p className="flex items-center gap-2 font-medium text-foreground">
        <Swatch color={colorOf(point.franchiseId)} />
        {point.name}
        {point.year != null && <span className="text-muted-foreground">{point.year}</span>}
      </p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
        <dt className="text-muted-foreground">{statX.label}</dt>
        <dd className="tabular text-right font-medium text-foreground">{formatStatValue(statX, point.x, { averaged })}</dd>
        <dt className="text-muted-foreground">{statY.label}</dt>
        <dd className="tabular text-right font-medium text-foreground">{formatStatValue(statY, point.y, { averaged })}</dd>
      </dl>
    </div>
  );
};
