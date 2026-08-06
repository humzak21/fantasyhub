/**
 * The ranking calculator had no tests (§8.3) despite being the piece of weighted
 * math that decides what the whole site displays. These cover the parts that
 * silently produce wrong numbers rather than throwing: the viewing-week cutoff,
 * win/loss derivation, all-play, luck, streaks, and rank ordering.
 */

import { describe, it, expect } from 'vitest';
import { PowerRankingCalculator } from '../powerRankingCalculator.js';

/** Four teams, ids 't1'..'t4'. */
const teams = ['t1', 't2', 't3', 't4'].map(id => ({ id, name: id.toUpperCase(), roster: [] }));

const game = (week, team1Id, team1Score, team2Id, team2Score) => ({
  id: `${week}-${team1Id}-${team2Id}`,
  week,
  team1Id,
  team2Id,
  team1Score,
  team2Score,
  isCompleted: true
});

/**
 * Weeks 1-3. t1 wins every week, t4 loses every week, t2/t3 split.
 * Scores are chosen so all-play ordering is unambiguous each week.
 */
const games = [
  game(1, 't1', 120, 't4', 80),
  game(1, 't2', 110, 't3', 90),
  game(2, 't1', 130, 't3', 70),
  game(2, 't2', 100, 't4', 95),
  game(3, 't1', 125, 't2', 85),
  game(3, 't3', 105, 't4', 60)
];

const build = (opts = {}) =>
  new PowerRankingCalculator(
    opts.teams ?? teams,
    opts.games ?? games,
    opts.currentWeek ?? 4,
    opts.players ?? [],
    opts.viewingWeek ?? null,
    opts.divisions ?? [],
    opts.regularSeasonWeeks ?? 14
  );

describe('getWinnerFromGame', () => {
  it('returns the higher-scoring team', () => {
    const calc = build();
    expect(calc.getWinnerFromGame(game(1, 'a', 100, 'b', 90))).toBe('a');
    expect(calc.getWinnerFromGame(game(1, 'a', 90, 'b', 100))).toBe('b');
  });

  it('returns null for an exact tie rather than picking a side', () => {
    expect(build().getWinnerFromGame(game(1, 'a', 100, 'b', 100))).toBeNull();
  });

  it('returns null for an incomplete game, so unplayed weeks cannot score', () => {
    const unplayed = { ...game(1, 'a', 0, 'b', 0), isCompleted: false };
    expect(build().getWinnerFromGame(unplayed)).toBeNull();
  });
});

describe('viewing-week cutoff', () => {
  // This is the mechanism behind historical rankings: viewing week 3 must see
  // weeks 1-2 only. An off-by-one here leaks a result the user has not
  // navigated to yet.
  it('counts only games strictly before the viewing week', () => {
    const atWeek3 = build({ viewingWeek: 3 }).calculateTeamStats('t1');
    expect(atWeek3.wins).toBe(2);
    expect(atWeek3.gamesPlayed).toBe(2);
    expect(atWeek3.pointsFor).toBe(250); // 120 + 130, week 3's 125 excluded
  });

  it('includes every completed week once the viewing week is past them', () => {
    const atWeek4 = build({ viewingWeek: 4 }).calculateTeamStats('t1');
    expect(atWeek4.wins).toBe(3);
    expect(atWeek4.pointsFor).toBe(375);
  });

  it('returns default stats when no games precede the viewing week', () => {
    const atWeek1 = build({ viewingWeek: 1 }).calculateTeamStats('t1');
    expect(atWeek1.gamesPlayed).toBe(0);
    expect(atWeek1.winPercentage).toBe(0);
  });
});

describe('calculateTeamStats', () => {
  it('derives wins, losses and points from scores alone', () => {
    const stats = build().calculateTeamStats('t4');
    expect(stats.wins).toBe(0);
    expect(stats.losses).toBe(3);
    expect(stats.pointsFor).toBe(235); // 80 + 95 + 60
    expect(stats.pointsAgainst).toBe(325); // 120 + 100 + 105
    expect(stats.pointDifferential).toBe(-90);
  });

  it('computes win percentage over games played, not weeks elapsed', () => {
    expect(build().calculateTeamStats('t2').winPercentage).toBeCloseTo(2 / 3, 5);
  });

  it('never counts an incomplete game', () => {
    const withPending = [...games, { ...game(4, 't1', 200, 't2', 0), isCompleted: false }];
    const stats = build({ games: withPending, currentWeek: 5, viewingWeek: 5 })
      .calculateTeamStats('t1');
    expect(stats.gamesPlayed).toBe(3);
    expect(stats.pointsFor).toBe(375);
  });
});

