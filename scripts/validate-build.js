#!/usr/bin/env node

/**
 * Build Validation Script
 * Catches React module resolution and other production build issues
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const log = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`)
};

async function validateBuild() {
  log.info('Starting build validation...');

  try {
    // 1. Check for common React issues in build
    await checkBuildForReactIssues();

    // 2. Build the project
    log.info('Building project...');
    await runCommand('npm', ['run', 'build']);
    log.success('Build completed successfully');

    // 3. Start preview server and test
    log.info('Starting preview server...');
    const previewProcess = spawn('npm', ['run', 'preview'], {
      detached: true,
      stdio: 'pipe'
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4. Test the built application
    try {
      await testBuiltApplication();
      log.success('Build validation passed!');
      process.exit(0);
    } catch (error) {
      log.error(`Build validation failed: ${error.message}`);
      process.exit(1);
    } finally {
      // Clean up preview server
      process.kill(-previewProcess.pid);
    }

  } catch (error) {
    log.error(`Build process failed: ${error.message}`);
    process.exit(1);
  }
}

async function checkBuildForReactIssues() {
  log.info('Checking for potential React module resolution issues...');

  // Check package.json for conflicting React versions
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const lockfile = readFileSync('package-lock.json', 'utf8');

  // Count React instances in lockfile
  const reactMatches = lockfile.match(/"react":/g);
  if (reactMatches && reactMatches.length > 2) {
    log.warn(`Found ${reactMatches.length} React references in lockfile - potential duplication`);
  }

  // Check for conflicting peer dependencies
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const reactVersion = deps.react;
  const reactDomVersion = deps['react-dom'];

  if (reactVersion !== reactDomVersion) {
    log.warn(`React versions mismatch: react@${reactVersion}, react-dom@${reactDomVersion}`);
  }

  log.success('React dependency check completed');
}

async function testBuiltApplication() {
  log.info('Testing built application...');

  // Test basic connectivity
  const response = await fetch('http://localhost:4173');
  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }

  const html = await response.text();

  // Check for common error patterns
  const errorPatterns = [
    /Cannot read properties of undefined/,
    /Cannot set properties of undefined/,
    /useLayoutEffect.*undefined/,
    /React is not defined/,
    /Module not found/
  ];

  for (const pattern of errorPatterns) {
    if (pattern.test(html)) {
      throw new Error(`Found error pattern in HTML: ${pattern}`);
    }
  }

  // Check for required React elements
  if (!html.includes('div id="root"') && !html.includes('div id="app"')) {
    throw new Error('No React root element found');
  }

  log.success('Application loaded successfully');
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

// Run validation
validateBuild().catch(error => {
  log.error(`Validation script failed: ${error.message}`);
  process.exit(1);
});