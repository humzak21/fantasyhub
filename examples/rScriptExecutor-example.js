#!/usr/bin/env node

/**
 * Example usage of RScriptExecutor service
 * This demonstrates how to use the RScriptExecutor to run R scripts
 * and handle the results.
 */

import { RScriptExecutor } from '../services/rScriptExecutor.js';

async function demonstrateRScriptExecutor() {
  console.log('🔬 RScriptExecutor Demo\n');

  // Create executor instance
  const executor = new RScriptExecutor({
    enableLogging: true,
    timeout: 30000, // 30 seconds
    maxRetries: 2
  });

  try {
    // Test R environment
    console.log('1. Testing R environment...');
    const envTest = await executor.testEnvironment();
    
    if (envTest.success) {
      console.log('✅ R environment is ready');
      console.log(`   R Version: ${envTest.rVersion}`);
      console.log(`   ffanalytics available: ${envTest.ffanalyticsAvailable}`);
    } else {
      console.log('❌ R environment test failed');
      console.log(`   Error: ${envTest.error}`);
      return;
    }

    console.log('\n2. Demonstrating ffanalytics methods...');
    
    // Example: Scrape projections (this would work if R and ffanalytics are properly set up)
    try {
      console.log('   Attempting to scrape weekly projections...');
      const projections = await executor.scrapeProjections(
        ['ESPN', 'CBS'], // sources
        ['QB', 'RB'],    // positions
        2024,            // season
        1                // week
      );
      
      console.log('✅ Projections scraped successfully');
      console.log(`   Data size: ${JSON.stringify(projections.data || {}).length} characters`);
      
    } catch (error) {
      console.log('⚠️  Projection scraping failed (expected if ffanalytics not fully configured)');
      console.log(`   Error: ${error.message}`);
    }

    // Show execution statistics
    console.log('\n3. Execution Statistics:');
    const stats = executor.getExecutionStats();
    console.log(`   Total executions: ${stats.totalExecutions}`);
    console.log(`   Success rate: ${stats.successRate.toFixed(1)}%`);
    console.log(`   Average execution time: ${stats.averageExecutionTime.toFixed(0)}ms`);

    // Demonstrate configuration management
    console.log('\n4. Configuration Management:');
    const config = executor.getConfig();
    console.log(`   Current timeout: ${config.timeout}ms`);
    console.log(`   Max retries: ${config.maxRetries}`);
    console.log(`   Scripts path: ${config.scriptsPath}`);

    // Update configuration
    executor.updateConfig({ timeout: 60000 });
    console.log(`   Updated timeout to: ${executor.getConfig().timeout}ms`);

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    if (error.details) {
      console.error('   Details:', error.details);
    }
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateRScriptExecutor()
    .then(() => {
      console.log('\n🎉 RScriptExecutor demo completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Demo failed:', error);
      process.exit(1);
    });
}