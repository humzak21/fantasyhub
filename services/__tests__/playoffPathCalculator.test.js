import { describe, it, expect } from 'vitest';

import { calculatePlayoffOdds } from '../playoffOddsCalculator.js';
import {
  applyScenario,
  buildPath,
  decodeScenario,
  decodeScenarioScores,
  encodeScenario,
  fieldSeeds,
  firstUnscoredWeek,
  pointsToGetIn,
  presetResults,
  projectedGameScore,
  recordsGoingIn,
  scenarioStandings,
  scoresNeeded,
  simulatePath
} from '../playoffPathCalculator.js';
import { buildRule } from '../playoffOddsCalculator.js';
import { computeSeeds } from '../../utils/playoffSeeding.js';

const REGULAR_WEEKS = 14;
const SIMS = 800;

const teams = Array.from({ length: 14 }, (_, i) => ({
  id: `t${i + 1}`,
  divisionId: i % 2 === 0 ? 'east' : 'west'
}));

/** A round robin: team indexes rotate around the first, week by week. */
function schedule(scoredThrough) {
  const games = [];
  const ring = teams.map((team) => team.id);
  for (let week = 1; week <= REGULAR_WEEKS; week += 1) {
    for (let g = 0; g < 7; g += 1) {
      const team1Id = ring[g];
      const team2Id = ring[13 - g];
      const scored = week <= scoredThrough;
      // Lower numbers are better teams, so the table has an order to find.
      const strength = (id) => 130 - Number(id.slice(1)) * 3;
      games.push({
        id: `w${week}g${g}`,
        week,
        type: 'regular',
        team1Id,
        team2Id,
        team1Score: scored ? strength(team1Id) + (week % 3) : null,
        team2Score: scored ? strength(team2Id) : null
      });
    }
    ring.splice(1, 0, ring.pop());
  }
  return games;
}

const pathAt = (scoredThrough) =>
  buildPath({ teams, games: schedule(scoredThrough), regularSeasonWeeks: REGULAR_WEEKS });

const row = (simulation, id) => simulation.teams.find((team) => team.id === id);

describe('projectedGameScore', () => {
  const path = pathAt(7);
  const game = path.games[0];

  it('is each side\'s expectation until a winner is named', () => {
    const projection = projectedGameScore(path, game);
    expect(projection.team1Score).toBeGreaterThan(0);
    expect(projection.team2Score).toBeGreaterThan(0);
  });

  it('gives the winner the higher score, whichever side they are', () => {
    for (const winner of [game.team1Id, game.team2Id]) {
      const { team1Score, team2Score } = projectedGameScore(path, game, winner);
      expect(winner === game.team1Id ? team1Score > team2Score : team2Score > team1Score).toBe(true);
    }
  });

  it('still names a winner when nobody has played', () => {
    const fresh = pathAt(0);
    const first = fresh.games[0];
    const { team1Score, team2Score } = projectedGameScore(fresh, first, first.team2Id);
    expect(team2Score).toBeGreaterThan(team1Score);
  });
});

describe('applyScenario', () => {
  const games = schedule(7);
  const path = pathAt(7);
  const decided = path.games[0];

  it('leaves the schedule alone with nothing decided', () => {
    expect(applyScenario(path, games, new Map())).toEqual(games);
  });

  it('scores a decided game, at its typed points when it has them', () => {
    const results = new Map([[decided.id, decided.team1Id]]);
    const projected = applyScenario(path, games, results).find((game) => game.id === decided.id);
    expect(projected.team1Score).toBeGreaterThan(projected.team2Score);

    const typed = applyScenario(path, games, results, new Map([[decided.id, { team1Score: 150, team2Score: 90 }]]));
    expect(typed.find((game) => game.id === decided.id)).toMatchObject({ team1Score: 150, team2Score: 90 });
  });

  it('keeps every undecided game unscored', () => {
    const results = new Map([[decided.id, decided.team1Id]]);
    const scored = applyScenario(path, games, results).filter((game) => game.team1Score != null);
    expect(scored).toHaveLength(49 + 1);
  });

  it('does not touch a game that has been played', () => {
    const played = games.find((game) => game.team1Score != null);
    const out = applyScenario(path, games, new Map([[played.id, played.team2Id]]));
    expect(out.find((game) => game.id === played.id)).toBe(played);
  });
});

