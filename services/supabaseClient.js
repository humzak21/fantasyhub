/**
 * Compatibility surface for the pre-`services/db` import path.
 *
 * Everything here now delegates to `services/db/` — one client factory, one
 * case-conversion implementation, one error mapper. This file exists so the
 * ~20 modules that import `supabase` or `handleSupabaseError` from here keep
 * working; new code should import from `services/db/` directly.
 */

import { getAnonClient, getAdminClient } from './db/client.js';
import { throwDbError } from './db/errors.js';

export { formatForDatabase, formatFromDatabase } from './db/caseMap.js';
export { DbError, DbErrorKind, toDbError, unwrap } from './db/errors.js';

/** Browser/public client. Null when the project is not configured. */
export const supabase = getAnonClient();

/** Service-role client. Null in the browser and without the key. */
export const supabaseAdmin = getAdminClient();

/**
 * Historical name for what is now `throwDbError`. Always throws; the callers
 * that wrote `handleSupabaseError(e); return []` after it were relying on that.
 */
export const handleSupabaseError = (error, operation = 'Database operation') =>
  throwDbError(error, operation);

/** Helper kept for callers that only need a presence check. */
export const requireAuth = () => {
  const user = supabase?.auth.getUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
};
