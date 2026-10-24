import { describe, it, expect } from 'vitest';
import { resolveViewerTeam } from '../viewerTeam.js';
import { getTeamOwnerNames } from '../../src/utils/displayNameUtils.js';

const teams = [
  { id: 't1', name: 'Lightskin Empire', owner: 'Humza Khalil' },
  { id: 't2', name: 'GrandPinto', owner: 'Aashish Gatamaneni' },
  { id: 't3', name: 'Nobody', owner: '' }
];
const owners = getTeamOwnerNames(teams);
const userNamed = (name) => ({ id: 'u', user_metadata: { name } });

describe('resolveViewerTeam', () => {
  it("matches the display name to the team's owner, ignoring case and spacing", () => {
    expect(resolveViewerTeam(teams, userNamed('  humza khalil '), owners)?.id).toBe('t1');
  });

  it('matches through a known ESPN misspelling', () => {
    expect(resolveViewerTeam(teams, userNamed('Aashish Gatmaneni'), owners)?.id).toBe('t2');
  });

  it('is null for a name that owns nothing — the admin without a franchise', () => {
    expect(resolveViewerTeam(teams, userNamed('Someone Else'), owners)).toBeNull();
  });

  it('is null signed out or without a display name', () => {
    expect(resolveViewerTeam(teams, null, owners)).toBeNull();
    expect(resolveViewerTeam(teams, { id: 'u', user_metadata: {} }, owners)).toBeNull();
  });

  it('is null for an unapproved viewer, who is handed no owners', () => {
    expect(resolveViewerTeam(teams, userNamed('Humza Khalil'), [])).toBeNull();
  });
});
