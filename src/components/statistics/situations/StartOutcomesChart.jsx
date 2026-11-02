import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';

import { ChartContainer, useMobileAxis } from '../../ui/chart';

/**
 * Where each start ended up: one bar per starting record, split by how the
 * season finished. Every team lands in exactly one segment, so each bar is the
 * whole group and a 0-3 bar can be read against a 3-0 bar whatever the sizes.
 *
 * The hues are the chart wheel's, in a fixed order; a missed playoff is the
 * uneventful end of a season, so it is a neutral, darker than the wheel because
 * at the wheel's lightness grey cannot be told from the punishment's red with
 * red-green colour blindness. Checked with the dataviz validator on the card
 * surface. The legend and the table beneath say the same thing without colour.
 */
const OUTCOMES = [
  { key: 'titles', label: 'Won the title', color: 'var(--chart-5)' },
  { key: 'playoffs', label: 'Made the playoffs', color: 'var(--chart-2)' },
  { key: 'missed', label: 'Missed the playoffs', color: 'oklch(0.52 0.012 265)' },
  { key: 'punished', label: 'Punishment', color: 'var(--chart-7)' }
];

/** One row of the chart: an outcome's teams, with `playoffs` net of the titles. */
const outcomeCounts = (group) => ({
  titles: group.titles,
  playoffs: group.madePlayoffs - group.titles,
  missed: group.count - group.madePlayoffs - group.punished,
  punished: group.punished
});

const Tip = ({ active, payload }) => {
  const row = active ? payload?.[0]?.payload : null;
  if (!row) return null;
  return (
    <div className="min-w-44 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">
        {row.key} start · {row.count} {row.count === 1 ? 'team' : 'teams'}
      </p>
      {OUTCOMES.map((outcome) => (
        <p key={outcome.key} className="flex items-center gap-2 tabular text-muted-foreground">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: outcome.color }} />
          <span className="flex-1">{outcome.label}</span>
          <span className="font-semibold text-foreground">{row[outcome.key]}</span>
        </p>
      ))}
    </div>
  );
};

export function OutcomeLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {OUTCOMES.map((outcome) => (
        <li key={outcome.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: outcome.color }} />
          {outcome.label}
        </li>
      ))}
    </ul>
  );
}

export default function StartOutcomesChart({ groups }) {
  const axis = useMobileAxis();
  const data = [...groups].reverse().map((group) => ({ ...group, ...outcomeCounts(group) }));

  return (
    // One height rule for any number of records: a 13-game start has up to fourteen.
    <ChartContainer
      config={{}}
      className="h-[calc(var(--start-rows)*40px+80px)] w-full"
      style={{ '--start-rows': data.length }}
    >
      <BarChart data={data} layout="vertical" stackOffset="expand" margin={{ top: 4, right: 12, bottom: 0, left: 0 }} {...axis.chart}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis
          type="number"
          domain={[0, 1]}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          tickFormatter={(value) => `${Math.round(value * 100)}%`}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          {...axis.x}
        />
        {/* A category axis in a horizontal layout: short records, a row each so
            every one fits, and `axis.y`'s numeric gutter is not for it. */}
        <YAxis type="category" dataKey="key" interval={0} width={48} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
        <Tooltip cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }} content={<Tip />} />
        {OUTCOMES.map((outcome) => (
          <Bar
            key={outcome.key}
            dataKey={outcome.key}
            stackId="outcome"
            fill={outcome.color}
            stroke="var(--card)"
            strokeWidth={2}
            maxBarSize={24}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
