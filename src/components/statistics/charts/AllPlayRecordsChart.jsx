import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../../ui/chart';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload;

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 shadow-lg">
      <p className="font-semibold text-gray-900 dark:text-white mb-2 text-sm">{data?.name}</p>
      <div className="text-sm">
        <span className="font-medium text-gray-900 dark:text-white">Record:</span>
        <span className="ml-2 font-semibold text-gray-900 dark:text-white">{data?.allPlayWins}-{data?.allPlayLosses}</span>
      </div>
      <div className="text-sm mt-1">
        <span className="font-medium text-gray-900 dark:text-white">Win %:</span>
        <span className="ml-2 font-semibold text-gray-900 dark:text-white">{data?.allPlayWinPercentage?.toFixed(2)}%</span>
      </div>
    </div>
  );
};

/**
 * AllPlayRecordsChart - Bar chart showing each team's record vs league median score
 * Demonstrates how often teams beat the median (typically ~50% for balanced leagues)
 */
const AllPlayRecordsChart = ({
  data = [],
  selectedTeams = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  const chartData = useMemo(() => {
    if (!data.length) return [];

    // Filter to selected teams if any are selected
    const filteredData = selectedTeams.length > 0
      ? data.filter(item => selectedTeams.includes(item.teamId))
      : data;

    // Sort by all-play win percentage descending
    return filteredData
      .sort((a, b) => b.allPlayWinPercentage - a.allPlayWinPercentage)
      .map(team => ({
        name: getMaskedTeamName({ id: team.teamId, name: team.teamName, owner: team.owner }, user, isAdmin, teamOwnerNames),
        allPlayWins: team.allPlayWins,
        allPlayLosses: team.allPlayLosses,
        allPlayWinPercentage: Math.round(team.allPlayWinPercentage * 100) / 100,
        teamId: team.teamId,
        totalGames: team.totalGames
      }));
  }, [data, selectedTeams, user, isAdmin]);

  if (chartData.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        No all-play data available. Complete games to see stats.
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <ChartContainer config={{}} className="w-full" style={{ height: 360 }}>
        <BarChart data={chartData} margin={{ top: 10, right: 18, left: 35, bottom: -10 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={60}
            tick={{ fontSize: 10 }}
            interval={0}
          />
          <YAxis
            yAxisId="left"
            label={{ value: 'Games', angle: -90, position: 'insideLeft', offset: -5, dy: 5 }}
            tick={{ fontSize: 10 }}
            width={30}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            label={{ value: 'Win %', angle: 90, position: 'insideRight', offset: -5, dy: 5 }}
            domain={[0, 100]}
            tick={{ fontSize: 10 }}
            width={30}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }} />
          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '22px' }} height={50} />
          <ReferenceLine y={50} yAxisId="right" stroke="#999" strokeDasharray="3 3" />

          <Bar yAxisId="left" dataKey="allPlayWins" name="All-Play Wins" fill="#10b981" opacity={0.8} />
          <Bar yAxisId="left" dataKey="allPlayLosses" name="All-Play Losses" fill="#ef4444" opacity={0.8} />
        </BarChart>
      </ChartContainer>
    </div>
  );
};

export default AllPlayRecordsChart;
