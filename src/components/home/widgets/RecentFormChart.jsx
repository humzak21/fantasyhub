import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';

import { ChartContainer, ChartTooltip, teamChartColor, useMobileAxis } from '../../ui/chart';
import { formatPoints } from '../../../utils/format';

/**
 * Points for across the last few weeks, as bars, with the league's weekly
 * average as a faint dashed line — three bars is a sparkline, not a report,
 * so it is 120px and has no legend.
 *
 * Its own module so `RecentForm` can lazy-load it: it is the home page's only
 * recharts consumer, and the landing chunk should not carry recharts.
 *
 * The bars wear the franchise's colour (`teamChartColor`): in a chart, hue is
 * identity. The average is a reference, so it is muted.
 */
export default function RecentFormChart({ rows, team }) {
  const axis = useMobileAxis();
  const data = rows.map((row) => ({
    label: `Wk ${row.week}`,
    pointsFor: row.pointsFor,
    leagueAverage: row.leagueAverage
  }));

  return (
    <ChartContainer config={{}} className="h-auto max-h-[260px] min-h-[120px] flex-1 sm:h-auto" aria-label="Points for, week by week, against the league average">
      <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -6 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} {...axis} />
        <YAxis tickLine={false} axisLine={false} width={44} domain={[0, 'auto']} tickCount={3} />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg">
                <p className="font-medium">{label}</p>
                <p className="tabular">Scored {formatPoints(payload[0]?.payload?.pointsFor)}</p>
                <p className="tabular text-muted-foreground">
                  League average {formatPoints(payload[0]?.payload?.leagueAverage)}
                </p>
              </div>
            ) : null
          }
        />
        <Bar dataKey="pointsFor" fill={teamChartColor(team)} radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Line
          dataKey="leagueAverage"
          type="monotone"
          stroke="var(--muted-foreground)"
          strokeOpacity={0.6}
          strokeDasharray="4 3"
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
