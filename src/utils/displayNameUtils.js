/**
 * Get truncated UUID for masked display (first 8 characters)
 */
export const getTruncatedUUID = (uuid) => {
  if (!uuid) return 'Unknown';
  return uuid.substring(0, 8);
};

/**
 * Get masked or real team name based on authentication status
 * @param {Object} team - Team object with id and name properties
 * @param {Object} user - User object from auth context (null if not logged in)
 * @param {boolean} isAdmin - Whether user is admin
 * @returns {string} - Either real team name or masked UUID
 */
export const getMaskedTeamName = (team, user, isAdmin) => {
  if (!team) return 'Unknown Team';

  // Admin always sees real name
  if (isAdmin) {
    return team.name;
  }

  // Authenticated users see real name
  if (user) {
    return team.name;
  }

  // Unauthenticated users see masked UUID
  return getTruncatedUUID(team.id);
};

/**
 * Get masked or real owner name based on authentication status
 * @param {Object} team - Team object with id and owner properties
 * @param {Object} user - User object from auth context (null if not logged in)
 * @param {boolean} isAdmin - Whether user is admin
 * @returns {string} - Either real owner name or masked UUID
 */
export const getMaskedOwnerName = (team, user, isAdmin) => {
  if (!team || !team.owner) return 'Unknown Owner';

  // Admin always sees real name
  if (isAdmin) {
    return team.owner;
  }

  // Authenticated users see real name
  if (user) {
    return team.owner;
  }

  // Unauthenticated users see masked UUID
  return getTruncatedUUID(team.id);
};

/**
 * Get either masked or real name based on authentication status
 * Generic function that works for any name and team
 * @param {string} name - The name to potentially mask
 * @param {string} teamId - Team ID for masking
 * @param {Object} user - User object from auth context (null if not logged in)
 * @param {boolean} isAdmin - Whether user is admin
 * @returns {string} - Either real name or masked UUID
 */
export const getMaskedOrRealName = (name, teamId, user, isAdmin) => {
  if (!name) return 'Unknown';

  // Admin always sees real name
  if (isAdmin) {
    return name;
  }

  // Authenticated users see real name
  if (user) {
    return name;
  }

  // Unauthenticated users see masked UUID
  return getTruncatedUUID(teamId);
};

/**
 * Get masked or real user/participant name based on authentication status
 * @param {string} displayName - The user's display name
 * @param {string} userId - User ID for masking
 * @param {Object} user - User object from auth context (null if not logged in)
 * @param {boolean} isAdmin - Whether user is admin
 * @returns {string} - Either real name or masked UUID
 */
export const getMaskedUserName = (displayName, userId, user, isAdmin) => {
  if (!displayName && !userId) return 'Unknown User';

  // Admin always sees real name
  if (isAdmin) {
    return displayName || `User ${userId?.slice(0, 8)}`;
  }

  // Authenticated users see real name
  if (user) {
    return displayName || `User ${userId?.slice(0, 8)}`;
  }

  // Unauthenticated users see masked UUID
  if (userId) {
    return getTruncatedUUID(userId);
  }

  return getTruncatedUUID(displayName);
};

/**
 * Get masked or real division name based on authentication status
 * @param {Object} division - Division object with name property
 * @param {number} divisionIndex - The index/position of the division (0-based)
 * @param {Object} user - User object from auth context (null if not logged in)
 * @param {boolean} isAdmin - Whether user is admin
 * @returns {string} - Either real division name or "Division N"
 */
export const getMaskedDivisionName = (division, divisionIndex, user, isAdmin) => {
  if (!division) return 'Unknown Division';

  // Admin always sees real name
  if (isAdmin) {
    return division.name;
  }

  // Authenticated users see real name
  if (user) {
    return division.name;
  }

  // Unauthenticated users see generic division number
  return `Division ${divisionIndex + 1}`;
};
