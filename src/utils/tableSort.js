/**
 * A sortable table's order, decided.
 *
 * Pure, and shared by the header buttons and the compact control a card stack
 * shows instead. `null` is the table's default order: whatever order the rows
 * arrived in, which is why a sort never has to know how to restore it.
 */

/** default → descending → ascending → default. */
export function nextSort(sort, key) {
  if (sort?.key !== key) return { key, direction: 'desc' };
  return sort.direction === 'desc' ? { key, direction: 'asc' } : null;
}

/** The `aria-sort` value for one column. */
export function ariaSortOf(sort, key) {
  if (sort?.key !== key) return 'none';
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

const isMissing = (value) =>
  value == null || value === '' || (typeof value === 'number' && Number.isNaN(value));

const compareValues = (a, b) => {
  if (typeof a === 'string' || typeof b === 'string') {
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
  }
  return a - b;
};

/**
 * `rows` in the order `sort` asks for.
 *
 * A missing value goes last in either direction: unknown is not the smallest
 * number. Equal values keep the default order, because the comparator is
 * negated rather than the result reversed — Array.prototype.sort is stable, so
 * a re-sort never shuffles a tie.
 *
 * @param {any[]} rows - in the table's default order
 * @param {{ key: string, direction: 'asc'|'desc' }|null} sort
 * @param {Array<{ key: string, sortValue?: (row: any) => any }>} columns
 * @returns {any[]} a new array, or `rows` itself for the default order
 */
export function sortRows(rows, sort, columns) {
  const value = columns.find((column) => column.key === sort?.key)?.sortValue;
  if (!value) return rows;

  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (isMissing(left) || isMissing(right)) return isMissing(left) - isMissing(right);
    return sign * compareValues(left, right);
  });
}
