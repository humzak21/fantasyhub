#!/usr/bin/env node

/**
 * FFAnalytics Configuration CLI
 * 
 * Command-line utility for managing ffanalytics configuration,
 * environment validation, and setup.
 */

const { FFAnalyticsConfig } = require('../config/ffanalytics-config');
const { FFAnalyticsEnvironment } = require('../config/ffanalytics-env');
const fs = require('fs');
const path = require('path');

/**
 * CLI Commands
 */
class FFAnalyticsConfigCLI {
  constructor() {
    this.commands = {
      'validate': this.validateEnvironment.bind(this),
      'setup': this.setupEnvironment.bind(this),
      'config': this.showConfiguration.bind(this),
      'template': this.generateTemplate.bind(this),
      'test': this.testConfiguration.bind(this),
      'weights': this.manageWeights.bind(this),
      'sources': this.manageSources.bind(this),
      'help': this.showHelp.bind(this)
    };
  }

  /**
   * Run CLI command
   */
  async run(args) {
    const command = args[0] || 'help';
    const commandArgs = args.slice(1);

    if (this.commands[command]) {
      try {
        await this.commands[command](commandArgs);
      } catch (error) {
        console.error(`❌ Error executing command '${command}':`, error.message);
        process.exit(1);
      }
    } else {
      console.error(`❌ Unknown command: ${command}`);
      this.showHelp();
      process.exit(1);
    }
  }

