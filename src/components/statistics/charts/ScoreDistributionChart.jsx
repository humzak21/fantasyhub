import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, useMobileAxis } from '../../ui/chart';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';

/**
 * Custom tooltip component for ScoreDistributionChart
 * Displays all score distribution metrics with labels
 */
const CustomScoreTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  const labels = {
    min: 'Min',
    q1: 'Q1 (25%)',
    average: 'Average',
    q3: 'Q3 (75%)',
    max: 'Max'
  };

  return (
    <div className="bg-card p-3 border border-border rounded-lg shadow-lg">
      <p className="font-semibold text-foreground mb-2">{data.name}</p>
      <div className="space-y-1 text-sm">
        {Object.entries(labels).map(([key, label]) => (
          <div key={key} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{label}:</span>
            <span className="font-medium text-foreground">{data[key]?.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * ScoreDistributionChart - Displays high/low/average scoring distribution for teams
 * Shows consistency vs variability in team scoring patterns
 * Uses a grouped bar chart showing min/average/max for visual simplicity
 */
const ScoreDistributionChart = ({
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

    // Sort by average score descending
    return filteredData
      .sort((a, b) => b.average - a.average)
      .map(team => ({
        name: getMaskedTeamName({ id: team.teamId, name: team.teamName, owner: team.owner }, user, isAdmin, teamOwnerNames),
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
      <div className="p-4 text-center text-muted-foreground text-sm">
        No score distribution data available. Complete games to see trends.
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <ChartContainer config={{}} className="h-[260px] w-full sm:h-[520px]">
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 35, bottom: 15 }} {...axis.chart}>
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={60}
            tick={{ fontSize: 10 }}
            interval={0}
            {...axis.x}
          />
          <YAxis
            label={{ value: 'Points', angle: -90, position: 'insideLeft', offset: -5, dy: 10 }}
            tick={{ fontSize: 10 }}
            width={30}
            {...axis.y}
          />
          <ChartTooltip content={<CustomScoreTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }} />
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
      <div className="mt-2 p-4 bg-muted rounded-lg text-sm text-muted-foreground">
        <p className="font-semibold text-foreground mb-2">Score Distribution Guide:</p>
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
