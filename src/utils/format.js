/**
 * One precision policy for the whole app.
 *
 * The same quantity used to be printed three ways depending on which file you
 * were in: win percentage as `86.67%` in the rankings table, `86.7%` in the
 * standings drawer, and `87%` in playoff odds — with the rankings' two
 * decimals implying a precision the underlying estimate does not have. Numbers
 * were set in three different faces too (`font-mono`, `tabular-nums`, and
 * whatever the surrounding text was), so a column of them did not line up.
 *
 * The rules:
 *   - points and ratings: one decimal
 *   - percentages: one decimal, and the value arriving is 0-100, not 0-1
 *   - anything absent is an em dash, never `0` and never `NaN`
 *
 * Render these through `NumberText` (src/components/ui/number-text.jsx) rather
 * than dropping the string into a `<span>`, so the digits are tabular.
 */

/** What a missing value looks like. Not "0" — a team with no games played has
 *  not scored zero points, it has not played. */
export const EMPTY = '—';

function isMissing(value) {
  return value === null || value === undefined || value === '' || Number.isNaN(Number(value));
}

/**
 * Points, ratings, any decimal quantity. Thousands are grouped, because season
 * point totals run to four digits.
 *
 * @param {number} value
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatPoints(value, decimals = 1) {
  if (isMissing(value)) return EMPTY;
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * A percentage. The value is already scaled 0-100 — that is the shape every
 * calculator in this codebase produces. Pass a 0-1 fraction through
 * `formatFraction` instead.
 *
 * @param {number} value
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatPct(value, decimals = 1) {
  if (isMissing(value)) return EMPTY;
  return `${Number(value).toFixed(decimals)}%`;
}

/**
 * A percentage from a 0-1 fraction, which is what the history views store.
 *
 * @param {number} value
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatFraction(value, decimals = 1) {
  if (isMissing(value)) return EMPTY;
  return formatPct(Number(value) * 100, decimals);
}

/**
 * A signed quantity — point differential, rating change. The sign is always
 * shown, including the plus, because the sign is the information.
 *
 * @param {number} value
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatDelta(value, decimals = 1) {
  if (isMissing(value)) return EMPTY;
  const n = Number(value);
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(decimals)}`;
}

/**
 * Which way a signed value points. Callers use this to pick a colour without
 * re-deriving the comparison (and without disagreeing about what 0 means: it
 * is neutral, not a loss).
 *
 * @param {number} value
 * @returns {'positive'|'negative'|'neutral'}
 */
export function deltaDirection(value) {
  if (isMissing(value)) return 'neutral';
  const n = Number(value);
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return 'neutral';
}

/**
 * A win-loss record. Accepts either three numbers or the record object the db
 * layer returns. Ties are only shown when there are some — this league plays
 * whole seasons without one.
 *
 * @param {number|{wins:number, losses:number, ties?:number}} wins
 * @param {number} [losses]
 * @param {number} [ties]
 * @returns {string}
 */
export function formatRecord(wins, losses = null, ties = null) {
  if (wins && typeof wins === 'object') {
    const r = wins;
    const w = r.wins ?? 0;
    const l = r.losses ?? 0;
    const t = r.ties ?? 0;
    return t > 0 ? `${w}–${l}–${t}` : `${w}–${l}`;
  }
  if (isMissing(wins) && isMissing(losses)) return EMPTY;
  const w = wins ?? 0;
  const l = losses ?? 0;
  return ties && ties > 0 ? `${w}–${l}–${ties}` : `${w}–${l}`;
}

/**
 * `W3` / `L1`. Returns null rather than a dash when there is no streak, so a
 * caller can skip rendering the chip entirely.
 *
 * @param {{type?: string, length?: number}} streak
 * @returns {{type: 'win'|'loss'|'tie', length: number, label: string}|null}
 */
export function parseStreak(streak) {
  if (!streak || !streak.type || streak.type === 'none') return null;
  const length = streak.length ?? 0;
  if (length <= 0) return null;
  const type = streak.type === 'win' ? 'win' : streak.type === 'loss' ? 'loss' : 'tie';
  const prefix = type === 'win' ? 'W' : type === 'loss' ? 'L' : 'T';
  return { type, length, label: `${prefix}${length}` };
}

/**
 * 1st, 2nd, 3rd. Handles the teens, which the naive version gets wrong.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatOrdinal(value) {
  if (isMissing(value)) return EMPTY;
  const n = Number(value);
  const ones = n % 10;
  const tens = n % 100;
  if (ones === 1 && tens !== 11) return `${n}st`;
  if (ones === 2 && tens !== 12) return `${n}nd`;
  if (ones === 3 && tens !== 13) return `${n}rd`;
  return `${n}th`;
}

/**
 * Points per game, guarding the division.
 *
 * @param {number} points
 * @param {number} games
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatPerGame(points, games, decimals = 1) {
  if (isMissing(points) || isMissing(games) || Number(games) === 0) return EMPTY;
  return formatPoints(Number(points) / Number(games), decimals);
}
