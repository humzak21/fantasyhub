/**
 * Chart utilities for league history visualizations
 * Provides color palettes, configurations, and helper functions for recharts
 */

/**
 * Color palette for franchise differentiation
 * Based on Tailwind colors for consistency
 */
export const FRANCHISE_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
  '#84cc16', // lime-500
  '#06b6d4', // cyan-500
  '#f43f5e', // rose-500
  '#a855f7', // purple-500
  '#eab308', // yellow-500
  '#64748b', // slate-500
];

/**
 * Get color for a franchise by index
 * @param {number} index - Franchise index
 * @returns {string} - Hex color code
 */
export const getFranchiseColor = (index) => {
  return FRANCHISE_COLORS[index % FRANCHISE_COLORS.length];
};

/**
 * Get color for a franchise by ID (deterministic)
 * @param {string} franchiseId - Franchise UUID
 * @returns {string} - Hex color code
 */
export const getFranchiseColorById = (franchiseId) => {
  if (!franchiseId) return FRANCHISE_COLORS[0];

  // Simple hash function to get consistent color for same ID
  let hash = 0;
  for (let i = 0; i < franchiseId.length; i++) {
    hash = franchiseId.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % FRANCHISE_COLORS.length;
  return FRANCHISE_COLORS[index];
};

/**
 * Championship/award colors
 */
export const AWARD_COLORS = {
  champion: '#f59e0b', // gold
  runner_up: '#9ca3af', // silver
  third_place: '#cd7f32', // bronze
  best_record: '#10b981', // green
  highest_points: '#3b82f6', // blue
  dubious: '#ef4444' // red
};

/**
 * Get color for award type
 * @param {string} awardType - Award type
 * @returns {string} - Hex color code
 */
export const getAwardColor = (awardType) => {
  return AWARD_COLORS[awardType] || '#64748b';
};

/**
 * Playoff finish colors (for charts)
 */
export const PLAYOFF_FINISH_COLORS = {
  'champion': '#f59e0b',
  '2nd': '#9ca3af',
  '3rd': '#cd7f32',
  '4th': '#6366f1',
  'semifinals': '#14b8a6',
  'quarterfinals': '#84cc16',
  'missed': '#ef4444'
};

/**
 * Default chart configuration for responsive containers
 */
export const DEFAULT_CHART_CONFIG = {
  width: '100%',
  height: 400,
  margin: { top: 20, right: 30, left: 20, bottom: 5 }
};

/**
 * Mobile chart configuration (smaller height)
 */
export const MOBILE_CHART_CONFIG = {
  width: '100%',
  height: 300,
  margin: { top: 10, right: 10, left: 10, bottom: 5 }
};

/**
 * Common axis style for charts
 */
export const AXIS_STYLE = {
  fontSize: 12,
  fill: '#64748b' // slate-500
};

/**
 * Common grid style for charts
 */
export const GRID_STYLE = {
  stroke: '#e2e8f0', // slate-200
  strokeDasharray: '3 3'
};

/**
 * Tooltip content wrapper style
 */
export const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  padding: '12px',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
};

/**
 * Legend style configuration
 */
export const LEGEND_CONFIG = {
  wrapperStyle: {
    paddingTop: '20px'
  },
  iconType: 'circle',
  iconSize: 10
};

/**
 * Format tick value for Y-axis (points)
 * @param {number} value - Tick value
 * @returns {string} - Formatted value
 */
export const formatYAxisPoints = (value) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
};

/**
 * Format tick value for percentage
 * @param {number} value - Tick value (0-1 decimal)
 * @returns {string} - Formatted percentage
 */
export const formatYAxisPercentage = (value) => {
  return `${(value * 100).toFixed(0)}%`;
};

/**
 * Format season year for X-axis
 * @param {number} year - Year value
 * @returns {string} - Formatted year
 */
export const formatXAxisYear = (year) => {
  return `'${year.toString().slice(-2)}`; // '24 for 2024
};

/**
 * Get gradient definition for chart backgrounds
 * @param {string} id - Gradient ID
 * @param {string} color - Base color
 * @returns {Object} - Gradient definition for recharts
 */
