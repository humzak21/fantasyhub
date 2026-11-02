/** How a lock reads on a record card: the record it was locked on, and how long was left. */

import { describe, it, expect } from 'vitest';

import { describeRow } from '../describeRow';
import { RECORDS, formatRecordValue } from '../recordCatalog';

const record = RECORDS.find((entry) => entry.id === 'lock-one-seed-earliest');
const identity = { franchiseName: () => 'Owner A', teamName: () => 'Team A' };
const row = { franchiseId: 'fA', teamId: 'tA', year: 2025, week: 13, weeksLeft: 1, record: { wins: 12, losses: 1, ties: 0 }, value: 13 };

describe('a lock row', () => {
  it('says what it was locked on and how much was left', () => {
    expect(describeRow(record, row, identity)).toEqual({
      name: 'Owner A',
      meta: 'Team A · 2025 · 12–1, 1 to play'
    });
  });

  it('says so when it went to the final week, and when points decided it', () => {
    const final = { ...row, week: 14, weeksLeft: 0 };
    expect(describeRow(record, final, identity).meta).toContain('final week');
    expect(describeRow(record, { ...final, onPoints: true }, identity).meta).toContain('final week, on points');
  });

  it('reads as a week', () => {
    expect(formatRecordValue(record, 13)).toBe('Wk 13');
  });
});

describe('the catalog', () => {
  it('names the four locks, earliest and latest, and every id once', () => {
    const lockRecords = RECORDS.filter((entry) => entry.kind === 'lock');
    expect(lockRecords.map((entry) => entry.title)).toEqual([
      'Earliest 1 seed',
      'Latest 1 seed',
      'Earliest punishment',
      'Latest punishment'
    ]);
    expect(new Set(RECORDS.map((entry) => entry.id)).size).toBe(RECORDS.length);
  });
});
