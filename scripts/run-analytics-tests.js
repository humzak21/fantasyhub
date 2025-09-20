#!/usr/bin/env node

/**
 * Test runner for FFAnalytics integration testing suite
 * Runs comprehensive tests for all analytics components
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Test suites configuration
const testSuites = {
  unit: {
    name: 'Unit Tests',
    description: 'Fast unit tests with mocked dependencies',
    files: [
      'services/__tests__/ffAnalyticsService.test.js',
      'services/__tests__/playerMatchingService.simple.test.js',
      'services/__tests__/analyticsCache.test.js',
      'services/__tests__/rScriptExecutor.test.js',
      'services/__tests__/powerRankingCalculator.analytics.test.js'
    ],
    timeout: 30000
  },

  integration: {
    name: 'Integration Tests',
    description: 'Tests with real component interactions',
    files: [
      'services/__tests__/playerMatchingService.integration.test.js',
      'services/__tests__/analyticsCache.integration.test.js',
      'services/__tests__/rScriptExecutor.integration.test.js',
      'services/__tests__/ffAnalyticsScheduler.integration.test.js'
    ],
    timeout: 60000
  },

  comprehensive: {
    name: 'Comprehensive Tests',
    description: 'Complete workflow and service coordination tests',
    files: [
      'services/__tests__/ffanalytics.comprehensive.test.js'
    ],
    timeout: 120000
  },

  performance: {
    name: 'Performance Tests',
    description: 'Bulk operations and performance validation',
    files: [
      'services/__tests__/ffanalytics.performance.test.js'
    ],
    timeout: 300000
  },

  accuracy: {
    name: 'Accuracy Tests',
    description: 'Player matching accuracy with various scenarios',
    files: [
      'services/__tests__/playerMatching.accuracy.test.js'
    ],
    timeout: 60000
  },

  errorHandling: {
    name: 'Error Handling Tests',
    description: 'Error scenarios and graceful degradation',
    files: [
      'services/__tests__/ffAnalyticsErrorHandler.test.js',
      'services/__tests__/ffAnalyticsGracefulDegradation.test.js',
      'services/__tests__/ffAnalyticsRetry.test.js',
      'services/__tests__/ffAnalyticsLogger.test.js'
    ],
    timeout: 45000
  },

  scheduler: {
    name: 'Scheduler Tests',
    description: 'Automated scheduling and background job tests',
    files: [
      'services/__tests__/ffAnalyticsScheduler.test.js'
    ],
    timeout: 30000
  },

  config: {
    name: 'Configuration Tests',
    description: 'Configuration management and environment tests',
    files: [
      'config/__tests__/ffanalytics-config.test.js',
      'config/__tests__/ffanalytics-env.test.js'
    ],
    timeout: 15000
  }
};

// Command line argument parsing
const args = process.argv.slice(2);
const options = {
  suite: 'all',
  verbose: false,
  coverage: false,
  watch: false,
  parallel: false,
  reporter: 'default'
};

// Parse command line arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  switch (arg) {
    case '--suite':
    case '-s':
      options.suite = args[++i];
      break;
    case '--verbose':
    case '-v':
      options.verbose = true;
      break;
    case '--coverage':
    case '-c':
      options.coverage = true;
      break;
    case '--watch':
    case '-w':
      options.watch = true;
      break;
    case '--parallel':
    case '-p':
      options.parallel = true;
      break;
    case '--reporter':
    case '-r':
      options.reporter = args[++i];
      break;
    case '--help':
    case '-h':
      showHelp();
      process.exit(0);
      break;
    default:
      if (arg.startsWith('--')) {
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
      }
  }
}

function showHelp() {
  console.log(`
FFAnalytics Test Runner

Usage: node scripts/run-analytics-tests.js [options]

Options:
  -s, --suite <name>     Run specific test suite (default: all)
  -v, --verbose          Enable verbose output
  -c, --coverage         Generate coverage report
  -w, --watch            Watch mode for development
  -p, --parallel         Run tests in parallel
  -r, --reporter <type>  Test reporter (default, verbose, json)
  -h, --help             Show this help message

Available test suites:
${Object.entries(testSuites).map(([key, suite]) => 
  `  ${key.padEnd(15)} ${suite.description}`
).join('\n')}

Examples:
  node scripts/run-analytics-tests.js --suite unit
  node scripts/run-analytics-tests.js --suite performance --verbose
  node scripts/run-analytics-tests.js --coverage
  node scripts/run-analytics-tests.js --watch --suite unit
`);
}

function runVitest(files, suiteOptions = {}) {
  return new Promise((resolve, reject) => {
    const vitestArgs = ['run'];
    
    // Add files to test
    if (files && files.length > 0) {
      vitestArgs.push(...files);
    }
    
    // Add options
    if (options.verbose) {
      vitestArgs.push('--reporter=verbose');
    } else if (options.reporter !== 'default') {
      vitestArgs.push(`--reporter=${options.reporter}`);
    }
    
    if (options.coverage) {
      vitestArgs.push('--coverage');
    }
    
    if (options.watch) {
      vitestArgs.push('--watch');
    }
    
    if (options.parallel) {
      vitestArgs.push('--threads');
    }
    
    // Set timeout
    if (suiteOptions.timeout) {
      vitestArgs.push(`--testTimeout=${suiteOptions.timeout}`);
    }
    
    console.log(`Running: npx vitest ${vitestArgs.join(' ')}`);
    
    const vitestProcess = spawn('npx', ['vitest', ...vitestArgs], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true
    });
    
    vitestProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Tests failed with exit code ${code}`));
      }
    });
    
    vitestProcess.on('error', (error) => {
      reject(error);
    });
  });
}

async function runTestSuite(suiteName, suite) {
  console.log(`\n🧪 Running ${suite.name}`);
  console.log(`📝 ${suite.description}`);
  console.log(`📁 Files: ${suite.files.length}`);
  
  if (options.verbose) {
    console.log(`   ${suite.files.join('\n   ')}`);
  }
  
  const startTime = Date.now();
  
  try {
    await runVitest(suite.files, { timeout: suite.timeout });
    const duration = Date.now() - startTime;
    console.log(`✅ ${suite.name} completed in ${duration}ms`);
    return { success: true, duration, suite: suiteName };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ ${suite.name} failed after ${duration}ms`);
    console.error(`   Error: ${error.message}`);
    return { success: false, duration, suite: suiteName, error };
  }
}

async function runAllTests() {
  console.log('🚀 Starting FFAnalytics Test Suite');
  console.log(`📊 Configuration: ${JSON.stringify(options, null, 2)}`);
  
  const startTime = Date.now();
  const results = [];
  
  if (options.suite === 'all') {
    // Run all test suites
    for (const [suiteName, suite] of Object.entries(testSuites)) {
      const result = await runTestSuite(suiteName, suite);
      results.push(result);
      
      // Stop on first failure unless in watch mode
      if (!result.success && !options.watch) {
        break;
      }
    }
  } else {
    // Run specific test suite
    const suite = testSuites[options.suite];
    if (!suite) {
      console.error(`❌ Unknown test suite: ${options.suite}`);
      console.error(`Available suites: ${Object.keys(testSuites).join(', ')}`);
      process.exit(1);
    }
    
    const result = await runTestSuite(options.suite, suite);
    results.push(result);
  }
  
  // Print summary
  const totalDuration = Date.now() - startTime;
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => r.success === false).length;
  
  console.log('\n📊 Test Summary');
  console.log(`⏱️  Total time: ${totalDuration}ms`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed suites:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   ${r.suite}: ${r.error?.message || 'Unknown error'}`);
    });
  }
  
  // Detailed timing if verbose
  if (options.verbose) {
    console.log('\n⏱️  Detailed timing:');
    results.forEach(r => {
      const status = r.success ? '✅' : '❌';
      console.log(`   ${status} ${r.suite}: ${r.duration}ms`);
    });
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\n🛑 Test run interrupted');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Test run terminated');
  process.exit(1);
});

// Run the tests
runAllTests().catch((error) => {
  console.error('💥 Fatal error running tests:', error);
  process.exit(1);
});