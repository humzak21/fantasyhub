import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, useMobileAxis } from '../../ui/chart';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload;

  return (
    <div className="bg-card p-3 rounded border border-border shadow-lg">
      <p className="font-semibold text-foreground mb-2 text-sm">{data?.name}</p>
      <div className="text-sm">
        <span className="font-medium text-foreground">Record:</span>
        <span className="ml-2 font-semibold text-foreground">{data?.allPlayWins}-{data?.allPlayLosses}</span>
      </div>
      <div className="text-sm mt-1">
        <span className="font-medium text-foreground">Win %:</span>
        <span className="ml-2 font-semibold text-foreground">{data?.allPlayWinPercentage?.toFixed(2)}%</span>
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
      <div className="p-4 text-center text-muted-foreground text-sm">
        No all-play data available. Complete games to see stats.
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <ChartContainer config={{}} className="h-[260px] w-full sm:h-[360px]">
        <BarChart data={chartData} margin={{ top: 10, right: 18, left: 35, bottom: -10 }} {...axis.chart}>
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
            yAxisId="left"
            label={{ value: 'Games', angle: -90, position: 'insideLeft', offset: -5, dy: 5 }}
            tick={{ fontSize: 10 }}
            width={30}
            {...axis.y}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            label={{ value: 'Win %', angle: 90, position: 'insideRight', offset: -5, dy: 5 }}
            domain={[0, 100]}
            tick={{ fontSize: 10 }}
            width={30}
            {...axis.y}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }} />
          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '22px' }} height={50} />
          <ReferenceLine y={50} yAxisId="right" stroke="hsl(var(--border))" strokeDasharray="3 3" />

          <Bar yAxisId="left" dataKey="allPlayWins" name="All-Play Wins" fill="hsl(var(--success))" opacity={0.8} />
          <Bar yAxisId="left" dataKey="allPlayLosses" name="All-Play Losses" fill="hsl(var(--destructive))" opacity={0.8} />
        </BarChart>
      </ChartContainer>
    </div>
  );
};

export default AllPlayRecordsChart;
