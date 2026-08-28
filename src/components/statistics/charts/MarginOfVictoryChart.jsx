import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, useMobileAxis } from '../../ui/chart';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';

/**
 * MarginOfVictoryChart - Horizontal bar chart showing average margin of victory/defeat
 * Positive margins indicate teams win by an average amount
 * Negative margins indicate teams lose by an average amount
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
      .map(team => ({
        name: getMaskedTeamName({ id: team.teamId, name: team.teamName, owner: team.owner }, user, isAdmin, teamOwnerNames),
        marginOfVictory: Math.round(team.marginOfVictory * 100) / 100,
        gamesPlayed: team.gamesPlayed,
        totalMargin: Math.round(team.totalMargin * 100) / 100,
        teamId: team.teamId
      }));
  }, [data, selectedTeams, user, isAdmin]);

  if (chartData.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        No margin of victory data available. Complete games to see stats.
      </div>
    );
  }


  return (
    <div className="w-full h-full flex flex-col mt-6">
      <ChartContainer config={{}} className="h-[260px] w-full sm:h-[360px]">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 20, left: 10, bottom: -25 }} {...axis.chart}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
          {/* No `axis.x` / `axis.y` here. This is the one horizontal chart
              (`layout="vertical"`), so the axis roles are swapped: X is
              numeric and Y is the category axis, already drawn with no ticks
              and zero width. The overrides — which exist to thin out crowded
              category ticks — have nothing to fix and would only add an empty
              30px gutter. The fluid height and the margin still apply. */}
          <XAxis
            type="number"
            label={{ value: 'Average Margin (Points)', position: 'insideBottomRight', offset: -5 }}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={false}
            width={0}
          />
          <ChartTooltip
            content={<ChartTooltipContent />}
            formatter={(value) => value.toFixed(2)}
            labelFormatter={(label) => `${label}`}
            cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
          />
          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '2px' }} height={50} />
          <ReferenceLine x={0} stroke="#666" strokeDasharray="3 3" />

          <Bar
            dataKey="marginOfVictory"
            name="Avg Margin"
            fill="#3b82f6"
            radius={[0, 8, 8, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.marginOfVictory > 0 ? '#10b981' : '#ef4444'}
                opacity={0.8}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
};

export default MarginOfVictoryChart;
