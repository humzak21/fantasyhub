/**
 * FFAnalytics Data Validator
 * 
 * Provides comprehensive data validation and quality assurance for ffanalytics integration.
 * Validates input data integrity, checks consistency between ESPN and ffanalytics data,
 * monitors data quality metrics, and provides manual correction capabilities.
 * 
 * Requirements addressed:
 * - 1.2: Validate data integrity and provide fallbacks
 * - 2.4: Graceful error handling when data is unavailable
 * - 4.1: Ensure data integrity for analytics storage
 */

import { 
  DataValidationError, 
  ERROR_TYPES, 
  getErrorSeverity 
} from './ffAnalyticsErrors.js';

/**
 * Data validation rules and thresholds
 */
const VALIDATION_RULES = {
  // Player data validation
  player: {
    name: {
      required: true,
      minLength: 2,
      maxLength: 100,
      pattern: /^[a-zA-Z\s\-'.]+$/
    },
    position: {
      required: true,
      validValues: ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF']
    },
    team: {
      required: true,
      minLength: 2,
      maxLength: 5,
      pattern: /^[A-Z]{2,5}$/
    }
  },
  
  // Analytics data validation
  analytics: {
    projectedPoints: {
      required: false,
      min: 0,
      max: 100,
      type: 'number'
    },
    weeklyRank: {
      required: false,
      min: 1,
      max: 1000,
      type: 'integer'
    },
    positionRank: {
      required: false,
      min: 1,
      max: 200,
      type: 'integer'
    },
    trendScore: {
      required: false,
      min: -1,
      max: 1,
      type: 'number'
    },
    consistencyRating: {
      required: false,
      min: 0,
      max: 1,
      type: 'number'
    },
    uncertainty: {
      required: false,
      min: 0,
      max: 100,
      type: 'number'
    },
    ceilingScore: {
      required: false,
      min: 0,
      max: 100,
      type: 'number'
    },
    floorScore: {
      required: false,
      min: 0,
      max: 100,
      type: 'number'
    }
  },
  
  // Consistency check thresholds
  consistency: {
    projectedPointsVariance: 50, // Max % difference between ESPN and ffanalytics
    positionMismatchTolerance: 0, // No tolerance for position mismatches
    teamMismatchTolerance: 0, // No tolerance for team mismatches
    nameMatchThreshold: 0.8 // Minimum similarity score for name matching
  },
  
  // Quality metrics thresholds
  quality: {
    minDataCompleteness: 0.7, // 70% of expected fields must be present
    maxOutlierPercentage: 0.05, // Max 5% outliers allowed
    minConsistencyScore: 0.8, // 80% consistency between data sources
    maxValidationErrors: 10 // Max validation errors per batch
  }
};

/**
 * Data quality metrics tracking
 */
class DataQualityMetrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalRecords = 0;
    this.validRecords = 0;
    this.invalidRecords = 0;
    this.missingFields = {};
    this.outliers = [];
    this.consistencyIssues = [];
    this.validationErrors = [];
    this.dataCompleteness = 0;
    this.consistencyScore = 0;
    this.qualityScore = 0;
    this.timestamp = new Date().toISOString();
  }

  addValidationError(error) {
    this.validationErrors.push({
      type: error.type,
      message: error.message,
      context: error.context,
      timestamp: new Date().toISOString()
    });
  }

  addMissingField(fieldName, recordId = null) {
    if (!this.missingFields[fieldName]) {
      this.missingFields[fieldName] = [];
    }
    this.missingFields[fieldName].push(recordId);
  }

  addOutlier(recordId, field, value, expectedRange) {
    this.outliers.push({
      recordId,
      field,
      value,
      expectedRange,
      timestamp: new Date().toISOString()
    });
  }

  addConsistencyIssue(issue) {
    this.consistencyIssues.push({
      ...issue,
      timestamp: new Date().toISOString()
    });
  }

  calculateMetrics() {
    // Data completeness
    this.dataCompleteness = this.totalRecords > 0 
      ? this.validRecords / this.totalRecords 
      : 0;

    // Consistency score
    this.consistencyScore = this.totalRecords > 0 
      ? Math.max(0, 1 - (this.consistencyIssues.length / this.totalRecords))
      : 0;

    // Overall quality score
    const outlierPenalty = this.outliers.length / Math.max(1, this.totalRecords);
    const errorPenalty = this.validationErrors.length / Math.max(1, this.totalRecords);
    
    this.qualityScore = Math.max(0, 
      this.dataCompleteness * 0.4 + 
      this.consistencyScore * 0.4 + 
      Math.max(0, 1 - outlierPenalty) * 0.1 +
      Math.max(0, 1 - errorPenalty) * 0.1
    );
  }

  getReport() {
    this.calculateMetrics();
    
    return {
      summary: {
        totalRecords: this.totalRecords,
        validRecords: this.validRecords,
        invalidRecords: this.invalidRecords,
        dataCompleteness: this.dataCompleteness,
        consistencyScore: this.consistencyScore,
        qualityScore: this.qualityScore,
        timestamp: this.timestamp
      },
      details: {
        missingFields: this.missingFields,
        outliers: this.outliers,
        consistencyIssues: this.consistencyIssues,
        validationErrors: this.validationErrors
      },
      recommendations: this.generateRecommendations()
    };
  }

  generateRecommendations() {
    const recommendations = [];

    if (this.dataCompleteness < VALIDATION_RULES.quality.minDataCompleteness) {
      recommendations.push({
        type: 'DATA_COMPLETENESS',
        priority: 'HIGH',
        message: `Data completeness (${(this.dataCompleteness * 100).toFixed(1)}%) is below threshold (${(VALIDATION_RULES.quality.minDataCompleteness * 100)}%)`,
        action: 'Review data sources and improve data collection'
      });
    }

    if (this.consistencyScore < VALIDATION_RULES.quality.minConsistencyScore) {
      recommendations.push({
        type: 'CONSISTENCY',
        priority: 'MEDIUM',
        message: `Consistency score (${(this.consistencyScore * 100).toFixed(1)}%) is below threshold (${(VALIDATION_RULES.quality.minConsistencyScore * 100)}%)`,
        action: 'Review data source consistency and player matching logic'
      });
    }

    if (this.outliers.length > this.totalRecords * VALIDATION_RULES.quality.maxOutlierPercentage) {
      recommendations.push({
        type: 'OUTLIERS',
        priority: 'MEDIUM',
        message: `Too many outliers detected (${this.outliers.length} out of ${this.totalRecords})`,
        action: 'Review outlier detection rules and investigate data anomalies'
      });
    }

    if (this.validationErrors.length > VALIDATION_RULES.quality.maxValidationErrors) {
      recommendations.push({
        type: 'VALIDATION_ERRORS',
        priority: 'HIGH',
        message: `Too many validation errors (${this.validationErrors.length})`,
        action: 'Review and fix validation errors before processing data'
      });
    }

    return recommendations;
  }
}

