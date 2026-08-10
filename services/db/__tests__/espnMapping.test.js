import { describe, it, expect } from 'vitest';
import {
  mapESPNInjuryStatus,
  getNFLTeamAbbreviation,
  mapESPNRosterSlot,
  isStarterSlot
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
