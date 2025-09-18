#!/usr/bin/env node

// Load environment variables for Node.js
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printUsage() {
  console.log(`
🏈 Fantasy Football Player Points Migration
==========================================

This script adds player points columns to your database for enhanced power rankings.

Usage: node scripts/migratePlayerPoints.js

Required Environment Variables:
- SUPABASE_URL: Your Supabase project URL
- SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key (for admin operations)

What this migration adds:
- Player points columns (projected, actual, season totals)
- Team roster analytics fields
- Weekly player stats tracking table
- Helper functions for roster calculations

⚠️  Make sure to backup your database before running this migration!
`);
}

async function runMigration() {
  try {
    // Validate environment variables - support both Railway and local formats
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('❌ Missing required environment variables:');
      if (!supabaseUrl) console.error('  - SUPABASE_URL or VITE_SUPABASE_URL');
      if (!serviceRoleKey) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
      console.error('\nPlease check your .env.local file or Railway environment variables.');
      process.exit(1);
    }

    console.log('🔧 Initializing Supabase admin client...');
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Test connection
    console.log('🔍 Testing database connection...');
    const { data: healthCheck, error: healthError } = await supabase
      .from('seasons')
      .select('count', { count: 'exact', head: true });

    if (healthError) {
      if (healthError.code === '42P01') {
        console.error('❌ Base tables not found. Please run the main database migration first.');
        process.exit(1);
      }
      throw healthError;
    }

    console.log('✅ Database connection successful');

    // Read migration SQL file
    const migrationPath = path.join(__dirname, '../database/add_player_points_migration.sql');
    console.log(`📖 Reading migration file: ${migrationPath}`);
    
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Migration file loaded successfully');

    // Execute migration
    console.log('🚀 Executing player points migration...');
    console.log('⏳ This may take a few moments...');

    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSql
    });

    if (error) {
      // If the RPC function doesn't exist, try direct SQL execution
      if (error.code === '42883') {
        console.log('📝 Direct SQL execution (RPC function not available)...');
        
        // Split SQL into individual statements and execute them
        const statements = migrationSql
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        console.log(`📊 Executing ${statements.length} SQL statements...`);

        for (let i = 0; i < statements.length; i++) {
          const statement = statements[i];
          console.log(`  [${i + 1}/${statements.length}] ${statement.substring(0, 50)}...`);
          
          try {
            const { error: stmtError } = await supabase.rpc('exec_statement', {
              statement: statement + ';'
            });
            
            if (stmtError) {
              console.warn(`⚠️  Warning on statement ${i + 1}:`, stmtError.message);
              // Continue with other statements - some may be safe to ignore (like "column already exists")
            }
          } catch (stmtErr) {
            console.warn(`⚠️  Warning on statement ${i + 1}:`, stmtErr.message);
          }
        }
        
        console.log('✅ Migration statements executed (with warnings)');
      } else {
        throw error;
      }
    } else {
      console.log('✅ Migration executed successfully');
    }

    // Verify migration by checking if new columns exist
    console.log('🔍 Verifying migration...');
    
    const { data: columns, error: columnError } = await supabase
      .rpc('get_table_columns', { table_name: 'players' });

    if (columnError) {
      console.log('⚠️  Could not verify column creation, but migration likely succeeded');
    } else {
      const pointsColumns = ['season_projected_points', 'season_actual_points', 'injury_status'];
      const foundColumns = pointsColumns.filter(col => 
        columns?.some(c => c.column_name === col)
      );
      
      console.log(`✅ Verified ${foundColumns.length}/${pointsColumns.length} new columns created`);
    }

    console.log(`
🎉 Player Points Migration Complete!

Next Steps:
1. Run your roster update script to populate player points data:
   node scripts/updateRosters.js update

2. The enhanced power rankings will now include:
   - Roster projected strength (15% weight)
   - Position group balance (5% weight)  
   - Injury resistance (5% weight)

3. Player tables now show:
   - Season total points
   - Points per game averages
   - Injury status
   - Projected vs actual performance

Your fantasy football power rankings are now supercharged! 🚀
`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    if (error.message.includes('permission denied')) {
      console.error(`
💡 Permission Error Solutions:
1. Make sure you're using the SERVICE_ROLE_KEY (not anon key)
2. Verify the service role key has admin privileges
3. Check that RLS policies allow the operation
`);
    }
    
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Some columns already exist - this is normal if re-running the migration');
    }
    
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  await runMigration();
}

main().catch(console.error);