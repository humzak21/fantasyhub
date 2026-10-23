/**
 * A run of `size` rows centred on one of them.
 *
 * The rankings slice shows the viewer's team with two above and two below.
 * At the ends it clamps rather than shrinking — rank 1 shows rows 1-5 and
 * rank 14 shows 10-14 — so the slice is always the same height. With no
 * viewer (`index` -1: an admin without a franchise, a co-manager) it is the
 * top `size`. Each returned entry carries its position in the full list, which
 * is the team's rank.
 *
 * @template T
 * @param {T[]} rows - already in rank order
 * @param {number} index - the row to centre, or -1
 * @param {number} [size]
 * @returns {Array<{ row: T, rank: number }>}
 */
export function windowAround(rows, index, size = 5) {
  const list = Array.isArray(rows) ? rows : [];
  const count = Math.min(size, list.length);
  if (count === 0) return [];

  let start = index < 0 ? 0 : index - Math.floor(count / 2);
  start = Math.max(0, Math.min(start, list.length - count));

  return list.slice(start, start + count).map((row, offset) => ({
    row,
    rank: start + offset + 1
  }));
}

export default windowAround;
