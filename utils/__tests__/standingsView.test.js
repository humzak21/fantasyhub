import { describe, it, expect } from 'vitest';

import { resolveUpperBracket } from '../projectedBracket.js';
import {
  STANDINGS_VIEW,
  gamesForView,
  scoredWeeks,
  standingsForView,
  withMovement
} from '../standings/standingsView.js';

const { LIVE, OFFICIAL, WEEK } = STANDINGS_VIEW;

const team = (id, division_id = 1) => ({ id, name: `Team ${id}`, owner: `Owner ${id}`, division_id });
const game = (id, week, team1Id, team2Id, team1Score, team2Score) => ({
  id,
  week,
  type: 'regular',
  team1Id,
  team2Id,
  team1Score,
  team2Score
});

const TEAMS = [team('a'), team('b'), team('c', 2), team('d', 2)];
const GAMES = [
  game('g1', 1, 'a', 'b', 110, 100),
  game('g2', 1, 'c', 'd', 90, 95),
  game('g3', 2, 'a', 'b', null, null),
  game('g4', 2, 'c', 'd', null, null)
];

const row = (id, divisionRank) => ({ id, divisionRank });

const OFFICIAL_TABLE = {
  divisions: [
    { divisionId: 1, teams: [row('a', 1), row('b', 2)] },
    { divisionId: 2, teams: [row('d', 1), row('c', 2)] }
  ],
  unassigned: []
};

const LIVE_WEEK = {
  games: {
    g3: { team1: { points: 40 }, team2: { points: 90 } },
    g4: { team1: { points: 200 }, team2: { points: 10 } }
  }
};

const view = (mode, extra) =>
  standingsForView({ mode, official: OFFICIAL_TABLE, teams: TEAMS, games: GAMES, year: 2026, ...extra });

const division = (standings, id) => standings.divisions.find((d) => d.divisionId === id).teams;

describe('scoredWeeks', () => {
  it('offers weeks with every game scored, newest first', () => {
    const games = [...GAMES, game('g5', 3, 'a', 'c', 1, 2)];
    expect(scoredWeeks(games)).toEqual([3, 1]);
  });

  it('leaves out a part-scored week, and the postseason', () => {
    const games = [
      game('g1', 1, 'a', 'b', 110, 100),
      game('g2', 1, 'c', 'd', null, null),
      { ...game('g3', 15, 'a', 'b', 100, 90), type: 'playoff_first_round' }
    ];
    expect(scoredWeeks(games)).toEqual([]);
  });
});

describe('withMovement', () => {
  const live = {
    divisions: [{ divisionId: 1, teams: [row('b', 1), row('a', 2)] }],
    unassigned: []
  };

  it('says who has moved against the official table', () => {
    const [up, down] = withMovement(live, OFFICIAL_TABLE).divisions[0].teams;

    expect(up).toMatchObject({ id: 'b', movement: 1 });
    expect(down).toMatchObject({ id: 'a', movement: -1 });
  });

  it('has no movement for a team with nothing to compare against', () => {
    const [first] = withMovement(live, { divisions: [] }).divisions[0].teams;
    expect(first.movement).toBeNull();
  });
});

describe('gamesForView', () => {
  it('leaves Official alone', () => {
    expect(gamesForView({ mode: OFFICIAL, games: GAMES })).toBe(GAMES);
  });

  it('stops a week\'s view at that week', () => {
    expect(gamesForView({ mode: WEEK, week: 1, games: GAMES }).map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('plays the live week out for Live', () => {
    const shown = gamesForView({ mode: LIVE, games: GAMES, live: LIVE_WEEK });
    expect(shown.find((g) => g.id === 'g3')).toMatchObject({ team1Score: 40, team2Score: 90 });
  });
});

describe('standingsForView', () => {
  it('hands Official straight back: it is the RPC', () => {
    expect(view(OFFICIAL)).toBe(OFFICIAL_TABLE);
  });

  it('applies the week in progress for Live, and reports the movement', () => {
    const live = view(LIVE, { live: LIVE_WEEK });

    expect(division(live, 2).map((r) => r.id)).toEqual(['c', 'd']);
    expect(division(live, 2)[0]).toMatchObject({ wins: 1, losses: 1, pointsFor: 290, movement: 1 });
  });

  it('shows a week as it stood, with no movement to report', () => {
    const shown = view(WEEK, { week: 1 });

    expect(division(shown, 2)[0]).toMatchObject({ id: 'd', wins: 1 });
    expect(division(shown, 2)[0]).not.toHaveProperty('movement');
  });
});

describe('the bracket under Live, in a postseason week', () => {
  const seeded = ['s1', 's2', 's3', 's4', 's5', 's6'].map((id, index) => ({
    id,
    name: id,
    playoffSeed: index + 1
  }));

  const firstRound = {
    ...game('r1', 15, 's3', 's6', null, null),
    type: 'playoff_first_round',
    isCompleted: false
  };

  const bracketFor = (live) =>
    resolveUpperBracket({
      games: gamesForView({ mode: LIVE, games: [firstRound], live }),
      teams: seeded,
      firstRoundWeek: 15
    });

  const matchup = (bracket) => bracket.rounds[0].matchups.find((m) => m.id === 'r1-3v6');

  it('shows the live score on a drawn game, and calls no winner', () => {
    const [third, sixth] = matchup(bracketFor({ games: { r1: { team1: { points: 88.4 }, team2: { points: 61.2 } } } })).sides;

    expect(third).toMatchObject({ score: 88.4, won: false, lost: false });
    expect(sixth).toMatchObject({ score: 61.2, won: false, lost: false });
  });

  it('leaves a game that has not started without a score', () => {
    const [third] = matchup(bracketFor(null)).sides;
    expect(third.score).toBeNull();
  });
});
