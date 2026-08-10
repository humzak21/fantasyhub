import { describe, it, expect } from 'vitest';

import {
  getTeamOwnerNames,
  hasDisplayName,
  isUserATeamOwner,
  matchesTeamOwner,
  validateFullName
} from '../displayNameUtils.js';

/**
 * These two functions have to agree on a shape, and for eight months they did
 * not: `getTeamOwnerNames` was changed to return `{ ownerName, teamName }`
 * objects while the History-tab gate still ran `.includes(<string>)` over the
 * result, which is always false. The gate also read `user_metadata.display_name`,
 * a key neither signup nor settings has ever written.
 *
 * So every case below feeds `isUserATeamOwner` the *actual output* of
 * `getTeamOwnerNames` rather than a hand-written literal. A future change to
 * the return shape fails here instead of silently hiding a tab.
 */

/** Shaped like `seasons.getActiveSeason()`: a season row with embedded teams. */
const season = {
  id: 'season-2025',
  year: 2025,
  teams: [
    { id: 'team-1', name: 'Cardiac Kids', owner: 'Humza Khalil' },
    { id: 'team-2', name: 'Dak to the Future', owner: 'Aaron Wadhwa' },
    { id: 'team-3', name: 'Unclaimed', owner: '' },
    { id: 'team-4', name: 'Also Unclaimed', owner: null }
  ]
};

const owners = getTeamOwnerNames(season);

const userWith = (metadata) => ({ id: 'user-1', user_metadata: metadata });

describe('getTeamOwnerNames', () => {
  it('returns one { ownerName, teamName } per team that has an owner', () => {
    expect(owners).toEqual([
      { ownerName: 'Humza Khalil', teamName: 'Cardiac Kids' },
      { ownerName: 'Aaron Wadhwa', teamName: 'Dak to the Future' }
    ]);
  });

  it('accepts a bare teams array as well as a season', () => {
    expect(getTeamOwnerNames(season.teams)).toEqual(owners);
  });

  it('returns [] for a season whose teams have not loaded', () => {
    expect(getTeamOwnerNames({ id: 'season-2025' })).toEqual([]);
    expect(getTeamOwnerNames(null)).toEqual([]);
  });
});

describe('isUserATeamOwner', () => {
  it('matches on full_name', () => {
    expect(isUserATeamOwner(userWith({ full_name: 'Humza Khalil' }), owners)).toBe(true);
  });

  it('matches on name when full_name is absent', () => {
    expect(isUserATeamOwner(userWith({ name: 'Aaron Wadhwa' }), owners)).toBe(true);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(isUserATeamOwner(userWith({ full_name: '  humza khalil  ' }), owners)).toBe(true);
  });

  it('still accepts a plain array of owner-name strings', () => {
    expect(isUserATeamOwner(userWith({ full_name: 'Humza Khalil' }), ['Humza Khalil'])).toBe(true);
  });

  it('rejects a user whose name matches no owner', () => {
    expect(isUserATeamOwner(userWith({ full_name: 'Not In The League' }), owners)).toBe(false);
  });

  it('rejects a user with no name metadata', () => {
    expect(isUserATeamOwner(userWith({}), owners)).toBe(false);
  });

  it('rejects a user whose only name is under display_name, which nothing writes', () => {
    expect(isUserATeamOwner(userWith({ display_name: 'Humza Khalil' }), owners)).toBe(false);
  });

  it('rejects everyone when the owner list is empty or the user is absent', () => {
    expect(isUserATeamOwner(userWith({ full_name: 'Humza Khalil' }), [])).toBe(false);
    expect(isUserATeamOwner(null, owners)).toBe(false);
    expect(isUserATeamOwner(userWith({ full_name: 'Humza Khalil' }), undefined)).toBe(false);
  });
});

describe('hasDisplayName', () => {
  it('is true when either metadata key holds a name', () => {
    expect(hasDisplayName(userWith({ full_name: 'Humza Khalil' }))).toBe(true);
    expect(hasDisplayName(userWith({ name: 'Humza Khalil' }))).toBe(true);
  });

  it('is false when the name is missing, blank or whitespace', () => {
    expect(hasDisplayName(userWith({}))).toBe(false);
    expect(hasDisplayName(userWith({ full_name: '', name: '' }))).toBe(false);
    expect(hasDisplayName(userWith({ full_name: '   ' }))).toBe(false);
    expect(hasDisplayName(userWith({ full_name: null, name: null }))).toBe(false);
  });

  it('is false for a user with no metadata at all, or no user', () => {
    expect(hasDisplayName({ id: 'user-1' })).toBe(false);
    expect(hasDisplayName(null)).toBe(false);
  });

  it('ignores display_name, which nothing writes', () => {
    expect(hasDisplayName(userWith({ display_name: 'Humza Khalil' }))).toBe(false);
  });
});

describe('matchesTeamOwner', () => {
  it('matches an owner regardless of case and whitespace', () => {
    expect(matchesTeamOwner('Humza Khalil', owners)).toBe(true);
    expect(matchesTeamOwner('  humza khalil  ', owners)).toBe(true);
  });

  it('accepts a plain array of strings as well as owner objects', () => {
    expect(matchesTeamOwner('Humza Khalil', ['Aaron Wadhwa', 'Humza Khalil'])).toBe(true);
  });

  it('rejects a near-miss, which is what the prompt warns about', () => {
    expect(matchesTeamOwner('Humza Kalil', owners)).toBe(false);
    expect(matchesTeamOwner('Humza A Khalil', owners)).toBe(false);
    expect(matchesTeamOwner('Humza', owners)).toBe(false);
  });

  it('rejects rather than throws on empty or absent input', () => {
    expect(matchesTeamOwner('Humza Khalil', [])).toBe(false);
    expect(matchesTeamOwner('Humza Khalil', undefined)).toBe(false);
    expect(matchesTeamOwner('', owners)).toBe(false);
    expect(matchesTeamOwner(null, owners)).toBe(false);
    expect(matchesTeamOwner('   ', owners)).toBe(false);
  });
});

describe('validateFullName', () => {
  it('accepts an ordinary first-and-last name', () => {
    expect(validateFullName('Humza Khalil')).toBeNull();
    expect(validateFullName('  Humza Khalil  ')).toBeNull();
  });

  it('rejects the three unambiguously wrong shapes', () => {
    expect(validateFullName('')).toMatch(/first and last name/i);
    expect(validateFullName('   ')).toMatch(/first and last name/i);
    expect(validateFullName('Khalil, Humza')).toMatch(/no commas/i);
    expect(validateFullName('Humza')).toMatch(/last name/i);
  });

  it('allows a middle name, which only the owner check can judge', () => {
    expect(validateFullName('Humza A Khalil')).toBeNull();
  });

  it('does not throw on a missing value', () => {
    expect(validateFullName(undefined)).toMatch(/first and last name/i);
    expect(validateFullName(null)).toMatch(/first and last name/i);
  });
});
