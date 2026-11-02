import { describe, it, expect } from 'vitest';
import { buildPickEmStandings } from '../pickEmStandings.js';

const pick = (userId, weekNumber, { correct = true, played = true } = {}) => ({
  userId,
  displayName: `Member ${userId}`,
  weekNumber,
  gameCompleted: played,
  isCorrect: played && correct
});

describe('buildPickEmStandings', () => {
  it('has a row for each member with a pick here, and nobody else', () => {
    expect(buildPickEmStandings([pick('a', 1), pick('b', 1)]).map((row) => row.userId)).toEqual([
      'a',
      'b'
    ]);
    expect(buildPickEmStandings([])).toEqual([]);
  });

  it('orders by points, then by accuracy', () => {
    const rows = buildPickEmStandings([
      pick('careful', 1),
      pick('busy', 1),
      pick('busy', 1, { correct: false }),
      pick('ahead', 1),
      pick('ahead', 1)
    ]);

    expect(rows.map((row) => row.userId)).toEqual(['ahead', 'careful', 'busy']);
  });

  it('counts the weeks entered, played or not', () => {
    const [row] = buildPickEmStandings([pick('a', 1), pick('a', 1), pick('a', 2, { played: false })]);

    expect(row.totalWeeksParticipated).toBe(2);
  });

  it('counts a perfect week only once every pick in it is decided', () => {
    const [row] = buildPickEmStandings([
      pick('a', 1),
      pick('a', 1),
      pick('a', 2),
      pick('a', 2, { played: false }),
      pick('a', 3),
      pick('a', 3, { correct: false })
    ]);

    expect(row.perfectWeeks).toBe(1);
  });

  it('adds a pick worth more than a point at what it is worth', () => {
    const [row] = buildPickEmStandings([{ ...pick('a', 1), pointsEarned: 3 }]);

    expect(row.totalPoints).toBe(3);
  });
});
