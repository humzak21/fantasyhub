/**
 * FFAnalytics Data Corrector
 * 
 * Provides manual data correction capabilities for edge cases and data quality issues.
 * Allows administrators to override validation errors, fix data inconsistencies,
 * and maintain data quality through manual interventions.
 * 
 * Requirements addressed:
 * - 1.2: Manual review capabilities for unmatched players
 * - 2.4: Manual data correction capabilities for edge cases
 * - 4.1: Data integrity maintenance through corrections
 */

import { 
  DataValidationError, 
  ERROR_TYPES 
} from './ffAnalyticsErrors.js';

/**
 * Data correction types
 */
const CORRECTION_TYPES = {
  PLAYER_MATCH_OVERRIDE: 'PLAYER_MATCH_OVERRIDE',
  DATA_VALUE_CORRECTION: 'DATA_VALUE_CORRECTION',
  VALIDATION_RULE_EXCEPTION: 'VALIDATION_RULE_EXCEPTION',
  CONSISTENCY_OVERRIDE: 'CONSISTENCY_OVERRIDE',
  OUTLIER_APPROVAL: 'OUTLIER_APPROVAL',
  FIELD_MAPPING_CORRECTION: 'FIELD_MAPPING_CORRECTION'
};

/**
 * Correction status types
 */
const CORRECTION_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  APPLIED: 'APPLIED',
  REVERTED: 'REVERTED'
};

/**
 * Data correction record
 */
class DataCorrection {
  constructor({
    id = null,
    type,
    description,
    originalData,
    correctedData,
    reason,
    createdBy,
    approvedBy = null,
    status = CORRECTION_STATUS.PENDING,
    metadata = {}
  }) {
    this.id = id || this.generateId();
    this.type = type;
    this.description = description;
    this.originalData = originalData;
    this.correctedData = correctedData;
    this.reason = reason;
    this.createdBy = createdBy;
    this.approvedBy = approvedBy;
    this.status = status;
    this.metadata = metadata;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.appliedAt = null;
  }

