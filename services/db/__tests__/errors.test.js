import { describe, it, expect } from 'vitest';
import { DbError, DbErrorKind, toDbError, throwDbError, unwrap } from '../errors.js';

describe('toDbError', () => {
  it('maps PGRST116 to not-found, keeping the message the UI used to show', () => {
    const error = toDbError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 'Get season');
    expect(error).toBeInstanceOf(DbError);
    expect(error.kind).toBe(DbErrorKind.NOT_FOUND);
    expect(error.isNotFound).toBe(true);
    expect(error.message).toBe('No data found');
    expect(error.operation).toBe('Get season');
    expect(error.code).toBe('PGRST116');
  });

  it('maps unique and foreign key violations', () => {
    expect(toDbError({ code: '23505' }).message).toBe('Duplicate data - this item already exists');
    expect(toDbError({ code: '23505' }).isDuplicate).toBe(true);
    expect(toDbError({ code: '23503' }).message).toBe('Invalid reference - related data not found');
    expect(toDbError({ code: '23503' }).kind).toBe(DbErrorKind.FOREIGN_KEY);
  });

  it('recognises JWT failures by message', () => {
    const error = toDbError({ message: 'JWT expired' });
    expect(error.kind).toBe(DbErrorKind.AUTH);
    expect(error.isAuthFailure).toBe(true);
    expect(error.message).toBe('Authentication required - please log in');
  });

  it('classifies permission and missing-table without rewriting the message', () => {
    const denied = toDbError({ code: '42501', message: 'permission denied for table games' });
    expect(denied.kind).toBe(DbErrorKind.PERMISSION);
    expect(denied.isAuthFailure).toBe(true);
    expect(denied.message).toBe('permission denied for table games');

    const missing = toDbError({ code: '42P01', message: 'relation "nope" does not exist' });
    expect(missing.kind).toBe(DbErrorKind.MISSING_TABLE);
  });

  it('preserves the driver detail an unmapped error carries', () => {
    const error = toDbError(
      { code: '42703', message: 'column teams_1.owner_name does not exist', details: 'd', hint: 'h' },
      'Get current season transactions'
    );
    expect(error.kind).toBe(DbErrorKind.UNKNOWN);
    expect(error.code).toBe('42703');
    expect(error.details).toBe('d');
    expect(error.hint).toBe('h');
    expect(error.operation).toBe('Get current season transactions');
    expect(error.cause.message).toBe('column teams_1.owner_name does not exist');
  });

  it('falls back to a generic message when there is nothing to report', () => {
    expect(toDbError(undefined).message).toBe('An unexpected database error occurred');
  });

  it('passes an existing DbError through, filling in a missing operation', () => {
    const original = new DbError('boom', { kind: DbErrorKind.CONFIG });
    const wrapped = toDbError(original, 'Initialization');
    expect(wrapped).toBe(original);
    expect(wrapped.operation).toBe('Initialization');
  });
});

describe('throwDbError', () => {
  it('always throws', () => {
    expect(() => throwDbError({ code: '23505' }, 'Add team')).toThrow(DbError);
  });
});

describe('unwrap', () => {
  it('returns data when there is no error', () => {
    expect(unwrap({ data: [1, 2], error: null }, 'Get games')).toEqual([1, 2]);
  });

  it('throws on error', () => {
    expect(() => unwrap({ data: null, error: { code: '23503' } }, 'Add game')).toThrow('Invalid reference - related data not found');
  });

  it('maps "no rows" to null when the caller allows it', () => {
    expect(unwrap({ data: null, error: { code: 'PGRST116' } }, 'Get config', { allowMissing: true })).toBeNull();
  });

  it('still throws other errors when allowMissing is set', () => {
    expect(() => unwrap({ data: null, error: { code: '23505' } }, 'Get config', { allowMissing: true })).toThrow();
  });
});
