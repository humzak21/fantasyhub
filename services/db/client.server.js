/**
 * Node entry point for the database clients.
 *
 * Its only job is to load `.env` files before a client is built, then hand back
 * the same memoised clients the rest of the app uses. Browser code must not
 * import this file — dotenv has no place in the bundle.
 *
 * Import order is not a hazard here: `./client.js` resolves environment
 * variables lazily, inside the getters, so the `dotenv.config()` calls below
 * still land first even though the import is hoisted above them.
 */

import dotenv from 'dotenv';
import { getAnonClient, getAdminClient, resolveClient, isAdminClient, resetClients } from './client.js';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
dotenv.config();

export { getAnonClient, getAdminClient, resolveClient, isAdminClient, resetClients };

/** Eager handles, for scripts that expect a value rather than a getter. */
export const supabase = getAnonClient();
export const supabaseAdmin = getAdminClient();
