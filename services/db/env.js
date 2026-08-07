/**
 * Supabase connection settings.
 *
 * Resolution is deliberately *lazy* — `services/db/client.server.js` loads
 * `.env` files with dotenv before any client is built, and reading the values
 * at module-evaluation time would capture them too early.
 *
 * Lookup order is `process.env` first, then Vite's `import.meta.env`. It is
 * deliberately not keyed on `typeof window`: jsdom (which every test runs
 * under) defines `window`, so a window check would send the *server* client
 * down the browser path and leave Node code without its service-role key. The
 * question that actually matters is "does this runtime have process.env", and
 * that is the question asked.
 *
 * The service-role key stays out of the browser regardless: `process` is
 * undefined there, and Vite only inlines `VITE_`-prefixed variables into
 * `import.meta.env`, which this never consults for that key.
 *
 * Before this module the same branching was written out three times, in
 * `supabaseClient.js`, `supabaseClient.server.js` and
 * `SupabaseDataManager.initialize()`.
 */

/** True where a DOM exists — used for session-persistence options, not env lookup. */
export const isBrowser = () => typeof window !== 'undefined';

const nodeEnv = () => (typeof process !== 'undefined' && process.env ? process.env : {});
const viteEnv = () => (typeof import.meta !== 'undefined' && import.meta.env) || {};

/** Project URL. Present in every environment. */
export function getSupabaseUrl() {
  const node = nodeEnv();
  return node.VITE_SUPABASE_URL || node.SUPABASE_URL || viteEnv().VITE_SUPABASE_URL;
}

/** Public anon key — safe in the browser bundle; RLS is what protects the data. */
export function getSupabaseAnonKey() {
  const node = nodeEnv();
  return node.VITE_SUPABASE_ANON_KEY || node.SUPABASE_ANON_KEY || viteEnv().VITE_SUPABASE_ANON_KEY;
}

/** Service-role key. Bypasses RLS, so it is only ever read from `process.env`. */
export function getSupabaseServiceRoleKey() {
  return nodeEnv().SUPABASE_SERVICE_ROLE_KEY || null;
}

/** True in `vite dev`, or in Node outside NODE_ENV=production. */
export function isDevEnvironment() {
  const node = nodeEnv();
  if (node.NODE_ENV) return node.NODE_ENV !== 'production';
  return viteEnv().DEV === true;
}
