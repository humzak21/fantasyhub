/**
 * Simple date utilities without timezone complications
 */

/**
 * Get current date as YYYY-MM-DD string
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const getCurrentDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Get yesterday's date as YYYY-MM-DD string
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const getYesterdayDate = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Format a YYYY-MM-DD date string for display
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string} Formatted date string
 */
export const formatDateForDisplay = (dateString) => {
  if (!dateString) return '';
  
  // Parse the date string directly
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day); // month is 0-indexed in Date constructor
  
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric'
  });
};

/**
 * Get formatted date parts for display
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {object} Object with day, monthYear, and fullDate
 */
export const getFormattedDateParts = (dateString) => {
  if (!dateString) return { day: 'N/A', monthYear: 'Unknown Date', fullDate: 'Unknown Date' };
  
  // Parse the date string directly
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day); // month is 0-indexed in Date constructor
  
  return {
    day: day.toString(),
    monthYear: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    fullDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  };
};

/**
 * Convert a Date object to date string (YYYY-MM-DD)
 * @param {Date} date - Date object
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const dateToString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Parse a date string and return Date object
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Date} Date object
 */
export const parseDate = (dateString) => {
  if (!dateString) return new Date();
  
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed in Date constructor
};

// Legacy exports for backward compatibility
export const getCurrentDateEST = getCurrentDate;
export const getYesterdayDateEST = getYesterdayDate;
export const dateToESTString = dateToString;
export const parseESTDate = parseDate; 