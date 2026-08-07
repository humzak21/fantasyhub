/**
 * Fantasy Football Week Calculator
 *
 * Every value here used to come from a hardcoded SEASON_START_DATE and a
 * TOTAL_WEEKS constant, which meant the whole UI's week math had to be edited
 * each September. It now derives from the active season row via
 * utils/seasonConfig.js — call `setSeasonConfig(activeSeasonRow)` once the
 * season loads and these functions follow it automatically.
 *
 * The exported signatures are unchanged so existing call sites keep working.
 */

import {
  deriveCurrentWeek,
  deriveWeekEnd,
  deriveWeekStart,
  getSeasonConfig,
  hasSeasonConfig
} from './seasonConfig.js';

const requireConfig = () => {
  const config = getSeasonConfig();
  if (!config?.startDate) {
    throw new Error(
      'Season config not loaded. Call setSeasonConfig(activeSeason) before using weekCalculator.'
    );
  }
  return config;
};

/** Total weeks in the active season, or 0 before the season loads. */
export const getTotalWeeks = () => getSeasonConfig()?.weekCount ?? 0;

/**
 * Calculate the current fantasy week from the current date.
 * Returns 1 before the season starts (and before config loads), and never
 * exceeds the season's week count.
 *
 * @returns {number}
 */
export const getCurrentWeek = () => {
  if (!hasSeasonConfig()) return 1;
  return deriveCurrentWeek(getSeasonConfig());
};

/**
 * Get the start date for a specific week.
 * @param {number} weekNumber
 * @returns {Date}
 */
export const getWeekStartDate = (weekNumber) => {
  const config = requireConfig();
  if (weekNumber < 1 || weekNumber > config.weekCount) {
    throw new Error(`Week number must be between 1 and ${config.weekCount}`);
  }
  return deriveWeekStart(config, weekNumber);
};

/**
 * Get the end date for a specific week (just before the next week starts).
 * @param {number} weekNumber
 * @returns {Date}
 */
export const getWeekEndDate = (weekNumber) => deriveWeekEnd(requireConfig(), weekNumber);

/**
 * Check if a specific week is currently active.
 * @param {number} weekNumber
 * @returns {boolean}
 */
export const isWeekActive = (weekNumber) => getCurrentWeek() === weekNumber;

/**
 * Get formatted date range for a week (e.g. "Sep 2 - Sep 8, 2025").
 * @param {number} weekNumber
 * @returns {string}
 */
export const getWeekDateRange = (weekNumber) => {
  const config = requireConfig();
  const startDate = getWeekStartDate(weekNumber);
  const endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);

  // Render in the season's zone, not the viewer's, so a west-coast visitor
  // does not see the week starting a day early.
  const formatOptions = { month: 'short', day: 'numeric', timeZone: config.timeZone };
  const startFormatted = startDate.toLocaleDateString('en-US', formatOptions);
  const endFormatted = endDate.toLocaleDateString('en-US', formatOptions);
  const year = startDate.toLocaleDateString('en-US', {
    year: 'numeric',
    timeZone: config.timeZone
  });

  return `${startFormatted} - ${endFormatted}, ${year}`;
};

/**
 * Get time remaining until next week starts.
 * @returns {{days:number, hours:number, minutes:number, isSeasonOver:boolean}}
 */
export const getTimeUntilNextWeek = () => {
  const config = requireConfig();
  const currentWeek = getCurrentWeek();

  if (currentWeek >= config.weekCount) {
    return { days: 0, hours: 0, minutes: 0, isSeasonOver: true };
  }

  const timeDiff = getWeekStartDate(currentWeek + 1).getTime() - Date.now();

  if (timeDiff <= 0) {
    return { days: 0, hours: 0, minutes: 0, isSeasonOver: false };
  }

  return {
    days: Math.floor(timeDiff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60)),
    isSeasonOver: false
  };
};

/**
 * Get all week information for the season.
 * @returns {Array<{number:number, startDate:Date, endDate:Date, dateRange:string, isActive:boolean, isPast:boolean, isFuture:boolean}>}
 */
export const getAllWeeks = () => {
  if (!hasSeasonConfig()) return [];

  const config = getSeasonConfig();
  const currentWeek = getCurrentWeek();

  return Array.from({ length: config.weekCount }, (_, index) => {
    const number = index + 1;
    return {
      number,
      startDate: getWeekStartDate(number),
      endDate: getWeekEndDate(number),
      dateRange: getWeekDateRange(number),
      isActive: number === currentWeek,
      isPast: number < currentWeek,
      isFuture: number > currentWeek
    };
  });
};
