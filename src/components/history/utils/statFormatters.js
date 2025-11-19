/**
 * Format win percentage as a percentage string
 * @param {number} percentage - Win percentage as decimal (e.g., 0.714)
 * @param {number} decimals - Number of decimal places (default 1)
 * @returns {string} - Formatted percentage (e.g., "71.4%")
 */
export const formatWinPercentage = (percentage, decimals = 1) => {
  if (percentage === null || percentage === undefined) return '-';
  if (isNaN(percentage)) return '-';
  return `${(percentage * 100).toFixed(decimals)}%`;
};

/**
 * Format a win-loss record
 * @param {number|Object} wins - Number of wins or object with wins/losses
 * @param {number} losses - Number of losses (if first param is number)
 * @param {number} ties - Number of ties (optional)
 * @returns {string} - Formatted record (e.g., "10-4", "10-4-0")
 */
export const formatRecord = (wins, losses = null, ties = null) => {
  // Handle object input
  if (typeof wins === 'object' && wins !== null) {
    const record = wins;
    if (record.ties && record.ties > 0) {
      return `${record.wins || 0}-${record.losses || 0}-${record.ties}`;
    }
    return `${record.wins || 0}-${record.losses || 0}`;
  }

  // Handle individual parameters
  if (ties !== null && ties > 0) {
    return `${wins || 0}-${losses || 0}-${ties}`;
  }
  return `${wins || 0}-${losses || 0}`;
};

/**
 * Format points with proper comma separator and decimal places
 * @param {number} points - Points value
 * @param {number} decimals - Number of decimal places (default 1)
 * @returns {string} - Formatted points (e.g., "1,847.5")
 */
