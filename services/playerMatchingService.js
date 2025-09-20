/**
 * PlayerMatchingService - Handles matching between local players and ffanalytics player data
 * 
 * This service implements fuzzy matching algorithms to correlate players in the Supabase database
 * with corresponding ffanalytics player records using name, position, and team information.
 * 
 * Features:
 * - Fuzzy string matching with confidence scoring
 * - Bulk matching functionality for efficient processing
 * - Validation and manual review capabilities for unmatched players
 * - Multiple matching strategies with fallback logic
 */

import { supabase, supabaseAdmin, handleSupabaseError, formatForDatabase, formatFromDatabase } from './supabaseClient.server.js';

export class PlayerMatchingService {
  constructor(supabaseClient = null) {
    // Use provided client or default to admin client for server operations, regular client for browser
    this.client = supabaseClient || supabaseAdmin || supabase;
    this.isAdminMode = !!(supabaseClient === supabaseAdmin || (!supabaseClient && supabaseAdmin));
    
    // Configuration for matching algorithms
    this.config = {
      confidenceThreshold: 0.8,
      fuzzyMatchThreshold: 0.7,
      autoApproveThreshold: 0.95,
      maxEditDistance: 3,
      positionWeight: 0.3,
      teamWeight: 0.2,
      nameWeight: 0.5
    };
  }

  /**
   * Match a single local player with ffanalytics player data
   * @param {Object} localPlayer - Local player object from database
   * @param {Array} ffanalyticsPlayers - Array of ffanalytics player objects
   * @returns {Object|null} Best match with confidence score or null
   */
  async matchPlayer(localPlayer, ffanalyticsPlayers) {
    if (!localPlayer || !ffanalyticsPlayers || !Array.isArray(ffanalyticsPlayers)) {
      return null;
    }

    // Filter candidates by position first (exact match required)
    const positionCandidates = ffanalyticsPlayers.filter(fp => 
      this.normalizePosition(fp.position || fp.pos) === this.normalizePosition(localPlayer.position)
    );

    if (positionCandidates.length === 0) {
      return null;
    }

    // Find best match using multiple strategies
    const bestMatch = await this.findBestMatch(
      localPlayer.name,
      localPlayer.position,
      localPlayer.teamAbbreviation || localPlayer.team_abbreviation,
      positionCandidates
    );

    return bestMatch;
  }

  /**
   * Find the best match for a player using multiple matching strategies
   * @param {string} playerName - Local player name
   * @param {string} position - Player position
   * @param {string} team - Player team abbreviation
   * @param {Array} candidates - Array of candidate ffanalytics players
   * @returns {Object|null} Best match with confidence score
   */
  async findBestMatch(playerName, position, team, candidates) {
    if (!candidates || candidates.length === 0) {
      return null;
    }

    const matches = [];

    // Calculate match scores for each candidate
    for (const candidate of candidates) {
      const confidence = this.calculateMatchConfidence(
        { name: playerName, position, team },
        candidate
      );

      if (confidence >= this.config.fuzzyMatchThreshold) {
        matches.push({
          player: candidate,
          confidence,
          matchDetails: this.getMatchDetails(
            { name: playerName, position, team },
            candidate
          )
        });
      }
    }

    // Sort by confidence and return best match
    matches.sort((a, b) => b.confidence - a.confidence);
    
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Calculate confidence score for a player match
   * @param {Object} localPlayer - Local player data
   * @param {Object} ffanalyticsPlayer - FFAnalytics player data
   * @returns {number} Confidence score between 0 and 1
   */
  calculateMatchConfidence(localPlayer, ffanalyticsPlayer) {
    const nameScore = this.calculateNameSimilarity(
      localPlayer.name,
      ffanalyticsPlayer.player_name || ffanalyticsPlayer.player || ffanalyticsPlayer.name
    );
    
    const positionScore = this.calculatePositionSimilarity(
      localPlayer.position,
      ffanalyticsPlayer.position || ffanalyticsPlayer.pos
    );
    
    const teamScore = this.calculateTeamSimilarity(
      localPlayer.team,
      ffanalyticsPlayer.team
    );

    // Weighted average of all similarity scores
    const confidence = (
      nameScore * this.config.nameWeight +
      positionScore * this.config.positionWeight +
      teamScore * this.config.teamWeight
    );

    return Math.min(1.0, Math.max(0.0, confidence));
  }

  /**
   * Calculate name similarity using multiple string matching algorithms
   * @param {string} name1 - First name
   * @param {string} name2 - Second name
   * @returns {number} Similarity score between 0 and 1
   */
  calculateNameSimilarity(name1, name2) {
    if (!name1 || !name2) return 0;

    const n1 = this.normalizeName(name1);
    const n2 = this.normalizeName(name2);

    // Exact match
    if (n1 === n2) return 1.0;

    // Check if one name contains the other (handles nicknames)
    if (n1.includes(n2) || n2.includes(n1)) return 0.9;

    // Levenshtein distance similarity
    const levenshteinScore = this.calculateLevenshteinSimilarity(n1, n2);
    
    // Jaro-Winkler similarity for better handling of name variations
    const jaroWinklerScore = this.calculateJaroWinklerSimilarity(n1, n2);
    
    // Token-based similarity (handles first/last name order differences)
    const tokenScore = this.calculateTokenSimilarity(n1, n2);

    // Return the highest score from all methods
    return Math.max(levenshteinScore, jaroWinklerScore, tokenScore);
  }

  /**
   * Calculate position similarity
   * @param {string} pos1 - First position
   * @param {string} pos2 - Second position
   * @returns {number} Similarity score (1.0 for exact match, 0.0 for different)
   */
  calculatePositionSimilarity(pos1, pos2) {
    if (!pos1 || !pos2) return 0;
    
    const p1 = this.normalizePosition(pos1);
    const p2 = this.normalizePosition(pos2);
    
    return p1 === p2 ? 1.0 : 0.0;
  }

  /**
   * Calculate team similarity
   * @param {string} team1 - First team abbreviation
   * @param {string} team2 - Second team abbreviation
   * @returns {number} Similarity score between 0 and 1
   */
  calculateTeamSimilarity(team1, team2) {
    if (!team1 || !team2) return 0.5; // Neutral score if team info missing
    
    const t1 = team1.toUpperCase().trim();
    const t2 = team2.toUpperCase().trim();
    
    // Exact match
    if (t1 === t2) return 1.0;
    
    // Handle common team abbreviation variations
    const teamMappings = this.getTeamMappings();
    const normalizedT1 = teamMappings[t1] || t1;
    const normalizedT2 = teamMappings[t2] || t2;
    
    return normalizedT1 === normalizedT2 ? 1.0 : 0.0;
  }

  /**
   * Normalize player name for comparison
   * @param {string} name - Player name
   * @returns {string} Normalized name
   */
  normalizeName(name) {
    if (!name) return '';
    
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, '') // Remove suffixes
      .trim();
  }

