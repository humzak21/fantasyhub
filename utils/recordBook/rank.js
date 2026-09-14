/**
 * A leaderboard from raw record rows.
 *
 * Competition ranking: equal values share a place and the next place skips —
 * 1, 2, 2, 4 — because "tied for second" is what a record book says, and a
 * dense 1, 2, 2, 3 would promote the fourth-best total to third.
 *
 * Equal values are compared at four decimal places, so two season totals that
 * differ only in floating-point noise tie rather than splitting a place. Within
 * a tie the earlier achievement is listed first: the record book remembers who
 * got there first.
 */

const KEY_SCALE = 10_000;
const valueKey = (value) => Math.round(value * KEY_SCALE);

/** Year then week, reading whichever of a row's shapes carries them. */
const when = (row) => [
  row.year ?? row.start?.year ?? row.startYear ?? 0,
  row.week ?? row.start?.week ?? 0
];

const chronological = (a, b) => {
  const [ay, aw] = when(a);
  const [by, bw] = when(b);
  return ay - by || aw - bw;
};

/**
 * @param {object[]} rows every row has a numeric `value`
 * @param {object} [options]
 * @param {'asc'|'desc'} [options.direction] which end of the scale leads
 * @param {number} [options.limit] rows to return; ties at the cut are not extended
 * @param {boolean} [options.hideZero] drop zeros — for counts where 0 means "never"
 * @returns {object[]} the rows with `rank` and `tied` added
 */
export function rankRows(rows = [], { direction = 'desc', limit = Infinity, hideZero = false } = {}) {
  const sign = direction === 'asc' ? 1 : -1;
  const sorted = rows
    .filter((row) => row && Number.isFinite(row.value) && !(hideZero && row.value === 0))
    .sort((a, b) => sign * (valueKey(a.value) - valueKey(b.value)) || chronological(a, b));

  let rank = 0;
  const ranked = sorted.map((row, index) => {
    if (index === 0 || valueKey(row.value) !== valueKey(sorted[index - 1].value)) rank = index + 1;
    return { ...row, rank };
  });

  return ranked
    .map((row, index) => ({
      ...row,
      tied:
        (index > 0 && ranked[index - 1].rank === row.rank) ||
        (index < ranked.length - 1 && ranked[index + 1].rank === row.rank)
    }))
    .slice(0, limit);
}

export default rankRows;
