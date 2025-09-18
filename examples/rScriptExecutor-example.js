#!/usr/bin/env node

/**
 * Example usage of RScriptExecutor service
 * This demonstrates how to use the RScriptExecutor to run R scripts
 * and handle the results.
 */

import { RScriptExecutor } from '../services/rScriptExecutor.js';

async function demonstrateRScriptExecutor() {
  console.log('🚀 Starting RScriptExecutor demonstration...');
  console.log('=' .repeat(50));

  // Create executor instance
  console.log('📝 Creating RScriptExecutor instance...');
  const executor = new RScriptExecutor({
    enableLogging: true,
    timeout: 30000, // 30 seconds
    maxRetries: 2
  });

  try {
    // Test R environment
    console.log('\n🔍 Testing R environment...');
    const envTest = await executor.testEnvironment();
    
    if (envTest.success) {
      console.log('✅ R environment test passed!');
      console.log('📊 R Version:', envTest.rVersion);
      console.log('📦 Required packages available:', envTest.packagesAvailable);
    } else {
      console.error('❌ R environment test failed!');
      console.error('⚠️  Issues found:', envTest.issues);
      return;
    }


    // Example: Scrape projections (this would work if R and ffanalytics are properly set up)
    console.log('\n📈 Attempting to scrape fantasy projections...');
    try {
      const projections = await executor.scrapeProjections(
        ['ESPN', 'CBS'], // sources
        ['QB', 'RB'],    // positions
        2024,            // season
        1                // week
      );

      if (projections.success) {
        console.log('✅ Projections scraped successfully!');
        console.log('📊 Number of players found:', projections.data?.length || 0);
        console.log('🏈 Sample projection:', projections.data?.[0] || 'No data');
        console.log('⏱️  Execution time:', projections.executionTime, 'ms');
      } else {
        console.warn('⚠️  Projection scraping failed:', projections.error);
      }

    } catch (error) {
      console.error('❌ Error during projection scraping:', error.message);
    }

    // Show execution statistics
    console.log('\n📈 Execution Statistics:');
    const stats = executor.getExecutionStats();
    console.log('📊 Total executions:', stats.totalExecutions);
    console.log('✅ Successful executions:', stats.successfulExecutions);
    console.log('❌ Failed executions:', stats.failedExecutions);
    console.log('⏱️  Average execution time:', stats.averageExecutionTime, 'ms');
    console.log('🔄 Total retry attempts:', stats.totalRetries);

    // Demonstrate configuration management
    console.log('\n⚙️  Current Configuration:');
    const config = executor.getConfig();
    console.log('🔧 Config:', JSON.stringify(config, null, 2));

    // Update configuration
    console.log('\n🔄 Updating configuration...');
    executor.updateConfig({ timeout: 60000 });
    console.log('✅ Configuration updated - timeout set to 60 seconds');
    console.log('🔧 New config:', JSON.stringify(executor.getConfig(), null, 2));

  } catch (error) {
    console.error('❌ Demonstration failed with error:', error.message);
    console.error('📋 Error details:', error);
  }

  console.log('\n' + '=' .repeat(50));
  console.log('🏁 RScriptExecutor demonstration completed!');
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateRScriptExecutor()
    .then(() => {
      console.log('\n🎉 Demo completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Demo failed:', error.message);
      console.error('📋 Full error:', error);
      process.exit(1);
    });
}