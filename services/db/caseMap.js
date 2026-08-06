/**
 * The single camelCase ⇄ snake_case boundary.
 *
 * Three copies of these converters used to exist (`supabaseClient.js`,
 * `supabaseClient.server.js`) alongside hand-written per-field mappings
 * scattered through the hook, components and scripts — `team1Id: game.team1_id`
 * and friends. Any field somebody forgot to list became a silent `undefined`
 * rather than an error.
 *
 * Now there is one implementation, one place to record the columns the plain
 * regex cannot round-trip, and a test that walks every column in the generated
 * database types to prove the set of exceptions is complete.
 */

/**
 * Columns whose snake_case and camelCase spellings are not related by the
 * regexes below. Keyed by database column name.
 *
 * Empty today: every column in the schema round-trips. It exists so that the
 * first column that does not (`espn_s2`-style names with digits or acronyms)
 * has an obvious home instead of becoming another ad-hoc mapping.
 */
export const COLUMN_OVERRIDES = {};

const CAMEL_OVERRIDES = Object.fromEntries(
  Object.entries(COLUMN_OVERRIDES).map(([snake, camel]) => [camel, snake])
);

/** `pointsFor` → `points_for`. Digits stay attached: `team1Id` → `team1_id`. */
export function camelToSnake(key) {
  if (Object.hasOwn(CAMEL_OVERRIDES, key)) return CAMEL_OVERRIDES[key];
  return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/** `points_for` → `pointsFor`. */
export function snakeToCamel(key) {
  if (Object.hasOwn(COLUMN_OVERRIDES, key)) return COLUMN_OVERRIDES[key];
  return key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

/**
 * True when `column` survives snake → camel → snake unchanged, i.e. when it
 * needs no entry in `COLUMN_OVERRIDES`.
 */
export function roundTripsCleanly(column) {
  return camelToSnake(snakeToCamel(column)) === column;
}

/**
 * Recursively rewrite the keys of plain objects and arrays. Anything that is
 * not a plain object — Date, null, primitives, class instances — is passed
 * through untouched, which is what keeps JSONB payloads and timestamps intact.
 */
function convertKeys(value, mapKey) {
  if (Array.isArray(value)) return value.map((item) => convertKeys(item, mapKey));

  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.keys(value).reduce((acc, key) => {
      acc[mapKey(key)] = convertKeys(value[key], mapKey);
      return acc;
    }, {});
  }

  return value;
}

/** Frontend shape → database shape. */
export function toDbShape(data) {
  if (!data) return data;
  return convertKeys(data, camelToSnake);
}

/** Database shape → frontend shape. */
export function fromDbShape(data) {
  if (!data) return data;
  return convertKeys(data, snakeToCamel);
}

// Names the rest of the codebase already uses.
export { toDbShape as formatForDatabase, fromDbShape as formatFromDatabase };
