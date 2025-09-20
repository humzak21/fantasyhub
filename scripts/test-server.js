#!/usr/bin/env node

/**
 * Test Server Analytics API
 * 
 * Simple script to test the analytics API endpoints
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api/analytics';

async function testServer() {
  console.log('🧪 Testing Analytics API Server...\n');

  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch('http://localhost:3001/health');
    const healthData = await healthResponse.json();
    
    if (healthResponse.ok) {
      console.log('✅ Health check passed');
      console.log(`   Status: ${healthData.status}`);
      console.log(`   Environment: ${healthData.environment}`);
    } else {
      console.log('❌ Health check failed');
      return;
    }

    // Test 2: Analytics status
    console.log('\n2. Testing analytics status...');
    const statusResponse = await fetch(`${API_BASE}/status`);
    const statusData = await statusResponse.json();
    
    if (statusResponse.ok) {
      console.log('✅ Analytics status check passed');
      console.log(`   Status: ${statusData.status}`);
      console.log(`   Stats:`, statusData.stats);
    } else {
      console.log('❌ Analytics status check failed');
      console.log(`   Error: ${statusData.error}`);
    }

    // Test 3: Sync endpoint (POST)
    console.log('\n3. Testing sync endpoint...');
    const syncResponse = await fetch(`${API_BASE}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ week: 2, force: true })
    });
    
    const syncData = await syncResponse.json();
    
    if (syncResponse.ok) {
      console.log('✅ Sync endpoint test passed');
      console.log(`   Message: ${syncData.message}`);
      console.log(`   Results:`, syncData.results);
    } else {
      console.log('❌ Sync endpoint test failed');
      console.log(`   Error: ${syncData.error}`);
    }

    console.log('\n🎉 Server tests completed!');

  } catch (error) {
    console.error('\n❌ Server test failed:', error.message);
    console.log('\n🔧 Make sure the server is running:');
    console.log('   npm run server:dev');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testServer();
}

export { testServer };