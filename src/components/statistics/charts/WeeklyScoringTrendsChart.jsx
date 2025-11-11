import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../../../../components/ui/chart';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 shadow-lg">
      <p className="font-semibold text-gray-900 dark:text-white mb-2 text-sm">Week {label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="text-sm">
          <span style={{ color: entry.color }} className="font-medium">{entry.name}:</span>
          <span className="ml-2 font-semibold text-gray-900 dark:text-white">{entry.value !== null && entry.value !== undefined ? entry.value.toFixed(1) : 'N/A'}</span>
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
  isAdmin = false
}) => {
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
      <div className="p-4 text-center text-gray-500 text-sm">
        No scoring data available for the selected week range.
      </div>
    );
  }

  // Get selected team IDs for rendering lines
  const teamIds = selectedTeams.length > 0 ? selectedTeams : rankings.map(r => r.id);

  return (
    <div className="w-full h-full flex flex-col mt-6">
      <ChartContainer config={{}} className="w-full" style={{ height: 360 }}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 35, bottom: -30 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
          <XAxis
            dataKey="week"
            label={{ value: 'Week', position: 'insideBottomRight', offset: -5 }}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            label={{ value: 'Points', angle: -90, position: 'insideLeft', offset: -5, dy: 5 }}
            tick={{ fontSize: 10 }}
            width={30}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} height={50} />

          {teamIds.map((teamId, index) => {
            const team = rankings.find(r => r.id === teamId);
            if (!team) return null;

            const teamName = getMaskedTeamName(team, user, isAdmin);
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
      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm text-gray-600 dark:text-gray-400">
        <p className="font-semibold text-gray-900 dark:text-white mb-2">Weekly Scoring Guide:</p>
        <ul className="space-y-1 text-xs">
          <li><span className="font-semibold">Upward trend:</span> Team improving in scoring performance</li>
          <li><span className="font-semibold">Downward trend:</span> Team declining in scoring performance</li>
          <li><span className="font-semibold">Flat line:</span> Consistent scoring week-to-week</li>
          <li><span className="font-semibold">Spikes/dips:</span> Individual standout or poor performances</li>
        </ul>
      </div>
    </div>
  );
};

export default WeeklyScoringTrendsChart;
