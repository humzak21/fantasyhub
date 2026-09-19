/**
 * Playoff odds, in both formats.
 *
 * The in-between numbers are a simulation and the tests treat them that way.
 * What is pinned is what has to be true: 100 appears only for a team that
 * makes the field in every remaining outcome, 0 only for one that misses in
 * every outcome, a finished season reports the field exactly, and the field is
 * the one `computeSeeds` names.
 */

import { describe, it, expect } from 'vitest';

import {
  PlayoffOddsCalculator,
  buildRule,
  buildSeasonState,
  calculatePlayoffOdds,
  makesFieldOnRecord,
  qualifiedField
} from '../playoffOddsCalculator.js';
import { computeSeeds, sortByStandings } from '../../utils/playoffSeeding.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEAM_COUNT = 14;
const WEEKS = 14;

const ids = Array.from({ length: TEAM_COUNT }, (_, i) => `t${String(i).padStart(2, '0')}`);

/** Seven and seven, interleaved so strength is spread across both divisions. */
const leagueTeams = ids.map((id, i) => ({ id, divisionId: i % 2 === 0 ? 1 : 2 }));

/**
 * A round robin by the circle method, repeated from round one after thirteen
 * weeks. Every team plays every week.
 */
function roundRobin(teamIds, weeks) {
  const rotating = teamIds.slice(1);
  const rounds = [];
  for (let r = 0; r < teamIds.length - 1; r += 1) {
    const circle = [teamIds[0], ...rotating];
    const pairs = [];
    for (let k = 0; k < teamIds.length / 2; k += 1) {
      pairs.push([circle[k], circle[circle.length - 1 - k]]);
    }
    rounds.push(pairs);
    rotating.unshift(rotating.pop());
  }
  return Array.from({ length: weeks }, (_, w) => rounds[w % rounds.length]);
}

/** A tiny seeded generator, so the random fixtures are the same every run. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The season's games, scored through `scoredThrough`. `winner(a, b, week)`
 * picks each result; unscored weeks carry null scores like the real table.
 */
function season({ scoredThrough, winner }) {
  let n = 0;
  return roundRobin(ids, WEEKS).flatMap((pairs, w) =>
    pairs.map(([a, b]) => {
      const week = w + 1;
      const scored = week <= scoredThrough;
      const aWins = scored && winner(a, b, week);
      return {
        id: `g${(n += 1)}`,
        week,
        type: 'regular',
        team1Id: a,
        team2Id: b,
        team1Score: scored ? (aWins ? 120 : 100) + (n % 7) : null,
        team2Score: scored ? (aWins ? 100 : 120) + (n % 5) : null
      };
    })
  );
}

/** Lower index always wins: t00 unbeaten, t13 winless. */
const chalk = (a, b) => a < b;

const odds = (games, viewingWeek, seasonYear = 2026, teams = leagueTeams) =>
  calculatePlayoffOdds({
    teams,
    games,
    viewingWeek,
    regularSeasonWeeks: WEEKS,
    seasonYear,
    simulations: 2000
  });

/**
 * Every team's final record under each win/loss outcome of the remaining
 * games, as team rows `computeSeeds` can read. Independent of the calculator's
 * own enumeration — this is what it is checked against.
 */
function* everyOutcome(games, viewingWeek) {
  const state = buildSeasonState({
    teams: leagueTeams,
    games,
    viewingWeek,
    regularSeasonWeeks: WEEKS
  });
  const { remaining } = state;
  for (let mask = 0; mask < 2 ** remaining.length; mask += 1) {
    const wins = state.wins.slice();
    const played = state.played.slice();
    remaining.forEach(([a, b], g) => {
      wins[mask & (1 << g) ? a : b] += 1;
      played[a] += 1;
      played[b] += 1;
    });
    yield { state, wins, played };
  }
}

/** Team rows for `computeSeeds`, with `favoured` winning or losing every tie. */
function rowsFor({ state, wins, played }, favoured, favour) {
  return state.ids.map((id, i) => ({
    id,
    divisionId: state.divisions[i],
    winPercentage: wins[i] / played[i],
    pointsFor: id === favoured ? favour * 1e9 : 0,
    pointsAgainst: 0
  }));
}

const inField = (rows, id) => computeSeeds(rows).get(id)?.seed != null;

// ---------------------------------------------------------------------------
// The rule the user asked for
// ---------------------------------------------------------------------------

