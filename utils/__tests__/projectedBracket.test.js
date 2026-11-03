import { describe, it, expect } from 'vitest';

import {
  HOME_BRACKET_AFTER_WEEK,
  boxScoreGame,
  flattenStandings,
  isBracketSet,
  lastScoredWeek,
  projectBracket,
  resolveUpperBracket,
  seedOrder,
  showsHomeBracket,
  showsPathToPlayoffs
} from '../projectedBracket.js';

const row = (n, seed = null) => ({
  id: `t${n}`,
  name: `Team ${n}`,
  divisionId: n % 2 ? 'east' : 'west',
  playoffSeed: seed,
  wins: 14 - n,
  losses: n,
  ties: 0,
  winPercentage: (14 - n) / 14,
  pointsFor: 1500 - n,
  pointsAgainst: 1000 + n
});

// Seeds 1-6 go to teams 1-6; 7-14 are unseeded and fall to the canonical sort.
const LEAGUE = Array.from({ length: 14 }, (_, i) => row(i + 1, i < 6 ? i + 1 : null));

const regular = (week, scored = true) => ({
  week,
  type: 'regular',
  team1Id: 'a',
  team2Id: 'b',
  team1Score: scored ? 100 : null,
  team2Score: scored ? 90 : null
});

const game = (id, type, week, team1Id, team2Id, winnerTeamId = null) => ({
  id,
  type,
  week,
  team1Id,
  team2Id,
  winnerTeamId,
  team1Score: winnerTeamId ? (winnerTeamId === team1Id ? 110 : 90) : null,
  team2Score: winnerTeamId ? (winnerTeamId === team2Id ? 110 : 90) : null
});

const seedsIn = (matchup) => matchup.sides.map((side) => side.seed ?? side.label);

