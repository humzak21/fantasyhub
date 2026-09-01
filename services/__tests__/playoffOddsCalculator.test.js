/**
 * Playoff odds, in both formats.
 *
 * The numbers are heuristics and the tests treat them that way: what is pinned
 * is the behaviour that has to be true — a finished season reports the field
 * exactly, a clinched team reads 100, an eliminated one reads 0, and a 2025
 * calculation does not move because 2026 changed the rules.
 */

import { describe, it, expect } from 'vitest';

import { PlayoffOddsCalculator } from '../playoffOddsCalculator.js';
import { computeSeeds } from '../../utils/playoffSeeding.js';

const team = (id, divisionId, wins, losses, pointsFor, pointsAgainst = 1000) => ({
  id,
  divisionId,
  wins,
  losses,
  ties: 0,
  pointsFor,
  pointsAgainst,
  winPercentage: wins + losses > 0 ? wins / (wins + losses) : 0
});

const divisions = [{ id: 1 }, { id: 2 }];

/** Division 1 is stacked; division 2 has one good team and four poor ones. */
const league = [
  team('d1-1', 1, 11, 1, 1500),
  team('d1-2', 1, 10, 2, 1450),
  team('d1-3', 1, 9, 3, 1400),
  team('d1-4', 1, 8, 4, 1350),
  team('d1-5', 1, 2, 10, 900),
  team('d2-1', 2, 10, 2, 1480),
  team('d2-2', 2, 5, 7, 1200),
  team('d2-3', 2, 4, 8, 1000),
  team('d2-4', 2, 3, 9, 950),
  team('d2-5', 2, 1, 11, 800)
];

// Week 13 of a 14-week regular season: everyone has played 12, two to go.
const build = (seasonYear, { teams = league, currentWeek = 13, weeks = 14 } = {}) =>
  new PlayoffOddsCalculator(teams, [], divisions, currentWeek, weeks, seasonYear);

describe('pre-2026: top three of each division', () => {
  it('reports exactly the top three of each division once the season is over', () => {
    // currentWeek 15 with a 14-week regular season: nothing left to play.
    const odds = build(2025, { currentWeek: 15, weeks: 14 }).calculateAllPlayoffOdds();

    expect(odds.get('d1-1')).toBe(100);
    expect(odds.get('d1-2')).toBe(100);
    expect(odds.get('d1-3')).toBe(100);
    expect(odds.get('d1-4')).toBe(0);

    // The fourth-best team in the league is out; the third-best in a weak
    // division is in. That is the rule this model encodes.
    expect(odds.get('d2-1')).toBe(100);
    expect(odds.get('d2-2')).toBe(100);
    expect(odds.get('d2-3')).toBe(100);
    expect(odds.get('d2-4')).toBe(0);
  });

  it('is unchanged by the 2026 rule — a season with no year gets the old model', () => {
    const withYear = build(2025).calculateAllPlayoffOdds();
    const withoutYear = new PlayoffOddsCalculator(
      league,
      [],
      divisions,
      13,
      14
    ).calculateAllPlayoffOdds();

    expect([...withYear.entries()]).toEqual([...withoutYear.entries()]);
  });

  it('keeps its exact 2025 numbers, so a past season\'s odds do not drift', () => {
    // A regression fixture, not a claim that these values are right: they were
    // read off the model as it stood before the 2026 branch was added, and
    // re-running 2025 must reproduce them exactly.
    const odds = build(2025).calculateAllPlayoffOdds();

    expect(Object.fromEntries(odds)).toEqual({
      'd1-1': 100,
      'd1-2': 100,
      'd1-3': 75,
      'd1-4': 31,
      'd1-5': 0,
      'd2-1': 100,
      'd2-2': 93,
      'd2-3': 67,
      'd2-4': 23,
      'd2-5': 0
    });
  });
});

describe('2026+: division winners on byes, league-wide wildcards', () => {
  it('reports exactly the six teams computeSeeds names once the season is over', () => {
    const odds = build(2026, { currentWeek: 15, weeks: 14 }).calculateAllPlayoffOdds();
    const seeds = computeSeeds(league);

    const hundreds = [...odds.entries()]
      .filter(([, value]) => value === 100)
      .map(([id]) => id)
      .sort();
    const qualified = [...seeds.entries()]
      .filter(([, info]) => info.seed != null)
      .map(([id]) => id)
      .sort();

    expect(hundreds).toHaveLength(6);
    expect(hundreds).toEqual(qualified);
    for (const [id, value] of odds) {
      if (!qualified.includes(id)) expect(value).toBe(0);
    }
  });

  it('takes a fourth-place team over another division\'s third', () => {
    const seededOdds = build(2026, { currentWeek: 15, weeks: 14 }).calculateAllPlayoffOdds();
    const legacyOdds = build(2025, { currentWeek: 15, weeks: 14 }).calculateAllPlayoffOdds();

    // 8-4 and fourth in the stacked division: out under the old rule, in now.
    expect(legacyOdds.get('d1-4')).toBe(0);
    expect(seededOdds.get('d1-4')).toBe(100);

    // 4-8 and third in the weak division: in under the old rule, out now.
    expect(legacyOdds.get('d2-3')).toBe(100);
    expect(seededOdds.get('d2-3')).toBe(0);
  });

  it('gives a stacked-division also-ran real odds while games remain', () => {
    // The team the old model puts at 31 for being fourth in its division —
    // while it is the fourth-best record in the league.
    const odds = build(2026).calculateAllPlayoffOdds();
    expect(odds.get('d1-4')).toBeGreaterThan(50);
  });

  it('reads 100 for a team the first side out can no longer reach', () => {
    // One week left. The 7th projected seed is on 5 wins and can reach 6; the
    // top four are all past that.
    const odds = build(2026, { currentWeek: 14, weeks: 14 }).calculateAllPlayoffOdds();

    expect(odds.get('d1-1')).toBe(100);
    expect(odds.get('d1-2')).toBe(100);
    expect(odds.get('d2-1')).toBe(100);
  });

  it('reads 0 for a team that can catch neither the last team in nor its own leader', () => {
    const odds = build(2026, { currentWeek: 14, weeks: 14 }).calculateAllPlayoffOdds();

    expect(odds.get('d1-5')).toBe(0);
    expect(odds.get('d2-5')).toBe(0);
  });

  it('keeps everything inside 0-100', () => {
    for (const week of [1, 5, 10, 14, 15]) {
      const odds = build(2026, { currentWeek: week, weeks: 14 }).calculateAllPlayoffOdds();
      for (const value of odds.values()) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it('seeds league-wide rather than falling over when a division is empty', () => {
    const oneDivision = league.filter((t) => t.divisionId === 1);
    const odds = build(2026, {
      teams: oneDivision,
      currentWeek: 15,
      weeks: 14
    }).calculateAllPlayoffOdds();

    // Five teams, six berths: everybody is in, and nobody reads NaN.
    expect([...odds.values()]).toEqual([100, 100, 100, 100, 100]);
  });

  it('returns an empty map for an empty league', () => {
    expect(build(2026, { teams: [] }).calculateAllPlayoffOdds().size).toBe(0);
  });
});