/**
 * Main data validator class
 */
export class FFAnalyticsDataValidator {
  constructor(supabaseClient, config = {}) {
    this.client = supabaseClient;
    this.config = {
      ...VALIDATION_RULES,
      ...config
    };
    this.metrics = new DataQualityMetrics();
  }

  /**
   * Validate ffanalytics input data
   * @param {Array} analyticsData - Raw ffanalytics data
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation results
   */
  async validateAnalyticsData(analyticsData, options = {}) {
    const {
      strict = false,
      skipOutlierDetection = false,
      customRules = {}
    } = options;

    this.metrics.reset();
    this.metrics.totalRecords = analyticsData.length;

    const validatedData = [];
    const errors = [];

    for (let i = 0; i < analyticsData.length; i++) {
      const record = analyticsData[i];
      
      // Handle null/undefined records
      if (!record || typeof record !== 'object') {
        this.metrics.invalidRecords++;
        const validationError = new DataValidationError(
          `Invalid record at index ${i}: ${record}`,
          record,
          null,
          { recordId: `record_${i}`, index: i }
        );
        this.metrics.addValidationError(validationError);
        errors.push(validationError);
        continue;
      }

      const recordId = record.id || record.player_name || record.player || `record_${i}`;

      try {
        // Validate individual record
        const validationResult = await this.validateSingleRecord(record, {
          strict,
          customRules,
          recordId
        });

        if (validationResult.isValid) {
          validatedData.push(validationResult.data);
          this.metrics.validRecords++;
        } else {
          this.metrics.invalidRecords++;
          errors.push(...validationResult.errors);
        }

        // Detect outliers if enabled
        if (!skipOutlierDetection && validationResult.isValid) {
          this.detectOutliers(validationResult.data, recordId);
        }

      } catch (error) {
        this.metrics.invalidRecords++;
        const validationError = new DataValidationError(
          `Record validation failed: ${error.message}`,
          record,
          null,
          { recordId, index: i }
        );
        this.metrics.addValidationError(validationError);
        errors.push(validationError);
      }
    }

    const qualityReport = this.metrics.getReport();

    return {
      success: errors.length === 0 || (!strict && this.metrics.validRecords > 0),
      validatedData,
      errors,
      qualityReport,
      summary: {
        totalRecords: analyticsData.length,
        validRecords: this.metrics.validRecords,
        invalidRecords: this.metrics.invalidRecords,
        qualityScore: qualityReport.summary.qualityScore
      }
    };
  }