describe('flattenStandings', () => {
  it('joins the divisions and the unassigned teams', () => {
    const rows = flattenStandings({ divisions: [{ teams: [{ id: 1 }] }, { teams: [{ id: 2 }] }], unassigned: [{ id: 3 }] });
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});

describe('lastScoredWeek', () => {
  it('finds the newest week scored in full', () => {
    expect(lastScoredWeek([regular(9), regular(10), regular(11, false)])).toBe(10);
  });

  it('does not count a week still part-scored', () => {
    expect(lastScoredWeek([regular(9), regular(10), regular(10, false)])).toBe(9);
  });

  it('ignores postseason rows and is 0 with nothing scored', () => {
    expect(lastScoredWeek([regular(1, false), { ...regular(15), type: 'playoff_semifinals' }])).toBe(0);
  });
});

describe('showsHomeBracket', () => {
  it('waits for week 10 to be scored', () => {
    expect(HOME_BRACKET_AFTER_WEEK).toBe(10);
    expect(showsHomeBracket([regular(9), regular(10, false)])).toBe(false);
    expect(showsHomeBracket([regular(9), regular(10)])).toBe(true);
  });

  it('shows a drawn bracket whatever the regular season says', () => {
    expect(showsHomeBracket([game('b', 'bye', 15, 't1', null)])).toBe(true);
  });
});

describe('showsPathToPlayoffs', () => {
  const games = [regular(13), regular(14), regular(14, false)];

  it('stays until the last game of the regular season has a score', () => {
    expect(showsPathToPlayoffs({ year: 2026, games })).toBe(true);
    expect(showsPathToPlayoffs({ year: 2026, games: [regular(13), regular(14)] })).toBe(false);
  });

  it('is back the next year, whose games are unplayed', () => {
    expect(showsPathToPlayoffs({ year: 2027, games: [regular(1, false)] })).toBe(true);
  });

  it('follows the season\'s own length', () => {
    const shortSeason = [regular(13), regular(14, false)];
    expect(showsPathToPlayoffs({ year: 2026, games: shortSeason, regularSeasonWeeks: 13 })).toBe(false);
  });

  it('does not count a postseason game still to be played', () => {
    const postseason = [regular(14), game('r1', 'playoff_first_round', 15, 't3', 't6')];
    expect(showsPathToPlayoffs({ year: 2026, games: postseason })).toBe(false);
  });

  it('has nothing to offer before seeding, or with no schedule', () => {
    expect(showsPathToPlayoffs({ year: 2025, games })).toBe(false);
    expect(showsPathToPlayoffs({ year: 2026, games: [] })).toBe(false);
  });
});

describe('seedOrder', () => {
  it('numbers the teams outside the field on from seven by the canonical sort', () => {
    expect(seedOrder([...LEAGUE].reverse()).map(({ team, seed }) => [team.id, seed])).toEqual(
      LEAGUE.map((team, index) => [team.id, index + 1])
    );
  });
});

describe('projectBracket', () => {
  it('puts seeds 1 and 2 on byes, and pairs 3v6 and 4v5', () => {
    const bracket = projectBracket(LEAGUE);
    expect(bracket.byes[1].id).toBe('t1');
    expect(bracket.byes[2].id).toBe('t2');
    expect([bracket.r1['3v6'].team1.id, bracket.r1['3v6'].team2.id]).toEqual(['t3', 't6']);
    expect([bracket.r1['4v5'].team1.id, bracket.r1['4v5'].team2.id]).toEqual(['t4', 't5']);
  });

  it('pairs the consolation bracket the way the league draws it', () => {
    expect(projectBracket(LEAGUE).consolation.map((pair) => [pair.team1Seed, pair.team2Seed]))
      .toEqual([[7, 8], [9, 10], [11, 12], [13, 14]]);
  });

  it('projects nothing until all six berths have a team', () => {
    expect(projectBracket(LEAGUE.slice(0, 5))).toBeNull();
    expect(projectBracket(LEAGUE.map((team) => ({ ...team, playoffSeed: null })))).not.toBeNull();
  });
});

describe('isBracketSet', () => {
  it('is false on the regular season alone', () => {
    expect(isBracketSet([regular(1)], new Map())).toBe(false);
  });

  it('is true from the first bye or round-1 row', () => {
    expect(isBracketSet([game('b', 'bye', 15, 't1', null)], new Map([['t1', 1]]))).toBe(true);
    expect(isBracketSet([game('r', 'playoff_first_round', 15, 't3', 't6')], new Map([['t3', 3], ['t6', 6]]))).toBe(true);
  });
});

describe('resolveUpperBracket', () => {
  it('projects from the standings and names no semifinal opponent', () => {
    const bracket = resolveUpperBracket({ games: [regular(5)], teams: LEAGUE });
    expect(bracket.drawn).toBe(false);
    expect(bracket.weeks).toEqual([15, 16, 17]);

    const [round1, semifinals, championship] = bracket.rounds;
    expect(round1.matchups.map(seedsIn)).toEqual([[1], [2], [3, 6], [4, 5]]);
    expect(semifinals.matchups.map(seedsIn)).toEqual([[1, 'Lowest seed left'], [2, 'Highest seed left']]);
    expect(championship.matchups.map(seedsIn)).toEqual([['Semifinal 1 winner', 'Semifinal 2 winner']]);
  });

  it('is null with no field and no bracket', () => {
    expect(resolveUpperBracket({ games: [], teams: LEAGUE.slice(0, 3) })).toBeNull();
  });

  it('takes the real rows once they exist', () => {
    const games = [
      game('b1', 'bye', 15, 't1', null),
      game('b2', 'bye', 15, 't2', null),
      // Real results say team 6 is in the 3v6 game, whatever the row order.
      game('r2', 'playoff_first_round', 15, 't4', 't5'),
      game('r1', 'playoff_first_round', 15, 't3', 't6')
    ];
    const bracket = resolveUpperBracket({ games, teams: LEAGUE });
    expect(bracket.drawn).toBe(true);
    expect(bracket.rounds[0].matchups.map(seedsIn)).toEqual([[1], [2], [3, 6], [4, 5]]);
  });

  it('re-seeds the semifinals once both round-1 games are decided', () => {
    const games = [
      game('b1', 'bye', 15, 't1', null),
      game('b2', 'bye', 15, 't2', null),
      game('r1', 'playoff_first_round', 15, 't3', 't6', 't6'),
      game('r2', 'playoff_first_round', 15, 't4', 't5', 't4')
    ];
    const { rounds } = resolveUpperBracket({ games, teams: LEAGUE });
    // Seed 1 draws the lowest seed left: the 6, not the 4.
    expect(rounds[1].matchups.map(seedsIn)).toEqual([[1, 6], [2, 4]]);
  });

  it('marks winners and losers and crowns the champion', () => {
    const games = [
      game('b1', 'bye', 15, 't1', null),
      game('b2', 'bye', 15, 't2', null),
      game('r1', 'playoff_first_round', 15, 't3', 't6', 't3'),
      game('r2', 'playoff_first_round', 15, 't4', 't5', 't4'),
      game('s1', 'playoff_semifinals', 16, 't1', 't4', 't1'),
      game('s2', 'playoff_semifinals', 16, 't2', 't3', 't3'),
      game('f', 'playoff_championship', 17, 't1', 't3', 't3')
    ];
    const bracket = resolveUpperBracket({ games, teams: LEAGUE });
    const [left, right] = bracket.rounds[2].matchups[0].sides;
    expect([left.lost, right.won]).toEqual([true, true]);
    expect(right.score).toBe(110);
    expect(bracket.champion.id).toBe('t3');
  });
});

describe('resolveUpperBracket · consolation', () => {
  const game = (id, type, week, team1Id, team2Id) => ({
    id, type, week, team1Id, team2Id, team1Score: null, team2Score: null
  });
  const teams = Array.from({ length: 14 }, (_, i) => ({
    id: `t${i + 1}`,
    name: `Team ${i + 1}`,
    playoffSeed: i < 6 ? i + 1 : null,
    winPercentage: (14 - i) / 14
  }));

  it('is every postseason game the bracket does not draw', () => {
    const games = [
      game('r', 'regular', 14, 't1', 't2'),
      game('b1', 'bye', 15, 't1', null),
      game('q1', 'playoff_first_round', 15, 't3', 't6'),
      game('c1', 'playoff_consolation_quarterfinals', 15, 't7', 't8'),
      game('p3', 'playoff', 17, 't3', 't4')
    ];

    const { consolation } = resolveUpperBracket({ games, teams });

    expect(consolation.map((matchup) => [matchup.id, matchup.week])).toEqual([['c1', 15], ['p3', 17]]);
    expect(consolation[0].sides[0].team.id).toBe('t7');
    expect(consolation[0].game.id).toBe('c1');
  });

  it('is empty while the bracket is a projection', () => {
    expect(resolveUpperBracket({ teams }).consolation).toEqual([]);
  });
});

describe('boxScoreGame', () => {
  const team = (id) => ({ id });

  it('is the real game when there is one', () => {
    const game = { id: 'g1', week: 15 };
    expect(boxScoreGame({ id: 'r1', game, sides: [] }, 15)).toBe(game);
  });

  it('stands in for a projected matchup, with nothing to score', () => {
    const stand = boxScoreGame({ id: 'r1-3v6', sides: [{ team: team('t3') }, { team: team('t6') }] }, 15);

    expect(stand).toMatchObject({
      id: 'r1-3v6',
      week: 15,
      team1Id: 't3',
      team2Id: 't6',
      team1Score: null,
      isCompleted: false,
      isProjected: true
    });
  });

  it('puts the named team first, and says what the other slot waits for', () => {
    const stand = boxScoreGame({ id: 'final', sides: [{ label: 'Semifinal 1 winner' }, { team: team('t2') }] }, 17);

    expect(stand).toMatchObject({ type: 'bye', team1Id: 't2', team2Id: null, opponentLabel: 'Semifinal 1 winner' });
  });

  it('calls a bye a bye', () => {
    const stand = boxScoreGame({ id: 'bye-1', bye: true, sides: [{ team: team('t1') }] }, 15);

    expect(stand).toMatchObject({ type: 'bye', opponentLabel: 'First-round bye' });
  });
});
