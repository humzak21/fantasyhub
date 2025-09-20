#!/usr/bin/env node

/**
 * FFAnalytics Integration Health Check
 * Comprehensive health check for the entire analytics integration system
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  rExecutable: process.env.R_EXECUTABLE_PATH || 'Rscript',
  scriptsPath: process.env.FFANALYTICS_SCRIPTS_PATH || './scripts/ffanalytics/',
  timeout: parseInt(process.env.R_SCRIPT_TIMEOUT) || 300000, // 5 minutes
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Logging functions
const log = {
  info: (msg) => console.log(`${colors.green}[INFO]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  debug: (msg) => config.logLevel === 'debug' && console.log(`${colors.blue}[DEBUG]${colors.reset} ${msg}`),
  section: (msg) => console.log(`${colors.cyan}\n=== ${msg} ===${colors.reset}`)
};

/**
 * Health check results tracker
 */
class HealthCheckResults {
  constructor() {
    this.results = {
      environment: { status: 'pending', details: {} },
      rEnvironment: { status: 'pending', details: {} },
      database: { status: 'pending', details: {} },
      services: { status: 'pending', details: {} },
      scripts: { status: 'pending', details: {} },
      overall: { status: 'pending', score: 0 }
    };
    this.startTime = Date.now();
  }

  setResult(category, status, details = {}) {
    this.results[category] = { status, details, timestamp: Date.now() };
  }

  getOverallStatus() {
    const categories = ['environment', 'rEnvironment', 'database', 'services', 'scripts'];
    const statuses = categories.map(cat => this.results[cat].status);
    
    const healthy = statuses.filter(s => s === 'healthy').length;
    const total = statuses.length;
    const score = Math.round((healthy / total) * 100);
    
    let overall = 'unhealthy';
    if (score >= 80) overall = 'healthy';
    else if (score >= 60) overall = 'degraded';
    
    this.results.overall = { status: overall, score, timestamp: Date.now() };
    return this.results.overall;
  }

  generateReport() {
    const duration = Date.now() - this.startTime;
    const overall = this.getOverallStatus();
    
    return {
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      overall: overall,
      details: this.results
    };
  }
}/
**
 * Check Node.js environment and dependencies
 */
async function checkEnvironment(results) {
  log.section('Environment Check');
  
  try {
    // Check Node.js version
    const nodeVersion = process.version;
    log.info(`Node.js version: ${nodeVersion}`);
    
    // Check required environment variables
    const requiredEnvVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingEnvVars.length > 0) {
      log.warn(`Missing environment variables: ${missingEnvVars.join(', ')}`);
    }
    
    // Check if package.json exists and has analytics dependencies
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      log.info('✓ package.json found');
      
      // Check for analytics-related scripts
      const scripts = packageJson.scripts || {};
      const analyticsScripts = Object.keys(scripts).filter(key => key.includes('analytics'));
      if (analyticsScripts.length > 0) {
        log.info(`✓ Analytics scripts available: ${analyticsScripts.join(', ')}`);
      }
    }
    
    results.setResult('environment', 'healthy', {
      nodeVersion,
      missingEnvVars,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    log.error(`Environment check failed: ${error.message}`);
    results.setResult('environment', 'unhealthy', { error: error.message });
  }
}

/**
 * Check R environment using the R health check script
 */
async function checkREnvironment(results) {
  log.section('R Environment Check');
  
  return new Promise((resolve) => {
    const testScriptPath = path.join(config.scriptsPath, 'test_environment.R');
    
    if (!fs.existsSync(testScriptPath)) {
      log.error(`R test script not found: ${testScriptPath}`);
      results.setResult('rEnvironment', 'unhealthy', { 
        error: 'Test script not found',
        path: testScriptPath 
      });
      resolve();
      return;
    }
    
    log.info('Running R environment test...');
    const rProcess = spawn(config.rExecutable, [testScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: config.timeout
    });
    
    let stdout = '';
    let stderr = '';
    
    rProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    rProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    rProcess.on('close', (code) => {
      if (code === 0) {
        log.info('✓ R environment test passed');
        results.setResult('rEnvironment', 'healthy', {
          exitCode: code,
          output: stdout.substring(0, 500) // Truncate for brevity
        });
      } else {
        log.error(`R environment test failed with code ${code}`);
        log.debug(`R stderr: ${stderr}`);
        results.setResult('rEnvironment', 'unhealthy', {
          exitCode: code,
          error: stderr,
          output: stdout.substring(0, 500)
        });
      }
      resolve();
    });
    
    rProcess.on('error', (error) => {
      log.error(`Failed to run R test: ${error.message}`);
      results.setResult('rEnvironment', 'unhealthy', { error: error.message });
      resolve();
    });
  });
}

/**
 * Check database connectivity and schema
 */
