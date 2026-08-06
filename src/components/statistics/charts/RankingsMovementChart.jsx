import React, { useMemo, useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../../ui/chart';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';
import { PowerRankingCalculator } from '../../../../services/powerRankingCalculator.js';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 shadow-lg">
      <p className="font-semibold text-gray-900 dark:text-white mb-2 text-sm">Week {label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="text-sm">
          <span style={{ color: entry.color }} className="font-medium">{entry.name}:</span>
          <span className="ml-2 font-semibold text-gray-900 dark:text-white">#{entry.value !== null && entry.value !== undefined ? entry.value : 'N/A'}</span>
        </div>
      ))}
    </div>
  );
};

// Color palette for team lines
const TEAM_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f97316', // orange
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#eab308', // yellow
  '#14b8a6', // teal
  '#f43f5e', // rose
  '#6366f1', // indigo
  '#14b8a6', // emerald
  '#a855f7', // fuchsia
  '#0ea5e9', // sky
  '#f59e0b', // amber
  '#6b7280'  // gray
];

/**
 * RankingsMovementChart - Shows how team power ranking positions change week-to-week
 * Allows filtering by selected teams
 *
 * Props:
 *  - data: (Optional) Pre-calculated ranking data in week-based format
 *  - teams: Team objects (required if data is not provided)
 *  - games: Game objects (required if data is not provided)
 *  - rankings: Current rankings array (used for team names)
 *  - selectedTeams: Array of selected team IDs to filter
 *  - minWeek, maxWeek: Week range filter
 *  - players: Player data (optional, for power ranking calculation)
 *  - divisions: Division data (optional)
 *  - regularSeasonWeeks: Number of regular season weeks
 *  - currentWeek: Current week
 */
const RankingsMovementChart = ({
  data = [],
  teams = [],
  games = [],
  rankings = [],
  selectedTeams = [],
  minWeek = 1,
  maxWeek = 17,
  user = null,
  isAdmin = false,
  players = [],
  divisions = [],
  regularSeasonWeeks = 14,
  currentWeek = 17,
  teamOwnerNames = []
}) => {
  const [calculatedData, setCalculatedData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Calculate rankings for each week if data not provided
  useEffect(() => {
    if (data && Array.isArray(data) && data.length > 0) {
      setCalculatedData(data);
      return;
    }

    if (!Array.isArray(teams) || teams.length === 0 || !Array.isArray(games)) {
      setCalculatedData([]);
      return;
    }

    setIsLoading(true);

    const calculateWeeklyRankings = async () => {
      try {
        const weeklyData = [];

        // Get all unique weeks from games
        const uniqueWeeks = new Set();
        games.forEach(game => {
          if (game.isCompleted) {
            uniqueWeeks.add(game.week);
          }
        });

        // Sort weeks numerically
        const sortedWeeks = Array.from(uniqueWeeks)
          .sort((a, b) => a - b)
          .filter(week => week >= 1 && week <= maxWeek);

        // For each week, calculate rankings
        for (const week of sortedWeeks) {
          try {
            // Create calculator with games only up to this week
            const gamesUpToWeek = games.filter(g => g.week <= week);

            const calculator = new PowerRankingCalculator(
              teams,
              gamesUpToWeek,
              currentWeek,
              players || [],
              week, // viewingWeek parameter
              null, // analyticsService
              divisions || [],
              regularSeasonWeeks
            );

            // Get rankings for this week
            const stats = await calculator.calculateAllTeamStats();
            const sorted = stats.sort((a, b) => b.powerRating - a.powerRating);

            // Build week data
            const weekData = { week };
            sorted.forEach((team, index) => {
              weekData[team.id] = index + 1; // 1-indexed rank
            });

            weeklyData.push(weekData);
          } catch (error) {
            console.error(`Error calculating rankings for week ${week}:`, error);
          }
        }

        setCalculatedData(weeklyData);
      } catch (error) {
        console.error('Error calculating weekly rankings:', error);
        setCalculatedData([]);
      } finally {
        setIsLoading(false);
      }
    };

    calculateWeeklyRankings();
  }, [teams, games, maxWeek, players, divisions, regularSeasonWeeks, currentWeek, data]);

  const chartData = useMemo(() => {
    const dataToUse = calculatedData.length > 0 ? calculatedData : data;

    if (!dataToUse || !dataToUse.length) return [];

    // Filter by week range
    const filteredByWeek = dataToUse.filter(item => item.week >= minWeek && item.week <= maxWeek);

    if (filteredByWeek.length === 0) return [];

    // If teams are selected, only include those teams
    const teamIds = selectedTeams.length > 0 ? selectedTeams : rankings.map(r => r.id);

    // Transform data to include only selected teams
    return filteredByWeek.map(weekData => {
      const transformed = { week: weekData.week };

      teamIds.forEach(teamId => {
        if (weekData[teamId] !== undefined && weekData[teamId] !== null) {
          transformed[teamId] = weekData[teamId];
        }
      });

      return transformed;
    });
  }, [calculatedData, data, rankings, selectedTeams, minWeek, maxWeek]);

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <div className="flex items-center justify-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border border-gray-300 border-t-gray-600"></div>
          Calculating power rankings for each week...
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        No ranking data available for the selected week range.
      </div>
    );
  }

  // Get selected team IDs for rendering lines
  const teamIds = selectedTeams.length > 0 ? selectedTeams : rankings.map(r => r.id);

  // Get max ranking to set YAxis domain
  const allRanks = [];
  chartData.forEach(week => {
    Object.keys(week).forEach(key => {
      if (key !== 'week' && typeof week[key] === 'number') {
        allRanks.push(week[key]);
      }
    });
  });
  const maxRank = Math.max(...allRanks, 1);

  return (
    <div className="w-full h-full flex flex-col">
      <ChartContainer config={{}} className="w-full" style={{ height: 360 }}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 35, bottom: 5 }}>
          <XAxis
            dataKey="week"
            label={{ value: 'Week', position: 'insideBottomRight', offset: -5 }}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            reversed
            domain={[0, Math.ceil(maxRank) + 1]}
            label={{ value: 'Ranking (1 = Best)', angle: -90, position: 'insideLeft', offset: -5, dy: 5 }}
            tick={{ fontSize: 10 }}
            width={30}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255, 255, 255, 0.3)' }} />
          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} height={50} />

          {teamIds.map((teamId, index) => {
            const team = rankings.find(r => r.id === teamId);
            if (!team) return null;

            const teamName = getMaskedTeamName(team, user, isAdmin, teamOwnerNames);
            const color = TEAM_COLORS[index % TEAM_COLORS.length];

            return (
              <Line
                key={teamId}
                type="monotone"
                dataKey={teamId}
                name={teamName}
                stroke={color}
                dot={{ r: 4 }}
                activeDot={{ r: 7 }}
                isAnimationActive={false}
                connectNulls={true}
                strokeWidth={2}
              />
            );
          })}
        </LineChart>
      </ChartContainer>
      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm text-gray-600 dark:text-gray-400">
        <p className="font-semibold text-gray-900 dark:text-white mb-2">Rankings Movement Guide:</p>
        <ul className="space-y-1 text-xs">
          <li><span className="font-semibold">Upward line:</span> Team improving in power rankings (moving toward #1)</li>
          <li><span className="font-semibold">Downward line:</span> Team declining in power rankings (moving down)</li>
          <li><span className="font-semibold">Flat line:</span> Consistent ranking position week-to-week</li>
          <li><span className="font-semibold">Y-axis:</span> #1 is at the top, ranking decreases downward</li>
        </ul>
      </div>
    </div>
  );
};

export default RankingsMovementChart;
