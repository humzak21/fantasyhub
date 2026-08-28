import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, useMobileAxis } from '../../ui/chart';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';

/**
 * Custom tooltip component for PointsPerGameChart
 * Displays PPG and total points with game count
 */
const CustomPPGTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;

  return (
    <div className="bg-card p-3 border border-border rounded-lg shadow-lg">
      <p className="font-semibold text-foreground mb-2">{data.name}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Points Per Game:</span>
          <span className="font-medium text-foreground">{data.ppg?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Total Points:</span>
          <span className="font-medium text-foreground">{data.totalPoints?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Games Played:</span>
          <span className="font-medium text-foreground">{data.gamesPlayed}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * PointsPerGameChart - Bar chart showing average points per game for each team
 * Higher bars indicate more prolific scoring teams
 */
const PointsPerGameChart = ({
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

    // Sort by PPG descending
    return filteredData
      .sort((a, b) => b.ppg - a.ppg)
      .map(team => ({
        name: getMaskedTeamName({ id: team.teamId, name: team.teamName, owner: team.owner }, user, isAdmin, teamOwnerNames),
        ppg: Math.round(team.ppg * 100) / 100,
        totalPoints: Math.round(team.totalPoints * 100) / 100,
        gamesPlayed: team.gamesPlayed,
        teamId: team.teamId
      }));
  }, [data, selectedTeams, user, isAdmin, teamOwnerNames]);

  if (chartData.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No scoring data available. Complete games to see points per game stats.
      </div>
    );
  }

  // Color gradient from highest to lowest
  const getBarColor = (index, total) => {
    const ratio = index / Math.max(total - 1, 1);

    // Gradient from green (best) to orange (middle) to red (worst)
    if (ratio < 0.5) {
      // Green to orange
      const localRatio = ratio * 2;
      return `rgb(${Math.round(16 + (249 - 16) * localRatio)}, ${Math.round(185 - (185 - 115) * localRatio)}, ${Math.round(129 - 129 * localRatio)})`;
    } else {
      // Orange to red
      const localRatio = (ratio - 0.5) * 2;
      return `rgb(${Math.round(249 - (249 - 239) * localRatio)}, ${Math.round(115 - (115 - 68) * localRatio)}, ${Math.round(22 - 22 * localRatio)})`;
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <ChartContainer config={{}} className="h-[260px] w-full sm:h-[400px]">
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 35, bottom: 15 }} {...axis.chart}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
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
            domain={[70, 150]}
            label={{ value: 'Points Per Game', angle: -90, position: 'insideLeft', offset: -5, dy: 30 }}
            tick={{ fontSize: 10 }}
            width={30}
            {...axis.y}
          />
          <ChartTooltip content={<CustomPPGTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }} />

          <Bar dataKey="ppg" name="PPG" radius={[8, 8, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getBarColor(index, chartData.length)}
                opacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
};

export default PointsPerGameChart;
