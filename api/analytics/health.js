/**
 * Analytics Health Check API Endpoint
 * Provides health status information for the FFAnalytics integration
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const config = {
  rExecutable: process.env.R_EXECUTABLE_PATH || 'Rscript',
  scriptsPath: process.env.FFANALYTICS_SCRIPTS_PATH || './scripts/ffanalytics/',
  timeout: parseInt(process.env.R_SCRIPT_TIMEOUT) || 30000, // 30 seconds for API
  logLevel: process.env.LOG_LEVEL || 'info'
};

/**
 * Run a quick health check
 */
async function runQuickHealthCheck() {
  const results = {
    environment: { status: 'pending', details: {} },
    rEnvironment: { status: 'pending', details: {} },
    services: { status: 'pending', details: {} },
    overall: { status: 'pending', score: 0 }
  };

  try {
    // Check environment
    const nodeVersion = process.version;
    const requiredEnvVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    results.environment = {
      status: missingEnvVars.length === 0 ? 'healthy' : 'degraded',
      details: { nodeVersion, missingEnvVars }
    };

    // Check R environment (quick test)
    const rHealthy = await checkREnvironmentQuick();
    results.rEnvironment = {
      status: rHealthy ? 'healthy' : 'unhealthy',
      details: { rExecutable: config.rExecutable }
    };

    // Check services
    const servicesDir = path.join(process.cwd(), 'services');
    const requiredServices = [
      'ffAnalyticsService.js',
      'rScriptExecutor.js',
      'analyticsCache.js'
    ];

    const serviceStatus = {};
    let foundServices = 0;

    for (const service of requiredServices) {
      const servicePath = path.join(servicesDir, service);
      const exists = fs.existsSync(servicePath);
      serviceStatus[service] = exists;
      if (exists) foundServices++;
    }

    const serviceHealth = foundServices >= requiredServices.length * 0.8 ? 'healthy' : 'unhealthy';
    results.services = {
      status: serviceHealth,
      details: { services: serviceStatus, found: foundServices, total: requiredServices.length }
    };

    // Calculate overall score
    const statuses = [results.environment.status, results.rEnvironment.status, results.services.status];
    const healthy = statuses.filter(s => s === 'healthy').length;
    const score = Math.round((healthy / statuses.length) * 100);
    
    let overall = 'unhealthy';
    if (score >= 80) overall = 'healthy';
    else if (score >= 60) overall = 'degraded';

    results.overall = { status: overall, score };

  } catch (error) {
    console.error('Health check error:', error);
    results.overall = { status: 'unhealthy', score: 0, error: error.message };
  }

  return results;
}

/**
 * Quick R environment check
 */
async function checkREnvironmentQuick() {
  return new Promise((resolve) => {
    const rProcess = spawn(config.rExecutable, ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000 // 5 second timeout
    });

    rProcess.on('close', (code) => {
      resolve(code === 0);
    });

    rProcess.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * API Handler
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const healthStatus = await runQuickHealthCheck();
    
    res.status(200).json({
      timestamp: new Date().toISOString(),
      ...healthStatus
    });
  } catch (error) {
    console.error('Health check API error:', error);
    res.status(500).json({
      error: 'Health check failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}