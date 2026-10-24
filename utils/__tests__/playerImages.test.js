/**
 * JITS-47: where headshots and logos come from, and when there is none.
 */

import { describe, it, expect } from 'vitest';
import { canonicalTeam, headshotUrl, initialsOf, isTeamDefense, teamLogoUrl, teamOf, uniqueByName, defenseTeam } from '../playerImages.js';

describe('canonicalTeam', () => {
  it('reads every spelling the league has stored', () => {
    expect(canonicalTeam('kc')).toBe('KC');
    expect(canonicalTeam('WSH')).toBe('WAS');
    expect(canonicalTeam('JAC')).toBe('JAX');
    expect(canonicalTeam('OAK')).toBe('LV');
    expect(canonicalTeam('LA')).toBe('LAR');
  });

  it('is null for no team, a free agent or a spelling it does not know', () => {
    expect(canonicalTeam(null)).toBeNull();
    expect(canonicalTeam('')).toBeNull();
    expect(canonicalTeam('FA')).toBeNull();
  });
});

describe('teamOf', () => {
  it("prefers the row's own week team over where the player is now", () => {
    expect(teamOf({ proTeamId: 12, teamAbbreviation: 'BUF' })).toBe('KC');
  });

  it('falls back to the stored abbreviation', () => {
    expect(teamOf({ proTeamId: null, teamAbbreviation: 'wsh' })).toBe('WAS');
    expect(teamOf({ proTeam: 'DAL' })).toBe('DAL');
    expect(teamOf({})).toBeNull();
  });
});

describe('teamLogoUrl', () => {
  it("is ESPN's resized logo, with Washington under its ESPN name", () => {
    expect(teamLogoUrl('KC')).toBe('https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/kc.png&w=64&h=64&scale=crop');
    expect(teamLogoUrl('WAS')).toContain('/nfl/500/wsh.png');
  });

  it('is null for an unknown team, never a guessed URL', () => {
    expect(teamLogoUrl('XYZ')).toBeNull();
    expect(teamLogoUrl(null)).toBeNull();
  });
});

describe('headshotUrl', () => {
  it("is ESPN's square crop for a real player", () => {
    expect(headshotUrl(4241457)).toBe('https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/4241457.png&w=96&h=96&scale=crop');
    expect(headshotUrl('4241457')).toContain('/full/4241457.png');
  });

  it('is null for a defence, a free-text pick or junk', () => {
    expect(headshotUrl(-16013)).toBeNull();
    expect(headshotUrl(null)).toBeNull();
    expect(headshotUrl('abc')).toBeNull();
  });
});

describe('isTeamDefense', () => {
  it('knows a defence by its position or its negative ESPN id', () => {
    expect(isTeamDefense({ position: 'D/ST' })).toBe(true);
    expect(isTeamDefense({ espnPlayerId: -16020 })).toBe(true);
    expect(isTeamDefense({ position: 'RB', espnPlayerId: 4241457 })).toBe(false);
  });
});

describe('initialsOf', () => {
  it('takes the first and last word', () => {
    expect(initialsOf("Ja'Marr Chase")).toBe('JC');
    expect(initialsOf('Amon-Ra St. Brown')).toBe('AB');
    expect(initialsOf('Kenneth Walker III')).toBe('KI');
    expect(initialsOf('Saquon')).toBe('S');
    expect(initialsOf('')).toBe('');
  });
});

describe('uniqueByName', () => {
  it('keeps a name only one player has, so a face is never a guess', () => {
    const map = uniqueByName([
      { name: 'Josh Allen', espnPlayerId: 3918298, position: 'QB' },
      { name: 'Josh Allen', espnPlayerId: 3127313, position: 'LB' },
      { name: 'Puka Nacua', espnPlayerId: 4426515, position: 'WR' },
      { name: null, espnPlayerId: 1 }
    ]);
    expect(map.has('Josh Allen')).toBe(false);
    expect(map.get('Puka Nacua').espnPlayerId).toBe(4426515);
    expect(map.size).toBe(1);
  });
});

describe('defenseTeam', () => {
  it("reads a defence's team from its ESPN id", () => {
    expect(defenseTeam(-16013)).toBe('LV');
    expect(defenseTeam(-16020)).toBe('NYJ');
    expect(defenseTeam(-16028)).toBe('WAS');
    expect(defenseTeam(4241457)).toBeNull();
    expect(defenseTeam(null)).toBeNull();
  });
});