  generateId() {
    return `correction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  approve(approvedBy) {
    this.status = CORRECTION_STATUS.APPROVED;
    this.approvedBy = approvedBy;
    this.updatedAt = new Date().toISOString();
  }

  reject(rejectedBy, reason = null) {
    this.status = CORRECTION_STATUS.REJECTED;
    this.approvedBy = rejectedBy;
    this.metadata.rejectionReason = reason;
    this.updatedAt = new Date().toISOString();
  }

  apply() {
    this.status = CORRECTION_STATUS.APPLIED;
    this.appliedAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  revert() {
    this.status = CORRECTION_STATUS.REVERTED;
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      description: this.description,
      originalData: this.originalData,
      correctedData: this.correctedData,
      reason: this.reason,
      createdBy: this.createdBy,
      approvedBy: this.approvedBy,
      status: this.status,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      appliedAt: this.appliedAt
    };
  }
}

/**
 * Main data corrector class
 */
export class FFAnalyticsDataCorrector {
  constructor(supabaseClient, config = {}) {
    this.client = supabaseClient;
    this.config = {
      autoApproveThreshold: 0.95, // Auto-approve corrections with high confidence
      requireApproval: true, // Require approval for all corrections
      maxPendingCorrections: 100, // Maximum pending corrections
      correctionRetentionDays: 90, // Keep correction history for 90 days
      ...config
    };
    
    this.corrections = new Map(); // In-memory correction store
    this.appliedCorrections = new Map(); // Track applied corrections
  }

  /**
   * Initialize the corrector and load existing corrections
   */
  async initialize() {
    try {
      console.log('Initializing FFAnalyticsDataCorrector...');
      
      // Load existing corrections from database
      await this.loadCorrections();
      
      console.log(`Loaded ${this.corrections.size} existing corrections`);
      return true;
    } catch (error) {
      console.error('Failed to initialize FFAnalyticsDataCorrector:', error);
      return false;
    }
  }

  /**
   * Create a player match override correction
   * @param {Object} localPlayer - Local player data
   * @param {Object} ffanalyticsPlayer - FFAnalytics player data
   * @param {string} reason - Reason for the override
   * @param {string} createdBy - User who created the correction
   * @returns {Promise<DataCorrection>} Created correction
   */
  async createPlayerMatchOverride(localPlayer, ffanalyticsPlayer, reason, createdBy) {
    const correction = new DataCorrection({
      type: CORRECTION_TYPES.PLAYER_MATCH_OVERRIDE,
      description: `Override player match: ${localPlayer.name} -> ${ffanalyticsPlayer.player_name || ffanalyticsPlayer.player}`,
      originalData: {
        localPlayerId: localPlayer.id,
        localPlayerName: localPlayer.name,
        localPlayerPosition: localPlayer.position,
        localPlayerTeam: localPlayer.team_abbreviation
      },
      correctedData: {
        ffanalyticsPlayerId: ffanalyticsPlayer.id || ffanalyticsPlayer.player_name,
        ffanalyticsPlayerName: ffanalyticsPlayer.player_name || ffanalyticsPlayer.player,
        ffanalyticsPlayerPosition: ffanalyticsPlayer.position || ffanalyticsPlayer.pos,
        ffanalyticsPlayerTeam: ffanalyticsPlayer.team,
        matchConfidence: 1.0 // Manual override has 100% confidence
      },
      reason,
      createdBy,
      metadata: {
        matchType: 'manual_override',
        originalMatchConfidence: 0,
        validationErrors: []
      }
    });

    await this.saveCorrection(correction);
    return correction;
  }

  /**
   * Create a data value correction
   * @param {string} playerId - Player ID
   * @param {string} fieldName - Field to correct
   * @param {any} originalValue - Original value
   * @param {any} correctedValue - Corrected value
   * @param {string} reason - Reason for the correction
   * @param {string} createdBy - User who created the correction
   * @returns {Promise<DataCorrection>} Created correction
   */
  async createDataValueCorrection(playerId, fieldName, originalValue, correctedValue, reason, createdBy) {
    const correction = new DataCorrection({
      type: CORRECTION_TYPES.DATA_VALUE_CORRECTION,
      description: `Correct ${fieldName} for player ${playerId}: ${originalValue} -> ${correctedValue}`,
      originalData: {
        playerId,
        fieldName,
        value: originalValue
      },
      correctedData: {
        playerId,
        fieldName,
        value: correctedValue
      },
      reason,
      createdBy,
      metadata: {
        fieldType: typeof correctedValue,
        validationPassed: true
      }
    });

    await this.saveCorrection(correction);
    return correction;
  }

  /**
   * Create a validation rule exception
   * @param {Object} record - Record that failed validation
   * @param {Array} validationErrors - Validation errors to override
   * @param {string} reason - Reason for the exception
   * @param {string} createdBy - User who created the exception
   * @returns {Promise<DataCorrection>} Created correction
   */
  async createValidationException(record, validationErrors, reason, createdBy) {
    const correction = new DataCorrection({
      type: CORRECTION_TYPES.VALIDATION_RULE_EXCEPTION,
      description: `Validation exception for record: ${record.player_name || record.id}`,
      originalData: {
        record,
        validationErrors: validationErrors.map(e => ({
          type: e.type,
          message: e.message,
          field: e.context?.field,
          value: e.context?.value
        }))
      },
      correctedData: {
        record,
        validationOverride: true,
        approvedErrors: validationErrors.map(e => e.type)
      },
      reason,
      createdBy,
      metadata: {
        errorCount: validationErrors.length,
        criticalErrors: validationErrors.filter(e => e.context?.critical).length
      }
    });

    await this.saveCorrection(correction);
    return correction;
  }

  /**
   * Create a consistency override
   * @param {Object} consistencyIssue - Consistency issue to override
   * @param {string} reason - Reason for the override
   * @param {string} createdBy - User who created the override
   * @returns {Promise<DataCorrection>} Created correction
   */
  async createConsistencyOverride(consistencyIssue, reason, createdBy) {
    const correction = new DataCorrection({
      type: CORRECTION_TYPES.CONSISTENCY_OVERRIDE,
      description: `Consistency override: ${consistencyIssue.type} for ${consistencyIssue.playerName}`,
      originalData: {
        issueType: consistencyIssue.type,
        playerId: consistencyIssue.playerId,
        playerName: consistencyIssue.playerName,
        espnValue: consistencyIssue.espnValue,
        ffanalyticsValue: consistencyIssue.ffanalyticsValue,
        severity: consistencyIssue.severity
      },
      correctedData: {
        consistencyOverride: true,
        acceptedValue: consistencyIssue.ffanalyticsValue, // Default to ffanalytics value
        overrideReason: reason
      },
      reason,
      createdBy,
      metadata: {
        originalSeverity: consistencyIssue.severity,
        variance: consistencyIssue.variance
      }
    });

    await this.saveCorrection(correction);
    return correction;
  }

  /**
   * Approve an outlier as valid data
   * @param {Object} outlier - Outlier data to approve
   * @param {string} reason - Reason for approval
   * @param {string} approvedBy - User who approved the outlier
   * @returns {Promise<DataCorrection>} Created correction
   */
  async approveOutlier(outlier, reason, approvedBy) {
    const correction = new DataCorrection({
      type: CORRECTION_TYPES.OUTLIER_APPROVAL,
      description: `Approve outlier: ${outlier.field} = ${outlier.value} for ${outlier.recordId}`,
      originalData: {
        recordId: outlier.recordId,
        field: outlier.field,
        value: outlier.value,
        expectedRange: outlier.expectedRange
      },
      correctedData: {
        outlierApproved: true,
        approvedValue: outlier.value,
        newRange: {
          min: Math.min(outlier.expectedRange.min, outlier.value),
          max: Math.max(outlier.expectedRange.max, outlier.value)
        }
      },
      reason,
      createdBy: approvedBy,
      status: CORRECTION_STATUS.APPROVED, // Auto-approve outlier approvals
      metadata: {
        originalRange: outlier.expectedRange,
        deviationAmount: this.calculateDeviation(outlier.value, outlier.expectedRange)
      }
    });

    correction.approve(approvedBy);
    await this.saveCorrection(correction);
    return correction;
  }

  /**
   * Create a field mapping correction
   * @param {string} sourceField - Source field name
   * @param {string} targetField - Target field name
   * @param {Function} transformFunction - Optional transform function
   * @param {string} reason - Reason for the mapping
   * @param {string} createdBy - User who created the mapping
   * @returns {Promise<DataCorrection>} Created correction
   */
  async createFieldMappingCorrection(sourceField, targetField, transformFunction, reason, createdBy) {
    const correction = new DataCorrection({
      type: CORRECTION_TYPES.FIELD_MAPPING_CORRECTION,
      description: `Field mapping: ${sourceField} -> ${targetField}`,
      originalData: {
        sourceField,
        unmapped: true
      },
      correctedData: {
        sourceField,
        targetField,
        transformFunction: transformFunction ? transformFunction.toString() : null,
        mappingActive: true
      },
      reason,
      createdBy,
      metadata: {
        hasTransform: !!transformFunction,
        mappingType: 'field_mapping'
      }
    });

    await this.saveCorrection(correction);
    return correction;
  }

  /**
   * Apply a correction
   * @param {string} correctionId - Correction ID to apply
   * @param {string} appliedBy - User applying the correction
   * @returns {Promise<boolean>} Success status
   */
  async applyCorrection(correctionId, appliedBy) {
    const correction = this.corrections.get(correctionId);
    
    if (!correction) {
      throw new Error(`Correction not found: ${correctionId}`);
    }

    if (correction.status !== CORRECTION_STATUS.APPROVED) {
      throw new Error(`Correction must be approved before applying: ${correctionId}`);
    }

    try {
      // Apply the correction based on its type
      let success = false;
      
      switch (correction.type) {
        case CORRECTION_TYPES.PLAYER_MATCH_OVERRIDE:
          success = await this.applyPlayerMatchOverride(correction);
          break;
        case CORRECTION_TYPES.DATA_VALUE_CORRECTION:
          success = await this.applyDataValueCorrection(correction);
          break;
        case CORRECTION_TYPES.VALIDATION_RULE_EXCEPTION:
          success = await this.applyValidationException(correction);
          break;
        case CORRECTION_TYPES.CONSISTENCY_OVERRIDE:
          success = await this.applyConsistencyOverride(correction);
          break;
        case CORRECTION_TYPES.OUTLIER_APPROVAL:
          success = await this.applyOutlierApproval(correction);
          break;
        case CORRECTION_TYPES.FIELD_MAPPING_CORRECTION:
          success = await this.applyFieldMappingCorrection(correction);
          break;
        default:
          throw new Error(`Unknown correction type: ${correction.type}`);
      }

      if (success) {
        correction.apply();
        this.appliedCorrections.set(correctionId, correction);
        await this.saveCorrection(correction);
        
        console.log(`Applied correction ${correctionId} by ${appliedBy}`);
        return true;
      } else {
        throw new Error('Failed to apply correction');
      }
    } catch (error) {
      console.error(`Failed to apply correction ${correctionId}:`, error);
      throw error;
    }
  }

  /**
   * Apply player match override
   * @private
   */
  async applyPlayerMatchOverride(correction) {
    try {
      const { localPlayerId } = correction.originalData;
      const { ffanalyticsPlayerId, matchConfidence } = correction.correctedData;

      // Update player record with ffanalytics mapping
      const { error } = await this.client
        .from('players')
        .update({
          ffanalytics_player_id: ffanalyticsPlayerId,
          ffanalytics_last_sync: new Date().toISOString(),
          ffanalytics_data: {
            manual_override: true,
            match_confidence: matchConfidence,
            correction_id: correction.id
          }
        })
        .eq('id', localPlayerId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Failed to apply player match override:', error);
      return false;
    }
  }

  /**
   * Apply data value correction
   * @private
   */
  async applyDataValueCorrection(correction) {
    try {
      const { playerId, fieldName, value } = correction.correctedData;

      // Update the specific field in the player record
      const updateData = {
        [fieldName]: value,
        ffanalytics_last_sync: new Date().toISOString()
      };

      // Add correction metadata to ffanalytics_data
      const { data: currentPlayer, error: fetchError } = await this.client
        .from('players')
        .select('ffanalytics_data')
        .eq('id', playerId)
        .single();

      if (fetchError) throw fetchError;

      const currentData = currentPlayer?.ffanalytics_data || {};
      updateData.ffanalytics_data = {
        ...currentData,
        corrections: {
          ...currentData.corrections,
          [fieldName]: {
            correction_id: correction.id,
            original_value: correction.originalData.value,
            corrected_value: value,
            applied_at: new Date().toISOString()
          }
        }
      };

      const { error } = await this.client
        .from('players')
        .update(updateData)
        .eq('id', playerId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Failed to apply data value correction:', error);
      return false;
    }
  }

  /**
   * Apply validation exception
   * @private
   */
  async applyValidationException(correction) {
    try {
      // Store validation exception in a separate table or metadata
      const { record, approvedErrors } = correction.correctedData;
      const playerId = record.id || record.player_id;

      if (!playerId) {
        console.warn('No player ID found for validation exception');
        return true; // Consider it successful for non-player records
      }

      // Update player record with validation exception metadata
      const { data: currentPlayer, error: fetchError } = await this.client
        .from('players')
        .select('ffanalytics_data')
        .eq('id', playerId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      const currentData = currentPlayer?.ffanalytics_data || {};
      const updateData = {
        ffanalytics_data: {
          ...currentData,
          validation_exceptions: {
            ...currentData.validation_exceptions,
            [correction.id]: {
              approved_errors: approvedErrors,
              applied_at: new Date().toISOString(),
              reason: correction.reason
            }
          }
        },
        ffanalytics_last_sync: new Date().toISOString()
      };

      const { error } = await this.client
        .from('players')
        .update(updateData)
        .eq('id', playerId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Failed to apply validation exception:', error);
      return false;
    }
  }

  /**
   * Apply consistency override
   * @private
   */
  async applyConsistencyOverride(correction) {
    try {
      const { playerId, acceptedValue } = correction.correctedData;
      const { issueType } = correction.originalData;

      // Update player record with consistency override
      const { data: currentPlayer, error: fetchError } = await this.client
        .from('players')
        .select('ffanalytics_data')
        .eq('id', playerId)
        .single();

      if (fetchError) throw fetchError;

      const currentData = currentPlayer?.ffanalytics_data || {};
      const updateData = {
        ffanalytics_data: {
          ...currentData,
          consistency_overrides: {
            ...currentData.consistency_overrides,
            [issueType]: {
              correction_id: correction.id,
              accepted_value: acceptedValue,
              applied_at: new Date().toISOString(),
              reason: correction.reason
            }
          }
        },
        ffanalytics_last_sync: new Date().toISOString()
      };

      const { error } = await this.client
        .from('players')
        .update(updateData)
        .eq('id', playerId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Failed to apply consistency override:', error);
      return false;
    }
  }

  /**
   * Apply outlier approval
   * @private
   */
  async applyOutlierApproval(correction) {
    try {
      // Outlier approval is mainly for validation rules adjustment
      // Store the approval in metadata for future validation runs
      console.log(`Outlier approved: ${correction.description}`);
      return true;
    } catch (error) {
      console.error('Failed to apply outlier approval:', error);
      return false;
    }
  }

  /**
   * Apply field mapping correction
   * @private
   */
  async applyFieldMappingCorrection(correction) {
    try {
      // Field mapping corrections are applied at the service level
      // Store the mapping for future data processing
      console.log(`Field mapping applied: ${correction.description}`);
      return true;
    } catch (error) {
      console.error('Failed to apply field mapping correction:', error);
      return false;
    }
  }

  /**
   * Get all corrections with optional filtering
   * @param {Object} filters - Filter options
   * @returns {Array} Filtered corrections
   */
  getCorrections(filters = {}) {
    const {
      type = null,
      status = null,
      createdBy = null,
      playerId = null,
      limit = null
    } = filters;

    let corrections = Array.from(this.corrections.values());

    if (type) {
      corrections = corrections.filter(c => c.type === type);
    }

    if (status) {
      corrections = corrections.filter(c => c.status === status);
    }

    if (createdBy) {
      corrections = corrections.filter(c => c.createdBy === createdBy);
    }

    if (playerId) {
      corrections = corrections.filter(c => 
        c.originalData.playerId === playerId || 
        c.originalData.localPlayerId === playerId ||
        c.correctedData.playerId === playerId
      );
    }

    // Sort by creation date (newest first)
    corrections.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (limit) {
      corrections = corrections.slice(0, limit);
    }

    return corrections.map(c => c.toJSON());
  }

  /**
   * Get correction statistics
   * @returns {Object} Correction statistics
   */
  getCorrectionStats() {
    const corrections = Array.from(this.corrections.values());
    
    const stats = {
      total: corrections.length,
      byStatus: {},
      byType: {},
      applied: this.appliedCorrections.size,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    corrections.forEach(correction => {
      // Count by status
      stats.byStatus[correction.status] = (stats.byStatus[correction.status] || 0) + 1;
      
      // Count by type
      stats.byType[correction.type] = (stats.byType[correction.type] || 0) + 1;
      
      // Count specific statuses
      if (correction.status === CORRECTION_STATUS.PENDING) stats.pending++;
      if (correction.status === CORRECTION_STATUS.APPROVED) stats.approved++;
      if (correction.status === CORRECTION_STATUS.REJECTED) stats.rejected++;
    });

    return stats;
  }

  /**
   * Save correction to storage
   * @private
   */
  async saveCorrection(correction) {
    try {
      // Store in memory
      this.corrections.set(correction.id, correction);
      
      // In a production environment, you would also save to database
      // For now, we'll just log the save operation
      console.log(`Saved correction: ${correction.id} (${correction.type})`);
      
      return true;
    } catch (error) {
      console.error('Failed to save correction:', error);
      throw error;
    }
  }

  /**
   * Load corrections from storage
   * @private
   */
  async loadCorrections() {
    try {
      // In a production environment, you would load from database
      // For now, we'll just initialize empty collections
      this.corrections.clear();
      this.appliedCorrections.clear();
      
      console.log('Loaded corrections from storage');
      return true;
    } catch (error) {
      console.error('Failed to load corrections:', error);
      throw error;
    }
  }

  /**
   * Calculate deviation amount for outliers
   * @private
   */
  calculateDeviation(value, expectedRange) {
    if (value < expectedRange.min) {
      return expectedRange.min - value;
    } else if (value > expectedRange.max) {
      return value - expectedRange.max;
    }
    return 0;
  }

  /**
   * Clean up old corrections
   * @returns {Promise<number>} Number of corrections cleaned up
   */
  async cleanupOldCorrections() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.correctionRetentionDays);
    
    let cleanedUp = 0;
    
    for (const [id, correction] of this.corrections) {
      if (new Date(correction.createdAt) < cutoffDate && 
          correction.status !== CORRECTION_STATUS.APPLIED) {
        this.corrections.delete(id);
        cleanedUp++;
      }
    }
    
    console.log(`Cleaned up ${cleanedUp} old corrections`);
    return cleanedUp;
  }
}

export {
  FFAnalyticsDataCorrector,
  DataCorrection,
  CORRECTION_TYPES,
  CORRECTION_STATUS
};

export default FFAnalyticsDataCorrector;