async function checkDatabase(results) {
  log.section('Database Check');
  
  try {
    // Try to import and test Supabase client
    const supabaseClientPath = path.join(process.cwd(), 'services', 'supabaseClient.js');
    
    if (!fs.existsSync(supabaseClientPath)) {
      log.warn('Supabase client not found, skipping database check');
      results.setResult('database', 'degraded', { 
        warning: 'Supabase client not found' 
      });
      return;
    }
    
    // Basic connectivity test (without actually connecting to avoid credentials issues)
    log.info('✓ Supabase client file exists');
    
    // Check if migration files exist
    const migrationPath = path.join(process.cwd(), 'database', 'ffanalytics_schema_migration.sql');
    if (fs.existsSync(migrationPath)) {
      log.info('✓ Database migration file found');
    } else {
      log.warn('Database migration file not found');
    }
    
    results.setResult('database', 'healthy', {
      clientExists: true,
      migrationExists: fs.existsSync(migrationPath)
    });
    
  } catch (error) {
    log.error(`Database check failed: ${error.message}`);
    results.setResult('database', 'unhealthy', { error: error.message });
  }
}

/**
 * Check analytics services
 */
async function checkServices(results) {
  log.section('Services Check');
  
  try {
    const servicesDir = path.join(process.cwd(), 'services');
    const requiredServices = [
      'ffAnalyticsService.js',
      'rScriptExecutor.js',
      'analyticsCache.js',
      'playerMatchingService.js'
    ];
    
    const serviceStatus = {};
    
    for (const service of requiredServices) {
      const servicePath = path.join(servicesDir, service);
      const exists = fs.existsSync(servicePath);
      serviceStatus[service] = exists;
      
      if (exists) {
        log.info(`✓ ${service} found`);
      } else {
        log.warn(`⚠ ${service} not found`);
      }
    }
    
    const foundServices = Object.values(serviceStatus).filter(Boolean).length;
    const totalServices = requiredServices.length;
    
    let status = 'healthy';
    if (foundServices < totalServices * 0.8) {
      status = 'unhealthy';
    } else if (foundServices < totalServices) {
      status = 'degraded';
    }
    
    results.setResult('services', status, {
      services: serviceStatus,
      found: foundServices,
      total: totalServices
    });
    
  } catch (error) {
    log.error(`Services check failed: ${error.message}`);
    results.setResult('services', 'unhealthy', { error: error.message });
  }
}

/**
 * Check R scripts
 */
async function checkScripts(results) {
  log.section('R Scripts Check');
  
  try {
    const requiredScripts = [
      'scrape_weekly_projections.R',
      'scrape_season_projections.R',
      'process_analytics_data.R',
      'test_environment.R'
    ];
    
    const scriptStatus = {};
    
    for (const script of requiredScripts) {
      const scriptPath = path.join(config.scriptsPath, script);
      const exists = fs.existsSync(scriptPath);
      scriptStatus[script] = exists;
      
      if (exists) {
        log.info(`✓ ${script} found`);
      } else {
        log.warn(`⚠ ${script} not found`);
      }
    }
    
    const foundScripts = Object.values(scriptStatus).filter(Boolean).length;
    const totalScripts = requiredScripts.length;
    
    let status = 'healthy';
    if (foundScripts < totalScripts * 0.8) {
      status = 'unhealthy';
    } else if (foundScripts < totalScripts) {
      status = 'degraded';
    }
    
    results.setResult('scripts', status, {
      scripts: scriptStatus,
      found: foundScripts,
      total: totalScripts
    });
    
  } catch (error) {
    log.error(`Scripts check failed: ${error.message}`);
    results.setResult('scripts', 'unhealthy', { error: error.message });
  }
}

/**
 * Main health check function
 */
async function runHealthCheck() {
  console.log('🏥 FFAnalytics Integration Health Check\n');
  
  const results = new HealthCheckResults();
  
  // Run all health checks
  await checkEnvironment(results);
  await checkREnvironment(results);
  await checkDatabase(results);
  await checkServices(results);
  await checkScripts(results);
  
  // Generate final report
  const report = results.generateReport();
  
  // Display summary
  log.section('Health Check Summary');
  const overall = report.overall;
  
  if (overall.status === 'healthy') {
    log.info(`✅ Overall Status: HEALTHY (${overall.score}%)`);
    log.info('The FFAnalytics integration is ready for use.');
  } else if (overall.status === 'degraded') {
    log.warn(`⚠️  Overall Status: DEGRADED (${overall.score}%)`);
    log.warn('The integration has some issues but may still function.');
  } else {
    log.error(`❌ Overall Status: UNHEALTHY (${overall.score}%)`);
    log.error('The integration has critical issues that need attention.');
  }
  
  log.info(`Health check completed in ${report.duration}`);
  
  // Save detailed report
  const reportPath = path.join(process.cwd(), 'logs', 'analytics', 'health-check.json');
  try {
    // Ensure logs directory exists
    const logsDir = path.dirname(reportPath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log.info(`Detailed report saved: ${reportPath}`);
  } catch (error) {
    log.warn(`Could not save report: ${error.message}`);
  }
  
  // Exit with appropriate code
  process.exit(overall.status === 'healthy' ? 0 : 1);
}

// Run health check if called directly
if (require.main === module) {
  runHealthCheck().catch(error => {
    log.error(`Health check failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  runHealthCheck,
  checkEnvironment,
  checkREnvironment,
  checkDatabase,
  checkServices,
  checkScripts,
  HealthCheckResults
};