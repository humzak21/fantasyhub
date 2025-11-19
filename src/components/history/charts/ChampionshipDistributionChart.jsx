import React, { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { Card } from '../../ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { getMaskedFranchiseName } from '../utils/privacyHelpers';
import {
  transformChampionshipsForPieChart,
  FRANCHISE_COLORS,
  getFranchiseColorById,
  DEFAULT_CHART_CONFIG,
  TOOLTIP_STYLE,
  AXIS_STYLE,
  GRID_STYLE
} from '../utils/chartHelpers';

const ChampionshipDistributionChart = ({
  championships = [],
  franchises = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  // Transform data for charts
  const pieChartData = useMemo(() => {
    if (!championships.length) return [];

    // Count championships by franchise
    const counts = {};
    championships.forEach(champ => {
      const franchiseId = champ.franchise_id;
      if (!counts[franchiseId]) {
        counts[franchiseId] = {
          franchiseId,
          count: 0,
          franchise: franchises.find(f => f.id === franchiseId)
        };
      }
      counts[franchiseId].count++;
    });

    // Convert to array and add names/colors
    return Object.values(counts)
      .map((item, index) => ({
        name: getMaskedFranchiseName(item.franchise, user, isAdmin, teamOwnerNames),
        value: item.count,
        franchiseId: item.franchiseId,
        color: getFranchiseColorById(item.franchiseId)
      }))
      .sort((a, b) => b.value - a.value); // Sort by count descending
  }, [championships, franchises, user, isAdmin, teamOwnerNames]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    return (
      <div style={TOOLTIP_STYLE}>
        <p className="font-semibold mb-1">{data.name}</p>
        <p className="text-sm">
          <span className="font-medium">{data.value}</span>{' '}
          {data.value === 1 ? 'Championship' : 'Championships'}
        </p>
      </div>
    );
  };

  // Custom label for pie chart
  const renderCustomLabel = (entry) => {
    return `${entry.value}`;
  };

  if (!championships.length) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>No championship data available</p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="pie" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="pie">Pie Chart</TabsTrigger>
        <TabsTrigger value="bar">Bar Chart</TabsTrigger>
      </TabsList>

      {/* Pie Chart View */}
      <TabsContent value="pie" className="mt-0">
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie
              data={pieChartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomLabel}
              outerRadius={120}
              fill="#8884d8"
              dataKey="value"
            >
              {pieChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              formatter={(value, entry) => (
                <span className="text-sm">
                  {entry.payload.name} ({entry.payload.value})
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </TabsContent>

      {/* Bar Chart View */}
      <TabsContent value="bar" className="mt-0">
        <ResponsiveContainer width="100%" height={350}>
          <BarChart
            data={pieChartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
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
              label={{ value: 'Championships', angle: -90, position: 'insideLeft' }}
              style={AXIS_STYLE}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
              {pieChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </TabsContent>
    </Tabs>
  );
};

export default ChampionshipDistributionChart;
