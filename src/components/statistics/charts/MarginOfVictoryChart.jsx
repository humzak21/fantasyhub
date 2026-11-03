import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { ChartContainer, ChartTooltip, useMobileAxis } from '../../ui/chart';
import { getMaskedOwnerName, getMaskedTeamName, shortOwnerName } from '../../../utils/displayNameUtils';

const MarginTooltip = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  const margin = data.marginOfVictory;
  return (
    <div className="bg-card p-3 border border-border rounded-lg shadow-lg">
      <p className="font-semibold text-foreground mb-2">{data.name}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Average margin:</span>
          <span className="font-medium text-foreground tabular">
            {margin > 0 ? '+' : ''}
            {margin.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Games played:</span>
          <span className="font-medium text-foreground tabular">{data.gamesPlayed}</span>
        </div>
      </div>
    </div>
  );
};

/** The chart's height follows how many bars it has to fit. */
const phoneHeight = (count) => (count > 8 ? 'h-[420px]' : count > 4 ? 'h-[280px]' : 'h-[200px]');

/**
 * MarginOfVictoryChart - Bar chart showing average margin of victory/defeat
 * Positive margins indicate teams win by an average amount
 * Negative margins indicate teams lose by an average amount
 *
 * Every bar is named. It used to be fourteen unlabelled bars either side of
 * zero — a shape with nobody in it. Below `md` the bars run sideways with the
 * owner's short name beside each; from `md` they stand up with an angled
 * tick per team.
 */
const MarginOfVictoryChart = ({
  data = [],
  selectedTeams = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  // Small-screen axis overrides; empty object on desktop. Must be above
  // the early returns below — a hook after a conditional return is a
  // rules-of-hooks violation and breaks on the render where the data
  // arrives.
  const axis = useMobileAxis();

  const chartData = useMemo(() => {
    if (!data.length) return [];

    // Filter to selected teams if any are selected
    const filteredData = selectedTeams.length > 0
      ? data.filter(item => selectedTeams.includes(item.teamId))
      : data;

    // Sort by margin of victory descending
    return filteredData
      .sort((a, b) => b.marginOfVictory - a.marginOfVictory)
      .map(team => {
        const row = { id: team.teamId, name: team.teamName, owner: team.owner };
        return {
          name: getMaskedTeamName(row, user, isAdmin, teamOwnerNames),
          label: shortOwnerName(getMaskedOwnerName(row, user, isAdmin, teamOwnerNames)),
          marginOfVictory: Math.round(team.marginOfVictory * 100) / 100,
          gamesPlayed: team.gamesPlayed,
          totalMargin: Math.round(team.totalMargin * 100) / 100,
          teamId: team.teamId
        };
      });
  }, [data, selectedTeams, user, isAdmin, teamOwnerNames]);

  if (chartData.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No margin of victory data available. Complete games to see stats.
      </div>
    );
  }

  // A margin has a direction, so it carries colour.
  const cells = chartData.map((entry, index) => (
    <Cell
      key={`cell-${index}`}
      fill={entry.marginOfVictory > 0 ? 'var(--success)' : 'var(--destructive)'}
      opacity={0.8}
    />
  ));

  if (axis.isMobile) {
    return (
      <div className="w-full h-full flex flex-col">
        <ChartContainer config={{}} className={`w-full ${phoneHeight(chartData.length)}`}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} height={20} />
            {/* A category axis in a horizontal layout: every name, and room
                for it. `axis.y`'s narrow numeric gutter would clip them; the
                chart's height grows with the bar count so no two names share
                a row. */}
            <YAxis
              type="category"
              dataKey="label"
              interval={0}
              tickLine={false}
              width={84}
              tick={{ fontSize: 10 }}
            />
            <ChartTooltip content={<MarginTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }} />
            <ReferenceLine x={0} stroke="var(--border)" strokeDasharray="3 3" />
            <Bar dataKey="marginOfVictory" name="Avg Margin" radius={[0, 6, 6, 0]} maxBarSize={18} isAnimationActive={false}>
              {cells}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <ChartContainer config={{}} className="h-[400px] w-full">
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 15 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
          <XAxis
            dataKey="label"
            angle={-45}
            textAnchor="end"
            height={70}
            tick={{ fontSize: 10 }}
            interval={0}
          />
          <YAxis
            label={{ value: 'Average margin (points)', angle: -90, position: 'insideLeft', offset: -5, dy: 60 }}
            tick={{ fontSize: 10 }}
            width={36}
          />
          <ChartTooltip content={<MarginTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }} />
          <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
          <Bar dataKey="marginOfVictory" name="Avg Margin" radius={[6, 6, 0, 0]}>
            {cells}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
};

export default MarginOfVictoryChart;
