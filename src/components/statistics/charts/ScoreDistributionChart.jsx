import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../../../../components/ui/chart';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';

/**
 * ScoreDistributionChart - Displays high/low/average scoring distribution for teams
 * Shows consistency vs variability in team scoring patterns
 * Uses a grouped bar chart showing min/average/max for visual simplicity
 */
const ScoreDistributionChart = ({
  data = [],
  selectedTeams = [],
  user = null,
  isAdmin = false
}) => {
  const chartData = useMemo(() => {
    if (!data.length) return [];

    // Filter to selected teams if any are selected
    const filteredData = selectedTeams.length > 0
      ? data.filter(item => selectedTeams.includes(item.teamId))
      : data;

    // Sort by average score descending
    return filteredData
      .sort((a, b) => b.average - a.average)
      .map(team => ({
        name: getMaskedTeamName({ id: team.teamId, name: team.teamName, owner: team.owner }, user, isAdmin),
        min: Math.round(team.min * 100) / 100,
        average: Math.round(team.average * 100) / 100,
        max: Math.round(team.max * 100) / 100,
        q1: Math.round(team.q1 * 100) / 100,
        q3: Math.round(team.q3 * 100) / 100,
        stdDev: team.stdDev,
        teamId: team.teamId
      }));
  }, [data, selectedTeams, user, isAdmin]);

  if (chartData.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        No score distribution data available. Complete games to see trends.
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <ChartContainer config={{}} className="w-full" style={{ height: 520 }}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 35, bottom: 15 }}>
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
            label={{ value: 'Points', angle: -90, position: 'insideLeft', offset: -5, dy: 10 }}
            tick={{ fontSize: 10 }}
            width={30}
          />
          <ChartTooltip
            content={<ChartTooltipContent />}
            formatter={(value) => value.toFixed(2)}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }}
            height={45}
          />

          <Bar dataKey="min" name="Min" fill="#ef4444" opacity={0.6} />
          <Bar dataKey="q1" name="Q1 (25%)" fill="#f97316" opacity={0.7} />
          <Bar dataKey="average" name="Average" fill="#3b82f6" opacity={0.8} />
          <Bar dataKey="q3" name="Q3 (75%)" fill="#10b981" opacity={0.7} />
          <Bar dataKey="max" name="Max" fill="#06b6d4" opacity={0.6} />
        </BarChart>
      </ChartContainer>
      <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm text-gray-600 dark:text-gray-400">
        <p className="font-semibold text-gray-900 dark:text-white mb-2">Score Distribution Guide:</p>
        <ul className="space-y-1 text-xs">
          <li><span className="font-semibold">Min/Max:</span> Lowest and highest individual game scores</li>
          <li><span className="font-semibold">Q1/Q3:</span> 25th and 75th percentile scores (middle 50% of games)</li>
          <li><span className="font-semibold">Average:</span> Mean score across all games</li>
          <li><span className="font-semibold">Consistency:</span> Taller bars between Q1-Q3 indicate less consistency</li>
        </ul>
      </div>
    </div>
  );
};

export default ScoreDistributionChart;
