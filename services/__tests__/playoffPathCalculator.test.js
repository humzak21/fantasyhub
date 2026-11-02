import { describe, it, expect } from 'vitest';

import { calculatePlayoffOdds } from '../playoffOddsCalculator.js';
import {
  buildPath,
  decodeScenario,
  encodeScenario,
  fieldSeeds,
  firstUnscoredWeek,
  presetResults,
  scenarioStandings,
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