export const getChartGradient = (id, color) => {
  return {
    id,
    type: 'linear',
    x1: '0',
    y1: '0',
    x2: '0',
    y2: '1',
    colorStops: [
      { offset: '0%', stopColor: color, stopOpacity: 0.8 },
      { offset: '100%', stopColor: color, stopOpacity: 0.1 }
    ]
  };
};

/**
 * Custom tooltip formatter for points
 * @param {number} value - Value to format
 * @param {string} name - Data key name
 * @returns {Array} - [formattedValue, displayName]
 */
export const pointsTooltipFormatter = (value, name) => {
  const formattedValue = typeof value === 'number' ? value.toFixed(1) : value;
  return [formattedValue, name];
};

/**
 * Custom tooltip formatter for percentages
 * @param {number} value - Value to format (0-1 decimal)
 * @param {string} name - Data key name
 * @returns {Array} - [formattedValue, displayName]
 */
export const percentageTooltipFormatter = (value, name) => {
  const formattedValue = typeof value === 'number'
    ? `${(value * 100).toFixed(1)}%`
    : value;
  return [formattedValue, name];
};

/**
 * Custom tooltip formatter for records
 * @param {number} value - Value to format
 * @param {string} name - Data key name
 * @returns {Array} - [formattedValue, displayName]
 */
export const recordTooltipFormatter = (value, name) => {
  return [value, name];
};

/**
 * Calculate domain for win percentage axis
 * @param {Array} data - Chart data array
 * @param {string} dataKey - Key for win percentage
 * @returns {Array} - [min, max] domain
 */
export const getWinPercentageDomain = (data, dataKey = 'winPercentage') => {
  if (!data || data.length === 0) return [0, 1];

  const values = data.map(d => d[dataKey]).filter(v => v !== null && v !== undefined);
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Add 10% padding on each side
  const padding = (max - min) * 0.1;
  return [
    Math.max(0, min - padding),
    Math.min(1, max + padding)
  ];
};

/**
 * Calculate domain for points axis
 * @param {Array} data - Chart data array
 * @param {string|Array} dataKeys - Key(s) for points data
 * @returns {Array} - [min, max] domain
 */
export const getPointsDomain = (data, dataKeys) => {
  if (!data || data.length === 0) return [0, 'auto'];

  const keys = Array.isArray(dataKeys) ? dataKeys : [dataKeys];
  const allValues = [];

  data.forEach(d => {
    keys.forEach(key => {
      if (d[key] !== null && d[key] !== undefined) {
        allValues.push(d[key]);
      }
    });
  });

  if (allValues.length === 0) return [0, 'auto'];

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);

  // Add 10% padding
  const padding = (max - min) * 0.1;
  return [
    Math.max(0, Math.floor(min - padding)),
    Math.ceil(max + padding)
  ];
};

/**
 * Transform franchise season history for line charts
 * @param {Array} seasonHistory - Array of season performance data
 * @param {string} metricKey - Key for the metric to chart
 * @returns {Array} - Transformed data for recharts
 */
export const transformSeasonHistoryForChart = (seasonHistory, metricKey) => {
  if (!seasonHistory || !Array.isArray(seasonHistory)) return [];

  return seasonHistory
    .map(season => ({
      year: season.season?.year || season.year,
      value: season[metricKey],
      label: `${season.season?.year || season.year}`
    }))
    .sort((a, b) => a.year - b.year);
};

/**
 * Transform multiple franchises for comparison chart
 * @param {Object} franchiseData - Object keyed by franchiseId with season history arrays
 * @param {string} metricKey - Key for the metric to chart
 * @returns {Array} - Transformed data for multi-line chart
 */
export const transformMultipleFranchisesForChart = (franchiseData, metricKey) => {
  if (!franchiseData || typeof franchiseData !== 'object') return [];

  // Get all unique years
  const allYears = new Set();
  Object.values(franchiseData).forEach(seasons => {
    seasons.forEach(season => {
      allYears.add(season.season?.year || season.year);
    });
  });

  const sortedYears = Array.from(allYears).sort();

  // Build data points for each year
  return sortedYears.map(year => {
    const dataPoint = { year, label: `${year}` };

    Object.entries(franchiseData).forEach(([franchiseId, seasons]) => {
      const seasonData = seasons.find(s => (s.season?.year || s.year) === year);
      dataPoint[franchiseId] = seasonData ? seasonData[metricKey] : null;
    });

    return dataPoint;
  });
};

