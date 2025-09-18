#!/usr/bin/env node

// Railway environment variable injection script
// This runs after build to inject runtime environment variables

import fs from 'fs';
import path from 'path';

const envFilePath = path.join(process.cwd(), 'dist', 'env.js');

console.log('🚀 Injecting Railway environment variables...');

// Read the template file
let envContent = fs.readFileSync(envFilePath, 'utf8');

// Replace placeholders with actual environment variables
envContent = envContent.replace('{{VITE_SUPABASE_URL}}', process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '');
envContent = envContent.replace('{{VITE_SUPABASE_ANON_KEY}}', process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '');
envContent = envContent.replace('{{VITE_ADMIN_USER_ID}}', process.env.VITE_ADMIN_USER_ID || '');

// Write the file back
fs.writeFileSync(envFilePath, envContent);

console.log('✅ Environment variables injected successfully');
console.log('📊 Variables:', {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? 'present' : 'missing',
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ? 'present' : 'missing',
  VITE_ADMIN_USER_ID: process.env.VITE_ADMIN_USER_ID ? 'present' : 'missing'
});