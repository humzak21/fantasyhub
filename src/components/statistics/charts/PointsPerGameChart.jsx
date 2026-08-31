import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, useMobileAxis, teamChartColor } from '../../ui/chart';
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
        teamId: team.teamId,
        // Carried through so the bar can be coloured by franchise. The owner
        // is what `teamColors` keys on when there is no franchise id.
        franchiseId: team.franchiseId ?? team.franchise_id,
        owner: team.owner
      }));
  }, [data, selectedTeams, user, isAdmin, teamOwnerNames]);

  if (chartData.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No scoring data available. Complete games to see points per game stats.
      </div>
    );
  }

  /*
   * Bars carry the team's own colour, not a green-to-red ramp by position.
   * The ramp encoded rank — which is already the sort order, stated twice —
   * and it did so with interpolated rgb() values that owed nothing to the
   * theme. Team colour lets a reader find their team in the chart instead.
   */

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
                fill={teamChartColor({ franchiseId: entry.franchiseId, ownerName: entry.owner, name: entry.name })}
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
