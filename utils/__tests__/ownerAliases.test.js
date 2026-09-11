/**
 * The owner alias table and the two functions everything compares through.
 * Worth pinning: the known ESPN misspelling resolves to the league spelling,
 * both spellings share one key, unknown names pass through untouched, and
 * whitespace and case never make two names strangers.
 */

import { describe, it, expect } from 'vitest';
import { canonicalOwnerName, ownerKey, sameOwnerName, OWNER_ALIASES } from '../ownerAliases.js';
import { extractOwnerInfo } from '../ownerUtils.js';

describe('ownerAliases', () => {
  it("maps ESPN's misspelling to the league's spelling", () => {
    expect(canonicalOwnerName('Aashish Gatmaneni')).toBe('Aashish Gatamaneni');
    expect(canonicalOwnerName('  aashish   GATMANENI ')).toBe('Aashish Gatamaneni');
    expect(canonicalOwnerName('Aashish Gatamaneni')).toBe('Aashish Gatamaneni');
  });

  it('leaves every other name alone apart from trimming', () => {
    expect(canonicalOwnerName('  Humza Khalil ')).toBe('Humza Khalil');
    expect(canonicalOwnerName(null)).toBe('');
    expect(canonicalOwnerName(42)).toBe('');
  });

  it('gives both spellings one comparison key', () => {
    expect(ownerKey('Aashish Gatmaneni')).toBe(ownerKey('Aashish Gatamaneni'));
    expect(ownerKey('Aashish Gatmaneni')).toBe('aashish gatamaneni');
    expect(sameOwnerName('Aashish Gatmaneni', 'AASHISH GATAMANENI')).toBe(true);
    expect(sameOwnerName('Humza  Khalil', 'humza khalil')).toBe(true);
    expect(sameOwnerName('Humza Khalil', 'Arya Shah')).toBe(false);
    expect(sameOwnerName('', '')).toBe(false);
  });

  it('keeps alias keys in comparison form so a lookup cannot miss on case', () => {
    for (const key of Object.keys(OWNER_ALIASES)) {
      expect(key).toBe(key.trim().replace(/\s+/g, ' ').toLowerCase());
    }
  });

  it('is applied by extractOwnerInfo, the one function every ESPN reader uses', () => {
    const members = [{ id: '{X}', firstName: 'Aashish', lastName: 'Gatmaneni' }];
    expect(extractOwnerInfo({ primaryOwner: '{X}' }, members)).toEqual({
      ownerId: '{X}',
      ownerName: 'Aashish Gatamaneni'
    });
    const byDisplay = [{ id: '{Y}', displayName: 'Aashish Gatmaneni' }];
    expect(extractOwnerInfo({ owners: ['{Y}'] }, byDisplay).ownerName).toBe('Aashish Gatamaneni');
  });
});