  /**
   * Normalize position for comparison
   * @param {string} position - Player position
   * @returns {string} Normalized position
   */
  normalizePosition(position) {
    if (!position) return '';
    
    const pos = position.toUpperCase().trim();
    
    // Handle position variations
    const positionMappings = {
      'DEF': 'D/ST',
      'DST': 'D/ST',
      'DEFENSE': 'D/ST',
      'PK': 'K',
      'KICKER': 'K'
    };
    
    return positionMappings[pos] || pos;
  }

  /**
   * Calculate Levenshtein distance similarity
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score between 0 and 1
   */
  calculateLevenshteinSimilarity(str1, str2) {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    
    if (maxLength === 0) return 1.0;
    
    return 1.0 - (distance / maxLength);
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Edit distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate Jaro-Winkler similarity
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score between 0 and 1
   */
  calculateJaroWinklerSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0 || len2 === 0) return 0.0;
    
    const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
    if (matchWindow < 0) return 0.0;
    
    const str1Matches = new Array(len1).fill(false);
    const str2Matches = new Array(len2).fill(false);
    
    let matches = 0;
    let transpositions = 0;
    
    // Find matches
    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, len2);
      
      for (let j = start; j < end; j++) {
        if (str2Matches[j] || str1[i] !== str2[j]) continue;
        str1Matches[i] = true;
        str2Matches[j] = true;
        matches++;
        break;
      }
    }
    
    if (matches === 0) return 0.0;
    
    // Find transpositions
    let k = 0;
    for (let i = 0; i < len1; i++) {
      if (!str1Matches[i]) continue;
      while (!str2Matches[k]) k++;
      if (str1[i] !== str2[k]) transpositions++;
      k++;
    }
    
    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
    
    // Calculate common prefix length (up to 4 characters)
    let prefix = 0;
    for (let i = 0; i < Math.min(len1, len2, 4); i++) {
      if (str1[i] === str2[i]) prefix++;
      else break;
    }
    
    return jaro + (0.1 * prefix * (1 - jaro));
  }

  /**
   * Calculate token-based similarity (handles name order differences)
   * @param {string} name1 - First name
   * @param {string} name2 - Second name
   * @returns {number} Similarity score between 0 and 1
   */
  calculateTokenSimilarity(name1, name2) {
    const tokens1 = name1.split(' ').filter(t => t.length > 0);
    const tokens2 = name2.split(' ').filter(t => t.length > 0);
    
    if (tokens1.length === 0 || tokens2.length === 0) return 0;
    
    let matchedTokens = 0;
    const used = new Set();
    
    for (const token1 of tokens1) {
      for (let i = 0; i < tokens2.length; i++) {
        if (used.has(i)) continue;
        
        const token2 = tokens2[i];
        const similarity = this.calculateLevenshteinSimilarity(token1, token2);
        
        if (similarity >= 0.8) { // High threshold for token matching
          matchedTokens++;
          used.add(i);
          break;
        }
      }
    }
    
    return matchedTokens / Math.max(tokens1.length, tokens2.length);
  }

  /**
   * Get team abbreviation mappings for normalization
   * @returns {Object} Team mapping object
   */
  getTeamMappings() {
    return {
      'LV': 'LAS',
      'LAS': 'LAS',
      'LAR': 'LAR',
      'LA': 'LAR',
      'WSH': 'WAS',
      'WAS': 'WAS'
    };
  }

  /**
   * Get detailed match information
   * @param {Object} localPlayer - Local player data
   * @param {Object} ffanalyticsPlayer - FFAnalytics player data
   * @returns {Object} Match details
   */
  getMatchDetails(localPlayer, ffanalyticsPlayer) {
    return {
      nameMatch: this.calculateNameSimilarity(
        localPlayer.name,
        ffanalyticsPlayer.player_name || ffanalyticsPlayer.player || ffanalyticsPlayer.name
      ),
      positionMatch: this.calculatePositionSimilarity(
        localPlayer.position,
        ffanalyticsPlayer.position || ffanalyticsPlayer.pos
      ),
      teamMatch: this.calculateTeamSimilarity(
        localPlayer.team,
        ffanalyticsPlayer.team
      ),
      exactNameMatch: this.normalizeName(localPlayer.name) === 
        this.normalizeName(ffanalyticsPlayer.player_name || ffanalyticsPlayer.player || ffanalyticsPlayer.name),
      exactPositionMatch: this.normalizePosition(localPlayer.position) === 
        this.normalizePosition(ffanalyticsPlayer.position || ffanalyticsPlayer.pos),
      exactTeamMatch: (localPlayer.team || '').toUpperCase() === 
        (ffanalyticsPlayer.team || '').toUpperCase()
    };
  }

  /**
   * Update player's ffanalytics ID in the database
   * @param {string} playerId - Local player ID
   * @param {string} ffAnalyticsId - FFAnalytics player ID
   * @param {number} confidence - Match confidence score
   * @returns {Object} Updated player data
   */
  async updatePlayerFFAnalyticsId(playerId, ffAnalyticsId, confidence = null) {
    try {
      const updateData = {
        ffanalytics_player_id: ffAnalyticsId,
        ffanalytics_last_sync: new Date().toISOString()
      };

      // Store confidence score in ffanalytics_data JSON field
      if (confidence !== null) {
        updateData.ffanalytics_data = {
          match_confidence: confidence,
          matched_at: new Date().toISOString()
        };
      }

      const { data, error } = await this.client
        .from('players')
        .update(updateData)
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;

      return formatFromDatabase(data);
    } catch (error) {
      handleSupabaseError(error, 'Update player ffanalytics ID');
    }
  }

  /**
   * Get players that haven't been matched with ffanalytics data
   * @param {number} limit - Maximum number of unmatched players to return
   * @returns {Array} Array of unmatched players
   */
  async getUnmatchedPlayers(limit = 100) {
    try {
      const { data, error } = await this.client
        .from('players')
        .select(`
          id,
          name,
          position,
          team_abbreviation,
          espn_player_id,
          is_active,
          season_projected_points,
          season_actual_points
        `)
        .is('ffanalytics_player_id', null)
        .eq('is_active', true)
        .order('season_projected_points', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return formatFromDatabase(data || []);
    } catch (error) {
      handleSupabaseError(error, 'Get unmatched players');
    }
  }

  /**
   * Validate existing player matches
   * @param {number} limit - Maximum number of matches to validate
   * @returns {Array} Array of validation results
   */
  async validateMatches(limit = 50) {
    try {
      const { data, error } = await this.client
        .from('players')
        .select(`
          id,
          name,
          position,
          team_abbreviation,
          ffanalytics_player_id,
          ffanalytics_data
        `)
        .not('ffanalytics_player_id', 'is', null)
        .eq('is_active', true)
        .limit(limit);

      if (error) throw error;

      const validationResults = [];

      for (const player of data || []) {
        const formattedPlayer = formatFromDatabase(player);
        const confidence = formattedPlayer.ffanalyticsData?.matchConfidence || 0;
        
        validationResults.push({
          playerId: formattedPlayer.id,
          playerName: formattedPlayer.name,
          position: formattedPlayer.position,
          team: formattedPlayer.teamAbbreviation,
          ffanalyticsId: formattedPlayer.ffanalyticsPlayerId,
          confidence,
          needsReview: confidence < this.config.confidenceThreshold,
          matchedAt: formattedPlayer.ffanalyticsData?.matchedAt
        });
      }

      return validationResults;
    } catch (error) {
      handleSupabaseError(error, 'Validate matches');
    }
  }

  /**
   * Bulk match players with ffanalytics data
   * @param {Array} localPlayers - Array of local players
   * @param {Array} ffanalyticsPlayers - Array of ffanalytics players
   * @param {Object} options - Matching options
   * @returns {Object} Bulk matching results
   */
  async bulkMatchPlayers(localPlayers, ffanalyticsPlayers, options = {}) {
    const {
      autoApprove = true,
      confidenceThreshold = this.config.confidenceThreshold,
      dryRun = false
    } = options;

    const results = {
      totalProcessed: 0,
      matched: 0,
      autoApproved: 0,
      needsReview: 0,
      failed: 0,
      matches: [],
      errors: []
    };

    if (!localPlayers || !ffanalyticsPlayers) {
      throw new Error('Both localPlayers and ffanalyticsPlayers arrays are required');
    }

    console.log(`Starting bulk matching for ${localPlayers.length} local players against ${ffanalyticsPlayers.length} ffanalytics players`);

    for (const localPlayer of localPlayers) {
      results.totalProcessed++;

      try {
        // Skip if already matched (unless forcing re-match)
        if (localPlayer.ffanalyticsPlayerId && !options.forceRematch) {
          continue;
        }

        const match = await this.matchPlayer(localPlayer, ffanalyticsPlayers);

        if (match && match.confidence >= this.config.fuzzyMatchThreshold) {
          results.matched++;

          const matchResult = {
            localPlayer: {
              id: localPlayer.id,
              name: localPlayer.name,
              position: localPlayer.position,
              team: localPlayer.teamAbbreviation || localPlayer.team_abbreviation
            },
            ffanalyticsPlayer: match.player,
            confidence: match.confidence,
            matchDetails: match.matchDetails,
            autoApproved: match.confidence >= this.config.autoApproveThreshold,
            needsReview: match.confidence < confidenceThreshold
          };

          results.matches.push(matchResult);

          // Auto-approve high confidence matches
          if (autoApprove && match.confidence >= this.config.autoApproveThreshold && !dryRun) {
            try {
              await this.updatePlayerFFAnalyticsId(
                localPlayer.id,
                match.player.player_id || match.player.id || match.player.player_name,
                match.confidence
              );
              results.autoApproved++;
            } catch (updateError) {
              results.errors.push({
                playerId: localPlayer.id,
                playerName: localPlayer.name,
                error: updateError.message
              });
              results.failed++;
            }
          } else if (match.confidence < confidenceThreshold) {
            results.needsReview++;
          }
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          playerId: localPlayer.id,
          playerName: localPlayer.name,
          error: error.message
        });
      }
    }

    console.log(`Bulk matching completed: ${results.matched} matches found, ${results.autoApproved} auto-approved, ${results.needsReview} need review, ${results.failed} failed`);

    return results;
  }

  /**
   * Get matching statistics
   * @returns {Object} Matching statistics
   */
  async getMatchingStats() {
    try {
      const { data: totalPlayers, error: totalError } = await this.client
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      if (totalError) throw totalError;

      const { data: matchedPlayers, error: matchedError } = await this.client
        .from('players')
        .select('id', { count: 'exact', head: true })
        .not('ffanalytics_player_id', 'is', null)
        .eq('is_active', true);

      if (matchedError) throw matchedError;

      const total = totalPlayers || 0;
      const matched = matchedPlayers || 0;
      const unmatched = total - matched;

      return {
        totalPlayers: total,
        matchedPlayers: matched,
        unmatchedPlayers: unmatched,
        matchPercentage: total > 0 ? ((matched / total) * 100).toFixed(1) : '0.0'
      };
    } catch (error) {
      handleSupabaseError(error, 'Get matching stats');
    }
  }

  /**
   * Clear all player matches (for testing or re-matching)
   * @param {boolean} confirm - Confirmation flag to prevent accidental clearing
   * @returns {number} Number of players cleared
   */
  async clearAllMatches(confirm = false) {
    if (!confirm) {
      throw new Error('Must confirm clearing all matches by passing confirm=true');
    }

    try {
      const { data, error } = await this.client
        .from('players')
        .update({
          ffanalytics_player_id: null,
          ffanalytics_last_sync: null,
          ffanalytics_data: null
        })
        .not('ffanalytics_player_id', 'is', null)
        .select('id');

      if (error) throw error;

      return (data || []).length;
    } catch (error) {
      handleSupabaseError(error, 'Clear all matches');
    }
  }
}

export default PlayerMatchingService;