describe('pointsToGetIn', () => {
  /** Two divisions of four, everyone level unless a row says otherwise. */
  const table = (overrides = {}) =>
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => ({
      id,
      divisionId: i % 2 === 0 ? 'east' : 'west',
      winPercentage: 0.5,
      pointsFor: 1000 - i * 10,
      pointsAgainst: 1000,
      ...overrides[id]
    }));

  it('is the gap to the team a level team has to pass', () => {
    const answer = pointsToGetIn(table(), 'g');
    expect(answer).toMatchObject({ status: 'points', seed: 6, rivalId: 'f' });
    expect(answer.gap).toBe(10);
    expect(answer.points).toBe(10.01);
  });

  it('says a result has to change when the team is behind on record', () => {
    const answer = pointsToGetIn(table({ g: { winPercentage: 0.25, pointsFor: 2000 } }), 'g');
    expect(answer).toMatchObject({ status: 'record', seed: 6 });
  });

  it('reports the cushion over the team that could take the spot', () => {
    const answer = pointsToGetIn(table(), 'f');
    expect(answer).toMatchObject({ status: 'in', seed: 6, cushion: 10, rivalId: 'g' });
  });

  it('has no cushion when nobody outside is level', () => {
    const answer = pointsToGetIn(
      table({ g: { winPercentage: 0.25 }, h: { winPercentage: 0.25 } }),
      'f'
    );
    expect(answer).toMatchObject({ status: 'in', cushion: null, rivalId: null });
  });

  it('is nothing for a team not on the table', () => {
    expect(pointsToGetIn(table(), 'zz')).toBeNull();
  });
});

describe('scoresNeeded', () => {
  const games = schedule(7);
  const path = pathAt(7);
  const mine = path.games.filter((game) => game.team1Id === 't1' || game.team2Id === 't1');
  const results = new Map([
    [mine[0].id, 't1'],
    [mine[1].id, mine[1].team1Id === 't1' ? mine[1].team2Id : mine[1].team1Id]
  ]);
  const rivalId = mine[0].team1Id === 't1' ? mine[0].team2Id : mine[0].team1Id;
  const needed = scoresNeeded(path, applyScenario(path, games, results), results, 't1', rivalId, 20);

  it('lists only the games the team wins in the scenario', () => {
    expect(needed.map((game) => game.id)).toEqual([mine[0].id]);
  });

  it('adds the points to what the table has them on, and marks the rival', () => {
    expect(needed[0].needed).toBeCloseTo(needed[0].score + 20, 2);
    expect(needed[0].againstRival).toBe(true);
    expect(needed[0].margin).toBeGreaterThan(20);
  });
});

describe('firstUnscoredWeek', () => {
  it('is the first week with a game to play', () => {
    expect(firstUnscoredWeek(schedule(7), REGULAR_WEEKS)).toBe(8);
  });

  it('runs past the regular season once it is all scored', () => {
    expect(firstUnscoredWeek(schedule(14), REGULAR_WEEKS)).toBe(15);
  });
});

describe('buildPath', () => {
  it('lists the games left with their teams', () => {
    const path = pathAt(7);
    expect(path.asOfWeek).toBe(8);
    expect(path.games).toHaveLength(49);
    expect(path.finalPlayed.every((n) => n === 14)).toBe(true);
    expect(path.state.ids[path.games[0].a]).toBe(path.games[0].team1Id);
  });
});

describe('fieldSeeds', () => {
  it('agrees with computeSeeds', () => {
    const rows = teams.map((team, i) => ({
      ...team,
      winPercentage: ((i * 5) % 14) / 14,
      pointsFor: 1000 + ((i * 7) % 14),
      pointsAgainst: 900
    }));
    const expected = computeSeeds(rows);
    const seeds = fieldSeeds(
      buildRule(rows.map((r) => r.divisionId), true),
      rows.map((r) => r.id),
      rows.map((r) => r.winPercentage),
      rows.map((r) => r.pointsFor),
      rows.map((r) => r.pointsAgainst)
    );
    rows.forEach((team, i) => expect(seeds[i]).toBe(expected.get(team.id).seed ?? 0));
  });
});

