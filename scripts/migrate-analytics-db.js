#!/usr/bin/env node

/**
 * Database Migration Script for FFAnalytics Integration
 * This script handles database schema migrations for the analytics integration
 */

const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  migrationsDir: path.join(__dirname, '..', 'database'),
  migrationFile: 'ffanalytics_schema_migration.sql',
  rollbackFile: 'ffanalytics_schema_rollback.sql',
  testFile: 'test_ffanalytics_schema.sql'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

// Logging functions
const log = {
  info: (msg) => console.log(`${colors.green}[INFO]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  debug: (msg) => console.log(`${colors.blue}[DEBUG]${colors.reset} ${msg}`)
};

/**
 * Check if migration files exist
 */
function checkMigrationFiles() {
  log.info('Checking migration files...');
  
  const migrationPath = path.join(config.migrationsDir, config.migrationFile);
  const rollbackPath = path.join(config.migrationsDir, config.rollbackFile);
  
  const files = {
    migration: fs.existsSync(migrationPath),
    rollback: fs.existsSync(rollbackPath)
  };
  
  if (files.migration) {
    log.info(`✓ Migration file found: ${config.migrationFile}`);
  } else {
    log.error(`✗ Migration file not found: ${migrationPath}`);
  }
  
  if (files.rollback) {
    log.info(`✓ Rollback file found: ${config.rollbackFile}`);
  } else {
    log.warn(`⚠ Rollback file not found: ${rollbackPath}`);
  }
  
  return files;
}

/**
 * Validate SQL syntax (basic validation)
 */
function validateSQL(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Basic SQL validation
    const issues = [];
    
    // Check for common SQL syntax issues
    if (!content.trim()) {
      issues.push('File is empty');
    }
    
    // Check for unmatched parentheses
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      issues.push(`Unmatched parentheses: ${openParens} open, ${closeParens} close`);
    }
    
    // Check for basic SQL keywords
    const hasCreateTable = /CREATE\s+TABLE/i.test(content);
    const hasAlterTable = /ALTER\s+TABLE/i.test(content);
    
    if (!hasCreateTable && !hasAlterTable) {
      issues.push('No CREATE TABLE or ALTER TABLE statements found');
    }
    
    return {
      valid: issues.length === 0,
      issues: issues,
      content: content
    };
  } catch (error) {
    return {
      valid: false,
      issues: [`Failed to read file: ${error.message}`],
      content: null
    };
  }
}

/**
 * Generate migration instructions
 */
function generateMigrationInstructions() {
  const migrationPath = path.join(config.migrationsDir, config.migrationFile);
  const rollbackPath = path.join(config.migrationsDir, config.rollbackFile);
  
  log.info('Generating migration instructions...');
  
  const instructions = `
# FFAnalytics Database Migration Instructions

## Overview
This migration adds the necessary database schema for the FFAnalytics integration.

## Prerequisites
- Supabase project with admin access
- Database connection established
- Backup of current database (recommended)

## Migration Steps

### 1. Backup Current Database
\`\`\`sql
-- Create a backup before running migrations
-- Use Supabase dashboard or pg_dump
\`\`\`

### 2. Run Migration
Execute the following file in your Supabase SQL editor:
\`${migrationPath}\`

### 3. Verify Migration
Check that the following tables/columns were created:
- \`players\` table extensions (ffanalytics columns)
- \`player_analytics_history\` table
- \`team_analytics_summary\` table
- Appropriate indexes

### 4. Test Schema
Run the test file to verify schema integrity:
\`${path.join(config.migrationsDir, config.testFile)}\`

## Rollback (if needed)
If you need to rollback the migration:
\`${rollbackPath}\`

## Verification Queries

### Check Players Table Extensions
\`\`\`sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'players'
AND column_name LIKE 'ffanalytics%';
\`\`\`

### Check New Tables
\`\`\`sql
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('player_analytics_history', 'team_analytics_summary');
\`\`\`

### Check Indexes
\`\`\`sql
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname LIKE '%ffanalytics%' OR indexname LIKE '%analytics%';
\`\`\`

## Troubleshooting

### Common Issues
1. **Permission Denied**: Ensure you have admin access to the database
2. **Table Already Exists**: Check if migration was already run
3. **Column Already Exists**: Use IF NOT EXISTS clauses in migration

### Support
- Check migration logs
- Verify Supabase connection
- Review SQL syntax in migration files

## Post-Migration Steps
1. Update application configuration
2. Run analytics health check: \`npm run analytics:health-check\`
3. Test data sync: \`npm run analytics:sync-weekly\`
`;

  const instructionsPath = path.join(config.migrationsDir, 'MIGRATION_INSTRUCTIONS.md');
  fs.writeFileSync(instructionsPath, instructions);
  
  log.info(`✓ Migration instructions created: ${instructionsPath}`);
  return instructionsPath;
}

/**
 * Create migration status tracker
 */
function createMigrationTracker() {
  const trackerContent = `-- FFAnalytics Migration Status Tracker
-- This table tracks the status of analytics migrations

CREATE TABLE IF NOT EXISTS analytics_migrations (
  id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL UNIQUE,
  version VARCHAR(50) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  rollback_sql TEXT,
  notes TEXT
);

-- Insert initial migration record
INSERT INTO analytics_migrations (migration_name, version, rollback_sql, notes)
VALUES (
  'ffanalytics_schema_migration',
  '1.0.0',
  'See ffanalytics_schema_rollback.sql',
  'Initial FFAnalytics integration schema'
) ON CONFLICT (migration_name) DO NOTHING;

-- Query to check migration status
-- SELECT * FROM analytics_migrations ORDER BY applied_at DESC;`;

  const trackerPath = path.join(config.migrationsDir, 'analytics_migration_tracker.sql');
  fs.writeFileSync(trackerPath, trackerContent);
  
  log.info(`✓ Migration tracker created: ${trackerPath}`);
  return trackerPath;
}

/**
 * Main migration process
 */
function main() {
  console.log('=== FFAnalytics Database Migration Tool ===\n');
  
  try {
    // Check migration files
    const files = checkMigrationFiles();
    
    if (!files.migration) {
      log.error('Cannot proceed without migration file');
      process.exit(1);
    }
    
    // Validate migration SQL
    log.info('Validating migration SQL...');
    const migrationPath = path.join(config.migrationsDir, config.migrationFile);
    const validation = validateSQL(migrationPath);
    
    if (validation.valid) {
      log.info('✓ Migration SQL validation passed');
    } else {
      log.warn('⚠ Migration SQL validation issues:');
      validation.issues.forEach(issue => log.warn(`  - ${issue}`));
    }
    
    // Validate rollback SQL if exists
    if (files.rollback) {
      log.info('Validating rollback SQL...');
      const rollbackPath = path.join(config.migrationsDir, config.rollbackFile);
      const rollbackValidation = validateSQL(rollbackPath);
      
      if (rollbackValidation.valid) {
        log.info('✓ Rollback SQL validation passed');
      } else {
        log.warn('⚠ Rollback SQL validation issues:');
        rollbackValidation.issues.forEach(issue => log.warn(`  - ${issue}`));
      }
    }
    
    // Generate migration instructions
    const instructionsPath = generateMigrationInstructions();
    
    // Create migration tracker
    const trackerPath = createMigrationTracker();
    
    // Summary
    console.log('\n=== Migration Preparation Complete ===');
    log.info('Files prepared for database migration:');
    log.info(`  Migration: ${path.join(config.migrationsDir, config.migrationFile)}`);
    if (files.rollback) {
      log.info(`  Rollback: ${path.join(config.migrationsDir, config.rollbackFile)}`);
    }
    log.info(`  Instructions: ${instructionsPath}`);
    log.info(`  Tracker: ${trackerPath}`);
    
    console.log('\nNext steps:');
    console.log('1. Review the migration instructions');
    console.log('2. Backup your database');
    console.log('3. Execute the migration in Supabase');
    console.log('4. Run the migration tracker SQL');
    console.log('5. Test with: npm run analytics:health-check');
    
  } catch (error) {
    log.error(`Migration preparation failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  checkMigrationFiles,
  validateSQL,
  generateMigrationInstructions,
  createMigrationTracker
};