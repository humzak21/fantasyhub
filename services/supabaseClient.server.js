/**
 * Compatibility surface for Node-side imports of the old server client.
 *
 * Delegates to `services/db/client.server.js` (which loads `.env` first) and
 * keeps the startup validation and connection banner the scripts expect. New
 * code should import from `services/db/` directly.
 */

import { getAnonClient, getAdminClient } from './db/client.server.js';
import { getSupabaseUrl, getSupabaseAnonKey, getSupabaseServiceRoleKey } from './db/env.js';
import { throwDbError } from './db/errors.js';

export { formatForDatabase, formatFromDatabase } from './db/caseMap.js';
export { DbError, DbErrorKind, toDbError, unwrap } from './db/errors.js';

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = getSupabaseAnonKey();
const supabaseServiceRoleKey = getSupabaseServiceRoleKey();

if (!supabaseUrl) {
  console.error('❌ Missing SUPABASE_URL or VITE_SUPABASE_URL environment variable');
  process.exit(1);
}

if (!supabaseAnonKey && !supabaseServiceRoleKey) {
  console.error('❌ Missing SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

export const supabase = getAnonClient();
export const supabaseAdmin = getAdminClient();

export const handleSupabaseError = (error, operation = 'Database operation') =>
  throwDbError(error, operation);

console.log('🔗 Supabase Server Client Configuration:');
console.log(`   URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
console.log(`   Anon Key: ${supabaseAnonKey ? '✅ Set' : '❌ Missing'}`);
console.log(`   Service Role Key: ${supabaseServiceRoleKey ? '✅ Set' : '❌ Missing'}`);
console.log(`   Standard Client: ${supabase ? '✅ Ready' : '❌ Not available'}`);
console.log(`   Admin Client: ${supabaseAdmin ? '✅ Ready' : '❌ Not available'}`);