  /**
   * Validate environment setup
   */
  async validateEnvironment(args) {
    console.log('🔍 Validating FFAnalytics environment...\n');

    try {
      const config = new FFAnalyticsConfig();
      const env = new FFAnalyticsEnvironment(config.export());
      const validation = await env.validateEnvironment();

      // Show validation results
      if (validation.valid) {
        console.log('✅ Environment validation passed!\n');
      } else {
        console.log('❌ Environment validation failed!\n');
      }

      // Show errors
      if (validation.errors.length > 0) {
        console.log('🚨 Errors:');
        validation.errors.forEach(error => console.log(`  - ${error}`));
        console.log();
      }

      // Show warnings
      if (validation.warnings.length > 0) {
        console.log('⚠️  Warnings:');
        validation.warnings.forEach(warning => console.log(`  - ${warning}`));
        console.log();
      }

      // Show info
      if (validation.info.length > 0) {
        console.log('ℹ️  Information:');
        validation.info.forEach(info => console.log(`  - ${info}`));
        console.log();
      }

      // Check production readiness
      const prodCheck = await env.isProductionReady();
      if (prodCheck.ready) {
        console.log('🚀 Environment is production ready!');
      } else {
        console.log('⚠️  Environment needs attention before production use');
        if (prodCheck.recommendations.length > 0) {
          console.log('\n📋 Recommendations:');
          prodCheck.recommendations.forEach(rec => console.log(`  - ${rec}`));
        }
      }

    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Setup environment for first-time use
   */
  async setupEnvironment(args) {
    console.log('🛠️  Setting up FFAnalytics environment...\n');

    try {
      const config = new FFAnalyticsConfig();
      const env = new FFAnalyticsEnvironment(config.export());
      const setup = await env.setupEnvironment();

      if (setup.success) {
        console.log('✅ Environment setup completed!\n');
        
        if (setup.actions.length > 0) {
          console.log('📋 Actions performed:');
          setup.actions.forEach(action => console.log(`  - ${action}`));
          console.log();
        }

        console.log('🔍 Running validation check...\n');
        await this.validateEnvironment([]);

      } else {
        console.log('❌ Environment setup failed!\n');
        setup.errors.forEach(error => console.log(`  - ${error}`));
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Show current configuration
   */
  async showConfiguration(args) {
    const section = args[0];

    try {
      const config = new FFAnalyticsConfig();
      
      console.log('⚙️  FFAnalytics Configuration\n');

      if (section) {
        const sectionConfig = config.get(section);
        if (sectionConfig) {
          console.log(`📋 ${section}:`);
          console.log(JSON.stringify(sectionConfig, null, 2));
        } else {
          console.error(`❌ Configuration section '${section}' not found`);
          process.exit(1);
        }
      } else {
        // Show summary
        console.log(`🔧 Status: ${config.isEnabled() ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`📊 Power Rankings: ${config.isPowerRankingsEnabled() ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`📈 Analytics Weight: ${config.get('powerRankings.analyticsWeight')}`);
        console.log(`🔄 Update Frequency: ${config.get('updates.frequency')}`);
        console.log(`📂 Scripts Path: ${config.get('rScripts.scriptsPath')}`);
        console.log(`🎯 Data Sources: ${config.get('dataSources.weekly').length} weekly, ${config.get('dataSources.seasonal').length} seasonal`);
        
        console.log('\n📋 Available sections:');
        console.log('  - rScripts');
        console.log('  - dataSources');
        console.log('  - cache');
        console.log('  - matching');
        console.log('  - powerRankings');
        console.log('  - updates');
        console.log('  - errorHandling');
        console.log('  - logging');
        
        console.log('\n💡 Use: npm run ffanalytics-config config <section> to view specific section');
      }

    } catch (error) {
      console.error('❌ Failed to load configuration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Generate environment template
   */
  async generateTemplate(args) {
    const outputFile = args[0] || '.env.ffanalytics.template';

    try {
      const config = new FFAnalyticsConfig();
      const env = new FFAnalyticsEnvironment(config.export());
      const template = env.generateEnvTemplate();

      fs.writeFileSync(outputFile, template);
      console.log(`✅ Environment template generated: ${outputFile}`);
      console.log('\n💡 Copy this file to .env and customize the values for your environment');

    } catch (error) {
      console.error('❌ Failed to generate template:', error.message);
      process.exit(1);
    }
  }

  /**
   * Test configuration with actual R environment
   */
  async testConfiguration(args) {
    console.log('🧪 Testing FFAnalytics configuration...\n');

    try {
      const config = new FFAnalyticsConfig();
      
      // Test R script execution
      console.log('🔍 Testing R script execution...');
      const { RScriptExecutor } = require('../services/rScriptExecutor');
      const rExecutor = new RScriptExecutor(config.getRScriptConfig());
      
      // Test basic R execution
      const testScript = `
        cat("R test successful\\n")
        cat("Working directory:", getwd(), "\\n")
        cat("R version:", R.version.string, "\\n")
      `;

      const result = await rExecutor.executeRScript('test', [], testScript);
      console.log('✅ R script execution test passed');
      console.log(`📋 Output: ${result.output}`);

      // Test ffanalytics package
      console.log('\n🔍 Testing ffanalytics package...');
      const packageTest = `
        if (require("ffanalytics", quietly = TRUE)) {
          cat("ffanalytics package loaded successfully\\n")
          cat("Package version:", as.character(packageVersion("ffanalytics")), "\\n")
        } else {
          stop("ffanalytics package not available")
        }
      `;

      const packageResult = await rExecutor.executeRScript('package-test', [], packageTest);
      console.log('✅ ffanalytics package test passed');
      console.log(`📋 Output: ${packageResult.output}`);

      console.log('\n🎉 All configuration tests passed!');

    } catch (error) {
      console.error('❌ Configuration test failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Manage power rankings weights
   */
  async manageWeights(args) {
    const action = args[0]; // get, set
    const weight = args[1];
    const value = args[2];

    try {
      const config = new FFAnalyticsConfig();

      if (action === 'get') {
        const weights = config.getPowerRankingsWeights();
        console.log('⚖️  Power Rankings Weights:\n');
        console.log(`📊 Analytics Weight: ${weights.analytics}`);
        console.log(`📈 Trend Weight: ${weights.trend}`);
        console.log(`📉 Consistency Weight: ${weights.consistency}`);
        console.log(`🎯 Ceiling/Floor Weight: ${weights.ceilingFloor}`);
        
        const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
        console.log(`\n🔢 Total Analytics Weight: ${totalWeight.toFixed(3)}`);
        
      } else if (action === 'set' && weight && value) {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue < 0 || numValue > 1) {
          console.error('❌ Weight value must be a number between 0 and 1');
          process.exit(1);
        }

        const weightMap = {
          'analytics': 'powerRankings.analyticsWeight',
          'trend': 'powerRankings.trendWeight',
          'consistency': 'powerRankings.consistencyWeight',
          'ceiling-floor': 'powerRankings.ceilingFloorWeight'
        };

        if (weightMap[weight]) {
          config.set(weightMap[weight], numValue);
          console.log(`✅ Set ${weight} weight to ${numValue}`);
        } else {
          console.error(`❌ Unknown weight: ${weight}`);
          console.log('Available weights: analytics, trend, consistency, ceiling-floor');
          process.exit(1);
        }

      } else {
        console.log('⚖️  Weight Management Commands:\n');
        console.log('📋 Get weights: npm run ffanalytics-config weights get');
        console.log('⚙️  Set weight: npm run ffanalytics-config weights set <weight> <value>');
        console.log('\nAvailable weights: analytics, trend, consistency, ceiling-floor');
        console.log('Values must be between 0.0 and 1.0');
      }

    } catch (error) {
      console.error('❌ Weight management failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Manage data sources
   */
  async manageSources(args) {
    const action = args[0]; // get, add, remove
    const type = args[1]; // weekly, seasonal
    const source = args[2];

    try {
      const config = new FFAnalyticsConfig();

      if (action === 'get') {
        const sources = config.getDataSourcesConfig();
        console.log('📊 Data Sources Configuration:\n');
        console.log(`📅 Weekly Sources: ${sources.weekly.join(', ')}`);
        console.log(`📈 Seasonal Sources: ${sources.seasonal.join(', ')}`);
        console.log(`🏈 Positions: ${sources.positions.join(', ')}`);
        console.log(`📊 Average Types: ${sources.avgTypes.join(', ')}`);
        
      } else if (action === 'add' && type && source) {
        const currentSources = config.get(`dataSources.${type}`);
        if (!currentSources) {
          console.error(`❌ Unknown source type: ${type}`);
          process.exit(1);
        }

        if (!currentSources.includes(source)) {
          currentSources.push(source);
          config.set(`dataSources.${type}`, currentSources);
          console.log(`✅ Added ${source} to ${type} sources`);
        } else {
          console.log(`ℹ️  ${source} is already in ${type} sources`);
        }

      } else if (action === 'remove' && type && source) {
        const currentSources = config.get(`dataSources.${type}`);
        if (!currentSources) {
          console.error(`❌ Unknown source type: ${type}`);
          process.exit(1);
        }

        const index = currentSources.indexOf(source);
        if (index > -1) {
          currentSources.splice(index, 1);
          config.set(`dataSources.${type}`, currentSources);
          console.log(`✅ Removed ${source} from ${type} sources`);
        } else {
          console.log(`ℹ️  ${source} is not in ${type} sources`);
        }

      } else {
        console.log('📊 Data Sources Management Commands:\n');
        console.log('📋 Get sources: npm run ffanalytics-config sources get');
        console.log('➕ Add source: npm run ffanalytics-config sources add <type> <source>');
        console.log('➖ Remove source: npm run ffanalytics-config sources remove <type> <source>');
        console.log('\nTypes: weekly, seasonal');
        console.log('Available sources: CBS, ESPN, FantasyPros, FantasySharks, FFToday, NumberFire, NFL, Yahoo');
      }

    } catch (error) {
      console.error('❌ Sources management failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log('🏈 FFAnalytics Configuration CLI\n');
    console.log('Available commands:\n');
    console.log('🔍 validate    - Validate environment setup');
    console.log('🛠️  setup       - Setup environment for first-time use');
    console.log('⚙️  config      - Show configuration (optionally specify section)');
    console.log('📄 template    - Generate environment variable template');
    console.log('🧪 test        - Test configuration with R environment');
    console.log('⚖️  weights     - Manage power rankings weights');
    console.log('📊 sources     - Manage data sources');
    console.log('❓ help        - Show this help message\n');
    console.log('Examples:');
    console.log('  npm run ffanalytics-config validate');
    console.log('  npm run ffanalytics-config config powerRankings');
    console.log('  npm run ffanalytics-config weights set analytics 0.2');
    console.log('  npm run ffanalytics-config sources add weekly Yahoo');
  }
}

// Run CLI if called directly
if (require.main === module) {
  const cli = new FFAnalyticsConfigCLI();
  const args = process.argv.slice(2);
  cli.run(args);
}

module.exports = { FFAnalyticsConfigCLI };