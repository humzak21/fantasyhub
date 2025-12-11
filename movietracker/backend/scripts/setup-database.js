import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupDatabase() {
  try {
    console.log('Setting up users table...');
    
    // Create users table
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        -- Create users table for authentication
        CREATE TABLE IF NOT EXISTS users (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          google_id TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          picture TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Create indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
      `
    });

    if (error) {
      console.error('Error setting up database:', error);
    } else {
      console.log('✅ Users table created successfully');
    }

    // Test the table
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('count(*)')
      .limit(1);

    if (testError) {
      console.error('Error testing users table:', testError);
    } else {
      console.log('✅ Users table is accessible');
    }

  } catch (err) {
    console.error('Setup error:', err.message);
  }
}

setupDatabase(); 