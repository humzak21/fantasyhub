/**
 * Utility functions for handling owner/manager information across seasons
 * Extracted from analyze_complete_stats.js for reuse in roster updater
 */



/**
 * Extract owner name from ESPN team data with fallback logic
 * @param {Object} espnTeamData - ESPN team data object
 * @param {Array} members - Current season members array
 * @param {Object} allSeasonMembers - All season members for fallback lookup
 * @returns {Object} Object containing ownerId and ownerName
 */
export function extractOwnerInfo(espnTeamData, members = []) {
    const ownerId = espnTeamData.primaryOwner || espnTeamData.owners?.[0];
    let ownerName = '';
    
    if (ownerId) {
        // Find owner in current season members
        const owner = members.find(m => m.id === ownerId);
        
        if (owner) {
            // Use firstName/lastName if available, otherwise displayName
            if (owner.firstName || owner.lastName) {
                ownerName = `${owner.firstName || ''} ${owner.lastName || ''}`.trim();
            } else if (owner.displayName) {
                ownerName = owner.displayName;
            }
        }
    }
    
    return {
        ownerId,
        ownerName
    };
}

/**
 * Enhanced team matching logic that considers owner information
 * @param {Object} espnTeam - ESPN team data
 * @param {Array} existingTeams - Array of existing teams in the system
 * @param {Array} members - Current season members
 * @param {Object} allSeasonMembers - All season members for fallback
 * @returns {Object|null} Matched team or null
 */
export function findMatchingTeam(espnTeam, existingTeams, members = []) {
    // Safety check for existingTeams
    if (!existingTeams || !Array.isArray(existingTeams)) {
        return null;
    }
    
    const { ownerName } = extractOwnerInfo(espnTeam, members);
    const espnTeamName = espnTeam.abbrev || `Team ${espnTeam.id}`;
    
    // Try multiple matching strategies in order of preference
    // Prioritize owner name matching since it's more reliable than ESPN team IDs
    const matchingStrategies = [
        // 1. Exact owner name match (most reliable)
        (team) => ownerName && team.owner && 
                 team.owner.toLowerCase() === ownerName.toLowerCase(),
        
        // 2. Owner name contains match (handles nicknames, etc.)
        (team) => ownerName && team.owner && 
                 (team.owner.toLowerCase().includes(ownerName.toLowerCase()) ||
                  ownerName.toLowerCase().includes(team.owner.toLowerCase())),
        
        // 3. Team name exact match
        (team) => team.name && espnTeamName &&
                 team.name.toLowerCase() === espnTeamName.toLowerCase(),
        
        // 4. Team name contains match
        (team) => team.name && espnTeamName &&
                 (team.name.toLowerCase().includes(espnTeamName.toLowerCase()) ||
                  espnTeamName.toLowerCase().includes(team.name.toLowerCase()))
    ];
    
    // Try each strategy until we find a match
    for (const strategy of matchingStrategies) {
        const match = existingTeams.find(strategy);
        if (match) {
            return {
                team: match,
                matchType: matchingStrategies.indexOf(strategy) + 1,
                confidence: getMatchConfidence(matchingStrategies.indexOf(strategy))
            };
        }
    }
    
    return null;
}

/**
 * Get confidence level for match type
 * @param {number} strategyIndex - Index of matching strategy used
 * @returns {string} Confidence level
 */
function getMatchConfidence(strategyIndex) {
    const confidenceLevels = ['high', 'high', 'medium', 'medium', 'low'];
    return confidenceLevels[strategyIndex] || 'low';
}
