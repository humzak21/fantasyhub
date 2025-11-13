/**
 * Get truncated UUID for masked display (first 8 characters)
 */
export const getTruncatedUUID = (uuid) => {
  if (!uuid) return 'Unknown';
  return uuid.substring(0, 8);
};

/**
 * Get the display name from a user object
 * @param {Object} user - User object from auth context
 * @returns {string|null} - User's display name or null
 */
export const getUserDisplayName = (user) => {
  if (!user) return null;
  // Check user_metadata for name (Supabase auth structure)
  return user.user_metadata?.name || user.user_metadata?.full_name || null;
};

/**
 * Extract team owner names from teams data
 * @param {Array<Object>|Object} teamsOrSeason - Either an array of teams or a season object with teams property
 * @returns {Array<string>} - Array of team owner names
 */
export const getTeamOwnerNames = (teamsOrSeason) => {
  // Handle season object with teams property
  let teams = teamsOrSeason;
  if (teamsOrSeason && teamsOrSeason.teams) {
    teams = teamsOrSeason.teams;
  }

  // Handle rankings array (which contains team data)
  if (!Array.isArray(teams)) {
    return [];
  }

  return teams
    .map(team => team.owner)
    .filter(owner => owner && owner.trim() !== '');
};

/**
 * Check if a user is a team owner by comparing their name to the list of team owners
 * @param {Object} user - User object from auth context
 * @param {Array<string>} teamOwnerNames - Array of team owner names
 * @returns {boolean} - Whether the user is a team owner
 */
export const isUserATeamOwner = (user, teamOwnerNames) => {
  if (!user || !teamOwnerNames || teamOwnerNames.length === 0) {
    return false;
  }

  const userName = getUserDisplayName(user);
  if (!userName) return false;

  // Case-insensitive comparison
  const normalizedUserName = userName.trim().toLowerCase();
  return teamOwnerNames.some(ownerName =>
    ownerName && ownerName.trim().toLowerCase() === normalizedUserName
  );
};

/**
 * Get masked or real team name based on authentication status and team ownership
 * @param {Object} team - Team object with id and name properties
 * @param {Object} user - User object from auth context (null if not logged in)
 * @param {boolean} isAdmin - Whether user is admin
 * @param {Array<string>} teamOwnerNames - Array of all team owner names in the league
 * @returns {string} - Either real team name or masked UUID
 */
export const getMaskedTeamName = (team, user, isAdmin, teamOwnerNames = []) => {
  if (!team) return 'Unknown Team';

  // Admin always sees real name
  if (isAdmin) {
    return team.name;
  }

  // Authenticated users who are team owners see real name
  if (user && isUserATeamOwner(user, teamOwnerNames)) {
    return team.name;
  }

  // Everyone else sees masked UUID
  return getTruncatedUUID(team.id);
};

/**
 * Get masked or real owner name based on authentication status and team ownership
 * @param {Object} team - Team object with id and owner properties
 * @param {Object} user - User object from auth context (null if not logged in)
 * @param {boolean} isAdmin - Whether user is admin
 * @param {Array<string>} teamOwnerNames - Array of all team owner names in the league
 * @returns {string} - Either real owner name or masked UUID
 */
export const getMaskedOwnerName = (team, user, isAdmin, teamOwnerNames = []) => {
  if (!team || !team.owner) return 'Unknown Owner';

  // Admin always sees real name
  if (isAdmin) {
    return team.owner;
  }

  // Authenticated users who are team owners see real name
  if (user && isUserATeamOwner(user, teamOwnerNames)) {
    return team.owner;
  }

  // Everyone else sees masked UUID
  return getTruncatedUUID(team.id);
};

/**
 * Get either masked or real name based on authentication status and team ownership
 * Generic function that works for any name and team
 * @param {string} name - The name to potentially mask
 * @param {string} teamId - Team ID for masking
 * @param {Object} user - User object from auth context (null if not logged in)
 * @param {boolean} isAdmin - Whether user is admin
 * @param {Array<string>} teamOwnerNames - Array of all team owner names in the league
 * @returns {string} - Either real name or masked UUID
 */
export const getMaskedOrRealName = (name, teamId, user, isAdmin, teamOwnerNames = []) => {
  if (!name) return 'Unknown';

  // Admin always sees real name
  if (isAdmin) {
    return name;
  }

  // Authenticated users who are team owners see real name
  if (user && isUserATeamOwner(user, teamOwnerNames)) {
    return name;
  }

  // Everyone else sees masked UUID
  return getTruncatedUUID(teamId);
};

/**
 * Get masked or real user/participant name based on authentication status and team ownership
 * @param {string} displayName - The user's display name
 * @param {string} userId - User ID for masking
 * @param {Object} user - User object from auth context (null if not logged in)
 * @param {boolean} isAdmin - Whether user is admin
 * @param {Array<string>} teamOwnerNames - Array of all team owner names in the league
 * @returns {string} - Either real name or masked UUID
 */
export const getMaskedUserName = (displayName, userId, user, isAdmin, teamOwnerNames = []) => {
  if (!displayName && !userId) return 'Unknown User';

  // Admin always sees real name
  if (isAdmin) {
    return displayName || `User ${userId?.slice(0, 8)}`;
  }

  // Authenticated users who are team owners see real name
  if (user && isUserATeamOwner(user, teamOwnerNames)) {
    return displayName || `User ${userId?.slice(0, 8)}`;
  }

  // Everyone else sees masked UUID
  if (userId) {
    return getTruncatedUUID(userId);
  }

  return getTruncatedUUID(displayName);
};

/**
 * Get masked or real division name based on authentication status and team ownership
 * @param {Object} division - Division object with name property
 * @param {number} divisionIndex - The index/position of the division (0-based)
 * @param {Object} user - User object from auth context (null if not logged in)
 * @param {boolean} isAdmin - Whether user is admin
 * @param {Array<string>} teamOwnerNames - Array of all team owner names in the league
 * @returns {string} - Either real division name or "Division N"
 */
export const getMaskedDivisionName = (division, divisionIndex, user, isAdmin, teamOwnerNames = []) => {
  if (!division) return 'Unknown Division';

  // Admin always sees real name
  if (isAdmin) {
    return division.name;
  }

  // Authenticated users who are team owners see real name
  if (user && isUserATeamOwner(user, teamOwnerNames)) {
    return division.name;
  }

  // Everyone else see generic division number
  return `Division ${divisionIndex + 1}`;
};
