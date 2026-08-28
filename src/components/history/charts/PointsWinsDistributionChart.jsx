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
import { TRANSACTION_COLORS } from '../../../../types/index.js';

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
  transactionData = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  // Transform data for charts
  const chartData = useMemo(() => {
    if (!careerStats.length) return { points: [], ppg: [], wins: [], transactions: [] };

    // Map career stats to chart data
    const data = careerStats.map((stat) => {
      const franchise = franchises.find(f => f.id === stat.franchise_id);
      const name = getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames);
      const totalPoints = stat.career_points_for || stat.total_points_for || 0;
      const totalWins = stat.total_wins || 0;
      const totalLosses = stat.total_losses || 0;
      const gamesPlayed = stat.total_games || stat.career_games || (totalWins + totalLosses) || 0;
      const ppg = gamesPlayed > 0 ? totalPoints / gamesPlayed : 0;

      return {
        name,
        franchiseId: stat.franchise_id,
        totalPoints,
        ppg,
        totalWins
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

    // Create color map from points ranking for consistent colors
    const colorMap = {};
    pointsData.forEach(d => {
      colorMap[d.franchiseId] = d.color;
    });

    // Sort by PPG for pie chart (descending) and use same colors as points
    const ppgData = [...data]
      .filter(d => d.ppg > 0)
      .sort((a, b) => b.ppg - a.ppg)
      .map(d => ({
        ...d,
        color: colorMap[d.franchiseId] || DISTINCT_COLORS[0]
      }));

    // Sort by total wins for bar chart (descending) and assign colors by index
    const winsData = [...data]
      .filter(d => d.totalWins > 0)
      .sort((a, b) => b.totalWins - a.totalWins)
      .map((d, index) => ({
        ...d,
        color: DISTINCT_COLORS[index % DISTINCT_COLORS.length]
      }));

    // Process transaction data for stacked bar chart
    const transactionsData = transactionData
      .filter(t => t.total_all_transactions > 0)
      .sort((a, b) => b.total_all_transactions - a.total_all_transactions)
      .map(t => {
        const franchise = t.franchise_id ? franchises.find(f => f.id === t.franchise_id) : null;
        // Use franchise name if available, otherwise fall back to owner_name or display_name
        const name = franchise
          ? getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames)
          : (t.owner_name || t.display_name || 'Unknown');

        return {
          name,
          franchiseId: t.franchise_id,
          freeAgents: t.total_free_agent_adds || 0,
          waivers: t.total_waiver_claims || 0,
          trades: t.total_trades || 0,
          drops: t.total_drops || 0,
          total: t.total_all_transactions || 0
        };
      });

    return { points: pointsData, ppg: ppgData, wins: winsData, transactions: transactionsData };
  }, [careerStats, franchises, transactionData, user, isAdmin, teamOwnerNames]);

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

  // Custom tooltip for PPG
  const PPGTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold mb-1 text-foreground">{data.name}</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{data.ppg.toFixed(1)}</span> PPG
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

  // Custom tooltip for transactions
  const TransactionsTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold mb-2 text-foreground">{data.name}</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Free Agents:</span>
            <span className="font-medium text-foreground">{data.freeAgents}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Waivers:</span>
            <span className="font-medium text-foreground">{data.waivers}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Trades:</span>
            <span className="font-medium text-foreground">{data.trades}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Drops:</span>
            <span className="font-medium text-foreground">{data.drops}</span>
          </div>
          <div className="flex justify-between gap-4 pt-1 border-t border-border">
            <span className="font-medium text-foreground">Total:</span>
            <span className="font-bold text-foreground">{data.total}</span>
          </div>
        </div>
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
    <Tabs defaultValue="wins" className="w-full">
      <TabsList className="mb-4 w-full">
        <TabsTrigger value="wins">Wins</TabsTrigger>
        <TabsTrigger value="points">Points</TabsTrigger>
        <TabsTrigger value="transactions">Transactions</TabsTrigger>
      </TabsList>

      {/* Wins Distribution - Bar Chart */}
      <TabsContent value="wins" className="mt-0">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={chartData.wins}
            margin={{ top: 20, right: 30, left: 20, bottom: 0 }}
          >
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
            <Tooltip content={<WinsTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }} />
            <Bar dataKey="totalWins" radius={[8, 8, 0, 0]}>
              {chartData.wins.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </TabsContent>

      {/* Points Distribution - Two Pie Charts Side by Side */}
      <TabsContent value="points" className="mt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Total Points Pie Chart */}
          <div>
            <h4 className="text-lg font-medium text-center mb-2 text-muted-foreground">Total Points</h4>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData.points}
                  cx="50%"
                  cy="50%"
                  outerRadius={125}
                  fill="#8884d8"
                  dataKey="totalPoints"
                  stroke="none"
                >
                  {chartData.points.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PointsTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* PPG Pie Chart */}
          <div>
            <h4 className="text-lg font-medium text-center mb-2 text-muted-foreground">Points Per Game</h4>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData.ppg}
                  cx="50%"
                  cy="50%"
                  outerRadius={125}
                  fill="#8884d8"
                  dataKey="ppg"
                  stroke="none"
                >
                  {chartData.ppg.map((entry, index) => (
                    <Cell key={`cell-ppg-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PPGTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Shared Legend */}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-6 px-4">
          {chartData.points.map((entry) => (
            <div key={entry.franchiseId} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm" style={{ color: entry.color }}>{entry.name}</span>
            </div>
          ))}
        </div>
      </TabsContent>

      {/* Transactions Distribution - Stacked Bar Chart */}
      <TabsContent value="transactions" className="mt-0">
        {chartData.transactions.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={chartData.transactions}
              margin={{ top: 5, right: 30, left: 20, bottom: 0 }}
            >
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={115}
                interval={0}
                style={AXIS_STYLE}
              />
              <YAxis
                label={{ value: 'Transactions', angle: -90, position: 'insideLeft' }}
                style={AXIS_STYLE}
                allowDecimals={false}
              />
              <Tooltip content={<TransactionsTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }} />
              <Legend
                verticalAlign="top"
                height={36}
                iconType="rect"
              />
              <Bar
                dataKey="freeAgents"
                stackId="a"
                fill={TRANSACTION_COLORS.free_agent}
                name="Free Agents"
              />
              <Bar
                dataKey="waivers"
                stackId="a"
                fill={TRANSACTION_COLORS.waiver}
                name="Waivers"
              />
              <Bar
                dataKey="trades"
                stackId="a"
                fill={TRANSACTION_COLORS.trade}
                name="Trades"
              />
              <Bar
                dataKey="drops"
                stackId="a"
                fill={TRANSACTION_COLORS.drop}
                name="Drops"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <p>No transaction data available</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground text-center mt-0 italic">
          Note: Humza's trade count may be elevated due to league manager transactions being assigned to his account.
        </p>
      </TabsContent>
    </Tabs>
  );
};

export default PointsWinsDistributionChart;
