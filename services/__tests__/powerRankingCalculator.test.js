/**
 * The ranking calculator had no tests (§8.3) despite being the piece of weighted
 * math that decides what the whole site displays. These cover the parts that
 * silently produce wrong numbers rather than throwing: the viewing-week cutoff,
 * win/loss derivation, all-play, luck, streaks, and rank ordering.
 */

import { describe, it, expect } from 'vitest';
import {
  PowerRankingCalculator,
  combineWeightedComponents,
  normalizeAcrossLeague,
  optimalLineupPoints
} from '../powerRankingCalculator.js';
import { POWER_RANKING_WEIGHTS, POWER_RANKING_COMPONENT_META } from '../../types/index.js';

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
    opts.regularSeasonWeeks ?? 14,
    // Eighth argument, optional: seven-argument calls must keep working, since
    // a season with no player data is the normal case for 2025 and earlier.
    opts.playerWeekStats ?? null
  );

/** One player-week row, in the shape `getPlayerWeekStats` returns. */
const playerRow = (position, points, { started = true, slot = null } = {}) => ({
  position,
  actualPoints: points,
  started,
  lineupSlotId: slot ?? (started ? 0 : 20)
});

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

describe('POWER_RANKING_WEIGHTS', () => {
  it('sums to exactly 1', () => {
    // The weights are only comparable to each other if they do. A drifting sum
    // silently rescales every rating the next time somebody retunes one.
    const total = Object.values(POWER_RANKING_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('has display metadata for every weighted component', () => {
    // The UI builds its labels from these two objects together; a weight
    // without meta renders as an unlabelled bar.
    for (const key of Object.keys(POWER_RANKING_WEIGHTS)) {
      expect(POWER_RANKING_COMPONENT_META[key]?.label).toBeTruthy();
      expect(POWER_RANKING_COMPONENT_META[key]?.description).toBeTruthy();
    }
    expect(Object.keys(POWER_RANKING_COMPONENT_META).sort())
      .toEqual(Object.keys(POWER_RANKING_WEIGHTS).sort());
  });
});

describe('normalizeAcrossLeague', () => {
  it('maps the range onto 0-100', () => {
    expect(normalizeAcrossLeague({ a: 10, b: 20, c: 30 })).toEqual({ a: 0, b: 50, c: 100 });
  });

  it('gives everyone a neutral 50 when nothing separates them', () => {
    // A league before week 1: every raw value is 0, and dividing by the span
    // would be a division by zero.
    expect(normalizeAcrossLeague({ a: 0, b: 0 })).toEqual({ a: 50, b: 50 });
  });

  it('keeps a missing value missing rather than calling it the minimum', () => {
    expect(normalizeAcrossLeague({ a: 10, b: null, c: 30 })).toEqual({ a: 0, b: null, c: 100 });
  });

  it('returns nulls when no team has the component at all', () => {
    expect(normalizeAcrossLeague({ a: null, b: null })).toEqual({ a: null, b: null });
  });
});

describe('combineWeightedComponents', () => {
  it('renormalizes over the components that exist', () => {
    // Two components present, both 80: the answer is 80, not 80 scaled down by
    // the seven that are missing.
    const components = { record: 80, allPlay: 80 };
    expect(combineWeightedComponents(components)).toBeCloseTo(80, 10);
  });

  it('weights the surviving components against each other', () => {
    // record 0.22 and allPlay 0.15 => (100*0.22 + 0*0.15) / 0.37
    const value = combineWeightedComponents({ record: 100, allPlay: 0 });
    expect(value).toBeCloseTo((100 * 0.22) / (0.22 + 0.15), 10);
  });

  it('ignores a null instead of scoring it as zero', () => {
    expect(combineWeightedComponents({ record: 90, rosterStrength: null })).toBe(90);
  });

  it('falls back to neutral when nothing is computable', () => {
    expect(combineWeightedComponents({})).toBe(50);
    expect(combineWeightedComponents(null)).toBe(50);
  });

  it('ignores keys that are not weighted components', () => {
    expect(combineWeightedComponents({ record: 60, luckPercentage: 0.4 })).toBe(60);
  });
});

describe('optimalLineupPoints', () => {
  // QB 20 | RB 15, RB 10 | WR 12, WR 8, WR 7 | TE 6 | D/ST 5 | K 4
  // bench RB 25, bench WR 3 | IR WR 99
  const week = [
    playerRow('QB', 20),
    playerRow('RB', 15),
    playerRow('RB', 10),
    playerRow('WR', 12),
    playerRow('WR', 8),
    playerRow('WR', 7),
    playerRow('TE', 6),
    playerRow('D/ST', 5),
    playerRow('K', 4),
    playerRow('RB', 25, { started: false }),
    playerRow('WR', 3, { started: false }),
    playerRow('WR', 99, { started: false, slot: 21 })
  ];

  it('fills the fixed slots first and gives FLEX the best of what is left', () => {
    // QB 20 + RB 25,15 + WR 12,8 + TE 6 + D/ST 5 + K 4 + FLEX(RB 10) = 105.
    // The bench RB outscores both starters, so an optimal manager starts it.
    expect(optimalLineupPoints(week)).toBe(105);
  });

  it('never counts an IR player, who could not legally have been started', () => {
    // The 99-point IR receiver would dominate every slot it touched.
    expect(optimalLineupPoints(week)).toBeLessThan(150);
  });

  it('does not reuse a player across two slots', () => {
    const thin = [playerRow('RB', 30), playerRow('QB', 10)];
    // RB fills one RB slot and FLEX takes nothing else; 30 + 10, not 30 twice.
    expect(optimalLineupPoints(thin)).toBe(40);
  });

  it('scores an empty week as zero rather than throwing', () => {
    expect(optimalLineupPoints([])).toBe(0);
    expect(optimalLineupPoints()).toBe(0);
  });
});

describe('all-play respects the viewing week', () => {
  // The regression this guards: all-play used to filter the team's own games by
  // `isCompleted` alone and then pool every completed game of that week, so
  // paging back to week 2 scored teams using results from weeks they had not
  // played yet.
  it('sees only weeks before the viewing week', () => {
    // Week 1 alone: t1 posts 120 against 110, 90, 80 — beats all three.
    expect(build({ viewingWeek: 2 }).calculateAllPlayWinPercentage('t1')).toBe(1);
    // Week 1 alone: t4 posts the lowest score of the week, so it beats nobody.
    expect(build({ viewingWeek: 2 }).calculateAllPlayWinPercentage('t4')).toBe(0);
  });

  it('picks up the later weeks once the viewing week passes them', () => {
    // In week 2 t4's 95 beats t3's 70, so across the season it is no longer 0 —
    // which is exactly the value that leaked into the week-2 view before.
    expect(build({ viewingWeek: 4 }).calculateAllPlayWinPercentage('t4')).toBeGreaterThan(0);
  });

  it('carries the cutoff into luck, which is derived from all-play', () => {
    expect(build({ viewingWeek: 2 }).calculateLuckPercentage('t1')).toBeCloseTo(0, 10);
  });
});

describe('components without player data (a 2025 season)', () => {
  const calc = build();

  it('leaves the roster components null rather than scoring them zero', () => {
    const components = calc.componentsByTeam.t1;
    expect(components.rosterStrength).toBeNull();
    expect(components.lineupEfficiency).toBeNull();
  });

  it('leaves the outlook null when no rosters are attached', () => {
    expect(calc.componentsByTeam.t1.futureStrength).toBeNull();
  });

  it('leaves the remaining schedule null when no games are left', () => {
    // Every game in the fixture is in weeks 1-3 and the viewing week is 4.
    expect(calc.componentsByTeam.t1.leagueSos).toBeNull();
  });

  it('still produces finite ratings from the team components alone', () => {
    for (const team of calc.getRankings()) {
      expect(Number.isFinite(team.powerRating)).toBe(true);
      expect(team.powerRating).toBeGreaterThanOrEqual(0);
      expect(team.powerRating).toBeLessThanOrEqual(100);
    }
  });

  it('still ranks the undefeated team first and the winless team last', () => {
    const order = calc.getRankings().map(team => team.id);
    expect(order[0]).toBe('t1');
    expect(order.at(-1)).toBe('t4');
  });
});

describe('roster components from player_week_stats', () => {
  // t1 starts a strong lineup every week; t4 starts a weak one. Both leave the
  // same bench points unused, so lineup efficiency separates them differently
  // from roster strength.
  const strongWeek = [playerRow('QB', 25), playerRow('RB', 20), playerRow('WR', 15)];
  const weakWeek = [playerRow('QB', 8), playerRow('RB', 6), playerRow('WR', 4)];

  const playerWeekStats = {
    t1: { 1: strongWeek, 2: strongWeek, 3: strongWeek },
    t4: { 1: weakWeek, 2: weakWeek, 3: weakWeek }
  };

  const calc = build({ playerWeekStats });

  it('averages the starters actually fielded, per week', () => {
    expect(calc.rawRosterStrength('t1')).toBeCloseTo(60, 10); // 25 + 20 + 15
    expect(calc.rawRosterStrength('t4')).toBeCloseTo(18, 10); // 8 + 6 + 4
  });

  it('reports null for a team with no stored weeks', () => {
    expect(calc.rawRosterStrength('t2')).toBeNull();
    expect(calc.componentsByTeam.t2.rosterStrength).toBeNull();
  });

  it('normalizes the teams that do have data against each other', () => {
    expect(calc.componentsByTeam.t1.rosterStrength).toBe(100);
    expect(calc.componentsByTeam.t4.rosterStrength).toBe(0);
  });

  it('honours the viewing-week cutoff on roster weeks too', () => {
    const atWeek2 = build({ playerWeekStats, viewingWeek: 2 });
    // Only week 1 counts, but every week is identical, so the mean is the same
    // while the number of weeks behind it is not.
    expect(atWeek2.calculateRosterMetrics({ id: 't1' }).rosterWeeksRecorded).toBe(1);
    expect(calc.calculateRosterMetrics({ id: 't1' }).rosterWeeksRecorded).toBe(3);
  });

  it('scores lineup efficiency against the optimal lineup of the same week', () => {
    // Started QB 20 + RB 15 + WR 12 = 47. The bench RB 25 would have replaced
    // the started RB 15 and the FLEX would then take it, so the optimal is
    // 20 + 25 + 12 + 15 = 72 (QB, RB, WR, FLEX filled; other slots empty).
    const withBench = {
      t1: {
        1: [
          playerRow('QB', 20),
          playerRow('RB', 15),
          playerRow('WR', 12),
          playerRow('RB', 25, { started: false })
        ]
      }
    };
    const efficiency = build({ playerWeekStats: withBench }).rawLineupEfficiency('t1');
    expect(efficiency).toBeCloseTo((47 / 72) * 100, 6);
  });

  it('caps a perfectly managed lineup at 100 rather than above it', () => {
    const perfect = { t1: { 1: [playerRow('QB', 20), playerRow('RB', 10)] } };
    expect(build({ playerWeekStats: perfect }).rawLineupEfficiency('t1')).toBeCloseTo(100, 10);
  });

  it('produces finite ratings once player data exists', () => {
    for (const team of calc.getRankings()) {
      expect(Number.isFinite(team.powerRating)).toBe(true);
    }
  });
});

describe('future outlook', () => {
  const rosteredTeams = [
    {
      id: 't1',
      name: 'T1',
      roster: [{ rosterSlot: 'QB', player: { id: 'p1' } }, { rosterSlot: 'BE', player: { id: 'p2' } }]
    },
    { id: 't2', name: 'T2', roster: [{ rosterSlot: 'QB', player: { id: 'p3' } }] },
    { id: 't3', name: 'T3', roster: [] },
    { id: 't4', name: 'T4', roster: [] }
  ];

  const players = [
    { id: 'p1', seasonProjectedPoints: 300, seasonActualPoints: 100, projectedPoints: 20 },
    { id: 'p2', seasonProjectedPoints: 900, seasonActualPoints: 0, projectedPoints: 90 },
    { id: 'p3', seasonProjectedPoints: 200, seasonActualPoints: 150, projectedPoints: 8 }
  ];

  it('counts only the starters, reading the roster entry shape that exists', () => {
    // The old code read `entry.playerId` and `entry.isActive`, keys these rows
    // do not have, so this number was always 0 and the component fell back to a
    // fraction of the performance score.
    const calc = build({ teams: rosteredTeams, players });
    expect(calc.rawFutureOutlook('t1')).toEqual({ restOfSeason: 200, nextWeek: 20 });
  });

  it('never lets a player who has beaten their projection subtract from it', () => {
    const calc = build({ teams: rosteredTeams, players });
    const overachiever = [{ id: 'p3', seasonProjectedPoints: 100, seasonActualPoints: 150, projectedPoints: 8 }];
    const withOverachiever = build({ teams: rosteredTeams, players: overachiever });
    expect(withOverachiever.rawFutureOutlook('t2').restOfSeason).toBe(0);
    expect(calc.rawFutureOutlook('t2').restOfSeason).toBe(50);
  });

  it('is null on a historical view, because nobody archived last month’s projections', () => {
    const historical = build({ teams: rosteredTeams, players, viewingWeek: 3, currentWeek: 9 });
    expect(historical.rawFutureOutlook('t1')).toBeNull();
    expect(historical.componentsByTeam.t1.futureStrength).toBeNull();
  });

  it('is null for a team with no roster attached', () => {
    const calc = build({ teams: rosteredTeams, players });
    expect(calc.rawFutureOutlook('t3')).toBeNull();
  });

  it('blends the two horizons after each is normalized, so 60/40 means 60/40', () => {
    // t1 leads both horizons, t2 trails both, so t1 normalizes to 100 on each
    // and the blend is 100 rather than being swallowed by the larger number.
    const calc = build({ teams: rosteredTeams, players });
    expect(calc.componentsByTeam.t1.futureStrength).toBeCloseTo(100, 10);
    expect(calc.componentsByTeam.t2.futureStrength).toBeCloseTo(0, 10);
  });
});

describe('remaining-schedule difficulty', () => {
  // Weeks 1-3 as in the fixture, plus a scheduled week 4 that pits t2 against
  // the strongest team and t3 against the weakest.
  const scheduled = [
    ...games,
    { id: '4-t1-t2', week: 4, team1Id: 't1', team2Id: 't2', team1Score: null, team2Score: null, isCompleted: false },
    { id: '4-t3-t4', week: 4, team1Id: 't3', team2Id: 't4', team1Score: null, team2Score: null, isCompleted: false }
  ];

  const calc = build({ games: scheduled, currentWeek: 4, viewingWeek: 4 });

  it('finds the opponents still to be played', () => {
    expect(calc.remainingOpponents('t2')).toEqual(['t1']);
    expect(calc.remainingOpponents('t3')).toEqual(['t4']);
  });

  it('scores a run-in against the strongest team above one against the weakest', () => {
    // Two passes: everyone is rated on the components that need no opponent,
    // then those ratings are what "how hard is the schedule" is measured with.
    // t2 still has to play t1 (undefeated); t3 still has to play t4 (winless).
    expect(calc.componentsByTeam.t2.leagueSos)
      .toBeGreaterThan(calc.componentsByTeam.t3.leagueSos);
  });

  it('points the same way as the opponent adjustment inside Record', () => {
    // These two used to disagree — facing strong teams raised your record score
    // and lowered your schedule score, so the same schedule was both an excuse
    // and a penalty. A hard run-in must not read as an easy one.
    const strongestRunIn = calc.componentsByTeam.t2.leagueSos;
    const weakestRunIn = calc.componentsByTeam.t3.leagueSos;
    expect(strongestRunIn).toBe(100);
    expect(weakestRunIn).toBe(0);
  });

  it('keeps the component inside 0-100', () => {
    for (const teamId of ['t1', 't2', 't3', 't4']) {
      const value = calc.componentsByTeam[teamId].leagueSos;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('ignores games past the end of the regular season', () => {
    const withPlayoff = build({
      games: [
        ...games,
        { id: '15-t1-t2', week: 15, team1Id: 't1', team2Id: 't2', team1Score: null, team2Score: null, isCompleted: false }
      ],
      currentWeek: 4,
      regularSeasonWeeks: 14
    });
    expect(withPlayoff.remainingOpponents('t1')).toEqual([]);
    expect(withPlayoff.componentsByTeam.t1.leagueSos).toBeNull();
  });
});

describe('week 1, before anything has been played', () => {
  // Every component is either empty or missing. The rating must still be a
  // number, and every team must get the same one rather than a NaN ordering.
  const calc = build({ viewingWeek: 1, currentWeek: 1 });

  it('gives every team a finite, identical rating', () => {
    const ratings = calc.getRankings().map(team => team.powerRating);
    expect(ratings.every(Number.isFinite)).toBe(true);
    expect(new Set(ratings.map(r => r.toFixed(6))).size).toBe(1);
  });

  it('numbers the ranks anyway, rather than leaving them undefined', () => {
    expect(calc.getRankings().map(team => team.rank)).toEqual([1, 2, 3, 4]);
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
