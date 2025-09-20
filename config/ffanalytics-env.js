/**
 * FFAnalytics Environment Setup and Validation
 * 
 * Provides utilities for environment validation, setup, and configuration management
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Environment validation and setup utilities
 */
class FFAnalyticsEnvironment {
  constructor(config) {
    this.config = config;
  }

  /**
   * Validate the complete environment setup
   */
  async validateEnvironment() {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      info: []
    };

    // Validate R installation
    const rValidation = await this.validateRInstallation();
    this.mergeValidationResults(results, rValidation);

    // Validate R scripts
    const scriptsValidation = this.validateRScripts();
    this.mergeValidationResults(results, scriptsValidation);

    // Validate file permissions
    const permissionsValidation = this.validateFilePermissions();
    this.mergeValidationResults(results, permissionsValidation);

    // Validate configuration
    const configValidation = this.validateConfigurationEnvironment();
    this.mergeValidationResults(results, configValidation);

    return results;
  }

  /**
   * Validate R installation and ffanalytics package
   */
  async validateRInstallation() {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      info: []
    };

    try {
      // Check if R is installed and accessible
      const rVersion = execSync(`${this.config.rScripts.rExecutable} --version`, { 
        encoding: 'utf8',
        timeout: 10000
      });
      
      results.info.push(`R installation found: ${rVersion.split('\n')[0]}`);

      // Check if ffanalytics package is installed
      const checkPackageScript = `
        if (!require("ffanalytics", quietly = TRUE)) {
          cat("PACKAGE_NOT_FOUND")
        } else {
          cat("PACKAGE_FOUND:", packageVersion("ffanalytics"))
        }
      `;

      const packageCheck = execSync(
        `${this.config.rScripts.rExecutable} -e "${checkPackageScript}"`,
        { encoding: 'utf8', timeout: 30000 }
      );

      if (packageCheck.includes('PACKAGE_NOT_FOUND')) {
        results.errors.push('ffanalytics R package is not installed');
        results.valid = false;
      } else {
        results.info.push(`ffanalytics package found: ${packageCheck.replace('PACKAGE_FOUND:', '').trim()}`);
      }

      // Check required dependencies
      const dependencies = [
        'dplyr', 'tidyr', 'purrr', 'httr2', 'rvest', 
        'data.table', 'readxl', 'readr', 'jsonlite'
      ];

      for (const dep of dependencies) {
        try {
          const depCheck = execSync(
            `${this.config.rScripts.rExecutable} -e "if (!require('${dep}', quietly = TRUE)) cat('MISSING') else cat('FOUND')"`,
            { encoding: 'utf8', timeout: 10000 }
          );

          if (depCheck.includes('MISSING')) {
            results.warnings.push(`R dependency '${dep}' is not installed`);
          }
        } catch (error) {
          results.warnings.push(`Could not check R dependency '${dep}': ${error.message}`);
        }
      }

    } catch (error) {
      results.errors.push(`R installation validation failed: ${error.message}`);
      results.valid = false;
    }

    return results;
  }

  /**
   * Validate R scripts exist and are readable
   */
  validateRScripts() {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      info: []
    };

    const scriptsPath = path.resolve(this.config.rScripts.scriptsPath);
    
    // Check if scripts directory exists
    if (!fs.existsSync(scriptsPath)) {
      results.errors.push(`R scripts directory does not exist: ${scriptsPath}`);
      results.valid = false;
      return results;
    }

    // Required R scripts
    const requiredScripts = [
      'scrape_weekly_projections.R',
      'scrape_season_projections.R',
      'process_analytics_data.R',
      'test_environment.R'
    ];

    for (const script of requiredScripts) {
      const scriptPath = path.join(scriptsPath, script);
      
      if (!fs.existsSync(scriptPath)) {
        results.errors.push(`Required R script not found: ${script}`);
        results.valid = false;
      } else {
        try {
          fs.accessSync(scriptPath, fs.constants.R_OK);
          results.info.push(`R script found and readable: ${script}`);
        } catch (error) {
          results.errors.push(`R script not readable: ${script}`);
          results.valid = false;
        }
      }
    }

    return results;
  }

  /**
   * Validate file permissions for logs and cache
   */
  validateFilePermissions() {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      info: []
    };

    // Check log directory permissions if file logging is enabled
    if (this.config.logging.enableFileLogging) {
      const logDir = path.dirname(path.resolve(this.config.logging.logFilePath));
      
      try {
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        
        fs.accessSync(logDir, fs.constants.W_OK);
        results.info.push(`Log directory is writable: ${logDir}`);
      } catch (error) {
        results.errors.push(`Log directory is not writable: ${logDir}`);
        results.valid = false;
      }
    }

    // Check scripts directory permissions
    const scriptsPath = path.resolve(this.config.rScripts.scriptsPath);
    try {
      fs.accessSync(scriptsPath, fs.constants.R_OK);
      results.info.push(`Scripts directory is readable: ${scriptsPath}`);
    } catch (error) {
      results.errors.push(`Scripts directory is not readable: ${scriptsPath}`);
      results.valid = false;
    }

    return results;
  }

  /**
   * Validate configuration-specific environment requirements
   */
  validateConfigurationEnvironment() {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      info: []
    };

    // Validate data sources
    const validSources = [
      'CBS', 'ESPN', 'FantasyPros', 'FantasySharks', 
      'FFToday', 'NumberFire', 'NFL', 'Yahoo'
    ];

    const invalidWeeklySources = this.config.dataSources.weekly.filter(
      source => !validSources.includes(source)
    );

    if (invalidWeeklySources.length > 0) {
      results.warnings.push(`Invalid weekly data sources: ${invalidWeeklySources.join(', ')}`);
    }

    // Validate positions
    const validPositions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    const invalidPositions = this.config.dataSources.positions.filter(
      pos => !validPositions.includes(pos)
    );

    if (invalidPositions.length > 0) {
      results.warnings.push(`Invalid positions: ${invalidPositions.join(', ')}`);
    }

    // Validate time format for updates
    if (this.config.updates.time && !/^\d{2}:\d{2}$/.test(this.config.updates.time)) {
      results.warnings.push(`Invalid time format for updates: ${this.config.updates.time}. Expected HH:MM format.`);
    }

    // Check for reasonable timeout values
    if (this.config.rScripts.timeout < 30000) {
      results.warnings.push('R script timeout is very low (< 30 seconds), may cause failures');
    }

    if (this.config.rScripts.timeout > 600000) {
      results.warnings.push('R script timeout is very high (> 10 minutes), may cause hanging');
    }

    return results;
  }

  /**
   * Merge validation results
   */
  mergeValidationResults(target, source) {
    target.valid = target.valid && source.valid;
    target.errors.push(...source.errors);
    target.warnings.push(...source.warnings);
    target.info.push(...source.info);
  }

  /**
   * Setup environment for first-time use
   */
  async setupEnvironment() {
    const results = {
      success: true,
      actions: [],
      errors: []
    };

    try {
      // Create scripts directory if it doesn't exist
      const scriptsPath = path.resolve(this.config.rScripts.scriptsPath);
      if (!fs.existsSync(scriptsPath)) {
        fs.mkdirSync(scriptsPath, { recursive: true });
        results.actions.push(`Created R scripts directory: ${scriptsPath}`);
      }

      // Create logs directory if file logging is enabled
      if (this.config.logging.enableFileLogging) {
        const logDir = path.dirname(path.resolve(this.config.logging.logFilePath));
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
          results.actions.push(`Created logs directory: ${logDir}`);
        }
      }

      // Test R environment
      const testScript = `
        cat("R environment test successful\\n")
        cat("R version:", R.version.string, "\\n")
        if (require("ffanalytics", quietly = TRUE)) {
          cat("ffanalytics package loaded successfully\\n")
        } else {
          cat("WARNING: ffanalytics package not available\\n")
        }
      `;

      const testResult = execSync(
        `${this.config.rScripts.rExecutable} -e "${testScript}"`,
        { encoding: 'utf8', timeout: 30000 }
      );

      results.actions.push('R environment test completed');
      results.actions.push(`R test output: ${testResult.trim()}`);

    } catch (error) {
      results.success = false;
      results.errors.push(`Environment setup failed: ${error.message}`);
    }

    return results;
  }

  /**
   * Generate environment configuration template
   */
  generateEnvTemplate() {
    const template = `# FFAnalytics Configuration Environment Variables
# Copy this to your .env file and customize as needed

# Core Settings
FFANALYTICS_ENABLED=true

# R Configuration
R_EXECUTABLE_PATH=Rscript
FFANALYTICS_SCRIPTS_PATH=./scripts/ffanalytics/
R_SCRIPT_TIMEOUT=300000
R_SCRIPT_MAX_RETRIES=3
R_SCRIPT_LOG_LEVEL=info

# Data Sources (comma-separated)
FFANALYTICS_WEEKLY_SOURCES=CBS,ESPN,FantasyPros,FantasySharks,FFToday,NumberFire,NFL
FFANALYTICS_SEASONAL_SOURCES=CBS,ESPN,FantasyPros,FantasySharks,FFToday,NumberFire,NFL
FFANALYTICS_POSITIONS=QB,RB,WR,TE,K,DST
FFANALYTICS_AVG_TYPES=average,robust,weighted

# Cache Settings (in seconds)
ANALYTICS_CACHE_TTL=3600
ANALYTICS_WEEKLY_TTL=86400
ANALYTICS_SEASONAL_TTL=604800
ANALYTICS_MAX_CACHE_SIZE=10000

# Player Matching Thresholds (0.0 to 1.0)
PLAYER_MATCH_CONFIDENCE_THRESHOLD=0.8
PLAYER_MATCH_FUZZY_THRESHOLD=0.7
PLAYER_MATCH_AUTO_APPROVE_THRESHOLD=0.95

# Power Rankings Weights (0.0 to 1.0)
ANALYTICS_WEIGHT=0.15
ANALYTICS_TREND_WEIGHT=0.1
ANALYTICS_CONSISTENCY_WEIGHT=0.05
ANALYTICS_CEILING_FLOOR_WEIGHT=0.05
ANALYTICS_MIN_DATA_POINTS=3

# Update Schedule
ANALYTICS_UPDATE_FREQUENCY=daily
ANALYTICS_UPDATE_TIME=06:00
ANALYTICS_RETRY_ATTEMPTS=3
ANALYTICS_RETRY_DELAY=300000

# Logging
ANALYTICS_LOG_LEVEL=info
ANALYTICS_LOG_FILE_PATH=./logs/ffanalytics.log
`;

    return template;
  }

  /**
   * Check if environment is ready for production use
   */
  async isProductionReady() {
    const validation = await this.validateEnvironment();
    
    return {
      ready: validation.valid && validation.errors.length === 0,
      criticalIssues: validation.errors,
      warnings: validation.warnings,
      recommendations: this.getProductionRecommendations(validation)
    };
  }

  /**
   * Get production readiness recommendations
   */
  getProductionRecommendations(validation) {
    const recommendations = [];

    if (validation.warnings.length > 0) {
      recommendations.push('Address all configuration warnings before production deployment');
    }

    if (this.config.rScripts.timeout < 60000) {
      recommendations.push('Consider increasing R script timeout for production stability');
    }

    if (!this.config.logging.enableFileLogging) {
      recommendations.push('Enable file logging for production monitoring');
    }

    if (this.config.updates.retryAttempts < 3) {
      recommendations.push('Increase retry attempts for better reliability in production');
    }

    if (this.config.cache.defaultTTL < 1800) {
      recommendations.push('Consider longer cache TTL for production performance');
    }

    return recommendations;
  }
}

module.exports = {
  FFAnalyticsEnvironment
};