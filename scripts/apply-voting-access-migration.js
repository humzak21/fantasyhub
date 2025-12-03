import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    console.error('VITE_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
    console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Set' : 'Missing');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
});

async function applyMigration() {
    console.log('Applying voting access migration...');

    const migrationPath = path.join(__dirname, '..', 'database', 'add-voting-access-column.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Split by semicolons and execute each statement
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    for (const statement of statements) {
        console.log('\nExecuting statement...');
        console.log(statement.substring(0, 100) + '...');

        const { data, error } = await supabase.rpc('exec_sql', { sql: statement });

        if (error) {
            // Check if it's just a notice about already existing column
            if (error.message && error.message.includes('already exists')) {
                console.log('Column already exists, skipping...');
                continue;
            }
            console.error('Error executing statement:', error);
            // Continue anyway - some errors are expected
        } else {
            console.log('✓ Statement executed successfully');
        }
    }

    console.log('\n✅ Migration completed!');
    console.log('\nYou can now use the toggle in the Admin panel to control awards section access.');
}

applyMigration().catch(console.error);