  /**
   * Validate a single analytics record
   * @private
   */
  async validateSingleRecord(record, options = {}) {
    const { strict = false, customRules = {}, recordId } = options;
    const errors = [];
    const warnings = [];
    const validatedData = { ...record };

    // Validate player information
    const playerValidation = this.validatePlayerInfo(record, recordId);
    errors.push(...playerValidation.errors);
    warnings.push(...playerValidation.warnings);

    // Validate analytics data
    const analyticsValidation = this.validateAnalyticsFields(record, recordId);
    errors.push(...analyticsValidation.errors);
    warnings.push(...analyticsValidation.warnings);

    // Apply custom validation rules
    if (Object.keys(customRules).length > 0) {
      const customValidation = this.applyCustomRules(record, customRules, recordId);
      errors.push(...customValidation.errors);
      warnings.push(...customValidation.warnings);
    }

    // Normalize and clean data
    const normalizedData = this.normalizeRecord(validatedData);

    const isValid = errors.length === 0 || (!strict && errors.every(e => !e.context?.critical));

    return {
      isValid,
      data: normalizedData,
      errors,
      warnings
    };
  }

  /**
   * Validate player information fields
   * @private
   */
  validatePlayerInfo(record, recordId) {
    const errors = [];
    const warnings = [];

    // Player name validation
    const playerName = record.player_name || record.player;
    if (!playerName) {
      errors.push(new DataValidationError(
        'Player name is required',
        record,
        this.config.player.name,
        { recordId, field: 'player_name', critical: true }
      ));
      this.metrics.addMissingField('player_name', recordId);
    } else if (typeof playerName !== 'string' || 
               playerName.length < this.config.player.name.minLength ||
               playerName.length > this.config.player.name.maxLength) {
      errors.push(new DataValidationError(
        `Invalid player name format: ${playerName}`,
        record,
        this.config.player.name,
        { recordId, field: 'player_name', value: playerName }
      ));
    } else if (!this.config.player.name.pattern.test(playerName)) {
      warnings.push({
        type: 'PLAYER_NAME_FORMAT',
        message: `Player name contains unusual characters: ${playerName}`,
        recordId,
        field: 'player_name',
        value: playerName
      });
    }

    // Position validation
    const position = record.position || record.pos;
    if (!position) {
      errors.push(new DataValidationError(
        'Player position is required',
        record,
        this.config.player.position,
        { recordId, field: 'position', critical: true }
      ));
      this.metrics.addMissingField('position', recordId);
    } else if (!this.config.player.position.validValues.includes(position)) {
      errors.push(new DataValidationError(
        `Invalid position: ${position}`,
        record,
        this.config.player.position,
        { recordId, field: 'position', value: position }
      ));
    }

    // Team validation
    const team = record.team;
    if (!team) {
      warnings.push({
        type: 'MISSING_TEAM',
        message: 'Team information is missing',
        recordId,
        field: 'team'
      });
      this.metrics.addMissingField('team', recordId);
    } else if (typeof team !== 'string' || 
               team.length < this.config.player.team.minLength ||
               team.length > this.config.player.team.maxLength) {
      warnings.push({
        type: 'TEAM_FORMAT',
        message: `Invalid team format: ${team}`,
        recordId,
        field: 'team',
        value: team
      });
    }

    return { errors, warnings };
  }

