import {
  getMaskedOwnerName,
  getMaskedTeamName,
  getMaskedOrRealName,
  isUserATeamOwner
} from '../../../utils/displayNameUtils';

/**
 * Get masked or real franchise owner name based on authentication status
 * @param {Object} franchise - Franchise object with id and owner_name properties
 * @param {Object} user - User object from auth context (null if not logged in)
 * @param {boolean} isAdmin - Whether user is admin
 * @param {Array<string>} teamOwnerNames - Array of all team owner names in the league
 * @returns {string} - Either real owner name or masked UUID
 */
export const getMaskedFranchiseName = (franchise, user, isAdmin, teamOwnerNames = []) => {
  if (!franchise) return 'Unknown Franchise';

  // Admin always sees real name
  if (isAdmin) {
    return franchise.display_name || franchise.owner_name || 'Unknown Owner';
  }

  // Authenticated users who are team owners see real name
  if (user && isUserATeamOwner(user, teamOwnerNames)) {
    return franchise.display_name || franchise.owner_name || 'Unknown Owner';
  }

  // Everyone else sees masked UUID
  return `Franchise ${franchise.id?.substring(0, 8) || 'Unknown'}`;
};

/**
 * Get masked or real historical team name
 * Adapts historical team structure to work with existing masking utilities
 * @param {Object} historicalTeam - Historical team object with franchise relationship
 * @param {Object} user - User object from auth context
 * @param {boolean} isAdmin - Whether user is admin
 * @param {Array<string>} teamOwnerNames - Array of all team owner names
 * @returns {string} - Either real team name or masked UUID
 */
export const getMaskedHistoricalTeamName = (historicalTeam, user, isAdmin, teamOwnerNames = []) => {
  if (!historicalTeam) return 'Unknown Team';

  // Admin always sees real name
  if (isAdmin) {
    return historicalTeam.team_name || 'Unknown Team';
  }

  // Authenticated users who are team owners see real name
  if (user && isUserATeamOwner(user, teamOwnerNames)) {
    return historicalTeam.team_name || 'Unknown Team';
  }

  // Everyone else sees masked UUID
  return `Team ${historicalTeam.id?.substring(0, 8) || 'Unknown'}`;
};

/**
 * Get masked franchise owner name for a historical team
 * @param {Object} historicalTeam - Historical team with franchise relationship
 * @param {Object} user - User object from auth context
 * @param {boolean} isAdmin - Whether user is admin
 * @param {Array<string>} teamOwnerNames - Array of all team owner names
 * @returns {string} - Either real owner name or masked string
 */
export const getMaskedHistoricalOwnerName = (historicalTeam, user, isAdmin, teamOwnerNames = []) => {
  if (!historicalTeam?.franchise) return 'Unknown Owner';

  const ownerName = historicalTeam.franchise.display_name ||
                    historicalTeam.franchise.owner_name;

  // Admin always sees real name
  if (isAdmin) {
    return ownerName || 'Unknown Owner';
  }

  // Authenticated users who are team owners see real name
  if (user && isUserATeamOwner(user, teamOwnerNames)) {
    return ownerName || 'Unknown Owner';
  }

  // Everyone else sees masked UUID
  return `Owner ${historicalTeam.franchise.id?.substring(0, 8) || 'Unknown'}`;
};

/**
 * Mask an array of franchises for display
 * Returns array with display_name set to masked or real name
 * @param {Array<Object>} franchises - Array of franchise objects
 * @param {Object} user - User object from auth context
 * @param {boolean} isAdmin - Whether user is admin
 * @param {Array<string>} teamOwnerNames - Array of all team owner names
 * @returns {Array<Object>} - Franchises with display_name property set appropriately
 */
export const getMaskedFranchiseList = (franchises, user, isAdmin, teamOwnerNames = []) => {
  if (!franchises || !Array.isArray(franchises)) return [];

  return franchises.map(franchise => ({
    ...franchise,
    masked_display_name: getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames)
  }));
};

/**
 * Check if user can view full franchise data
 * @param {Object} user - User object from auth context
 * @param {boolean} isAdmin - Whether user is admin
 * @param {Array<string>} teamOwnerNames - Array of all team owner names
 * @returns {boolean} - Whether user can see real names
 */
export const canViewFullData = (user, isAdmin, teamOwnerNames = []) => {
  if (isAdmin) return true;
  if (user && isUserATeamOwner(user, teamOwnerNames)) return true;
  return false;
};

/**
 * Get appropriate pronoun for franchise based on visibility
 * Returns "you" if it's the user's franchise, otherwise the franchise name
 * @param {Object} franchise - Franchise object
 * @param {Object} user - User object from auth context
 * @param {boolean} isAdmin - Whether user is admin
 * @param {Array<string>} teamOwnerNames - Array of all team owner names
 * @returns {string} - "You" or the franchise display name
 */
export const getFranchisePronoun = (franchise, user, isAdmin, teamOwnerNames = []) => {
  if (!franchise || !user) {
    return getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames);
  }

  // Check if this franchise belongs to the current user
  const userDisplayName = user.user_metadata?.name || user.user_metadata?.full_name;
  const franchiseOwner = franchise.display_name || franchise.owner_name;

  if (userDisplayName && franchiseOwner &&
      userDisplayName.trim().toLowerCase() === franchiseOwner.trim().toLowerCase()) {
    return 'You';
  }

  return getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames);
};

/**
 * Sort franchises with current user first (if they have a franchise)
 * @param {Array<Object>} franchises - Array of franchise objects
 * @param {Object} user - User object from auth context
 * @returns {Array<Object>} - Sorted franchises with user's franchise first
 */
export const sortFranchisesWithUserFirst = (franchises, user) => {
  if (!franchises || !Array.isArray(franchises) || !user) {
    return franchises;
  }

  const userDisplayName = user.user_metadata?.name || user.user_metadata?.full_name;
  if (!userDisplayName) return franchises;

  const normalizedUserName = userDisplayName.trim().toLowerCase();

  return [...franchises].sort((a, b) => {
    const aOwner = (a.display_name || a.owner_name || '').trim().toLowerCase();
    const bOwner = (b.display_name || b.owner_name || '').trim().toLowerCase();

    const aIsUser = aOwner === normalizedUserName;
    const bIsUser = bOwner === normalizedUserName;

    if (aIsUser && !bIsUser) return -1;
    if (!aIsUser && bIsUser) return 1;
    return 0;
  });
};
