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
 * Has this user set a display name at all?
 *
 * Gates <DisplayNamePrompt>. Goes through `getUserDisplayName` so it reads the
 * same two metadata keys the rest of the app does — signup and settings write
 * `name` and `full_name` together, and `display_name` is written by nothing.
 *
 * @param {Object} user - User object from auth context
 * @returns {boolean} - Whether a non-blank name is set
 */
export const hasDisplayName = (user) => Boolean(getUserDisplayName(user)?.trim());

/**
 * Is this an acceptable "First Last" display name?
 *
 * Rejects only what is unambiguously wrong. <DisplayNamePrompt> asks for a name
 * with no comma, no nickname and no middle name, but a middle name still passes
 * here: the rules are guidance, and `matchesTeamOwner` is what actually catches
 * a name the league will not recognise. Blocking on a shape guess would lock out
 * anyone whose name genuinely does not fit it.
 *
 * @param {string} raw - The name as typed
 * @returns {string|null} - An error message, or null if the name is acceptable
 */
export const validateFullName = (raw) => {
  const name = (raw ?? '').trim();
  if (!name) return 'Enter your first and last name.';
  if (name.includes(',')) return 'No commas — write it as First Last.';
  if (!/\s/.test(name)) return 'Include your last name too.';
  return null;
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
    .filter(team => team.owner && team.owner.trim() !== '')
    .map(team => ({
      ownerName: team.owner,
      teamName: team.name
    }));
};

/**
 * Does a name match one of the league's team owners?
 *
 * The one place the owner-name comparison rule lives, so `isUserATeamOwner`
 * (which unmasks the league for a viewer) and <DisplayNamePrompt> (which warns
 * a user that the name they just typed matches nobody) can never disagree
 * about what counts as a match.
 *
 * @param {string} name - A candidate display name
 * @param {Array<Object|string>} teamOwnerNames - Owner names, as strings or as
 *   the `{ ownerName, teamName }` objects `getTeamOwnerNames` returns
 * @returns {boolean} - Whether the name matches an owner
 */
export const matchesTeamOwner = (name, teamOwnerNames = []) => {
  if (!name || !Array.isArray(teamOwnerNames) || teamOwnerNames.length === 0) {
    return false;
  }

  // Case-insensitive comparison
  const normalizedName = name.trim().toLowerCase();
  if (!normalizedName) return false;

  return teamOwnerNames.some(item => {
    // Handle both string array and object array formats
    const ownerName = typeof item === 'string' ? item : item?.ownerName;
    return ownerName && ownerName.trim().toLowerCase() === normalizedName;
  });
};

/**
 * Check if a user is a team owner by comparing their name to the list of team owners
 * @param {Object} user - User object from auth context
 * @param {Array<Object|string>} teamOwnerNames - Array of team owner names (can be strings or objects with ownerName property)
 * @returns {boolean} - Whether the user is a team owner
 */
export const isUserATeamOwner = (user, teamOwnerNames) => {
  if (!user) return false;
  return matchesTeamOwner(getUserDisplayName(user), teamOwnerNames);
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