describe('100 means clinched and 0 means eliminated', () => {
  it('gives nobody 100 or 0 after one week', () => {
    const result = odds(season({ scoredThrough: 1, winner: chalk }), 2);

    for (const value of result.values()) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(99);
    }
  });

  it('does not treat a 1-0 start as a playoff lock', () => {
    const result = odds(season({ scoredThrough: 1, winner: chalk }), 2);

    // Six of fourteen get in, so a 1-0 team sits a little above 43%. Thirteen
    // games remain and one result says little about how good a team is.
    for (const value of result.values()) expect(value).toBeLessThan(75);
  });

  it('adds up to the six berths', () => {
    for (const week of [1, 2, 6, 10]) {
      const result = odds(season({ scoredThrough: week - 1, winner: chalk }), week);
      const total = [...result.values()].reduce((sum, value) => sum + value, 0);
      expect(Math.abs(total - 600)).toBeLessThanOrEqual(TEAM_COUNT);
    }
  });

  it('reads 100 only for a team that is in whatever happens, even losing every tiebreak', () => {
    // Two weeks left, fourteen games: small enough to try every outcome.
    const rng = seeded(7);
    for (let trial = 0; trial < 4; trial += 1) {
      const games = season({ scoredThrough: 12, winner: () => rng() < 0.5 });
      const result = odds(games, 13);

      for (const id of ids.filter((teamId) => result.get(teamId) === 100)) {
        for (const outcome of everyOutcome(games, 13)) {
          expect(inField(rowsFor(outcome, id, -1), id)).toBe(true);
        }
      }
    }
  });

  it('reads 0 only for a team that is out whatever happens, even winning every tiebreak', () => {
    const rng = seeded(11);
    for (let trial = 0; trial < 4; trial += 1) {
      const games = season({ scoredThrough: 12, winner: () => rng() < 0.5 });
      const result = odds(games, 13);

      for (const id of ids.filter((teamId) => result.get(teamId) === 0)) {
        for (const outcome of everyOutcome(games, 13)) {
          expect(inField(rowsFor(outcome, id, 1), id)).toBe(false);
        }
      }
    }
  });

  it('calls a clinch as soon as it has happened, with two weeks left', () => {
    // Under chalk t00 is 12-0 and t01 11-1 in the other division: nobody else
    // can reach either.
    const result = odds(season({ scoredThrough: 12, winner: chalk }), 13);

    expect(result.get('t00')).toBe(100);
    expect(result.get('t01')).toBe(100);
    expect(result.get('t13')).toBe(0);
  });

  it('holds a near-certain team below 100 until it is certain', () => {
    // Seven weeks left. t00 is 7-0 and as good as in, but losing out while
    // others win out would still leave it short — so it is not in yet.
    const result = odds(season({ scoredThrough: 7, winner: chalk }), 8);

    expect(result.get('t00')).toBeLessThan(100);
    expect(result.get('t00')).toBeGreaterThanOrEqual(90);
  });

  it('calls a clinch that depends on the division winners taking two berths', () => {
    // Four weeks left. t00 is 10-0: at most five teams can reach ten wins, and
    // two of those berths are division winners', so it is in whatever happens.
    const result = odds(season({ scoredThrough: 10, winner: chalk }), 11);

    expect(result.get('t00')).toBe(100);
  });

  it('calls clinches from the independent bound when too many games remain to try them all', () => {
    // Eleven games in, three weeks (21 games) left. t00 at 11-0 and t01 at
    // 10-1 are past anything their division, and all but a few, can reach.
    const result = odds(season({ scoredThrough: 11, winner: chalk }), 12);

    expect(result.get('t00')).toBe(100);
    expect(result.get('t13')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Who gets in
// ---------------------------------------------------------------------------

describe('the field', () => {
  it('matches computeSeeds on any finished standings', () => {
    const rng = seeded(3);
    for (let trial = 0; trial < 200; trial += 1) {
      const rows = leagueTeams.map((team) => ({
        ...team,
        // Few distinct records, so ties on win% are common.
        winPercentage: Math.floor(rng() * 5) / 4,
        pointsFor: Math.floor(rng() * 3) * 100,
        pointsAgainst: Math.floor(rng() * 3) * 100
      }));

      const field = qualifiedField(
        buildRule(rows.map((r) => r.divisionId), true),
        rows.map((r) => r.id),
        rows.map((r) => r.winPercentage),
        rows.map((r) => r.pointsFor),
        rows.map((r) => r.pointsAgainst)
      );

      const seeds = computeSeeds(rows);
      rows.forEach((row, i) => {
        expect(field[i]).toBe(seeds.get(row.id).seed != null);
      });
    }
  });

  it('agrees with computeSeeds on who is in when every tie goes one way', () => {
    const rule = buildRule(leagueTeams.map((t) => t.divisionId), true);
    const rng = seeded(5);
    for (let trial = 0; trial < 200; trial += 1) {
      const pct = leagueTeams.map(() => Math.floor(rng() * 4) / 3);
      leagueTeams.forEach((team, i) => {
        for (const favour of [-1, 1]) {
          const rows = leagueTeams.map((other, j) => ({
            ...other,
            winPercentage: pct[j],
            pointsFor: j === i ? favour * 1e9 : 0,
            pointsAgainst: 0
          }));
          expect(makesFieldOnRecord(rule, i, pct, favour > 0)).toBe(inField(rows, team.id));
        }
      });
    }
  });

  it('reports exactly the six teams computeSeeds names once the season is over', () => {
    const rng = seeded(9);
    const games = season({ scoredThrough: WEEKS, winner: () => rng() < 0.5 });
    const result = odds(games, WEEKS + 1);
    const state = buildSeasonState({
      teams: leagueTeams,
      games,
      viewingWeek: WEEKS + 1,
      regularSeasonWeeks: WEEKS
    });
    const rows = state.ids.map((id, i) => ({
      id,
      divisionId: state.divisions[i],
      wins: state.wins[i],
      losses: state.played[i] - state.wins[i],
      ties: 0,
      pointsFor: state.pointsFor[i],
      pointsAgainst: state.pointsAgainst[i]
    }));
    const seeds = computeSeeds(rows);

    for (const id of ids) {
      expect(result.get(id)).toBe(seeds.get(id).seed != null ? 100 : 0);
    }
  });

  it('takes the top three of each division through 2025', () => {
    const rng = seeded(13);
    const games = season({ scoredThrough: WEEKS, winner: () => rng() < 0.5 });
    const result = odds(games, WEEKS + 1, 2025);
    const state = buildSeasonState({
      teams: leagueTeams,
      games,
      viewingWeek: WEEKS + 1,
      regularSeasonWeeks: WEEKS
    });
    const rows = state.ids.map((id, i) => ({
      id,
      divisionId: state.divisions[i],
      winPercentage: state.wins[i] / state.played[i],
      pointsFor: state.pointsFor[i],
      pointsAgainst: state.pointsAgainst[i]
    }));

    for (const division of [1, 2]) {
      const order = sortByStandings(rows.filter((row) => row.divisionId === division));
      order.forEach((row, place) => {
        expect(result.get(row.id)).toBe(place < 3 ? 100 : 0);
      });
    }
  });

  it('uses the pre-2026 rule when the year is unknown', () => {
    const games = season({ scoredThrough: 6, winner: chalk });
    const withYear = odds(games, 7, 2025);
    const withoutYear = odds(games, 7, null);
    expect([...withoutYear.entries()]).toEqual([...withYear.entries()]);
  });
});

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

describe('inputs', () => {
  it('counts only the weeks before the one being viewed', () => {
    // Week 4 of a finished season must read like week 4 did at the time.
    const whole = season({ scoredThrough: WEEKS, winner: chalk });
    const atTheTime = season({ scoredThrough: 3, winner: chalk });

    expect([...odds(whole, 4).entries()]).toEqual([...odds(atTheTime, 4).entries()]);
  });

  it('ignores postseason games', () => {
    const games = season({ scoredThrough: 6, winner: chalk });
    const withPlayoffs = [
      ...games,
      { id: 'p1', week: 15, type: 'playoff_first_round', team1Id: 't13', team2Id: 't12', team1Score: 200, team2Score: 1 }
    ];
    expect([...odds(withPlayoffs, 7).entries()]).toEqual([...odds(games, 7).entries()]);
  });

  it('is deterministic', () => {
    const games = season({ scoredThrough: 5, winner: chalk });
    expect([...odds(games, 6).entries()]).toEqual([...odds(games, 6).entries()]);
  });

  it('falls back to the stored records when there is no schedule', () => {
    const teams = [
      { id: 'a', divisionId: 1, wins: 11, losses: 1, ties: 0, pointsFor: 1500, pointsAgainst: 1000 },
      { id: 'b', divisionId: 1, wins: 10, losses: 2, ties: 0, pointsFor: 1450, pointsAgainst: 1000 },
      { id: 'c', divisionId: 1, wins: 9, losses: 3, ties: 0, pointsFor: 1400, pointsAgainst: 1000 },
      { id: 'd', divisionId: 1, wins: 8, losses: 4, ties: 0, pointsFor: 1350, pointsAgainst: 1000 },
      { id: 'e', divisionId: 1, wins: 2, losses: 10, ties: 0, pointsFor: 900, pointsAgainst: 1000 },
      { id: 'f', divisionId: 2, wins: 10, losses: 2, ties: 0, pointsFor: 1480, pointsAgainst: 1000 },
      { id: 'g', divisionId: 2, wins: 5, losses: 7, ties: 0, pointsFor: 1200, pointsAgainst: 1000 },
      { id: 'h', divisionId: 2, wins: 4, losses: 8, ties: 0, pointsFor: 1000, pointsAgainst: 1000 },
      { id: 'i', divisionId: 2, wins: 3, losses: 9, ties: 0, pointsFor: 950, pointsAgainst: 1000 },
      { id: 'j', divisionId: 2, wins: 1, losses: 11, ties: 0, pointsFor: 800, pointsAgainst: 1000 }
    ];
    // Viewing week 13 of 14 with twelve played: each team has weeks 13 and 14
    // left, against opponents the missing schedule does not name.
    const result = new PlayoffOddsCalculator(teams, [], [{ id: 1 }, { id: 2 }], 13, 14, 2026)
      .calculateAllPlayoffOdds();

    expect(result.get('a')).toBe(100);
    expect(result.get('f')).toBe(100);
    expect(result.get('j')).toBe(0);
    for (const value of result.values()) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('returns an empty map for an empty league', () => {
    expect(odds([], 3, 2026, []).size).toBe(0);
  });
});
