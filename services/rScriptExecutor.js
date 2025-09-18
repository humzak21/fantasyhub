import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Error types for R script execution
 */
export const R_ERROR_TYPES = {
  TIMEOUT: 'TIMEOUT',
  SCRIPT_NOT_FOUND: 'SCRIPT_NOT_FOUND',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  PARSING_FAILED: 'PARSING_FAILED',
  ENVIRONMENT_ERROR: 'ENVIRONMENT_ERROR',
  INVALID_ARGUMENTS: 'INVALID_ARGUMENTS'
};

/**
 * Custom error class for R script execution
 */
export class RScriptError extends Error {
  constructor(message, type, retryable = false, details = {}) {
    super(message);
    this.name = 'RScriptError';
    this.type = type;
    this.retryable = retryable;
    this.details = details;
  }
}

/**
 * Enhanced R Script Executor service for ffanalytics integration
 * Provides robust R script execution with timeout handling, error recovery,
 * logging, monitoring, and data parsing capabilities
 */
export class RScriptExecutor {
  constructor(config = {}) {
    this.config = {
      rExecutable: config.rExecutable || process.env.R_EXECUTABLE_PATH || 'Rscript',
      scriptsPath: config.scriptsPath || process.env.FFANALYTICS_SCRIPTS_PATH || path.join(__dirname, '../scripts/ffanalytics'),
      timeout: config.timeout || 300000, // 5 minutes default
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 5000, // 5 seconds
      enableLogging: config.enableLogging !== false,
      ...config
    };
    
    this.executionStats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      lastExecutionTime: null
    };
  }

  /**
   * Execute an R script with comprehensive error handling and monitoring
   * @param {string} scriptName - Name of the R script (with or without .R extension)
   * @param {Array} args - Arguments to pass to the script
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Execution result with parsed data
   */
  async executeScript(scriptName, args = [], options = {}) {
    const startTime = Date.now();
    const executionId = this._generateExecutionId();
    
    try {
      this._logExecution('info', `Starting R script execution: ${scriptName}`, { executionId, args });
      
      // Validate script exists
      const scriptPath = await this._validateScript(scriptName);
      
      // Prepare execution options
      const execOptions = {
        timeout: options.timeout || this.config.timeout,
        retries: options.retries !== undefined ? options.retries : this.config.maxRetries,
        parseJson: options.parseJson !== false,
        ...options
      };
      
      // Execute with retry logic
      const result = await this._executeWithRetry(scriptPath, args, execOptions, executionId);
      
      // Update statistics
      const executionTime = Date.now() - startTime;
      this._updateStats(true, executionTime);
      
      this._logExecution('info', `R script execution completed successfully: ${scriptName}`, {
        executionId,
        executionTime,
        dataSize: result.data ? JSON.stringify(result.data).length : 0
      });
      
      return {
        ...result,
        executionId,
        executionTime,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this._updateStats(false, executionTime);
      
      this._logExecution('error', `R script execution failed: ${scriptName}`, {
        executionId,
        error: error.message,
        type: error.type,
        executionTime
      });
      
      throw error;
    }
  }

  /**
   * Execute R script with retry logic
   * @private
   */
  async _executeWithRetry(scriptPath, args, options, executionId) {
    let lastError;
    
    for (let attempt = 1; attempt <= options.retries + 1; attempt++) {
      try {
        if (attempt > 1) {
          this._logExecution('warn', `Retrying R script execution (attempt ${attempt})`, { executionId });
          await this._delay(this.config.retryDelay * (attempt - 1)); // Exponential backoff
        }
        
        const result = await this._executeRScript(scriptPath, args, options);
        
        if (attempt > 1) {
          this._logExecution('info', `R script execution succeeded on retry attempt ${attempt}`, { executionId });
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        if (!error.retryable || attempt > options.retries) {
          break;
        }
        
        this._logExecution('warn', `R script execution failed, will retry: ${error.message}`, {
          executionId,
          attempt,
          maxRetries: options.retries
        });
      }
    }
    
    throw lastError;
  }

  /**
   * Core R script execution method
   * @private
   */
  async _executeRScript(scriptPath, args, options) {
    return new Promise((resolve, reject) => {
      const rProcess = spawn(this.config.rExecutable, [scriptPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: options.timeout,
        env: { ...process.env, ...options.env }
      });
      
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      
      // Set up timeout handling
      const timeoutId = setTimeout(() => {
        timedOut = true;
        rProcess.kill('SIGTERM');
        
        // Force kill if SIGTERM doesn't work
        setTimeout(() => {
          if (!rProcess.killed) {
            rProcess.kill('SIGKILL');
          }
        }, 5000);
      }, options.timeout);
      
      rProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      rProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      rProcess.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        
        if (timedOut) {
          reject(new RScriptError(
            `R script execution timed out after ${options.timeout}ms`,
            R_ERROR_TYPES.TIMEOUT,
            true,
            { timeout: options.timeout, signal }
          ));
          return;
        }
        
        const result = {
          success: code === 0,
          code,
          signal,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          data: null
        };
        
        if (code === 0) {
          // Parse output data if requested
          if (options.parseJson) {
            try {
              result.data = this._parseScriptOutput(stdout);
            } catch (parseError) {
              reject(new RScriptError(
                `Failed to parse R script output: ${parseError.message}`,
                R_ERROR_TYPES.PARSING_FAILED,
                false,
                { parseError: parseError.message, stdout }
              ));
              return;
            }
          }
          
          resolve(result);
        } else {
          const errorMessage = stderr || `R script failed with exit code ${code}`;
          const isRetryable = this._isRetryableError(stderr, code);
          
          reject(new RScriptError(
            errorMessage,
            R_ERROR_TYPES.EXECUTION_FAILED,
            isRetryable,
            { code, signal, stderr, stdout }
          ));
        }
      });
      
      rProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        
        let errorType = R_ERROR_TYPES.EXECUTION_FAILED;
        let retryable = false;
        
        if (error.code === 'ENOENT') {
          errorType = R_ERROR_TYPES.ENVIRONMENT_ERROR;
          retryable = false;
        } else if (error.code === 'ETIMEDOUT') {
          errorType = R_ERROR_TYPES.TIMEOUT;
          retryable = true;
        }
        
        reject(new RScriptError(
          `R script process error: ${error.message}`,
          errorType,
          retryable,
          { originalError: error }
        ));
      });
    });
  }

  /**
   * Parse R script output to extract structured data
   * @private
   */
  _parseScriptOutput(stdout) {
    if (!stdout || stdout.trim() === '') {
      return null;
    }
    
    const lines = stdout.split('\n');
    
    // Look for complete JSON objects or arrays in the output
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Try to parse each line as JSON
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return JSON.parse(trimmed);
        } catch (error) {
          // Continue to next line if this one doesn't parse
        }
      }
    }
    
    // Look for multi-line JSON blocks
    const jsonLines = [];
    let inJsonBlock = false;
    let braceCount = 0;
    let bracketCount = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!inJsonBlock && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
        inJsonBlock = true;
        jsonLines.push(line);
        braceCount += (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;
        bracketCount += (trimmed.match(/\[/g) || []).length - (trimmed.match(/\]/g) || []).length;
      } else if (inJsonBlock) {
        jsonLines.push(line);
        braceCount += (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;
        bracketCount += (trimmed.match(/\[/g) || []).length - (trimmed.match(/\]/g) || []).length;
        
        // Check if we've closed all braces and brackets
        if (braceCount <= 0 && bracketCount <= 0) {
          break;
        }
      }
    }
    
    if (jsonLines.length > 0) {
      try {
        const jsonString = jsonLines.join('\n');
        return JSON.parse(jsonString);
      } catch (error) {
        // If JSON parsing fails, try to extract data from R output format
        return this._parseRDataOutput(stdout);
      }
    }
    
    // Try to parse R data output format
    return this._parseRDataOutput(stdout);
  }

  /**
   * Parse R data output format (data.frame, list, etc.)
   * @private
   */
  _parseRDataOutput(stdout) {
    // This is a simplified parser for R output
    // In a production environment, you might want to use a more sophisticated parser
    // or ensure R scripts output JSON format
    
    const lines = stdout.split('\n').filter(line => line.trim() !== '');
    
    // Look for structured data patterns
    const dataLines = lines.filter(line => 
      !line.startsWith('[1]') && 
      !line.startsWith('Loading') && 
      !line.startsWith('Attaching') &&
      !line.includes('package') &&
      line.trim() !== ''
    );
    
    if (dataLines.length === 0) {
      return null;
    }
    
    // Return raw data lines for further processing
    return {
      type: 'raw',
      lines: dataLines,
      raw: stdout
    };
  }

  /**
   * Determine if an error is retryable
   * @private
   */
  _isRetryableError(stderr, code) {
    if (!stderr) return false;
    
    const retryablePatterns = [
      /network.*error/i,
      /connection.*failed/i,
      /timeout/i,
      /temporary.*failure/i,
      /rate.*limit/i,
      /service.*unavailable/i
    ];
    
    return retryablePatterns.some(pattern => pattern.test(stderr));
  }

  /**
   * Validate that the R script exists
   * @private
   */
  async _validateScript(scriptName) {
    // Add .R extension if not present
    const fileName = scriptName.endsWith('.R') ? scriptName : `${scriptName}.R`;
    const scriptPath = path.join(this.config.scriptsPath, fileName);
    
    try {
      await fs.access(scriptPath);
      return scriptPath;
    } catch (error) {
      throw new RScriptError(
        `R script not found: ${scriptPath}`,
        R_ERROR_TYPES.SCRIPT_NOT_FOUND,
        false,
        { scriptPath, scriptsPath: this.config.scriptsPath }
      );
    }
  }

  /**
   * Generate unique execution ID for tracking
   * @private
   */
  _generateExecutionId() {
    return `r_exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update execution statistics
   * @private
   */
  _updateStats(success, executionTime) {
    this.executionStats.totalExecutions++;
    this.executionStats.lastExecutionTime = executionTime;
    
    if (success) {
      this.executionStats.successfulExecutions++;
    } else {
      this.executionStats.failedExecutions++;
    }
    
    // Update average execution time
    const totalTime = (this.executionStats.averageExecutionTime * (this.executionStats.totalExecutions - 1)) + executionTime;
    this.executionStats.averageExecutionTime = totalTime / this.executionStats.totalExecutions;
  }

  /**
   * Log execution events
   * @private
   */
  _logExecution(level, message, details = {}) {
    if (!this.config.enableLogging) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: 'RScriptExecutor',
      message,
      ...details
    };
    
    // In a production environment, you would use a proper logging library
    console.log(`[${level.toUpperCase()}] ${message}`, details);
  }

  /**
   * Delay utility for retry logic
   * @private
   */
  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // FFAnalytics-specific methods

  /**
   * Scrape projections using ffanalytics
   * @param {Array} sources - Data sources to scrape from
   * @param {Array} positions - Player positions to include
   * @param {number} season - Season year
   * @param {number} week - Week number (0 for season-long)
   * @returns {Promise<Object>} - Scraped projections data
   */
  async scrapeProjections(sources, positions, season, week) {
    const args = [
      '--sources', sources.join(','),
      '--positions', positions.join(','),
      '--season', season.toString(),
      '--week', week.toString()
    ];
    
    const scriptName = week === 0 ? 'scrape_season_projections' : 'scrape_weekly_projections';
    
    return this.executeScript(scriptName, args, {
      timeout: 600000, // 10 minutes for scraping operations
      parseJson: true
    });
  }

  /**
   * Calculate projections table from scraped data
   * @param {Object} scrapeData - Raw scraped data
   * @param {string} avgType - Averaging type ('average', 'robust', 'weighted')
   * @returns {Promise<Object>} - Processed projections table
   */
  async calculateProjectionsTable(scrapeData, avgType = 'average') {
    // This would typically involve passing data to R script
    // For now, we'll use a processing script
    const args = [
      '--avg-type', avgType,
      '--data', JSON.stringify(scrapeData)
    ];
    
    return this.executeScript('process_analytics_data', args, {
      parseJson: true
    });
  }

  /**
   * Add Expert Consensus Rankings (ECR) to projections data
   * @param {Object} projectionsData - Projections data
   * @returns {Promise<Object>} - Enhanced data with ECR
   */
  async addECR(projectionsData) {
    const args = ['--add-ecr', '--data', JSON.stringify(projectionsData)];
    
    return this.executeScript('process_analytics_data', args, {
      parseJson: true
    });
  }

  /**
   * Add Average Draft Position (ADP) to projections data
   * @param {Object} projectionsData - Projections data
   * @param {Array} sources - ADP sources
   * @returns {Promise<Object>} - Enhanced data with ADP
   */
  async addADP(projectionsData, sources = ['ESPN', 'Yahoo']) {
    const args = [
      '--add-adp',
      '--adp-sources', sources.join(','),
      '--data', JSON.stringify(projectionsData)
    ];
    
    return this.executeScript('process_analytics_data', args, {
      parseJson: true
    });
  }

  /**
   * Add uncertainty metrics to projections data
   * @param {Object} projectionsData - Projections data
   * @returns {Promise<Object>} - Enhanced data with uncertainty metrics
   */
  async addUncertainty(projectionsData) {
    const args = ['--add-uncertainty', '--data', JSON.stringify(projectionsData)];
    
    return this.executeScript('process_analytics_data', args, {
      parseJson: true
    });
  }

  /**
   * Add player information to projections data
   * @param {Object} projectionsData - Projections data
   * @returns {Promise<Object>} - Enhanced data with player info
   */
  async addPlayerInfo(projectionsData) {
    const args = ['--add-player-info', '--data', JSON.stringify(projectionsData)];
    
    return this.executeScript('process_analytics_data', args, {
      parseJson: true
    });
  }

  /**
   * Test R environment and ffanalytics package availability
   * @returns {Promise<Object>} - Environment test results
   */
  async testEnvironment() {
    try {
      const result = await this.executeScript('test_environment', [], {
        timeout: 30000,
        parseJson: false
      });
      
      return {
        success: true,
        rVersion: this._extractRVersion(result.stdout),
        ffanalyticsAvailable: result.stdout.includes('ffanalytics package loaded successfully'),
        details: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        type: error.type,
        details: error.details
      };
    }
  }

  /**
   * Extract R version from output
   * @private
   */
  _extractRVersion(stdout) {
    const versionMatch = stdout.match(/R version (\d+\.\d+\.\d+)/);
    return versionMatch ? versionMatch[1] : 'unknown';
  }

  /**
   * Get execution statistics
   * @returns {Object} - Current execution statistics
   */
  getExecutionStats() {
    return {
      ...this.executionStats,
      successRate: this.executionStats.totalExecutions > 0 
        ? (this.executionStats.successfulExecutions / this.executionStats.totalExecutions) * 100 
        : 0
    };
  }

  /**
   * Reset execution statistics
   */
  resetStats() {
    this.executionStats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      lastExecutionTime: null
    };
  }

  /**
   * Get current configuration
   * @returns {Object} - Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

// Export singleton instance with default configuration
export const rScriptExecutor = new RScriptExecutor();