/**
 * Which takes the home page shows: the two most recent, plus every take graded
 * in the last three days — a graded take is news for exactly as long as it
 * takes everyone to settle up. A take that is both appears once.
 *
 * Graded first (they are the ones with a result to read), then newest. Pure,
 * over the board the Takes tab already holds.
 */

export const GRADED_WITHIN_MS = 72 * 60 * 60 * 1000;

const time = (value) => {
  const at = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(at) ? at : null;
};

const isGraded = (take) => Boolean(take?.status && take.status !== 'pending');

/**
 * @param {object[]} takes - the board's rows
 * @param {Date} [now]
 * @param {{ recent?: number, gradedWithinMs?: number }} [options]
 * @returns {object[]}
 */
export function selectHomeTakes(takes = [], now = new Date(), { recent = 2, gradedWithinMs = GRADED_WITHIN_MS } = {}) {
  const nowMs = now.getTime();

  const newest = [...takes]
    .filter((take) => time(take.createdAt) !== null)
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))
    .slice(0, recent);

  const graded = takes.filter((take) => {
    if (!isGraded(take)) return false;
    const at = time(take.resolvedAt);
    return at !== null && at <= nowMs && nowMs - at <= gradedWithinMs;
  });

  const gradedIds = new Set(graded.map((take) => take.id));
  const byId = new Map();
  for (const take of [...graded, ...newest]) byId.set(take.id, take);

  return [...byId.values()].sort(
    (a, b) =>
      Number(gradedIds.has(b.id)) - Number(gradedIds.has(a.id)) ||
      (time(b.createdAt) ?? 0) - (time(a.createdAt) ?? 0)
  );
}

/** Enough to fill the tallest column the page builds; more is never seen. */
export const MORE_HOME_TAKES = 10;

/**
 * What the card can add when it has room to spare: the rest of the board,
 * newest first, after the takes `selectHomeTakes` already chose. The card
 * shows as many of these as fit (`useFitCount`), so a tall column fills with
 * takes and a short one shows only the essentials.
 *
 * @param {object[]} takes - the board's rows
 * @param {object[]} shown - what `selectHomeTakes` returned
 * @param {number} [limit] - the most the card will ever try
 * @returns {object[]}
 */
export function moreHomeTakes(takes = [], shown = [], limit = MORE_HOME_TAKES) {
  const shownIds = new Set(shown.map((take) => take.id));
  return takes
    .filter((take) => !shownIds.has(take.id) && time(take.createdAt) !== null)
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))
    .slice(0, limit);
}

export default selectHomeTakes;
