import { describe, it, expect } from 'vitest';

import { deriveDivisionTitles, finalsOf, recordsHeldBy } from '../trophyCase.js';

const row = (franchiseId, division, wins, losses, pointsFor, extra = {}) => ({
  team_id: `t-${franchiseId}`,
  team_name: `Team ${franchiseId}`,
  franchise_id: franchiseId,
  season_id: 's25',
  season_year: 2025,
  division_id: division,
  wins,
  losses,
  ties: 0,
  points_for: pointsFor,
  points_against: 1000,
  ...extra
});

const DIVISIONS = [
  { id: 'east', name: 'Assholes' },
  { id: 'west', name: 'Ninjas' }
];

describe('deriveDivisionTitles', () => {
  it('gives each division of a completed season to its best record', () => {
    const titles = deriveDivisionTitles({
      standings: [row('a', 'east', 10, 4, 1500), row('b', 'east', 9, 5, 1700), row('c', 'west', 8, 6, 1400)],
      divisions: DIVISIONS,
      completedSeasonIds: ['s25']
    });

    expect(titles.map((title) => [title.franchiseId, title.divisionName])).toEqual([
      ['a', 'Assholes'],
      ['c', 'Ninjas']
    ]);
    expect(titles[0]).toMatchObject({ year: 2025, wins: 10, losses: 4, teamName: 'Team a' });
  });

  it('breaks a level record on points for, then points against', () => {
    const titles = deriveDivisionTitles({
      standings: [
        row('a', 'east', 10, 4, 1500),
        row('b', 'east', 10, 4, 1600),
        row('c', 'west', 10, 4, 1500, { points_against: 900 }),
        row('d', 'west', 10, 4, 1500, { points_against: 950 })
      ],
      divisions: DIVISIONS,
      completedSeasonIds: ['s25']
    });

    expect(titles.map((title) => title.franchiseId)).toEqual(['b', 'c']);
  });

  it('counts a tie as half a win', () => {
    const titles = deriveDivisionTitles({
      standings: [row('a', 'east', 9, 5, 1800), row('b', 'east', 9, 4, 1200, { ties: 1 })],
      divisions: DIVISIONS,
      completedSeasonIds: ['s25']
    });

    expect(titles[0].franchiseId).toBe('b');
  });

  it('awards nothing for a season still being played', () => {
    const titles = deriveDivisionTitles({
      standings: [row('a', 'east', 3, 0, 400, { season_id: 's26', season_year: 2026 })],
      divisions: DIVISIONS,
      completedSeasonIds: ['s25']
    });

    expect(titles).toEqual([]);
  });
});

describe('finalsOf', () => {
  it('splits titles from runner-ups, newest first', () => {
    const seasons = [
      { season: { year: 2021 }, playoff_finish: 'champion' },
      { season: { year: 2024 }, playoff_finish: 'champion' },
      { season: { year: 2022 }, playoff_finish: '2nd' },
      { season: { year: 2023 }, playoff_finish: 'none' }
    ];

    const { titles, runnerUps } = finalsOf(seasons);

    expect(titles.map((season) => season.season.year)).toEqual([2024, 2021]);
    expect(runnerUps.map((season) => season.season.year)).toEqual([2022]);
  });
});

describe('recordsHeldBy', () => {
  const catalog = [
    { id: 'wins', scope: 'career', data: 'wins', direction: 'desc', format: 'int' },
    { id: 'low', scope: 'season', data: 'low', direction: 'asc', format: 'points', phases: true },
    { id: 'pair', scope: 'career', data: 'pair', direction: 'desc', format: 'int' }
  ];
  const book = {
    career: {
      wins: [
        { franchiseId: 'a', value: 50 },
        { franchiseId: 'b', value: 50 },
        { franchiseId: 'c', value: 40 }
      ],
      pair: [{ franchiseId: 'x', partnerFranchiseId: 'c', value: 6 }]
    },
    season: {
      low: [
        { franchiseId: 'a', value: 41, phase: 'regular', year: 2023 },
        { franchiseId: 'a', value: 41, phase: 'regular', year: 2021 },
        { franchiseId: 'b', value: 12, phase: 'playoff', year: 2022 },
        { franchiseId: 'c', value: 60, phase: 'regular', year: 2024 }
      ]
    }
  };

  it('holds a shared #1, and says so', () => {
    const [wins] = recordsHeldBy(book, 'b', catalog);
    expect(wins.record.id).toBe('wins');
    expect(wins.shared).toBe(true);
  });

  it('holds a bad record just as it holds a good one', () => {
    const held = recordsHeldBy(book, 'a', catalog);
    expect(held.map((entry) => entry.record.id)).toEqual(['wins', 'low']);
  });

  it('reads game records from the regular season, as the record proper', () => {
    const held = recordsHeldBy(book, 'b', catalog);
    expect(held.map((entry) => entry.record.id)).toEqual(['wins']);
  });

  it('lists a record held twice once, with both rows', () => {
    const low = recordsHeldBy(book, 'a', catalog).find((entry) => entry.record.id === 'low');
    expect(low.rows).toHaveLength(2);
    expect(low.shared).toBe(false);
  });

  it('counts a pair record for either side', () => {
    expect(recordsHeldBy(book, 'c', catalog).map((entry) => entry.record.id)).toEqual(['pair']);
  });

  it('holds nothing for a franchise outside the top, or with no book', () => {
    expect(recordsHeldBy(book, 'nobody', catalog)).toEqual([]);
    expect(recordsHeldBy(null, 'a', catalog)).toEqual([]);
  });
});
