import { describe, it, expect } from 'vitest';

import { PICK_EM_TOURNEYS, tourneyStandings, tourneyWinners } from '../tourneys.js';

const [firstHalf, secondHalf] = PICK_EM_TOURNEYS;

const weeks = (from, to, rows) =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, rows]));

describe('tourneyStandings', () => {
  it('adds up the weeks in its span and no others', () => {
    const standings = tourneyStandings(firstHalf, {
      ...weeks(1, 8, [{ userId: 'a', totalPoints: 4 }]),
      9: [{ userId: 'a', totalPoints: 100 }]
    });

    expect(standings).toEqual([{ userId: 'a', totalPoints: 32, entered: 8, eligible: true }]);
  });

  it('counts a week entered on a score of nothing', () => {
    const [row] = tourneyStandings(firstHalf, weeks(1, 5, [{ userId: 'a', totalPoints: 0 }]));
    expect(row).toMatchObject({ entered: 5, eligible: true });
  });

  it('holds the second half apart from the first', () => {
    const [row] = tourneyStandings(secondHalf, {
      ...weeks(5, 8, [{ userId: 'a', totalPoints: 7 }]),
      ...weeks(9, 13, [{ userId: 'a', totalPoints: 1 }])
    });

    expect(row).toMatchObject({ totalPoints: 5, entered: 5 });
  });
});

describe('tourneyWinners', () => {
  const row = (userId, totalPoints, eligible = true) => ({ userId, totalPoints, entered: 5, eligible });

  it('is the top score over the floor', () => {
    const winners = tourneyWinners([row('under', 90, false), row('a', 50), row('b', 40)]);
    expect(winners.map((winner) => winner.userId)).toEqual(['a']);
  });

  it('is everybody tied for first', () => {
    const winners = tourneyWinners([row('a', 50), row('b', 50), row('c', 40)]);
    expect(winners.map((winner) => winner.userId)).toEqual(['a', 'b']);
  });

  it('is nobody when nobody cleared the floor or scored', () => {
    expect(tourneyWinners([row('a', 50, false)])).toEqual([]);
    expect(tourneyWinners([row('a', 0)])).toEqual([]);
    expect(tourneyWinners([])).toEqual([]);
  });
});
