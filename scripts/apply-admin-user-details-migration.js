#!/usr/bin/env node

/**
 * Apply admin user details migration to Supabase
 * This creates the get_users_for_admin RPC function
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   VITE_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('📦 Applying admin user details migration...\n');

  try {
    // Read the migration SQL file
    const migrationPath = join(__dirname, '../database/admin_user_details_migration.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded:', migrationPath);
    console.log('🔧 Executing migration...\n');

    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_string: migrationSQL
    });

    if (error) {
      // If exec_sql doesn't exist, try direct execution
      console.log('⚠️  exec_sql RPC not available, trying direct execution...');

      // Split by semicolons and execute each statement
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.length > 0) {
          console.log('📝 Executing statement...');
          const { error: stmtError } = await supabase.rpc('exec', {
            query: statement
          });

          if (stmtError) {
            console.error('❌ Error executing statement:', stmtError);
            throw stmtError;
          }
        }
      }

      console.log('\n✅ Migration applied successfully!');
    } else {
      console.log('✅ Migration applied successfully!');
      if (data) {
        console.log('📊 Result:', data);
      }
    }

    // Test the function
    console.log('\n🧪 Testing get_users_for_admin function...');
    const { data: testData, error: testError } = await supabase.rpc('get_users_for_admin', {
      user_ids: []
    });

    if (testError) {
      console.error('⚠️  Test failed:', testError.message);
      console.log('\n⚠️  This is expected if you\'re not logged in as admin.');
      console.log('   The function should work when called from the authenticated admin account.');
    } else {
      console.log('✅ Function is callable!');
      console.log('📊 Test result:', testData);
    }

    console.log('\n✨ Migration complete!');
    console.log('\nℹ️  If the direct execution failed, please run the SQL manually in Supabase:');
    console.log('   1. Go to Supabase Dashboard > SQL Editor');
    console.log('   2. Copy the contents of database/admin_user_details_migration.sql');
    console.log('   3. Paste and execute the SQL\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.log('\n📋 Manual migration required:');
    console.log('   1. Go to Supabase Dashboard > SQL Editor');
    console.log('   2. Copy the contents of database/admin_user_details_migration.sql');
    console.log('   3. Paste and execute the SQL\n');
    process.exit(1);
  }
}

applyMigration();
