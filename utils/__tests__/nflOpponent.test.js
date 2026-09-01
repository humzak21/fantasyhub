/**
 * The opponent chip's text, and the map it reads from.
 *
 * The distinction under test throughout is bye-versus-unknown. They render
 * differently on purpose: a bye is a fact the calendar asserts, and an absent
 * entry is the calendar having nothing to say — about a player with no NFL
 * team, a season nobody has imported, or a week outside the schedule. Printing
 * "BYE" for the second would tell the reader something false about a real
 * player who is, in fact, playing.
 */

import { describe, it, expect } from 'vitest';

import { formatOpponent, isBye } from '../nflOpponent.js';
import { buildOpponentMap } from '../../hooks/queries/useNflSchedule.js';

/** BUF(2) at KC(12) in week 1; BUF is off in week 7. */
const ROWS = [
  {
    seasonYear: 2026,
    week: 1,
    proTeamId: 2,
    opponentProTeamId: 12,
    isHome: false,
    gameTime: '2026-09-13T17:00:00.000Z',
    startTimeTbd: false,
    statsOfficial: false
  },
  {
    seasonYear: 2026,
    week: 1,
    proTeamId: 12,
    opponentProTeamId: 2,
    isHome: true,
    gameTime: '2026-09-13T17:00:00.000Z',
    startTimeTbd: false,
    statsOfficial: false
  },
  {
    seasonYear: 2026,
    week: 7,
    proTeamId: 2,
    opponentProTeamId: null,
    isHome: null,
    gameTime: null,
    startTimeTbd: false,
    statsOfficial: false
  }
];

describe('buildOpponentMap', () => {
  it('keys one week by ESPN proTeamId', () => {
    const map = buildOpponentMap(ROWS, 1);

    expect(Object.keys(map).sort()).toEqual(['12', '2']);
    expect(map[2]).toMatchObject({
      bye: false,
      opponentProTeamId: 12,
      opponentAbbrev: 'KC',
      isHome: false
    });
    expect(map[12]).toMatchObject({ opponentAbbrev: 'BUF', isHome: true });
  });

  it('marks a bye off the stored row, not off a missing one', () => {
    const map = buildOpponentMap(ROWS, 7);

    expect(map[2]).toMatchObject({ bye: true, opponentProTeamId: null, opponentAbbrev: null });
    // KC simply has no week 7 row in this fixture — that is not a bye.
    expect(map[12]).toBeUndefined();
  });

  it('is empty for a week the calendar does not cover', () => {
    expect(buildOpponentMap(ROWS, 19)).toEqual({});
    expect(buildOpponentMap(ROWS, null)).toEqual({});
    expect(buildOpponentMap([], 1)).toEqual({});
    expect(buildOpponentMap(undefined, 1)).toEqual({});
  });
});

describe('formatOpponent', () => {
  const map = { ...buildOpponentMap(ROWS, 1), bye: buildOpponentMap(ROWS, 7)[2] };

  it('reads "@ ABBR" away and "vs ABBR" at home', () => {
    expect(formatOpponent(map[2])).toBe('@ KC');
    expect(formatOpponent(map[12])).toBe('vs BUF');
  });

  it('reads BYE on a bye', () => {
    expect(formatOpponent(map.bye)).toBe('BYE');
  });

  it('says nothing when there is no entry', () => {
    // The map returns undefined for a proTeamId it has never heard of, which
    // is what a free-text parlay pick or an unimported season produces.
    expect(formatOpponent(undefined)).toBeNull();
    expect(formatOpponent(null)).toBeNull();
  });

  it('says nothing rather than "@ null" for an unrecognised opponent id', () => {
    // getNFLTeamAbbreviation returns null for an id outside the 32; a relocated
    // or expansion franchise would land here before the map is updated.
    expect(formatOpponent({ bye: false, isHome: true, opponentAbbrev: null })).toBeNull();
  });
});

describe('isBye', () => {
  it('is true only for an asserted bye', () => {
    expect(isBye(buildOpponentMap(ROWS, 7)[2])).toBe(true);
    expect(isBye(buildOpponentMap(ROWS, 1)[2])).toBe(false);
    expect(isBye(undefined)).toBe(false);
  });
});