  /**
   * Validate analytics data fields
   * @private
   */
  validateAnalyticsFields(record, recordId) {
    const errors = [];
    const warnings = [];

    // Validate each analytics field
    Object.entries(this.config.analytics).forEach(([fieldName, rules]) => {
      const value = record[fieldName] || record[this.getFieldAlias(fieldName)];

      if (rules.required && (value === null || value === undefined)) {
        errors.push(new DataValidationError(
          `Required field missing: ${fieldName}`,
          record,
          rules,
          { recordId, field: fieldName, critical: false }
        ));
        this.metrics.addMissingField(fieldName, recordId);
        return;
      }

      if (value !== null && value !== undefined) {
        // Type validation
        if (rules.type === 'number' && (typeof value !== 'number' || isNaN(value))) {
          errors.push(new DataValidationError(
            `Invalid number format for ${fieldName}: ${value}`,
            record,
            rules,
            { recordId, field: fieldName, value }
          ));
        } else if (rules.type === 'integer' && (!Number.isInteger(value))) {
          errors.push(new DataValidationError(
            `Invalid integer format for ${fieldName}: ${value}`,
            record,
            rules,
            { recordId, field: fieldName, value }
          ));
        }

        // Range validation
        if (typeof value === 'number' && !isNaN(value)) {
          if (rules.min !== undefined && value < rules.min) {
            warnings.push({
              type: 'VALUE_BELOW_MIN',
              message: `${fieldName} value ${value} is below minimum ${rules.min}`,
              recordId,
              field: fieldName,
              value,
              expectedRange: { min: rules.min, max: rules.max }
            });
          }
          if (rules.max !== undefined && value > rules.max) {
            warnings.push({
              type: 'VALUE_ABOVE_MAX',
              message: `${fieldName} value ${value} is above maximum ${rules.max}`,
              recordId,
              field: fieldName,
              value,
              expectedRange: { min: rules.min, max: rules.max }
            });
          }
        }
      }
    });

    return { errors, warnings };
  }

  /**
   * Apply custom validation rules
   * @private
   */
  applyCustomRules(record, customRules, recordId) {
    const errors = [];
    const warnings = [];

    Object.entries(customRules).forEach(([ruleName, ruleFunction]) => {
      try {
        const result = ruleFunction(record, recordId);
        if (result && !result.valid) {
          if (result.critical) {
            errors.push(new DataValidationError(
              result.message || `Custom rule failed: ${ruleName}`,
              record,
              { ruleName },
              { recordId, customRule: ruleName }
            ));
          } else {
            warnings.push({
              type: 'CUSTOM_RULE_WARNING',
              message: result.message || `Custom rule warning: ${ruleName}`,
              recordId,
              ruleName
            });
          }
        }
      } catch (error) {
        errors.push(new DataValidationError(
          `Custom rule execution failed: ${ruleName} - ${error.message}`,
          record,
          { ruleName },
          { recordId, customRule: ruleName, error: error.message }
        ));
      }
    });

    return { errors, warnings };
  }

  /**
   * Detect outliers in validated data
   * @private
   */
  detectOutliers(record, recordId) {
    const numericFields = ['projectedPoints', 'weeklyRank', 'positionRank', 'trendScore', 'consistencyRating'];
    
    numericFields.forEach(field => {
      const value = record[field];
      if (typeof value === 'number' && !isNaN(value)) {
        const rules = this.config.analytics[field];
        if (rules && rules.min !== undefined && rules.max !== undefined) {
          const range = rules.max - rules.min;
          const outlierThreshold = range * 0.1; // 10% of range
          
          if (value < rules.min - outlierThreshold || value > rules.max + outlierThreshold) {
            this.metrics.addOutlier(recordId, field, value, {
              min: rules.min,
              max: rules.max
            });
          }
        }
      }
    });
  }

  /**
   * Normalize and clean record data
   * @private
   */
  normalizeRecord(record) {
    const normalized = { ...record };

    // Normalize player name
    if (normalized.player_name || normalized.player) {
      normalized.player_name = (normalized.player_name || normalized.player)
        .trim()
        .replace(/\s+/g, ' '); // Replace multiple spaces with single space
    }

    // Normalize position
    if (normalized.position || normalized.pos) {
      normalized.position = (normalized.position || normalized.pos).toUpperCase();
    }

    // Normalize team
    if (normalized.team) {
      normalized.team = normalized.team.toUpperCase().trim();
    }

    // Round numeric values to appropriate precision
    const numericFields = ['projectedPoints', 'trendScore', 'consistencyRating', 'uncertainty'];
    numericFields.forEach(field => {
      if (typeof normalized[field] === 'number' && !isNaN(normalized[field])) {
        normalized[field] = Math.round(normalized[field] * 100) / 100; // 2 decimal places
      }
    });

    return normalized;
  }

