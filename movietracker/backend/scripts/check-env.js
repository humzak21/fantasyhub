#!/usr/bin/env node

/**
 * Environment Variables Checker for Railway Deployment
 *
 * This script checks if all required environment variables are properly set.
 * Run this to debug environment variable issues on Railway.
 */

import dotenv from 'dotenv';

// Load .env file in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY', 
  'SUPABASE_SERVICE_ROLE_KEY',
  'TMDB_API_KEY',
  'FRONTEND_URL'
];

const optionalEnvVars = [
  'NODE_ENV',
  'PORT'
];

console.log('🔍 Checking Environment Variables...\n');

let allRequired = true;

console.log('📋 Required Variables:');
requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  const status = value ? '✅' : '❌';
  const displayValue = value ? 
    (varName.includes('KEY') ? `${value.substring(0, 10)}...` : value) : 
    'NOT SET';
  
  console.log(`${status} ${varName}: ${displayValue}`);
  
  if (!value) {
    allRequired = false;
  }
});

console.log('\n📋 Optional Variables:');
optionalEnvVars.forEach(varName => {
  const value = process.env[varName];
  const status = value ? '✅' : '⚠️';
  console.log(`${status} ${varName}: ${value || 'NOT SET'}`);
});

console.log('\n' + '='.repeat(50));

if (allRequired) {
  console.log('🎉 All required environment variables are set!');
  console.log('✅ Your Railway deployment should work correctly.');
} else {
  console.log('❌ Missing required environment variables!');
  console.log('🚨 Please set the missing variables in Railway dashboard:');
  console.log('   Project → Variables tab → Add the missing variables');
}

console.log('\n📚 Railway Environment Setup Guide:');
console.log('1. Go to your Railway project dashboard');
console.log('2. Click on the "Variables" tab');
console.log('3. Add each missing variable with its value');
console.log('4. Redeploy your application');

process.exit(allRequired ? 0 : 1);