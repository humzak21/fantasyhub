import { describe, it, expect } from 'vitest';

import { resolveUpperBracket } from '../projectedBracket.js';
import {
  STANDINGS_VIEW,
  gamesForView,
  scoredWeeks,
  standingsForView,
  withMovement,
  withPlayoffStatus
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

describe('withPlayoffStatus', () => {
  // Fourteen teams in two divisions, a round robin, and the lower id always
  // winning: t00 is unbeaten and t13 winless.
  const ids = Array.from({ length: 14 }, (_, i) => `t${String(i).padStart(2, '0')}`);
  const teams = ids.map((id, i) => team(id, i % 2 === 0 ? 1 : 2));
  const schedule = (() => {
    const rotating = ids.slice(1);
    const rounds = [];
    for (let r = 0; r < 13; r += 1) {
      const circle = [ids[0], ...rotating];
      rounds.push(Array.from({ length: 7 }, (_, k) => [circle[k], circle[13 - k]]));
      rotating.unshift(rotating.pop());
    }
    return Array.from({ length: 14 }, (_, w) => rounds[w % 13]);
  })();
  const seasonScoredThrough = (last) =>
    schedule.flatMap((pairs, w) =>
      pairs.map(([a, b], k) => {
        const week = w + 1;
        const scored = week <= last;
        const aWins = a < b;
        return game(`g${week}-${k}`, week, a, b, scored ? (aWins ? 120 : 100) : null, scored ? (aWins ? 100 : 120) : null);
      })
    );

  const table = {
    divisions: [1, 2].map((divisionId) => ({
      divisionId,
      teams: teams
        .filter((t) => t.division_id === divisionId)
        .map((t, index) => ({ id: t.id, divisionRank: index + 1, playoffSeed: null }))
    })),
    unassigned: []
  };

  const marks = (standings) =>
    Object.fromEntries(standings.divisions.flatMap((d) => d.teams.map((r) => [r.id, r.playoffStatus])));

  const status = (mode, games, extra = {}) =>
    marks(withPlayoffStatus(table, { mode, teams, games, year: 2026, regularSeasonWeeks: 14, ...extra }));

  it('marks a clinch and an elimination on the official table', () => {
    const result = status(OFFICIAL, seasonScoredThrough(12));

    expect(result.t00).toBe('clinched');
    expect(result.t13).toBe('eliminated');
  });

  it('marks nobody until something is settled', () => {
    expect(Object.values(status(OFFICIAL, seasonScoredThrough(1))).every((s) => s === null)).toBe(true);
  });

  it('drops every mark once week 14 is scored', () => {
    expect(Object.values(status(OFFICIAL, seasonScoredThrough(14))).every((s) => s === null)).toBe(true);
  });

  it('reads a week\'s view as it stood, with the weeks after it still to play', () => {
    const games = seasonScoredThrough(14);

    expect(status(WEEK, games, { week: 12 })).toMatchObject({ t00: 'clinched', t13: 'eliminated' });
    expect(Object.values(status(WEEK, games, { week: 14 })).every((s) => s === null)).toBe(true);
    expect(Object.values(status(WEEK, games, { week: 1 })).every((s) => s === null)).toBe(true);
  });

  it('plays the live week out for Live, as its table does', () => {
    const games = seasonScoredThrough(13);
    const live = {
      games: Object.fromEntries(
        games
          .filter((g) => g.week === 14)
          .map((g) => [g.id, { team1: { points: 90 }, team2: { points: 80 } }])
      )
    };

    expect(status(OFFICIAL, games)).toMatchObject({ t00: 'clinched' });
    // As if week 14 ended now, the regular season is over: no marks.
    expect(Object.values(status(LIVE, games, { live })).every((s) => s === null)).toBe(true);
  });

  it('keeps every other field on the row, and marks the unassigned', () => {
    const withLoose = { ...table, unassigned: [{ id: 't13', divisionRank: null }] };
    const result = withPlayoffStatus(withLoose, {
      mode: OFFICIAL,
      teams,
      games: seasonScoredThrough(12),
      year: 2026,
      regularSeasonWeeks: 14
    });

    expect(result.divisions[0].teams[0]).toMatchObject({ id: 't00', divisionRank: 1, playoffStatus: 'clinched' });
    expect(result.unassigned[0]).toMatchObject({ id: 't13', playoffStatus: 'eliminated' });
  });

  it('passes no standings through untouched', () => {
    expect(withPlayoffStatus(undefined, { mode: OFFICIAL, teams, games: [] })).toBeUndefined();
  });
});
