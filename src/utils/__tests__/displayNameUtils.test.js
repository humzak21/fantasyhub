import { describe, it, expect } from 'vitest';

import { getTeamOwnerNames, isUserATeamOwner } from '../displayNameUtils.js';

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
  });
});
