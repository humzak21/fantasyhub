#!/usr/bin/env node

/**
 * Health Check Script
 * Tests connectivity to both frontend and backend services
 */

const https = require('https');
const http = require('http');

const FRONTEND_URL = process.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:3000';
const BACKEND_URL = process.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:3001';

function checkService(name, url, endpoint = '') {
  return new Promise((resolve) => {
    const fullUrl = `${url}${endpoint}`;
    const isHttps = fullUrl.startsWith('https');
    const client = isHttps ? https : http;
    
    console.log(`🔍 Checking ${name} at ${fullUrl}...`);
    
    const request = client.get(fullUrl, { timeout: 5000 }, (response) => {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        console.log(`✅ ${name} is healthy`);
        resolve(true);
      } else {
        console.log(`❌ ${name} returned status ${response.statusCode}`);
        resolve(false);
      }
    });

    request.on('error', (error) => {
      console.log(`❌ ${name} is not accessible: ${error.message}`);
      resolve(false);
    });

    request.on('timeout', () => {
      console.log(`❌ ${name} request timed out`);
      request.destroy();
      resolve(false);
    });
  });
}

async function main() {
  console.log('🏥 Movie Tracker Health Check\n');
  
  const checks = await Promise.all([
    checkService('Frontend', FRONTEND_URL),
    checkService('Backend API', BACKEND_URL, '/health')
  ]);

  const allHealthy = checks.every(check => check);
  
  console.log('\n📊 Health Check Summary:');
  console.log(`Status: ${allHealthy ? '✅ All services healthy' : '❌ Some services unhealthy'}`);
  
  if (!allHealthy) {
    console.log('\n🔧 Troubleshooting:');
    console.log('- Make sure both frontend and backend are running');
    console.log('- Check your environment variables');
    console.log('- Run: npm run dev:full');
    process.exit(1);
  }
  
  process.exit(0);
}

main().catch(console.error); 