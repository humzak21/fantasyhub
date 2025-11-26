#!/usr/bin/env node

/**
 * Railway-specific build script to handle memory constraints
 */

console.log('🚂 Railway Build Script Starting...');

// Set conservative memory limits (only valid flags)
process.env.NODE_OPTIONS = '--max-old-space-size=384';

console.log('💾 Memory settings applied:');
console.log('  - Max old space: 384MB (very conservative)');

// Import required modules
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

/**
 * Run command with memory constraints
 */
function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`🔧 Running: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=384'
      },
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${command} completed successfully`);
        resolve();
      } else {
        console.error(`❌ ${command} failed with code ${code}`);
        reject(new Error(`Command failed: ${command}`));
      }
    });

    child.on('error', (error) => {
      console.error(`❌ Error running ${command}:`, error);
      reject(error);
    });
  });
}

/**
 * Force garbage collection if available
 */
function forceGC() {
  if (global.gc) {
    console.log('🧹 Running garbage collection...');
    global.gc();
  }
}

async function build() {
  try {
    console.log('🏗️  Starting build process...');
    
    // Step 1: Clean any previous builds
    console.log('🧽 Cleaning previous builds...');
    try {
      await runCommand('rm', ['-rf', 'dist']);
    } catch (error) {
      console.log('ℹ️  No previous dist to clean');
    }
    
    // Force GC after cleanup
    forceGC();
    
    // Step 2: Run Vite build with minimal memory
    console.log('⚡ Building frontend with Vite...');
    await runCommand('npx', ['vite', 'build', '--mode', 'production']);
    
    // Force GC after build
    forceGC();
    
    console.log('✅ Build completed successfully!');
    console.log('📦 Frontend built to dist/');
    
  } catch (error) {
    console.error('💥 Build failed:', error.message);
    process.exit(1);
  }
}

// Start the build
build(); 