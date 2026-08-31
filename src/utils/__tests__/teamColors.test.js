import { describe, it, expect } from 'vitest';
import {
  TEAM_COLOR_SLOTS,
  getTeamColor,
  getTeamColorKey,
  getTeamColorSlot,
  getTeamInitials,
  teamChartColor,
} from '../teamColors';

describe('getTeamColorKey', () => {
  it('prefers franchise id over owner and name', () => {
    const key = getTeamColorKey({ franchiseId: 7, ownerName: 'Humza Khalil', name: 'Lightskin Empire' });
    expect(key).toBe('franchise:7');
  });

  it('accepts the snake_case shape the db layer returns', () => {
    expect(getTeamColorKey({ franchise_id: 7 })).toBe('franchise:7');
    expect(getTeamColorKey({ owner_name: 'Humza Khalil' })).toBe('owner:humza khalil');
  });

  it('falls back to owner, then to team name', () => {
    expect(getTeamColorKey({ ownerName: 'Anish Madala' })).toBe('owner:anish madala');
    expect(getTeamColorKey({ name: 'GrandPinto' })).toBe('name:grandpinto');
  });

  it('ignores a franchise id that is present but empty', () => {
    expect(getTeamColorKey({ franchiseId: null, ownerName: 'Arya Shah' })).toBe('owner:arya shah');
    expect(getTeamColorKey({ franchiseId: '', ownerName: 'Arya Shah' })).toBe('owner:arya shah');
  });

  it('is stable across owner-name casing and padding', () => {
    expect(getTeamColorKey({ ownerName: '  Eshan Kaul ' })).toBe(getTeamColorKey({ ownerName: 'eshan kaul' }));
  });

  it('returns an empty key for nothing identifiable', () => {
    expect(getTeamColorKey(null)).toBe('');
    expect(getTeamColorKey({})).toBe('');
  });
});

describe('getTeamColorSlot', () => {
  it('is deterministic — the same team always gets the same slot', () => {
    const team = { ownerName: 'Harshil Pareek' };
    const first = getTeamColorSlot(team);
    for (let i = 0; i < 50; i += 1) {
      expect(getTeamColorSlot({ ...team })).toBe(first);
    }
  });

  it('does not depend on the team name, which changes between seasons', () => {
    const y1 = { franchiseId: 3, name: 'Not Again Killas' };
    const y2 = { franchiseId: 3, name: 'a completely different name' };
    expect(getTeamColorSlot(y1)).toBe(getTeamColorSlot(y2));
  });

  it('always lands inside the wheel', () => {
    const owners = [
      'Humza Khalil', 'Harshil Pareek', 'Eshan Kaul', 'Anish Madala', 'Arya Shah',
      'Aaron Wadhwa', 'Rohit Ramki', 'Nikhil Sharma', 'Aashish Gatmaneni',
      'Aditya Penmesta', 'Rohith Mahesh', 'Anand Kanumuru', 'Pranav Simha', 'Sai Rav',
    ];
    for (const ownerName of owners) {
      const slot = getTeamColorSlot({ ownerName });
      expect(slot).toBeGreaterThanOrEqual(1);
      expect(slot).toBeLessThanOrEqual(TEAM_COLOR_SLOTS);
      expect(Number.isInteger(slot)).toBe(true);
    }
  });

  it('does not collide on anagrams', () => {
    // A character-sum hash would give these the same slot.
    expect(getTeamColorSlot({ ownerName: 'abc' })).not.toBe(getTeamColorSlot({ ownerName: 'cba' }));
  });

  it('gives an unidentifiable team a valid slot rather than throwing', () => {
    expect(getTeamColorSlot(null)).toBe(1);
    expect(getTeamColorSlot({})).toBe(1);
  });
});

describe('getTeamColor', () => {
  it('points at a custom property that is emitted at runtime', () => {
    // `--color-team-N` is a @theme entry and is inlined away by `@theme
    // inline`; only `--team-N` survives into the bundle as a real custom
    // property, and recharts needs a value it can actually resolve.
    const color = getTeamColor({ ownerName: 'Humza Khalil' });
    expect(color.varName).toMatch(/^--team-\d+$/);
    expect(color.value).toBe(`var(${color.varName})`);
  });

  it('returns class names matching the safelisted utilities', () => {
    const color = getTeamColor({ franchiseId: 2 });
    expect(color.bg).toBe(`bg-team-${color.slot}`);
    expect(color.text).toBe(`text-team-${color.slot}`);
    expect(color.border).toBe(`border-team-${color.slot}`);
    expect(color.ring).toBe(`ring-team-${color.slot}`);
  });

  it('teamChartColor agrees with getTeamColor', () => {
    const team = { franchiseId: 9 };
    expect(teamChartColor(team)).toBe(getTeamColor(team).value);
  });
});

describe('getTeamInitials', () => {
  it('uses the owner first and last initial', () => {
    expect(getTeamInitials({ ownerName: 'Humza Khalil' })).toBe('HK');
  });

  it('prefers the owner over the team name', () => {
    expect(getTeamInitials({ ownerName: 'Arya Shah', name: 'Comeback season' })).toBe('AS');
  });

  it('takes two letters from a single-word name', () => {
    expect(getTeamInitials({ ownerName: 'Madonna' })).toBe('MA');
  });

  it('uses the first and last word when there is a middle name', () => {
    expect(getTeamInitials({ ownerName: 'Mary Jane Watson' })).toBe('MW');
  });

  it('falls back to the team name, then to a placeholder', () => {
    expect(getTeamInitials({ name: 'GrandPinto' })).toBe('GR');
    expect(getTeamInitials({})).toBe('?');
    expect(getTeamInitials(null)).toBe('?');
  });
});