  /**
   * Get field alias for backwards compatibility
   * @private
   */
  getFieldAlias(fieldName) {
    const aliases = {
      'projectedPoints': 'points',
      'weeklyRank': 'rank',
      'positionRank': 'pos_rank',
      'player_name': 'player',
      'position': 'pos'
    };
    return aliases[fieldName] || fieldName;
  }

  /**
   * Check consistency between ESPN and ffanalytics data
   * @param {Array} espnPlayers - ESPN player data
   * @param {Array} ffanalyticsPlayers - FFAnalytics player data
   * @param {Object} options - Consistency check options
   * @returns {Promise<Object>} Consistency check results
   */
  async checkDataConsistency(espnPlayers, ffanalyticsPlayers, options = {}) {
    const {
      checkProjections = true,
      checkPositions = true,
      checkTeams = true,
      toleranceLevel = 'medium'
    } = options;

    const consistencyIssues = [];
    const matchedPairs = [];
    const unmatchedEspn = [];
    const unmatchedFFAnalytics = [];

    // Create lookup maps
    const espnMap = new Map();
    espnPlayers.forEach(player => {
      const key = this.createPlayerKey(player.name, player.position, player.team_abbreviation);
      espnMap.set(key, player);
    });

    const ffanalyticsMap = new Map();
    ffanalyticsPlayers.forEach(player => {
      const key = this.createPlayerKey(player.player_name || player.player, player.position || player.pos, player.team);
      ffanalyticsMap.set(key, player);
    });

    // Find matches and check consistency
    for (const [key, espnPlayer] of espnMap) {
      const ffanalyticsPlayer = ffanalyticsMap.get(key);
      
      if (ffanalyticsPlayer) {
        matchedPairs.push({ espnPlayer, ffanalyticsPlayer });
        
        // Check consistency for matched pairs
        const issues = this.checkPlayerConsistency(espnPlayer, ffanalyticsPlayer, {
          checkProjections,
          checkPositions,
          checkTeams,
          toleranceLevel
        });
        
        consistencyIssues.push(...issues);
      } else {
        unmatchedEspn.push(espnPlayer);
      }
    }

    // Find unmatched ffanalytics players
    for (const [key, ffanalyticsPlayer] of ffanalyticsMap) {
      if (!espnMap.has(key)) {
        unmatchedFFAnalytics.push(ffanalyticsPlayer);
      }
    }

    // Calculate consistency metrics
    const totalPlayers = Math.max(espnPlayers.length, ffanalyticsPlayers.length);
    const matchRate = totalPlayers > 0 ? matchedPairs.length / totalPlayers : 0;
    const consistencyRate = matchedPairs.length > 0 
      ? Math.max(0, 1 - (consistencyIssues.length / matchedPairs.length))
      : 0;

    return {
      summary: {
        totalEspnPlayers: espnPlayers.length,
        totalFFAnalyticsPlayers: ffanalyticsPlayers.length,
        matchedPairs: matchedPairs.length,
        unmatchedEspn: unmatchedEspn.length,
        unmatchedFFAnalytics: unmatchedFFAnalytics.length,
        consistencyIssues: consistencyIssues.length,
        matchRate,
        consistencyRate
      },
      details: {
        matchedPairs,
        unmatchedEspn,
        unmatchedFFAnalytics,
        consistencyIssues
      },
      recommendations: this.generateConsistencyRecommendations(matchRate, consistencyRate, consistencyIssues)
    };
  }

