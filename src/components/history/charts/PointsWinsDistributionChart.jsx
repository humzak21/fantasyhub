import React, { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { getMaskedFranchiseName } from '../utils/privacyHelpers';
import { AXIS_STYLE, GRID_STYLE } from '../utils/chartHelpers';

// Distinct color palette for pie chart - maximally different colors
const DISTINCT_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#a855f7', // purple
  '#dc2626', // red-600
  '#eab308', // yellow
  '#64748b', // slate
];

const PointsWinsDistributionChart = ({
  careerStats = [],
  franchises = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  // Transform data for charts
  const chartData = useMemo(() => {
    if (!careerStats.length) return { points: [], wins: [] };

    // Map career stats to chart data
    const data = careerStats.map((stat) => {
      const franchise = franchises.find(f => f.id === stat.franchise_id);
      const name = getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames);

      return {
        name,
        franchiseId: stat.franchise_id,
        totalPoints: stat.career_points_for || stat.total_points_for || 0,
        totalWins: stat.total_wins || 0
      };
    });

    // Sort by total points for pie chart (descending) and assign colors by index
    const pointsData = [...data]
      .filter(d => d.totalPoints > 0)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((d, index) => ({
        ...d,
        color: DISTINCT_COLORS[index % DISTINCT_COLORS.length]
      }));

    // Sort by total wins for bar chart (descending) and assign colors by index
    const winsData = [...data]
      .filter(d => d.totalWins > 0)
      .sort((a, b) => b.totalWins - a.totalWins)
      .map((d, index) => ({
        ...d,
        color: DISTINCT_COLORS[index % DISTINCT_COLORS.length]
      }));

    return { points: pointsData, wins: winsData };
  }, [careerStats, franchises, user, isAdmin, teamOwnerNames]);

  // Custom tooltip for points
  const PointsTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold mb-1 text-foreground">{data.name}</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{data.totalPoints.toLocaleString()}</span> Points
        </p>
      </div>
    );
  };

  // Custom tooltip for wins
  const WinsTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold mb-1 text-foreground">{data.name}</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{data.totalWins}</span> Wins
        </p>
      </div>
    );
  };

  if (!careerStats.length) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>No career statistics available</p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="points" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="points">Points Distribution</TabsTrigger>
        <TabsTrigger value="wins">Wins Distribution</TabsTrigger>
      </TabsList>

      {/* Points Distribution - Pie Chart */}
      <TabsContent value="points" className="mt-0">
        <ResponsiveContainer width="100%" height={400}>
          <PieChart>
            <Pie
              data={chartData.points}
              cx="50%"
              cy="50%"
              outerRadius={120}
              fill="#8884d8"
              dataKey="totalPoints"
            >
              {chartData.points.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<PointsTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              formatter={(value, entry) => (
                <span className="text-sm">
                  {entry.payload.name}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </TabsContent>

      {/* Wins Distribution - Bar Chart */}
      <TabsContent value="wins" className="mt-0">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={chartData.wins}
            margin={{ top: 20, right: 30, left: 20, bottom: 0 }}
          >
            <CartesianGrid {...GRID_STYLE} />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              interval={0}
              style={AXIS_STYLE}
            />
            <YAxis
              label={{ value: 'Total Wins', angle: -90, position: 'insideLeft' }}
              style={AXIS_STYLE}
              allowDecimals={false}
            />
            <Tooltip content={<WinsTooltip />} />
            <Bar dataKey="totalWins" radius={[8, 8, 0, 0]}>
              {chartData.wins.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </TabsContent>
    </Tabs>
  );
};

export default PointsWinsDistributionChart;
