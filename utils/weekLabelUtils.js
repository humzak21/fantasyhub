/**
 * Week Label Utilities
 * Provides consistent week label formatting across the application
 */

/**
 * Check if a week is in the playoff period
 * @param {number} week - Week number
 * @param {number} regularSeasonWeeks - Number of regular season weeks
 * @returns {boolean} True if week is a playoff week
 */
export const isPlayoffWeek = (week, regularSeasonWeeks) => {
  if (!week || !regularSeasonWeeks) return false;
  return week > regularSeasonWeeks;
};

/**
 * Generate a formatted label for a given week
 * @param {number} week - Week number
 * @param {number} regularSeasonWeeks - Number of regular season weeks
 * @param {number} totalWeeks - Total number of weeks in season
 * @returns {string} Formatted week label (e.g., "Week 5", "Playoffs R1", "Championship")
 */
export const getWeekLabel = (week, regularSeasonWeeks, totalWeeks) => {
  // Validate inputs
  if (!week || !regularSeasonWeeks || !totalWeeks) {
    return `Week ${week || 1}`;
  }

  // Ensure week is within valid range
  const validWeek = Math.max(1, Math.min(week, totalWeeks));

  if (isPlayoffWeek(validWeek, regularSeasonWeeks)) {
    const playoffWeek = validWeek - regularSeasonWeeks;
    const totalPlayoffWeeks = totalWeeks - regularSeasonWeeks;
    
    // Handle single playoff week (championship only)
    if (totalPlayoffWeeks === 1) {
      return 'Championship';
    }
    
    // Handle multiple playoff weeks
    if (playoffWeek === totalPlayoffWeeks) {
      return 'Championship';
    }
    if (totalPlayoffWeeks === 2) {
      // For 2-week playoffs: R1 and Championship
      if (playoffWeek === 1) return 'Playoffs R1';
    } else if (totalPlayoffWeeks >= 3) {
      // For 3+ week playoffs: R1, Semifinals (second-to-last), Championship (last)
      if (playoffWeek === totalPlayoffWeeks - 1) {
        return 'Semifinals';
      }
      if (playoffWeek === 1) {
        return 'Playoffs R1';
      }
    }
    
    // Handle additional playoff rounds
    return `Playoffs R${playoffWeek}`;
  }
  
  return `Week ${validWeek}`;
};

/**
 * Validate week navigation boundaries
 * @param {number} currentWeek - Current week number
 * @param {number} totalWeeks - Total number of weeks
 * @param {string} direction - Navigation direction ('previous' or 'next')
 * @returns {boolean} True if navigation is valid
 */
export const canNavigateWeek = (currentWeek, totalWeeks, direction) => {
  if (!currentWeek || !totalWeeks) return false;
  
  if (direction === 'previous') {
    return currentWeek > 1;
  }
  
  if (direction === 'next') {
    return currentWeek < totalWeeks;
  }
  
  return false;
};

/**
 * Get the next valid week number for navigation
 * @param {number} currentWeek - Current week number
 * @param {number} totalWeeks - Total number of weeks
 * @param {string} direction - Navigation direction ('previous' or 'next')
 * @returns {number|null} Next valid week number or null if navigation is invalid
 */
export const getNextWeek = (currentWeek, totalWeeks, direction) => {
  if (!canNavigateWeek(currentWeek, totalWeeks, direction)) {
    return null;
  }
  
  if (direction === 'previous') {
    return Math.max(1, currentWeek - 1);
  }
  
  if (direction === 'next') {
    return Math.min(totalWeeks, currentWeek + 1);
  }
  
  return null;
};

/**
 * Validate and normalize week number to ensure it's within valid bounds
 * @param {number} week - Week number to validate
 * @param {number} totalWeeks - Total number of weeks
 * @returns {number} Valid week number within bounds
 */
export const normalizeWeek = (week, totalWeeks) => {
  if (!week || !totalWeeks) return 1;
  return Math.max(1, Math.min(week, totalWeeks));
};

/**
 * Get week type classification
 * @param {number} week - Week number
 * @param {number} regularSeasonWeeks - Number of regular season weeks
 * @param {number} totalWeeks - Total number of weeks
 * @returns {string} Week type ('regular', 'playoffs', 'championship')
 */
export const getWeekType = (week, regularSeasonWeeks, totalWeeks) => {
  if (!week || !regularSeasonWeeks || !totalWeeks) return 'regular';
  
  const validWeek = normalizeWeek(week, totalWeeks);
  
  if (validWeek <= regularSeasonWeeks) {
    return 'regular';
  }
  
  const playoffWeek = validWeek - regularSeasonWeeks;
  const totalPlayoffWeeks = totalWeeks - regularSeasonWeeks;
  
  if (playoffWeek === totalPlayoffWeeks || totalPlayoffWeeks === 1) {
    return 'championship';
  }
  
  return 'playoffs';
};