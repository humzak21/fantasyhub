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
import { useMobileAxis, teamChartColor } from '../../ui/chart';
import { getMaskedFranchiseName } from '../utils/privacyHelpers';
import { AXIS_STYLE, GRID_STYLE } from '../utils/chartHelpers';
import { TRANSACTION_COLORS } from '../../../../types/index.js';

/*
 * Franchise colours come from the franchise, not from a local palette indexed
 * by position in the query result. The list that was here assigned a colour by
 * array index, so the same franchise changed colour between the wins tab and
 * the points tab of this very component.
 */

const PointsWinsDistributionChart = ({
  careerStats = [],
  franchises = [],
  transactionData = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  // Small-screen axis overrides; empty object on desktop. Above the early
  // returns below — a hook after a conditional return is a rules-of-hooks
  // violation that only breaks once the data arrives.
  const axis = useMobileAxis();

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
        // Carried so the colour can fall back to the owner when a row has no
        // franchise id — owner names are the stable identity across seasons.
        ownerName: stat.owner_name,
        totalPoints,
        ppg,
        totalWins
      };
    });

    // Sorted for the bar chart; the colour is the franchise's, not the row's.
    const pointsData = [...data]
      .filter(d => d.totalPoints > 0)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((d) => ({
        ...d,
        color: teamChartColor({ franchiseId: d.franchiseId, ownerName: d.ownerName, name: d.name })
      }));

    // Create color map from points ranking for consistent colors
    const colorMap = {};
    pointsData.forEach(d => {
      colorMap[d.franchiseId] = d.color;
    });

    // Sorted by PPG; same franchise colours as the points chart.
    const ppgData = [...data]
      .filter(d => d.ppg > 0)
      .sort((a, b) => b.ppg - a.ppg)
      .map(d => ({
        ...d,
        color: colorMap[d.franchiseId] || teamChartColor({ franchiseId: d.franchiseId, ownerName: d.ownerName, name: d.name })
      }));

    // Sorted for the bar chart; the colour is the franchise's, not the row's.
    const winsData = [...data]
      .filter(d => d.totalWins > 0)
      .sort((a, b) => b.totalWins - a.totalWins)
      .map((d) => ({
        ...d,
        color: teamChartColor({ franchiseId: d.franchiseId, ownerName: d.ownerName, name: d.name })
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
        <ResponsiveContainer width="100%" height={axis.isMobile ? 280 : 400}>
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
              {...axis.x}
            />
            <YAxis
              label={{ value: 'Total Wins', angle: -90, position: 'insideLeft' }}
              style={AXIS_STYLE}
              allowDecimals={false}
              {...axis.y}
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

      {/*
        Sorted bars, not pie charts.
        Two 14-slice pies compared quantities that differ by a few percent —
        the one encoding people read worst — and needed a 14-item shared
        legend underneath to say which slice was whose, which could not fit at
        375px. A bar chart puts the names on the axis and makes "who is ahead
        of whom" a matter of reading down the page.
      */}
      <TabsContent value="points" className="mt-0">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-center text-sm font-medium text-muted-foreground">
              Total points
            </h4>
            <ResponsiveContainer width="100%" height={axis.isMobile ? 320 : 380}>
              <BarChart
                data={[...chartData.points].sort((a, b) => b.totalPoints - a.totalPoints)}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              >
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={axis.isMobile ? 70 : 110}
                  tick={{ fontSize: axis.isMobile ? 9 : 11 }}
                />
                <Tooltip content={<PointsTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="totalPoints" radius={[0, 4, 4, 0]}>
                  {chartData.points.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div>
            <h4 className="mb-2 text-center text-sm font-medium text-muted-foreground">
              Points per game
            </h4>
            <ResponsiveContainer width="100%" height={axis.isMobile ? 320 : 380}>
              <BarChart
                data={[...chartData.ppg].sort((a, b) => b.ppg - a.ppg)}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              >
                {/* The domain is rounded before it reaches the axis. Passing
                    `dataMin - 5` lets recharts label the ticks with the raw
                    float, so the axis read "108.803373493397591". */}
                <XAxis
                  type="number"
                  domain={[
                    (dataMin) => Math.floor((dataMin - 5) / 5) * 5,
                    (dataMax) => Math.ceil((dataMax + 5) / 5) * 5,
                  ]}
                  tickFormatter={(v) => Math.round(v)}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={axis.isMobile ? 70 : 110}
                  tick={{ fontSize: axis.isMobile ? 9 : 11 }}
                />
                <Tooltip content={<PPGTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="ppg" radius={[0, 4, 4, 0]}>
                  {chartData.ppg.map((entry, index) => (
                    <Cell key={`cell-ppg-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </TabsContent>

      {/* Transactions Distribution - Stacked Bar Chart */}
      <TabsContent value="transactions" className="mt-0">
        {chartData.transactions.length > 0 ? (
          <ResponsiveContainer width="100%" height={axis.isMobile ? 280 : 400}>
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
              {...axis.x}
            />
              <YAxis
                label={{ value: 'Transactions', angle: -90, position: 'insideLeft' }}
                style={AXIS_STYLE}
                allowDecimals={false}
              {...axis.y}
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
