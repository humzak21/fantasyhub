/**
 * Grouping the parlay board by division.
 *
 * The chain is display name → `teams.owner` → `teams.division_id`, and every
 * link can be missing in a way that is nobody's mistake. What matters is that a
 * broken link puts the pick in `unassigned` rather than in a division it does
 * not belong to: a missing pick is noticeable, a misfiled one is not.
 */

import { describe, it, expect } from 'vitest';
import { groupPicksByDivision } from '../parlayDivisions';

const DIVISIONS = [
  { id: 'd1', name: 'The Dawg Pound', displayOrder: 1 },
  { id: 'd2', name: 'The Kennel', displayOrder: 2 }
];

const TEAMS = [
  { id: 't1', owner: 'Humza Khalil', division_id: 'd1' },
  { id: 't2', owner: 'Arya Shah', division_id: 'd2' }
];

const pick = (id, displayName) => ({ id, displayName, playerNameRaw: 'Somebody' });

describe('groupPicksByDivision', () => {
  it('seats each pick in its owner’s division', () => {
    const { groups, unassigned } = groupPicksByDivision(
      [pick('a', 'Humza Khalil'), pick('b', 'Arya Shah')],
      { teams: TEAMS, divisions: DIVISIONS }
    );

    expect(groups.map((group) => group.division.id)).toEqual(['d1', 'd2']);
    expect(groups[0].picks.map((p) => p.id)).toEqual(['a']);
    expect(groups[1].picks.map((p) => p.id)).toEqual(['b']);
    expect(unassigned).toEqual([]);
  });

  it('matches names the way the rest of the app does — trimmed and case-folded', () => {
    const { groups } = groupPicksByDivision([pick('a', '  humza KHALIL ')], {
      teams: TEAMS,
      divisions: DIVISIONS
    });

    expect(groups[0].picks).toHaveLength(1);
  });

  it('keeps every division, including one nobody has entered', () => {
    const { groups } = groupPicksByDivision([pick('a', 'Humza Khalil')], {
      teams: TEAMS,
      divisions: DIVISIONS
    });

    expect(groups).toHaveLength(2);
    expect(groups[1].picks).toEqual([]);
  });

  it('sets aside a name that matches no owner rather than guessing', () => {
    const { groups, unassigned } = groupPicksByDivision([pick('a', 'Somebody Else')], {
      teams: TEAMS,
      divisions: DIVISIONS
    });

    expect(unassigned.map((p) => p.id)).toEqual(['a']);
    expect(groups.every((group) => group.picks.length === 0)).toBe(true);
  });

  it('sets aside a pick with no display name at all', () => {
    const { unassigned } = groupPicksByDivision([pick('a', null)], {
      teams: TEAMS,
      divisions: DIVISIONS
    });

    expect(unassigned.map((p) => p.id)).toEqual(['a']);
  });

  it('sets aside an owner whose team is in no division', () => {
    const { unassigned } = groupPicksByDivision([pick('a', 'Nobody Div')], {
      teams: [...TEAMS, { id: 't3', owner: 'Nobody Div', division_id: null }],
      divisions: DIVISIONS
    });

    expect(unassigned.map((p) => p.id)).toEqual(['a']);
  });

  it('reads a camelCased team too — the admin paths hand those around', () => {
    const { groups } = groupPicksByDivision([pick('a', 'Humza Khalil')], {
      teams: [{ id: 't1', owner: 'Humza Khalil', divisionId: 'd1' }],
      divisions: DIVISIONS
    });

    expect(groups[0].picks).toHaveLength(1);
  });

  it('is empty-safe when the league has not loaded yet', () => {
    expect(groupPicksByDivision()).toEqual({ groups: [], unassigned: [] });
    expect(groupPicksByDivision([pick('a', 'Humza Khalil')], {})).toEqual({
      groups: [],
      unassigned: [expect.objectContaining({ id: 'a' })]
    });
  });
});
