import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  camelToSnake,
  snakeToCamel,
  roundTripsCleanly,
  toDbShape,
  fromDbShape,
  COLUMN_OVERRIDES
} from '../caseMap.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('key conversion', () => {
  it('converts both directions', () => {
    expect(camelToSnake('pointsFor')).toBe('points_for');
    expect(camelToSnake('strengthOfSchedule')).toBe('strength_of_schedule');
    expect(snakeToCamel('points_for')).toBe('pointsFor');
    expect(snakeToCamel('strength_of_schedule')).toBe('strengthOfSchedule');
  });

  it('keeps digits attached to the segment they belong to', () => {
    expect(snakeToCamel('team1_id')).toBe('team1Id');
    expect(camelToSnake('team1Id')).toBe('team1_id');
    expect(snakeToCamel('team2_score')).toBe('team2Score');
    expect(camelToSnake('team2Score')).toBe('team2_score');
  });

  it('leaves already-converted keys alone', () => {
    expect(snakeToCamel('id')).toBe('id');
    expect(camelToSnake('id')).toBe('id');
  });
});

describe('object conversion', () => {
  it('recurses through nested objects and arrays', () => {
    const input = { seasonId: 'a', currentStreak: { streakType: 'win', length: 3 }, teamGames: [{ weekNumber: 1 }] };
    expect(toDbShape(input)).toEqual({
      season_id: 'a',
      current_streak: { streak_type: 'win', length: 3 },
      team_games: [{ week_number: 1 }]
    });
  });

  it('passes non-plain objects through untouched', () => {
    const when = new Date('2026-08-05T00:00:00Z');
    const out = toDbShape({ createdAt: when, count: 3, missing: null });
    expect(out.created_at).toBe(when);
    expect(out.count).toBe(3);
    expect(out.missing).toBeNull();
  });

  it('round-trips a representative row', () => {
    const row = {
      id: 'x',
      season_id: 'y',
      team1_id: 'a',
      team2_id: 'b',
      team1_score: 101.5,
      team2_score: 99,
      winner_team_id: 'a',
      point_differential: 2.5,
      is_blowout: false
    };
    expect(toDbShape(fromDbShape(row))).toEqual(row);
  });

  it('returns falsy input unchanged', () => {
    expect(fromDbShape(null)).toBeNull();
    expect(fromDbShape(undefined)).toBeUndefined();
  });
});

/**
 * The point of the whole module: prove the exception list is complete.
 *
 * Every column of every table and view in the live schema has to survive
 * snake → camel → snake. A column that does not is exactly the case that used
 * to produce a silent `undefined` in a component, and it fails here instead.
 */
describe('every column in the generated schema types', () => {
  const source = readFileSync(resolve(here, '../../../types/supabase.ts'), 'utf8');

  const columns = new Set();
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*Row: \{$/.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*\}$/.test(lines[j])) break;
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\??:/.exec(lines[j]);
      if (match) columns.add(match[1]);
    }
  }

  it('found the schema', () => {
    expect(columns.size).toBeGreaterThan(200);
    expect(columns.has('points_for')).toBe(true);
    expect(columns.has('team1_id')).toBe(true);
  });

  it('round-trips without loss', () => {
    const broken = [...columns].filter((column) => !roundTripsCleanly(column));
    expect(broken, `add these to COLUMN_OVERRIDES: ${broken.join(', ')}`).toEqual([]);
  });

  it('has no stale overrides', () => {
    for (const column of Object.keys(COLUMN_OVERRIDES)) {
      expect(columns.has(column), `${column} is overridden but no longer in the schema`).toBe(true);
    }
  });
});