  /**
   * Check consistency between individual ESPN and ffanalytics player records
   * @private
   */
  checkPlayerConsistency(espnPlayer, ffanalyticsPlayer, options) {
    const issues = [];
    const { checkProjections, checkPositions, checkTeams, toleranceLevel } = options;

    // Position consistency
    if (checkPositions) {
      const espnPos = espnPlayer.position;
      const ffPos = ffanalyticsPlayer.position || ffanalyticsPlayer.pos;
      
      if (espnPos !== ffPos) {
        issues.push({
          type: 'POSITION_MISMATCH',
          playerId: espnPlayer.id,
          playerName: espnPlayer.name,
          espnValue: espnPos,
          ffanalyticsValue: ffPos,
          severity: 'HIGH'
        });
        this.metrics.addConsistencyIssue({
          type: 'POSITION_MISMATCH',
          playerId: espnPlayer.id,
          playerName: espnPlayer.name,
          espnValue: espnPos,
          ffanalyticsValue: ffPos
        });
      }
    }

    // Team consistency
    if (checkTeams) {
      const espnTeam = espnPlayer.team_abbreviation;
      const ffTeam = ffanalyticsPlayer.team;
      
      if (espnTeam && ffTeam && espnTeam !== ffTeam) {
        issues.push({
          type: 'TEAM_MISMATCH',
          playerId: espnPlayer.id,
          playerName: espnPlayer.name,
          espnValue: espnTeam,
          ffanalyticsValue: ffTeam,
          severity: 'MEDIUM'
        });
        this.metrics.addConsistencyIssue({
          type: 'TEAM_MISMATCH',
          playerId: espnPlayer.id,
          playerName: espnPlayer.name,
          espnValue: espnTeam,
          ffanalyticsValue: ffTeam
        });
      }
    }

    // Projection consistency
    if (checkProjections) {
      const espnProjection = espnPlayer.season_projected_points || 0;
      const ffProjection = ffanalyticsPlayer.projectedPoints || ffanalyticsPlayer.points || 0;
      
      if (espnProjection > 0 && ffProjection > 0) {
        const variance = Math.abs(espnProjection - ffProjection) / Math.max(espnProjection, ffProjection);
        const threshold = this.getToleranceThreshold(toleranceLevel);
        
        if (variance > threshold) {
          issues.push({
            type: 'PROJECTION_VARIANCE',
            playerId: espnPlayer.id,
            playerName: espnPlayer.name,
            espnValue: espnProjection,
            ffanalyticsValue: ffProjection,
            variance: variance,
            threshold: threshold,
            severity: variance > threshold * 2 ? 'HIGH' : 'MEDIUM'
          });
          this.metrics.addConsistencyIssue({
            type: 'PROJECTION_VARIANCE',
            playerId: espnPlayer.id,
            playerName: espnPlayer.name,
            variance: variance,
            threshold: threshold
          });
        }
      }
    }

    return issues;
  }

  /**
   * Create a player key for matching
   * @private
   */
  createPlayerKey(name, position, team) {
    const normalizedName = (name || '').toLowerCase().replace(/[^a-z]/g, '');
    const normalizedPos = (position || '').toUpperCase();
    const normalizedTeam = (team || '').toUpperCase();
    return `${normalizedName}_${normalizedPos}_${normalizedTeam}`;
  }

  /**
   * Get tolerance threshold based on level
   * @private
   */
  getToleranceThreshold(level) {
    const thresholds = {
      strict: 0.1,   // 10%
      medium: 0.25,  // 25%
      loose: 0.5     // 50%
    };
    return thresholds[level] || thresholds.medium;
  }

  /**
   * Generate consistency recommendations
   * @private
   */
  generateConsistencyRecommendations(matchRate, consistencyRate, issues) {
    const recommendations = [];

    if (matchRate < 0.8) {
      recommendations.push({
        type: 'LOW_MATCH_RATE',
        priority: 'HIGH',
        message: `Low match rate (${(matchRate * 100).toFixed(1)}%) between ESPN and ffanalytics data`,
        action: 'Review player matching algorithm and data source consistency'
      });
    }

    if (consistencyRate < 0.7) {
      recommendations.push({
        type: 'LOW_CONSISTENCY',
        priority: 'MEDIUM',
        message: `Low consistency rate (${(consistencyRate * 100).toFixed(1)}%) between data sources`,
        action: 'Investigate data source differences and adjust tolerance levels'
      });
    }

    // Analyze issue types
    const issueTypes = {};
    issues.forEach(issue => {
      issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
    });

    Object.entries(issueTypes).forEach(([type, count]) => {
      if (count > 5) {
        recommendations.push({
          type: `HIGH_${type}_COUNT`,
          priority: 'MEDIUM',
          message: `High number of ${type} issues (${count})`,
          action: `Review ${type.toLowerCase()} data consistency and validation rules`
        });
      }
    });

    return recommendations;
  }

  /**
   * Get current data quality metrics
   * @returns {Object} Current quality metrics
   */
  getQualityMetrics() {
    return this.metrics.getReport();
  }

  /**
   * Reset quality metrics
   */
  resetMetrics() {
    this.metrics.reset();
  }
}

export default FFAnalyticsDataValidator;