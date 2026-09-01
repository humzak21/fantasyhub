import { describe, it, expect } from 'vitest';
import {
  mapESPNInjuryStatus,
  getNFLTeamAbbreviation,
  mapESPNRosterSlot,
  isStarterSlot,
  ESPN_STAT_IDS,
  getTouchdownCount,
  getScoredTouchdownCount
} from '../espnMapping.js';

describe('mapESPNInjuryStatus', () => {
  it('passes through the statuses the UI renders', () => {
    expect(mapESPNInjuryStatus('QUESTIONABLE')).toBe('QUESTIONABLE');
    expect(mapESPNInjuryStatus('OUT')).toBe('OUT');
  });

  it('treats an absent status as healthy', () => {
    expect(mapESPNInjuryStatus(null)).toBe('ACTIVE');
    expect(mapESPNInjuryStatus(undefined)).toBe('ACTIVE');
  });
});

describe('getNFLTeamAbbreviation', () => {
  it('maps ESPN pro team ids', () => {
    expect(getNFLTeamAbbreviation(12)).toBe('KC');
    expect(getNFLTeamAbbreviation(33)).toBe('BAL');
    expect(getNFLTeamAbbreviation(34)).toBe('HOU');
  });

  it('returns null for a free agent (id 0) rather than inventing a team', () => {
    expect(getNFLTeamAbbreviation(0)).toBeNull();
    expect(getNFLTeamAbbreviation(999)).toBeNull();
  });
});

describe('mapESPNRosterSlot', () => {
  it('maps starting slots', () => {
    expect(mapESPNRosterSlot(0)).toBe('QB');
    expect(mapESPNRosterSlot(2)).toBe('RB');
    expect(mapESPNRosterSlot(4)).toBe('WR');
    expect(mapESPNRosterSlot(6)).toBe('TE');
  });

  it('maps the bench', () => {
    expect(mapESPNRosterSlot(20)).toBe('BE');
  });

  it('maps the multi-position slots to FLEX rather than the bench', () => {
    // These four were absent from the map, so anyone started in one fell
    // through to the `|| 'BE'` default and was recorded as benched.
    expect(mapESPNRosterSlot(3)).toBe('FLEX'); // RB/WR
    expect(mapESPNRosterSlot(5)).toBe('FLEX'); // WR/TE
    expect(mapESPNRosterSlot(7)).toBe('FLEX'); // OP
    expect(mapESPNRosterSlot(23)).toBe('FLEX');
  });

  it('maps the team QB slot', () => {
    expect(mapESPNRosterSlot(1)).toBe('QB');
  });

  it('falls back to the bench for a slot it does not know', () => {
    expect(mapESPNRosterSlot(99)).toBe('BE');
  });
});

describe('isStarterSlot', () => {
  it('counts every scoring slot as a start', () => {
    for (const slot of [0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 23]) {
      expect(isStarterSlot(slot)).toBe(true);
    }
  });

  it('excludes the bench and IR, the only two slots that do not score', () => {
    expect(isStarterSlot(20)).toBe(false);
    expect(isStarterSlot(21)).toBe(false);
  });

  it('treats a missing slot as not started rather than as a start', () => {
    expect(isStarterSlot(null)).toBe(false);
    expect(isStarterSlot(undefined)).toBe(false);
  });
});

/**
 * Touchdowns, derived from `player_week_stats.stat_breakdown`.
 *
 * Two distinctions carry the weight here: null is not zero, and thrown is not
 * scored. Both are the sort of thing that reads as a rounding difference and
 * behaves as a wrong answer nobody audits.
 */
describe('touchdown counts', () => {
  // Jahmyr Gibbs' 2025 season line, whose figures reconcile to his stored
  // appliedTotal of 366.9 under PPR — which is how these ids were verified.
  const GIBBS_SEASON = { 24: 1223, 25: 13, 42: 616, 43: 5, 53: 77, 72: 1 };

  // Jalen Hurts' 2025: 25 passing, 8 rushing, none receiving.
  const HURTS_SEASON = { 3: 3224, 4: 25, 20: 6, 24: 421, 25: 8 };

  it('names the ids as strings, because ESPN keys the map with strings', () => {
    expect(ESPN_STAT_IDS).toEqual({ PASSING_TD: '4', RUSHING_TD: '25', RECEIVING_TD: '43' });
    // `statBreakdown[25]` and `statBreakdown['25']` are the same lookup in JS,
    // but the constant has to be a string for Object.values comparisons.
    expect(Object.values(ESPN_STAT_IDS).every((id) => typeof id === 'string')).toBe(true);
  });

  it('counts rushing and receiving as scored', () => {
    expect(getScoredTouchdownCount(GIBBS_SEASON)).toBe(18);
  });

  it('does not credit a quarterback with the touchdowns he threw', () => {
    // 25 thrown, 8 run. He scored 8; he was involved in 33.
    expect(getScoredTouchdownCount(HURTS_SEASON)).toBe(8);
    expect(getTouchdownCount(HURTS_SEASON)).toBe(33);
  });

  it('treats an absent category as zero of it, not as unknown', () => {
    // A player with a breakdown who caught none has 0 receiving TDs; the row
    // knows that. This is the case null must not be conflated with.
    expect(getScoredTouchdownCount({ 24: 40 })).toBe(0);
    expect(getTouchdownCount({})).toBe(0);
  });

  it('is null when there is no breakdown at all', () => {
    // Every row written before 2026-09 is this case. Returning 0 would report
    // the whole of league history as having scored nothing.
    expect(getTouchdownCount(null)).toBeNull();
    expect(getTouchdownCount(undefined)).toBeNull();
    expect(getScoredTouchdownCount(null)).toBeNull();
    expect(getScoredTouchdownCount('not an object')).toBeNull();
  });

  it('ignores a non-numeric value rather than producing NaN', () => {
    expect(getScoredTouchdownCount({ 25: 2, 43: null })).toBe(2);
    expect(getScoredTouchdownCount({ 25: 'x' })).toBe(0);
  });
});
