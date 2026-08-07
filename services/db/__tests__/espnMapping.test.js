import { describe, it, expect } from 'vitest';
import { mapESPNInjuryStatus, getNFLTeamAbbreviation, mapESPNRosterSlot } from '../espnMapping.js';

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
});
