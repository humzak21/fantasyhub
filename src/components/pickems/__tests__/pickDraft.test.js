import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  clearDraft,
  draftDiffers,
  draftKey,
  initialSelections,
  parseDraft,
  readDraft,
  usePickDraft,
  writeDraft
} from '../pickDraft.js';

/** A Map-backed Storage, so a test can inspect every key. */
function memoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()]
  };
}

const submitted = [
  { gameId: 'g1', predictedWinnerTeamId: 't1' },
  { gameId: 'g2', predictedWinnerTeamId: 't3' }
];

beforeEach(() => localStorage.clear());

describe('pickDraft — precedence', () => {
  it('starts from the draft over what was submitted, game by game', () => {
    const draft = { picks: { g2: 't4', g3: 't5' }, parlay: null };
    expect(initialSelections({ draft, submitted })).toEqual({ g1: 't1', g2: 't4', g3: 't5' });
  });

  it('falls back to what was submitted, then to nothing', () => {
    expect(initialSelections({ draft: null, submitted })).toEqual({ g1: 't1', g2: 't3' });
    expect(initialSelections({})).toEqual({});
  });

  it('knows whether a draft changes anything submitted', () => {
    expect(draftDiffers({ picks: { g1: 't1' } }, submitted)).toBe(false);
    expect(draftDiffers({ picks: { g1: 't2' } }, submitted)).toBe(true);
    expect(draftDiffers(null, submitted)).toBe(false);
  });
});

describe('pickDraft — storage', () => {
  it('writes per member per week and reads it back', () => {
    const storage = memoryStorage();
    writeDraft(storage, 'u1', 'w7', { picks: { g1: 't2' }, parlay: { playerId: 'p1', playerName: 'Bijan' } });

    expect(readDraft(storage, 'u1', 'w7')).toMatchObject({
      picks: { g1: 't2' },
      parlay: { playerId: 'p1', playerName: 'Bijan' }
    });
    expect(readDraft(storage, 'u2', 'w7')).toBeNull();
  });

  it("sweeps the member's drafts for other weeks, and nobody else's", () => {
    const storage = memoryStorage();
    storage.setItem(draftKey('u1', 'w6'), JSON.stringify({ picks: { g0: 't1' } }));
    storage.setItem(draftKey('u2', 'w6'), JSON.stringify({ picks: { g0: 't1' } }));
    storage.setItem('takes:confirm:u1', '1');

    writeDraft(storage, 'u1', 'w7', { picks: { g1: 't2' } });

    expect(storage.keys().sort()).toEqual([draftKey('u1', 'w7'), draftKey('u2', 'w6'), 'takes:confirm:u1'].sort());
  });

  it('clears one part, and removes the key once nothing is left', () => {
    const storage = memoryStorage();
    writeDraft(storage, 'u1', 'w7', { picks: { g1: 't2' }, parlay: { playerId: null, playerName: 'Gibbs' } });

    clearDraft(storage, 'u1', 'w7', 'picks');
    expect(readDraft(storage, 'u1', 'w7')).toMatchObject({ picks: {}, parlay: { playerName: 'Gibbs' } });

    clearDraft(storage, 'u1', 'w7', 'parlay');
    expect(storage.getItem(draftKey('u1', 'w7'))).toBeNull();
  });

  it('treats garbage as no draft', () => {
    expect(parseDraft('not json')).toBeNull();
    expect(parseDraft('"a string"')).toBeNull();
    expect(parseDraft(JSON.stringify({ parlay: { playerId: 'x' } }))).toEqual({ picks: {}, parlay: null, updatedAt: null });
  });

  it('survives a storage that throws on every call', () => {
    const broken = {
      length: 0,
      key: () => {
        throw new Error('denied');
      },
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      }
    };
    expect(() => writeDraft(broken, 'u1', 'w7', { picks: { g1: 't1' } })).not.toThrow();
    expect(readDraft(broken, 'u1', 'w7')).toBeNull();
  });
});

describe('usePickDraft', () => {
  it('two readers of one week agree, live', () => {
    const a = renderHook(() => usePickDraft('w7', 'u1'));
    const b = renderHook(() => usePickDraft('w7', 'u1'));

    act(() => a.result.current.setPick('g1', 't2'));
    expect(b.result.current.draft.picks).toEqual({ g1: 't2' });

    act(() => b.result.current.setParlay({ playerId: null, playerName: 'Jahmyr Gibbs' }));
    expect(a.result.current.draft.parlay).toEqual({ playerId: null, playerName: 'Jahmyr Gibbs' });

    act(() => a.result.current.clear());
    expect(b.result.current.draft).toMatchObject({ picks: {}, parlay: null });
  });

  it('keeps a blank parlay name as no parlay', () => {
    const { result } = renderHook(() => usePickDraft('w7', 'u1'));
    act(() => result.current.setParlay({ playerId: null, playerName: '   ' }));
    expect(result.current.draft.parlay).toBeNull();
  });

  it('is an empty draft signed out', () => {
    const { result } = renderHook(() => usePickDraft('w7', null));
    act(() => result.current.setPick('g1', 't2'));
    expect(result.current.draft.picks).toEqual({});
    expect(localStorage.length).toBe(0);
  });
});
