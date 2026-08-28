import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, useMobileAxis } from '../../ui/chart';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-card p-3 rounded border border-border shadow-lg">
      <p className="font-semibold text-foreground mb-2 text-sm">Week {label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="text-sm">
          <span style={{ color: entry.color }} className="font-medium">{entry.name}:</span>
          <span className="ml-2 font-semibold text-foreground">{entry.value !== null && entry.value !== undefined ? entry.value.toFixed(1) : 'N/A'}</span>
        </div>
      ))}
    </div>
  );
};

// Color palette for team lines (cycle through colors for up to 16 teams)
const TEAM_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f97316', // orange
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#eab308', // yellow
  '#14b8a6', // teal
  '#f43f5e', // rose
  '#6366f1', // indigo
  '#14b8a6', // emerald
  '#a855f7', // fuchsia
  '#0ea5e9', // sky
  '#f59e0b', // amber
  '#6b7280'  // gray
];

/**
 * WeeklyScoringTrendsChart - Line chart showing team scores over time
 * Allows filtering by selected teams and week range
 */
const WeeklyScoringTrendsChart = ({
  data = [],
  rankings = [],
  selectedTeams = [],
  minWeek = 1,
  maxWeek = 17,
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

    // Filter by week range
    const filteredByWeek = data.filter(item => item.week >= minWeek && item.week <= maxWeek);

    if (filteredByWeek.length === 0) return [];

    // If teams are selected, only include those teams
    const teamIds = selectedTeams.length > 0 ? selectedTeams : rankings.map(r => r.id);

    // Transform data to include only selected teams
    return filteredByWeek.map(weekData => {
      const transformed = { week: weekData.week };

      teamIds.forEach(teamId => {
        if (weekData[teamId] !== undefined && weekData[teamId] !== null) {
          transformed[teamId] = weekData[teamId];
        }
      });

      return transformed;
    });
  }, [data, rankings, selectedTeams, minWeek, maxWeek]);

  if (chartData.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No scoring data available for the selected week range.
      </div>
    );
  }

  // Get selected team IDs for rendering lines
  const teamIds = selectedTeams.length > 0 ? selectedTeams : rankings.map(r => r.id);


  return (
    <div className="w-full h-full flex flex-col mt-6">
      <ChartContainer config={{}} className="h-[260px] w-full sm:h-[360px]">
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 35, bottom: -30 }} {...axis.chart}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
          <XAxis
            dataKey="week"
            label={{ value: 'Week', position: 'insideBottomRight', offset: -5 }}
            tick={{ fontSize: 10 }}
            {...axis.x}
          />
          <YAxis
            label={{ value: 'Points', angle: -90, position: 'insideLeft', offset: -5, dy: 5 }}
            tick={{ fontSize: 10 }}
            width={30}
            {...axis.y}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255, 255, 255, 0.3)' }} />
          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} height={50} />

          {teamIds.map((teamId, index) => {
            const team = rankings.find(r => r.id === teamId);
            if (!team) return null;

            const teamName = getMaskedTeamName(team, user, isAdmin, teamOwnerNames);
            const color = TEAM_COLORS[index % TEAM_COLORS.length];

            return (
              <Line
                key={teamId}
                type="monotone"
                dataKey={teamId}
                name={teamName}
                stroke={color}
                dot={{ r: 3 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
                connectNulls={true}
              />
            );
          })}
        </LineChart>
      </ChartContainer>
    </div>
  );
};

export default WeeklyScoringTrendsChart;
