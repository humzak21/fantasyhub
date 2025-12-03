import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupDatabase() {
    console.log('Setting up awards database...');

    const sqlPath = path.join(process.cwd(), 'database', 'awards_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Split by semicolon to get individual statements (rough splitting)
    // Note: This might break complex functions, but for simple tables it's fine.
    // However, the function definition uses $$ which contains semicolons.
    // So splitting by semicolon is dangerous.

    // If we have an RPC for raw SQL, we can try sending the whole thing.
    // But usually Supabase client doesn't support raw SQL execution directly without an RPC.

    // Let's try to use the 'execute_raw_sql' RPC if it exists.
    const { error } = await supabase.rpc('execute_raw_sql', { query: sql });

    if (error) {
        console.error('Error executing SQL via RPC:', error);
        console.log('Attempting to execute via direct connection if possible... (not implemented)');
        console.log('Please run the SQL in database/awards_schema.sql manually in the Supabase Dashboard.');
    } else {
        console.log('Successfully executed SQL via RPC.');
    }
}

setupDatabase();
