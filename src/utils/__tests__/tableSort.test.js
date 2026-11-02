import { describe, it, expect } from 'vitest';

import { ariaSortOf, nextSort, sortRows } from '../tableSort.js';

const columns = [
  { key: 'wins', sortValue: (row) => row.wins },
  { key: 'name', sortValue: (row) => row.name },
  { key: 'plain' }
];

const rows = [
  { id: 'a', wins: 10, name: 'bravo' },
  { id: 'b', wins: 30, name: 'Alpha' },
  { id: 'c', wins: 10, name: 'charlie' },
  { id: 'd', wins: null, name: 'Delta' }
];

const ids = (list) => list.map((row) => row.id);

describe('nextSort', () => {
  it('cycles default, descending, ascending, default', () => {
    const first = nextSort(null, 'wins');
    expect(first).toEqual({ key: 'wins', direction: 'desc' });

    const second = nextSort(first, 'wins');
    expect(second).toEqual({ key: 'wins', direction: 'asc' });

    expect(nextSort(second, 'wins')).toBeNull();
  });

  it('starts a different column from descending', () => {
    expect(nextSort({ key: 'wins', direction: 'asc' }, 'name')).toEqual({ key: 'name', direction: 'desc' });
  });
});

describe('ariaSortOf', () => {
  it('names the sorted column and only that column', () => {
    const sort = { key: 'wins', direction: 'asc' };
    expect(ariaSortOf(sort, 'wins')).toBe('ascending');
    expect(ariaSortOf({ ...sort, direction: 'desc' }, 'wins')).toBe('descending');
    expect(ariaSortOf(sort, 'name')).toBe('none');
    expect(ariaSortOf(null, 'wins')).toBe('none');
  });
});

describe('sortRows', () => {
  it('returns the default order untouched', () => {
    expect(sortRows(rows, null, columns)).toBe(rows);
    expect(sortRows(rows, { key: 'plain', direction: 'asc' }, columns)).toBe(rows);
  });

  it('keeps a tie in its default order in both directions', () => {
    expect(ids(sortRows(rows, { key: 'wins', direction: 'desc' }, columns))).toEqual(['b', 'a', 'c', 'd']);
    expect(ids(sortRows(rows, { key: 'wins', direction: 'asc' }, columns))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('puts a missing value last in either direction', () => {
    expect(ids(sortRows(rows, { key: 'wins', direction: 'asc' }, columns)).at(-1)).toBe('d');
    expect(ids(sortRows(rows, { key: 'wins', direction: 'desc' }, columns)).at(-1)).toBe('d');
  });

  it('compares text without regard to case', () => {
    expect(ids(sortRows(rows, { key: 'name', direction: 'asc' }, columns))).toEqual(['b', 'a', 'c', 'd']);
  });
});