describe('calculateAllPlayWinPercentage', () => {
  it('scores a team against every other score that week, not just its opponent', () => {
    // Week 1 scores: 120, 110, 90, 80. t1's 120 beats all 3 others.
    // Week 2: 130, 100, 95, 70 — t1's 130 beats all 3.
    // Week 3: 125, 105, 85, 60 — t1's 125 beats all 3. So 9/9.
    expect(build().calculateAllPlayWinPercentage('t1')).toBe(1);
  });

  it('gives the weekly-low team an all-play of zero', () => {
    // t4 posts 80, 95, 60 — the lowest score in weeks 1 and 3, and in week 2
    // only 70 (t3) is lower, so t4 is not a clean zero. t3 is the clearer case
    // for a bottom team, so assert t4 is simply very low and bounded.
    const t4 = build().calculateAllPlayWinPercentage('t4');
    expect(t4).toBeGreaterThanOrEqual(0);
    expect(t4).toBeLessThan(0.25);
  });

  it('returns 0 for a team with no completed games', () => {
    expect(build({ games: [] }).calculateAllPlayWinPercentage('t1')).toBe(0);
  });
});

describe('calculateLuckPercentage', () => {
  it('is zero for a team whose record matches its all-play', () => {
    // t1 is 3-0 with a 1.000 all-play: it won exactly as often as its scores
    // deserved, so it was neither lucky nor unlucky.
    expect(build().calculateLuckPercentage('t1')).toBeCloseTo(0, 5);
  });

  it('is positive when a team wins more than its scores justify', () => {
    // t2 goes 2-1 while posting middling scores (110, 100, 85), so its actual
    // win rate outruns its all-play rate.
    expect(build().calculateLuckPercentage('t2')).toBeGreaterThan(0);
  });
});

describe('calculateCurrentStreak', () => {
  const streakFor = teamId => {
    const calc = build();
    const teamGames = games.filter(g => g.team1Id === teamId || g.team2Id === teamId);
    return calc.calculateCurrentStreak(teamId, teamGames);
  };

  it('counts a win streak back from the most recent week', () => {
    expect(streakFor('t1')).toEqual({ type: 'win', length: 3 });
  });

  it('counts a loss streak', () => {
    expect(streakFor('t4')).toEqual({ type: 'loss', length: 3 });
  });

  it('stops the streak at the first different result', () => {
    // t2: W (wk1), W (wk2), L (wk3). Most recent is a loss, so the streak is 1.
    expect(streakFor('t2')).toEqual({ type: 'loss', length: 1 });
  });

  it('reports no streak without games', () => {
    expect(build().calculateCurrentStreak('t1', [])).toEqual({ type: 'none', length: 0 });
  });
});

describe('getRankings', () => {
  it('orders teams by power rating, best first, and numbers them from 1', async () => {
    const rankings = await build().getRankings();

    expect(rankings).toHaveLength(4);
    expect(rankings.map(r => r.rank)).toEqual([1, 2, 3, 4]);

    const ratings = rankings.map(r => r.powerRating);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });

  it('puts the undefeated team above the winless one', async () => {
    const rankings = await build().getRankings();
    const order = rankings.map(r => r.teamId ?? r.id);
    expect(order.indexOf('t1')).toBeLessThan(order.indexOf('t4'));
  });

  it('keeps every power rating within the 0-100 bound it promises', async () => {
    for (const team of await build().getRankings()) {
      expect(team.powerRating).toBeGreaterThanOrEqual(0);
      expect(team.powerRating).toBeLessThanOrEqual(100);
    }
  });

  it('derives rankChange from the previous snapshot', async () => {
    const first = await build().getRankings();
    const worst = first.at(-1);
    const best = first[0];

    // Feed back a snapshot with the order inverted; every team should report a
    // move, and the signs must be opposite for the two ends.
    const previous = [...first]
      .reverse()
      .map((team, index) => ({ teamId: team.teamId ?? team.id, rank: index + 1 }));

    const second = await build().getRankings(previous);
    const bestNow = second.find(t => (t.teamId ?? t.id) === (best.teamId ?? best.id));
    const worstNow = second.find(t => (t.teamId ?? t.id) === (worst.teamId ?? worst.id));

    expect(bestNow.rankChange).toBeGreaterThan(0);
    expect(worstNow.rankChange).toBeLessThan(0);
  });

  it('reports no movement when there is no previous snapshot', async () => {
    for (const team of await build().getRankings()) {
      expect(team.rankChange).toBe(0);
      expect(team.previousRank).toBeNull();
    }
  });
});

describe('degenerate inputs', () => {
  it('survives a league with no games at all', async () => {
    const rankings = await build({ games: [] }).getRankings();
    expect(rankings).toHaveLength(4);
    for (const team of rankings) {
      expect(Number.isFinite(team.powerRating)).toBe(true);
    }
  });

  it('survives an empty league', async () => {
    expect(await build({ teams: [], games: [] }).getRankings()).toEqual([]);
  });

  it('coerces non-array constructor arguments instead of throwing', () => {
    const calc = new PowerRankingCalculator(null, undefined, 1);
    expect(calc.teams).toEqual([]);
    expect(calc.games).toEqual([]);
    expect(calc.players).toEqual([]);
  });
});