export const formatPoints = (points, decimals = 1) => {
  if (points === null || points === undefined) return '-';
  if (isNaN(points)) return '-';

  return points.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

/**
 * Format average points per game
 * @param {number} points - Total points
 * @param {number} games - Number of games
 * @param {number} decimals - Number of decimal places (default 1)
 * @returns {string} - Formatted PPG (e.g., "112.5")
 */
export const formatPointsPerGame = (points, games, decimals = 1) => {
  if (!points || !games || games === 0) return '-';
  const ppg = points / games;
  return formatPoints(ppg, decimals);
};

/**
 * Format playoff finish position
 * @param {string} playoffFinish - Playoff finish value from database
 * @returns {string} - Formatted display string
 */
export const formatPlayoffFinish = (playoffFinish) => {
  if (!playoffFinish) return 'Did not qualify';

  const finishMap = {
    'champion': '🏆 Champion',
    '2nd': '🥈 Runner-up',
    '3rd': '🥉 3rd Place',
    '4th': '4th Place',
    'semifinals': 'Semifinals',
    'quarterfinals': 'Quarterfinals',
    'missed': 'Missed Playoffs'
  };

  return finishMap[playoffFinish] || playoffFinish;
};

/**
 * Format playoff finish for short display
 * @param {string} playoffFinish - Playoff finish value
 * @returns {string} - Short format (e.g., "1st", "2nd")
 */
export const formatPlayoffFinishShort = (playoffFinish) => {
  const shortMap = {
    'champion': '1st',
    '2nd': '2nd',
    '3rd': '3rd',
    '4th': '4th',
    'semifinals': 'SF',
    'quarterfinals': 'QF',
    'missed': '-'
  };

  return shortMap[playoffFinish] || '-';
};

/**
 * Format season year for display
 * @param {number} year - Season year
 * @returns {string} - Formatted season (e.g., "2024 Season")
 */
export const formatSeasonYear = (year) => {
  if (!year) return 'Unknown Season';
  return `${year} Season`;
};

/**
 * Format a year range
 * @param {number} startYear - Start year
 * @param {number} endYear - End year (optional, defaults to "Present")
 * @returns {string} - Formatted range (e.g., "2020-2024", "2020-Present")
 */
export const formatYearRange = (startYear, endYear = null) => {
  if (!startYear) return '-';
  if (!endYear) return `${startYear}-Present`;
  if (startYear === endYear) return `${startYear}`;
  return `${startYear}-${endYear}`;
};

/**
 * Format an ordinal number (1st, 2nd, 3rd, etc.)
 * @param {number} num - Number to format
 * @returns {string} - Ordinal number (e.g., "1st", "2nd")
 */
export const formatOrdinal = (num) => {
  if (!num || isNaN(num)) return '-';

  const j = num % 10;
  const k = num % 100;

  if (j === 1 && k !== 11) return `${num}st`;
  if (j === 2 && k !== 12) return `${num}nd`;
  if (j === 3 && k !== 13) return `${num}rd`;
  return `${num}th`;
};

/**
 * Format point differential with +/- sign
 * @param {number} differential - Point differential
 * @param {number} decimals - Number of decimal places (default 1)
 * @returns {string} - Formatted differential (e.g., "+45.5", "-23.0")
 */
export const formatDifferential = (differential, decimals = 1) => {
  if (differential === null || differential === undefined) return '-';
  if (isNaN(differential)) return '-';

  const sign = differential >= 0 ? '+' : '';
  return `${sign}${differential.toFixed(decimals)}`;
};

/**
 * Format streak (W5, L3, etc.)
 * @param {Object} streak - Streak object with type and length
 * @returns {string} - Formatted streak
 */
export const formatStreak = (streak) => {
  if (!streak || !streak.type || streak.type === 'none') return '-';

  const prefix = streak.type === 'win' ? 'W' : streak.type === 'loss' ? 'L' : 'T';
  return `${prefix}${streak.length || 0}`;
};

/**
 * Format award category for display
 * @param {string} category - Award category from database
 * @returns {string} - Formatted category name
 */
export const formatAwardCategory = (category) => {
  const categoryMap = {
    'STANDARD': 'Championship',
    'REGULAR_SEASON': 'Regular Season',
    'DUBIOUS': 'Dubious Dishonor',
    'ADVANCED': 'Advanced'
  };

  return categoryMap[category] || category;
};

/**
 * Format award type for display
 * @param {string} awardType - Award type from database
 * @returns {string} - Formatted award name
 */
export const formatAwardType = (awardType) => {
  const awardMap = {
    'champion': 'League Champion',
    'runner_up': 'Runner-up',
    'third_place': '3rd Place',
    'fourth_place': '4th Place',
    'best_record': 'Best Record',
    'highest_points': 'Highest Points',
    'most_blowouts': 'Most Blowouts',
    'highest_weekly_score': 'Highest Weekly Score',
    'worst_record': 'Worst Record',
    'lowest_points': 'Lowest Points',
    'most_points_against': 'Most Points Against',
    'biggest_blowout_loss': 'Biggest Blowout Loss',
    'lowest_weekly_score': 'Lowest Weekly Score',
    'highest_efficiency': 'Highest Efficiency',
    'most_consistent': 'Most Consistent'
  };

  return awardMap[awardType] || awardType.replace(/_/g, ' ');
};

/**
 * Format record category for display
 * @param {string} category - Record category from database
 * @returns {string} - Formatted category name
 */
export const formatRecordCategory = (category) => {
  const categoryMap = {
    'SINGLE_GAME': 'Single Game',
    'SINGLE_SEASON': 'Single Season',
    'CAREER': 'Career',
    'STREAK': 'Streak'
  };

  return categoryMap[category] || category;
};

/**
 * Format large numbers with K/M suffixes
 * @param {number} num - Number to format
 * @returns {string} - Formatted number (e.g., "1.2K", "5.4M")
 */
export const formatLargeNumber = (num) => {
  if (num === null || num === undefined) return '-';
  if (isNaN(num)) return '-';

  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
};

/**
 * Format duration in seasons
 * @param {number} seasons - Number of seasons
 * @returns {string} - Formatted duration (e.g., "5 seasons", "1 season")
 */
export const formatSeasonDuration = (seasons) => {
  if (!seasons) return '-';
  return seasons === 1 ? '1 season' : `${seasons} seasons`;
};

/**
 * Format matchup count
 * @param {number} count - Number of matchups
 * @returns {string} - Formatted matchup count (e.g., "15 games", "1 game")
 */
export const formatMatchupCount = (count) => {
  if (!count) return 'No matchups';
  return count === 1 ? '1 game' : `${count} games`;
};

/**
 * Format date for historical data
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date
 */
export const formatHistoricalDate = (date) => {
  if (!date) return '-';

  try {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (err) {
    return '-';
  }
};

/**
 * Get color class for win percentage
 * @param {number} percentage - Win percentage as decimal
 * @returns {string} - Tailwind color class
 */
export const getWinPercentageColor = (percentage) => {
  if (percentage >= 0.7) return 'text-green-600';
  if (percentage >= 0.5) return 'text-blue-600';
  if (percentage >= 0.3) return 'text-yellow-600';
  return 'text-red-600';
};

/**
 * Get color class for playoff finish
 * @param {string} playoffFinish - Playoff finish value
 * @returns {string} - Tailwind color class
 */
export const getPlayoffFinishColor = (playoffFinish) => {
  if (playoffFinish === 'champion') return 'text-amber-600';
  if (playoffFinish === '2nd') return 'text-gray-600';
  if (playoffFinish === '3rd') return 'text-orange-600';
  return 'text-muted-foreground';
};

/**
 * Get badge variant for award category
 * @param {string} category - Award category
 * @returns {string} - Badge variant
 */
export const getAwardCategoryVariant = (category) => {
  const variantMap = {
    'STANDARD': 'default',
    'REGULAR_SEASON': 'secondary',
    'DUBIOUS': 'destructive',
    'ADVANCED': 'outline'
  };

  return variantMap[category] || 'outline';
};
