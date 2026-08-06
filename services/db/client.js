/**
 * The only place `createClient()` is called.
 *
 * There used to be three factories — `supabaseClient.js`,
 * `supabaseClient.server.js` and `SupabaseDataManager.initialize()` — each with
 * its own environment detection. Beyond the triplicated env logic, every extra
 * anon client is a second GoTrue instance racing the first over the same
 * `localStorage` session, which is how auth state ends up disagreeing between
 * the app shell and a component that imported the "other" client.
 *
 * Two clients exist here, memoised, and no more:
 *
 *   getAnonClient()   public anon key, RLS applies. The browser client.
 *   getAdminClient()  service-role key, bypasses RLS. Node only — returns null
 *                     in the browser because the key is never exposed there.
 *
 * Node scripts should import `./client.server.js`, which loads `.env` files
 * before delegating here.
 */

import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseAnonKey, getSupabaseServiceRoleKey, isBrowser } from './env.js';
import { DbError, DbErrorKind } from './errors.js';

let anonClient = null;
let adminClient = null;

/**
 * The browser/public client. Returns null when the project is not configured,
 * matching the previous behaviour of `export const supabase = url && key ? … : null`.
 */
export function getAnonClient() {
  if (anonClient) return anonClient;

  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;

  anonClient = createClient(url, key, {
    auth: {
      // The browser keeps a session; Node scripts have nowhere to persist one.
      autoRefreshToken: isBrowser(),
      persistSession: isBrowser(),
      detectSessionInUrl: isBrowser()
    },
    db: { schema: 'public' },
    global: {
      headers: { 'x-client-info': 'fantasy-football-power-rankings' }
    }
  });

  return anonClient;
}

/** The service-role client. Null in the browser, and null without the key. */
export function getAdminClient() {
  if (adminClient) return adminClient;

  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) return null;

  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
    global: {
      headers: { 'x-client-info': 'fantasy-football-power-rankings-admin' }
    }
  });

  return adminClient;
}

/**
 * The client for "whatever this process is". Node scripts holding the
 * service-role key get admin access; the browser gets the anon client. This is
 * the rule `SupabaseDataManager.initialize()` implemented inline.
 */
export function resolveClient() {
  const admin = getAdminClient();
  if (admin) return admin;

  const anon = getAnonClient();
  if (anon) return anon;

  throw new DbError(
    getSupabaseUrl()
      ? 'Missing Supabase authentication keys (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY)'
      : 'Missing SUPABASE_URL environment variable',
    { kind: DbErrorKind.CONFIG, operation: 'Client initialization' }
  );
}

/** True when the resolved client holds the service-role key. */
export function isAdminClient() {
  return getAdminClient() !== null;
}

/** Test seam — drops the memoised clients so env changes take effect. */
export function resetClients() {
  anonClient = null;
  adminClient = null;
}
