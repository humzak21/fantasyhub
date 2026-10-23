/**
 * A small league for the league chat's tests: three franchises over two
 * seasons (2024 complete, 2025 in progress), with a playoff, a championship and
 * a consolation game, built into cards by the real `buildLeagueFacts`.
 */

import { buildLeagueFacts } from '../leagueFacts.js';

export const S24 = 's24';
export const S25 = 's25';

const teams = [
  { id: 'a24', seasonId: S24, franchiseId: 'fa', owner: 'Anna Park', madePlayoffs: true, playoffFinish: 'champion', finalRank: 1 },
  { id: 'b24', seasonId: S24, franchiseId: 'fb', owner: 'Ben Cole', madePlayoffs: true, playoffFinish: '2nd', finalRank: 2 },
  { id: 'c24', seasonId: S24, franchiseId: 'fc', owner: 'Cara Diaz', madePlayoffs: false, playoffFinish: 'none', finalRank: 3 },
  { id: 'a25', seasonId: S25, franchiseId: 'fa', owner: 'Anna Park' },
  { id: 'b25', seasonId: S25, franchiseId: 'fb', owner: 'Ben Cole' },
  { id: 'c25', seasonId: S25, franchiseId: 'fc', owner: 'Cara Diaz' }
];

const game = (seasonId, week, a, b, pa, pb, extra = {}) => {
  const resultA = pa > pb ? 'W' : pa < pb ? 'L' : 'T';
  const resultB = resultA === 'W' ? 'L' : resultA === 'L' ? 'W' : 'T';
  const base = { seasonId, week, type: 'regular', isPlayoff: false, isConsolation: false, ...extra };
  return [
    { ...base, teamId: a, opponentId: b, pointsFor: pa, pointsAgainst: pb, result: resultA },
    { ...base, teamId: b, opponentId: a, pointsFor: pb, pointsAgainst: pa, result: resultB }
  ];
};

const results = [
  ...game(S24, 1, 'a24', 'b24', 120.5, 100.25),
  ...game(S24, 2, 'a24', 'c24', 98.1, 130.04),
  ...game(S24, 3, 'b24', 'c24', 111.11, 90),
  ...game(S24, 4, 'a24', 'b24', 140.2, 99.9),
  ...game(S24, 15, 'a24', 'b24', 150.66, 120.06, { type: 'playoff_championship', isPlayoff: true }),
  ...game(S24, 15, 'c24', 'c24x', 0, 0), // an opponent with no team row is ignored
  ...game(S25, 1, 'b25', 'a25', 133.3, 101.01),
  ...game(S25, 2, 'c25', 'a25', 88.8, 92.2)
];

export const seasons = [
  { id: S24, year: 2024, isCompleted: true },
  { id: S25, year: 2025, isCompleted: false }
];

export function buildFixture() {
  const built = buildLeagueFacts({
    seasons,
    teams,
    results,
    currentSeasonId: S25,
    pairings: [{ team1Id: 'a25', team2Id: 'b25' }],
    currentWeek: 3
  });
  return { ...built, cards: built.cards.map((card, i) => ({ id: i + 1, ...card })) };
}