/**
 * Transform H2H data for chart
 * @param {Array} h2hRecords - Array of H2H record objects
 * @param {Function} getFranchiseName - Function to get franchise display name
 * @returns {Array} - Transformed data for bar chart
 */
export const transformH2HDataForChart = (h2hRecords, getFranchiseName) => {
  if (!h2hRecords || !Array.isArray(h2hRecords)) return [];

  return h2hRecords.map(record => {
    const franchise1Name = getFranchiseName(record.franchise1_id);
    const franchise2Name = getFranchiseName(record.franchise2_id);

    const total = record.total_matchups || 1;
    const franchise1WinPct = (record.franchise1_wins || 0) / total;
    const franchise2WinPct = (record.franchise2_wins || 0) / total;

    return {
      matchup: `${franchise1Name} vs ${franchise2Name}`,
      franchise1: franchise1Name,
      franchise2: franchise2Name,
      franchise1WinPct,
      franchise2WinPct,
      franchise1Wins: record.franchise1_wins,
      franchise2Wins: record.franchise2_wins,
      total: total
    };
  });
};

/**
 * Transform championship data for pie chart
 * @param {Array} championships - Array of championship awards
 * @param {Function} getFranchiseName - Function to get franchise display name
 * @returns {Array} - Transformed data for pie chart
 */
export const transformChampionshipsForPieChart = (championships, getFranchiseName) => {
  if (!championships || !Array.isArray(championships)) return [];

  // Count championships by franchise
  const counts = {};
  championships.forEach(champ => {
    const franchiseId = champ.franchise_id;
    counts[franchiseId] = (counts[franchiseId] || 0) + 1;
  });

  // Transform to pie chart data
  return Object.entries(counts).map(([franchiseId, count], index) => ({
    name: getFranchiseName(franchiseId),
    value: count,
    franchiseId,
    color: getFranchiseColor(index)
  }));
};

/**
 * Transform awards data for stacked bar chart
 * @param {Array} franchises - Array of franchise objects
 * @param {Object} awardsByFranchise - Object keyed by franchiseId with awards arrays
 * @param {Function} getFranchiseName - Function to get franchise display name
 * @returns {Array} - Transformed data for stacked bar chart
 */
export const transformAwardsForBarChart = (franchises, awardsByFranchise, getFranchiseName) => {
  if (!franchises || !Array.isArray(franchises)) return [];

  return franchises.map((franchise, index) => {
    const awards = awardsByFranchise[franchise.id] || [];

    // Count by category
    const standard = awards.filter(a => a.award_category === 'STANDARD').length;
    const regularSeason = awards.filter(a => a.award_category === 'REGULAR_SEASON').length;
    const dubious = awards.filter(a => a.award_category === 'DUBIOUS').length;
    const advanced = awards.filter(a => a.award_category === 'ADVANCED').length;

    return {
      franchise: getFranchiseName(franchise.id),
      franchiseId: franchise.id,
      standard,
      regularSeason,
      dubious,
      advanced,
      total: standard + regularSeason + dubious + advanced,
      color: getFranchiseColor(index)
    };
  }).filter(d => d.total > 0); // Only include franchises with awards
};

/**
 * Get responsive chart height based on screen width
 * @param {number} screenWidth - Screen width in pixels
 * @returns {number} - Chart height in pixels
 */
export const getResponsiveChartHeight = (screenWidth) => {
  if (screenWidth < 640) return 250; // mobile
  if (screenWidth < 1024) return 350; // tablet
  return 400; // desktop
};

/**
 * Check if device is mobile based on screen width
 * @param {number} screenWidth - Screen width in pixels
 * @returns {boolean} - Whether device is mobile
 */
export const isMobileDevice = (screenWidth) => {
  return screenWidth < 640;
};