describe('simulatePath', () => {
  it('feeds typed points into the tiebreak', () => {
    const path = pathAt(13);
    const game = path.games.find((candidate) => candidate.team1Id === 't5' || candidate.team2Id === 't5');
    const results = new Map([[game.id, 't5']]);
    const high = game.team1Id === 't5' ? { team1Score: 400, team2Score: 90 } : { team1Score: 90, team2Score: 400 };

    const plain = simulatePath(path, { results, simulations: SIMS });
    const typed = simulatePath(path, { results, scores: new Map([[game.id, high]]), simulations: SIMS });

    expect(row(typed, 't5').meanPointsFor).toBeGreaterThan(row(plain, 't5').meanPointsFor + 200);
    expect(row(typed, 't5').meanWins).toBe(row(plain, 't5').meanWins);
  });

  it('ignores points for a game nobody decided', () => {
    const path = pathAt(13);
    const scores = new Map([[path.games[0].id, { team1Score: 400, team2Score: 90 }]]);
    const plain = simulatePath(path, { simulations: SIMS });
    const typed = simulatePath(path, { scores, simulations: SIMS });
    expect(typed.teams).toEqual(plain.teams);
  });

  it('reads the same odds as the rankings when nothing is decided', () => {
    const games = schedule(7);
    const odds = calculatePlayoffOdds({
      teams,
      games,
      viewingWeek: 8,
      regularSeasonWeeks: REGULAR_WEEKS,
      seasonYear: 2026,
      simulations: SIMS
    });
    const simulation = simulatePath(pathAt(7), { simulations: SIMS });
    for (const team of simulation.teams) expect(team.odds).toBe(odds.get(team.id));
  });

  it('adds up: six in, two byes, every seed filled once', () => {
    const { teams: rows } = simulatePath(pathAt(7), { simulations: SIMS });
    const total = (pick) => rows.reduce((sum, team) => sum + pick(team), 0);
    expect(total((team) => team.made)).toBeCloseTo(6, 5);
    expect(total((team) => team.bye)).toBeCloseTo(2, 5);
    for (let seed = 0; seed < 6; seed += 1) {
      expect(total((team) => team.seedShares[seed])).toBeCloseTo(1, 5);
    }
  });

  it('is deterministic', () => {
    const run = () => simulatePath(pathAt(7), { simulations: SIMS, focusId: 't5' });
    expect(run()).toEqual(run());
  });

  it('moves a team up when it wins out, and down when it loses out', () => {
    const path = pathAt(7);
    const odds = (preset) =>
      row(simulatePath(path, { results: presetResults(path, preset, 't7'), simulations: SIMS }), 't7').made;
    expect(odds('win')).toBeGreaterThan(odds('lose'));
  });

  it('counts a decided game for the side that was given it', () => {
    const path = pathAt(7);
    const game = path.games[0];
    const results = new Map([[game.id, game.team2Id]]);
    const { focus } = simulatePath(path, { results, focusId: 't1', simulations: SIMS });
    const impact = focus.games.find((g) => g.id === game.id);
    expect(impact.decided).toBe(true);
    expect(impact.team1Share).toBe(0);
  });

  it('calls a clinch a clinch inside the scenario', () => {
    const path = pathAt(11);
    const results = new Map(
      path.games.map((game) => [game.id, Number(game.team1Id.slice(1)) < Number(game.team2Id.slice(1)) ? game.team1Id : game.team2Id])
    );
    const { teams: rows } = simulatePath(path, { results, simulations: 200 });
    expect(rows.filter((team) => team.odds === 100)).toHaveLength(6);
    expect(rows.filter((team) => team.odds === 0)).toHaveLength(8);
  });

  it('reports the records that get a team in, best first, and they add up', () => {
    const { focus } = simulatePath(pathAt(7), { focusId: 't7', simulations: SIMS });
    const wins = focus.records.map((record) => record.wins);
    expect(wins).toEqual([...wins].sort((a, b) => b - a));
    expect(focus.records.reduce((sum, record) => sum + record.share, 0)).toBeCloseTo(1, 5);
    expect(focus.records[0].made).toBeGreaterThanOrEqual(focus.records.at(-1).made);
    for (const record of focus.records) expect(record.wins + record.losses).toBe(14);
  });

  it('finds the team\'s own games matter more than a stranger\'s', () => {
    const { focus } = simulatePath(pathAt(7), { focusId: 't7', simulations: SIMS });
    const average = (list) => list.reduce((sum, game) => sum + game.swing, 0) / list.length;
    expect(average(focus.games.filter((g) => g.involvesFocus)))
      .toBeGreaterThan(average(focus.games.filter((g) => !g.involvesFocus)));
  });

  it('only names a first-round opponent from the other half of 3v6 or 4v5', () => {
    const { focus } = simulatePath(pathAt(7), { focusId: 't5', simulations: SIMS });
    expect(focus.opponents.length).toBeGreaterThan(0);
    expect(focus.opponents.every((opponent) => opponent.id !== 't5')).toBe(true);
    expect(focus.opponents.reduce((sum, o) => sum + o.ofRound1, 0)).toBeCloseTo(1, 5);
  });

  it('answers without a focus team', () => {
    expect(simulatePath(pathAt(7), { simulations: 50 }).focus).toBeNull();
  });
});

