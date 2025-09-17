/**
 * Fantasy Football Week Calculator
 * Week 1 starts September 2nd, 2025 at 12:00 AM EDT
 * Weeks change over every Tuesday for 18 weeks total
 */

// Week 1 start: September 2nd, 2025 at 12:00 AM EDT
const SEASON_START_DATE = new Date('2025-09-02T00:00:00-04:00'); // EDT timezone (September is daylight time)
const TOTAL_WEEKS = 18;

/**
 * Calculate the current fantasy football week based on the current date
 * @returns {number} Current week number (1-18), or 1 if before season starts, or 18 if after season ends
 */
export const getCurrentWeek = () => {
  const now = new Date();
  
  console.log('=== Week Calculator Debug ===');
  console.log('Current date:', now.toString());
  console.log('Season start date:', SEASON_START_DATE.toString());
  console.log('Is before season start?', now < SEASON_START_DATE);
  
  // If before season starts, return week 1
  if (now < SEASON_START_DATE) {
    console.log('Returning week 1 (before season start)');
    return 1;
  }
  
  // Calculate milliseconds since season start
  const timeDiff = now.getTime() - SEASON_START_DATE.getTime();
  
  // Convert to days and calculate week
  const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(daysDiff / 7) + 1;
  
  console.log('Time diff (ms):', timeDiff);
  console.log('Days diff:', daysDiff);
  console.log('Calculated week (before cap):', weekNumber);
  console.log('Total weeks allowed:', TOTAL_WEEKS);
  
  const finalWeek = Math.min(weekNumber, TOTAL_WEEKS);
  console.log('Final week returned:', finalWeek);
  console.log('=== End Debug ===');
  
  // Cap at week 18
  return finalWeek;
};

/**
 * Get the start date for a specific week
 * @param {number} weekNumber - Week number (1-17)
 * @returns {Date} Start date of the specified week
 */
export const getWeekStartDate = (weekNumber) => {
  if (weekNumber < 1 || weekNumber > TOTAL_WEEKS) {
    throw new Error(`Week number must be between 1 and ${TOTAL_WEEKS}`);
  }
  
  const weekStartTime = new Date(SEASON_START_DATE);
  weekStartTime.setDate(weekStartTime.getDate() + (weekNumber - 1) * 7);
  return weekStartTime;
};

/**
 * Get the end date for a specific week
 * @param {number} weekNumber - Week number (1-17)
 * @returns {Date} End date of the specified week (6 days, 23 hours, 59 minutes after start)
 */
export const getWeekEndDate = (weekNumber) => {
  const startDate = getWeekStartDate(weekNumber);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);
  endDate.setMilliseconds(endDate.getMilliseconds() - 1); // End just before next week starts
  return endDate;
};

/**
 * Check if a specific week is currently active
 * @param {number} weekNumber - Week number to check
 * @returns {boolean} True if the week is currently active
 */
export const isWeekActive = (weekNumber) => {
  return getCurrentWeek() === weekNumber;
};

/**
 * Get formatted date range for a week
 * @param {number} weekNumber - Week number (1-17)
 * @returns {string} Formatted date range (e.g., "Sep 2 - Sep 8, 2025")
 */
export const getWeekDateRange = (weekNumber) => {
  const startDate = getWeekStartDate(weekNumber);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6); // 6 days later for display
  
  const formatOptions = { month: 'short', day: 'numeric' };
  const startFormatted = startDate.toLocaleDateString('en-US', formatOptions);
  const endFormatted = endDate.toLocaleDateString('en-US', formatOptions);
  const year = startDate.getFullYear();
  
  return `${startFormatted} - ${endFormatted}, ${year}`;
};

/**
 * Get time remaining until next week starts
 * @returns {Object} Object with days, hours, minutes until next week
 */
export const getTimeUntilNextWeek = () => {
  const currentWeek = getCurrentWeek();
  const nextWeekStart = getWeekStartDate(Math.min(currentWeek + 1, TOTAL_WEEKS));
  const now = new Date();
  
  if (currentWeek >= TOTAL_WEEKS) {
    return { days: 0, hours: 0, minutes: 0, isSeasonOver: true };
  }
  
  const timeDiff = nextWeekStart.getTime() - now.getTime();
  
  if (timeDiff <= 0) {
    return { days: 0, hours: 0, minutes: 0, isSeasonOver: false };
  }
  
  const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
  
  return { days, hours, minutes, isSeasonOver: false };
};

/**
 * Get all week information for the season
 * @returns {Array} Array of week objects with number, startDate, endDate, dateRange, isActive
 */
export const getAllWeeks = () => {
  const weeks = [];
  const currentWeek = getCurrentWeek();
  
  for (let i = 1; i <= TOTAL_WEEKS; i++) {
    weeks.push({
      number: i,
      startDate: getWeekStartDate(i),
      endDate: getWeekEndDate(i),
      dateRange: getWeekDateRange(i),
      isActive: i === currentWeek,
      isPast: i < currentWeek,
      isFuture: i > currentWeek
    });
  }
  
  return weeks;
};
