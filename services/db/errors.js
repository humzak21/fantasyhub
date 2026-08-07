/**
 * Typed errors for the data layer.
 *
 * The old `handleSupabaseError` flattened every failure into a bare `Error`
 * with a generic string, discarding the Postgres code, the PostgREST details
 * and the name of the operation that failed. Callers could not tell "no rows"
 * from "the request was rejected", so several of them swallowed the error and
 * returned `[]` — making an outage indistinguishable from an empty league.
 *
 * `DbError` keeps the diagnosis (`kind`, `code`, `details`, `operation`,
 * `cause`) while leaving `.message` byte-identical to what the UI used to
 * render, so existing toasts and `catch (err) { setError(err.message) }` call
 * sites are unaffected.
 */

/** Coarse classification callers can branch on without knowing Postgres codes. */
export const DbErrorKind = {
  NOT_FOUND: 'not_found',
  DUPLICATE: 'duplicate',
  FOREIGN_KEY: 'foreign_key',
  AUTH: 'auth',
  PERMISSION: 'permission',
  MISSING_TABLE: 'missing_table',
  CONFIG: 'config',
  UNKNOWN: 'unknown'
};

export class DbError extends Error {
  constructor(message, { kind = DbErrorKind.UNKNOWN, code, details, hint, operation, cause } = {}) {
    super(message);
    this.name = 'DbError';
    this.kind = kind;
    this.code = code;
    this.details = details;
    this.hint = hint;
    this.operation = operation;
    if (cause !== undefined) this.cause = cause;
  }

  get isNotFound() {
    return this.kind === DbErrorKind.NOT_FOUND;
  }

  get isDuplicate() {
    return this.kind === DbErrorKind.DUPLICATE;
  }

  /** True when the fix is "log in" or "you are not the admin", not "retry". */
  get isAuthFailure() {
    return this.kind === DbErrorKind.AUTH || this.kind === DbErrorKind.PERMISSION;
  }
}

/**
 * Postgres / PostgREST codes worth naming. The messages are carried over
 * verbatim from the previous `handleSupabaseError` so nothing user-visible
 * changes; only unmapped codes fall through to the driver's own message.
 */
const CODE_MAP = {
  PGRST116: { kind: DbErrorKind.NOT_FOUND, message: 'No data found' },
  23505: { kind: DbErrorKind.DUPLICATE, message: 'Duplicate data - this item already exists' },
  23503: { kind: DbErrorKind.FOREIGN_KEY, message: 'Invalid reference - related data not found' },
  42501: { kind: DbErrorKind.PERMISSION },
  '42P01': { kind: DbErrorKind.MISSING_TABLE }
};

/** Normalise anything thrown by supabase-js into a `DbError`. */
export function toDbError(error, operation = 'Database operation') {
  if (error instanceof DbError) {
    if (!error.operation) error.operation = operation;
    return error;
  }

  const code = error?.code;
  const mapped = CODE_MAP[code];

  let kind = mapped?.kind ?? DbErrorKind.UNKNOWN;
  let message = mapped?.message ?? error?.message;

  // JWT problems surface with assorted codes but a recognisable message.
  if (!mapped && typeof error?.message === 'string' && error.message.includes('JWT')) {
    kind = DbErrorKind.AUTH;
    message = 'Authentication required - please log in';
  }

  return new DbError(message || 'An unexpected database error occurred', {
    kind,
    code,
    details: error?.details,
    hint: error?.hint,
    operation,
    cause: error
  });
}

/**
 * Drop-in replacement for the old `handleSupabaseError`: always throws.
 * Named for what it does, since "handle" suggested it might not.
 */
export function throwDbError(error, operation = 'Database operation') {
  throw toDbError(error, operation);
}

/**
 * Unwrap a supabase-js `{ data, error }` result, throwing a `DbError` on
 * failure. Replaces the `if (error) throw error;` line repeated ~200 times.
 *
 * `allowMissing` maps PostgREST's "no rows returned" onto `null` — the right
 * behaviour for `.single()` on a row that legitimately may not exist.
 */
export function unwrap(result, operation, { allowMissing = false } = {}) {
  const { data, error } = result ?? {};
  if (!error) return data;

  const dbError = toDbError(error, operation);
  if (allowMissing && dbError.isNotFound) return null;
  throw dbError;
}