describe('scenarioStandings', () => {
  it('seeds exactly six teams from the average finish', () => {
    const path = pathAt(7);
    const rows = scenarioStandings(path, simulatePath(path, { simulations: SIMS }), teams);
    const seeds = rows.map((team) => team.playoffSeed).filter(Boolean).sort((a, b) => a - b);
    expect(seeds).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('presetResults', () => {
  it('settles only the focus team\'s games for win and lose', () => {
    const path = pathAt(7);
    const win = presetResults(path, 'win', 't3');
    expect(win.size).toBe(7);
    expect([...win.values()].every((winner) => winner === 't3')).toBe(true);
    expect([...presetResults(path, 'lose', 't3').values()].includes('t3')).toBe(false);
  });

  it('settles every game for favorites', () => {
    const path = pathAt(7);
    expect(presetResults(path, 'favorites', 't3').size).toBe(49);
  });
});

describe('a scenario in a URL', () => {
  const games = schedule(7);
  const results = new Map([['w8g0', games.find((g) => g.id === 'w8g0').team2Id], ['w12g3', games.find((g) => g.id === 'w12g3').team1Id]]);

  it('carries typed points as hundredths, and brings them back', () => {
    const scores = new Map([['w8g0', { team1Score: 110.2, team2Score: 132.5 }]]);
    const param = encodeScenario(results, games, scores);
    expect(param).toBe('8a2-11020-13250.12d1');
    expect(decodeScenario(param, games)).toEqual(results);
    expect(decodeScenarioScores(param, games)).toEqual(scores);
  });

  it('drops points that disagree with the winner, and keeps the winner', () => {
    const scores = new Map([['w8g0', { team1Score: 150, team2Score: 90 }]]);
    expect(encodeScenario(results, games, scores)).toBe('8a2.12d1');
    expect(decodeScenarioScores('8a2-15000-9000', games).size).toBe(0);
    expect(decodeScenario('8a2-15000-9000', games).size).toBe(1);
  });

  it('round-trips', () => {
    const param = encodeScenario(results, games);
    expect(param).toBe('8a2.12d1');
    expect(decodeScenario(param, games)).toEqual(results);
  });

  it('is empty with nothing decided', () => {
    expect(encodeScenario(new Map(), games)).toBe('');
    expect(decodeScenario('', games).size).toBe(0);
    expect(decodeScenario(null, games).size).toBe(0);
  });

  it('skips what it cannot read, and a game since played', () => {
    expect(decodeScenario('8a2.nope.99a1.8z1.3a1', games)).toEqual(new Map([['w8g0', games.find((g) => g.id === 'w8g0').team2Id]]));
  });
});

describe('recordsGoingIn', () => {
  const games = schedule(7);
  const path = pathAt(7);
  const [first] = path.games;
  const later = path.games.find(
    (game) => game.week === first.week + 1 && [game.team1Id, game.team2Id].includes(first.team1Id)
  );

  it('counts the games played, and leaves an undecided earlier game open', () => {
    const records = recordsGoingIn(path, applyScenario(path, games, new Map()), new Map());
    const week8 = records.get(8).get(first.team1Id);
    expect(week8.wins + week8.losses + week8.ties).toBe(7);
    expect(week8.undecided).toBe(0);
    expect(records.get(9).get(first.team1Id)).toMatchObject({ ...week8, undecided: 1 });
  });

  it("moves the next week's record when a game is decided", () => {
    const results = new Map([[first.id, first.team1Id]]);
    const before = recordsGoingIn(path, applyScenario(path, games, new Map()), new Map());
    const after = recordsGoingIn(path, applyScenario(path, games, results), results);
    const winner = first.team1Id;
    const loser = first.team2Id;

    expect(after.get(later.week).get(winner)).toMatchObject({
      wins: before.get(later.week).get(winner).wins + 1,
      undecided: 0
    });
    expect(after.get(later.week).get(loser).losses).toBe(before.get(later.week).get(loser).losses + 1);
    // The week the game is played in is unchanged: the record is going in.
    expect(after.get(first.week)).toEqual(before.get(first.week));
  });
});
