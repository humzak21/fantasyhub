import { describe, it, expect } from 'vitest';

import { buildPlayerProfile, percentile, stddevPop } from '../buildPlayerProfile.js';

/**
 * One running back across two seasons and two franchises, in the shape
 * `getPlayerProfileSource` returns (view rows camelCased):
 *
 * - 2025: weeks 1-2 started on A; dropped before week 3 (no row); claimed by B
 *   for weeks 4-5 (benched in 4; started in 5 but never played, a settled 0 with
 *   no stat line); back on B for the first playoff round, week 15.
 * - 2026, the active season: weeks 1-7 on A, week 3 a bye for A, week 4 on the
 *   bench, week 7 not yet played.
 */
const BREAKDOWN = { 23: 10, 24: 40, 53: 2, 42: 15, 58: 3 };

function line(seasonId, year, week, teamId, franchiseId, started, actualPoints, extra = {}) {
  return {
    id: `${seasonId}-${week}`,
    seasonId, year, week, playerId: 'p1', espnPlayerId: 100, teamId, franchiseId,
    position: 'RB', rosterSlot: started ? 'RB' : 'BE', started, actualPoints,
    projectedPoints: null, proTeamId: 8, injuryStatus: 'ACTIVE',
    statBreakdown: null, overallRank: null, overallOf: null, positionRank: null, positionOf: null,
    gameId: `g-${seasonId}-${week}`, gameType: 'regular', teamScore: 100, opponentScore: 90,
    opponentTeamId: teamId === 'tA26' || teamId === 'tA25' ? `tB${String(year).slice(2)}` : `tA${String(year).slice(2)}`,
    opponentFranchiseId: null, result: 'W', isBye: false,
    ...extra
  };
}

const ranked = (positionRank) => ({ overallRank: positionRank * 2, overallOf: 150, positionRank, positionOf: 40 });

function source() {
  const s26 = (week, started, points, extra) =>
    line('s26', 2026, week, 'tA26', 'fA', started, points, {
      projectedPoints: 15,
      statBreakdown: points == null ? null : { ...BREAKDOWN },
      ...extra
    });

  return {
    player: {
      id: 'p1', espnPlayerId: 100, name: 'Jahmyr Gibbs', position: 'RB', teamAbbreviation: 'DET',
      proTeamId: 8, injuryStatus: 'ACTIVE', projectedPoints: 18.5, isActive: true
    },
    lines: [
      // Out of order on purpose: the builder sorts.
      s26(6, true, 40, { ...ranked(1), statBreakdown: { ...BREAKDOWN, 25: 2 } }),
      s26(1, true, 10, ranked(12)),
      s26(2, true, 20, { ...ranked(6), result: 'L', teamScore: 80, opponentScore: 95 }),
      s26(3, true, 30, {
        ...ranked(3), gameType: 'bye', isBye: true, result: null, teamScore: 101,
        opponentScore: null, opponentTeamId: null
      }),
      s26(4, false, 5, ranked(20)),
      s26(5, true, 25, { ...ranked(5), result: 'T', teamScore: 90, opponentScore: 90 }),
      s26(7, true, null, { result: null, teamScore: null, opponentScore: null }),

      line('s25', 2025, 1, 'tA25', 'fA', true, 10),
      line('s25', 2025, 2, 'tA25', 'fA', true, 8, { result: 'L' }),
      line('s25', 2025, 4, 'tB25', 'fB', false, 15, { result: 'L' }),
      line('s25', 2025, 5, 'tB25', 'fB', true, 0),
      line('s25', 2025, 15, 'tB25', 'fB', true, 22, {
        gameType: 'playoff_first_round', statBreakdown: { 23: 12, 24: 60, 25: 1 }
      })
    ],
    teams: [
      { id: 'tA25', seasonId: 's25', franchiseId: 'fA', name: 'Alpha 25', owner: 'Owner A' },
      { id: 'tB25', seasonId: 's25', franchiseId: 'fB', name: 'Bravo 25', owner: 'Owner B' },
      { id: 'tA26', seasonId: 's26', franchiseId: 'fA', name: 'Alpha 26', owner: 'Owner A' },
      { id: 'tB26', seasonId: 's26', franchiseId: 'fB', name: 'Bravo 26', owner: 'Owner B' }
    ],
    franchises: [
      { id: 'fA', owner_name: 'Owner A', display_name: null },
      { id: 'fB', owner_name: 'Owner B', display_name: null }
    ],
    seasons: [
      { id: 's25', year: 2025, nflSeasonYear: 2025, regularSeasonWeeks: 14, playoffWeeks: 3, totalWeeks: 17, isActive: false, isCompleted: true },
      { id: 's26', year: 2026, nflSeasonYear: 2026, regularSeasonWeeks: 14, playoffWeeks: 3, totalWeeks: 17, isActive: true, isCompleted: false }
    ],
    current: { teamId: 'tA26', rosterSlot: 'RB', seasonId: 's26' },
    events: [
      {
        id: 'e-drop', seasonId: 's25', year: 2025, type: 'FREEAGENT', week: 3, processedAt: '2025-09-20T10:00:00Z',
        bidAmount: null, franchiseId: 'fA', franchiseIds: ['fA'],
        espnPlayerIds: [999, 100], playerFromFranchiseIds: [null, 'fA'], playerToFranchiseIds: ['fA', null]
      },
      {
        id: 'e-claim', seasonId: 's25', year: 2025, type: 'WAIVER', week: 4, processedAt: '2025-09-24T10:00:00Z',
        bidAmount: 12, franchiseId: 'fB', franchiseIds: ['fB'],
        espnPlayerIds: [100], playerFromFranchiseIds: [null], playerToFranchiseIds: ['fB']
      },
      {
        id: 'e-trade', seasonId: 's25', year: 2025, type: 'TRADE_ACCEPT', week: 16, processedAt: '2025-12-20T10:00:00Z',
        bidAmount: null, franchiseId: 'fB', franchiseIds: ['fB', 'fA'],
        espnPlayerIds: [100, 200], playerFromFranchiseIds: ['fB', 'fA'], playerToFranchiseIds: ['fA', 'fB']
      },
      {
        id: 'e-old', seasonId: 's25', year: 2025, type: 'FREEAGENT', week: 1, processedAt: '2025-09-05T10:00:00Z',
        bidAmount: null, franchiseId: 'fA', franchiseIds: ['fA'],
        espnPlayerIds: [100], playerFromFranchiseIds: null, playerToFranchiseIds: null
      }
    ]
  };
}

describe('buildPlayerProfile', () => {
  const profile = buildPlayerProfile(source());
  const [season26, season25] = profile.seasons;
  const week = (season, n) => season.weeks.find((w) => w.week === n);

  it('is null for a missing player', () => {
    expect(buildPlayerProfile(null)).toBeNull();
  });

  it('describes the player as he is now', () => {
    expect(profile.player).toEqual({
      id: 'p1', espnPlayerId: 100, name: 'Jahmyr Gibbs', position: 'RB', proTeam: 'DET',
      proTeamId: 8, injuryStatus: 'ACTIVE', projectedPoints: 18.5, isActive: true
    });
    expect(profile.current).toEqual({
      teamId: 'tA26', franchiseId: 'fA', franchise: source().franchises[0], rosterSlot: 'RB', seasonYear: 2026
    });
  });

  it('hands out the franchises array’s own objects, so the UI can mask them', () => {
    const src = source();
    const built = buildPlayerProfile(src);
    expect(built.current.franchise).toBe(src.franchises[0]);
    expect(built.seasons[0].weeks[0].franchise).toBe(src.franchises[0]);
  });

  it('orders seasons newest first and weeks ascending within each', () => {
    expect(profile.seasons.map((s) => s.year)).toEqual([2026, 2025]);
    expect(season26.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(season25.weeks.map((w) => w.week)).toEqual([1, 2, 4, 5, 15]);
    expect(season26.isCurrent).toBe(true);
    expect(season25.isCurrent).toBe(false);
  });

  it('builds each week line from the week’s own facts', () => {
    const w6 = week(season26, 6);
    expect(w6).toMatchObject({
      label: 'Week 6', isPostseason: false, phase: null, franchiseId: 'fA', started: true, slot: 'RB',
      actualPoints: 40, appeared: true, touchdowns: 2, proTeam: 'DET',
      rank: { overall: 2, overallOf: 150, positional: 1, positionalOf: 40 },
      game: { result: 'W', teamScore: 100, opponentScore: 90, opponentTeamId: 'tB26', opponentFranchiseId: 'fB', isBye: false, type: 'regular' }
    });
    expect(w6.game.opponentFranchise).toEqual({ id: 'fB', owner_name: 'Owner B', display_name: null });
    expect(w6.stats).toEqual({ 23: 10, 24: 40, 25: 2, 53: 2, 42: 15, 58: 3 });
  });

  it('names a postseason week by its game', () => {
    expect(week(season25, 15)).toMatchObject({ label: 'Playoffs R1', isPostseason: true, phase: 'Playoffs, first round' });
  });

  it('keeps a settled zero with no stat line, but not as a game played', () => {
    const w5 = week(season25, 5);
    expect(w5).toMatchObject({ actualPoints: 0, appeared: false, stats: null, touchdowns: null, rank: null });
  });

  it('marks the bye', () => {
    expect(week(season26, 3).game).toMatchObject({ isBye: true, result: null, type: 'bye', opponentTeamId: null });
  });

  it('totals a season over appeared weeks, with null for what is unknown', () => {
    expect(season25.totals).toMatchObject({
      weeksRostered: 5,
      weeksStarted: 4,
      gamesPlayed: 4,
      startedGames: 3,
      benchGames: 1,
      totalPoints: 55,
      pointsPerGame: 13.75,
      startedPoints: 40,
      benchPoints: 15,
      startPct: 0.8,
      avgPositionRank: null,
      top5Finishes: null,
      projectedTotal: null,
      projectedDelta: null
    });
    expect(season25.totals.best).toMatchObject({ week: 15, actualPoints: 22 });
    expect(season25.totals.worst).toMatchObject({ week: 2, actualPoints: 8 });
  });

  it('reads projections and ranks where the season has them', () => {
    expect(season26.totals).toMatchObject({
      weeksRostered: 7,
      gamesPlayed: 6,
      totalPoints: 130,
      projectedTotal: 105,
      avgProjected: 15,
      // Week 7 has a projection and no game; it is not a 15-point miss.
      projectedDelta: 40,
      projectedDeltaWeeks: 6,
      top5Finishes: 3
    });
    expect(season26.totals.avgPositionRank).toBeCloseTo(47 / 6);
    expect(season26.totals.pointsPerGame).toBeCloseTo(130 / 6);
  });

  it('gives a season with no appeared week a null average, never 0', () => {
    const src = source();
    src.lines = src.lines.filter((l) => l.seasonId !== 's25' || l.week === 5);
    const lonely = buildPlayerProfile(src).seasons[1];
    expect(lonely.totals).toMatchObject({ gamesPlayed: 0, totalPoints: null, pointsPerGame: null, best: null, worst: null });
    expect(lonely.byGroup).toEqual([]);
  });

  it('sums the season’s stat groups for his position', () => {
    expect(season26.byGroup.map((g) => g.group)).toEqual(['rushing', 'receiving']);
    const rushing = Object.fromEntries(season26.byGroup[0].rows.map((r) => [r.short, r]));
    expect(rushing.CAR).toMatchObject({ total: 60, perGame: 10 });
    expect(rushing['RUSH TD'].total).toBe(2);
    expect(season26.byGroup[0].derived).toEqual([{ id: 'yardsPerCarry', label: 'Yards per carry', format: 'decimal', value: 4 }]);
    // 2025 had one week with a breakdown; the other three are not zeros.
    expect(season25.byGroup[0].games).toBe(1);
  });

  it('adds up the career', () => {
    expect(profile.career).toMatchObject({
      weeksRostered: 12,
      weeksStarted: 10,
      gamesPlayed: 10,
      totalPoints: 185,
      pointsPerGame: 18.5,
      seasonsPlayed: 2,
      franchisesCount: 2,
      firstYear: 2025,
      lastYear: 2026
    });
    expect(profile.career.startPct).toBeCloseTo(10 / 12);
    expect(profile.career.byGroup[0].rows.find((r) => r.short === 'CAR').total).toBe(72);
  });

  it('lists best and worst games, ties to the newer week', () => {
    const tag = (w) => `${w.year}-${w.week}:${w.actualPoints}`;
    expect(profile.bestGames.map(tag)).toEqual(['2026-6:40', '2026-3:30', '2026-5:25', '2025-15:22', '2026-2:20']);
    expect(profile.worstGames.map(tag)).toEqual(['2026-4:5', '2025-2:8', '2026-1:10', '2025-1:10', '2025-4:15']);
  });

  it('counts his team’s results in the weeks he started and the game was scored', () => {
    expect(season26.recordWhenStarted).toEqual({ wins: 2, losses: 1, ties: 1 });
    expect(season25.recordWhenStarted).toEqual({ wins: 3, losses: 1, ties: 0 });
    expect(profile.recordWhenStarted).toEqual({ wins: 5, losses: 2, ties: 1 });
  });

  it('breaks stints on a new franchise, a gap and a new season', () => {
    expect(profile.stints.map((s) => [s.year, s.franchiseId, s.fromWeek, s.toWeek, s.weeks, s.starts])).toEqual([
      [2026, 'fA', 1, 7, 7, 6],
      [2025, 'fA', 1, 2, 2, 2],
      [2025, 'fB', 4, 5, 2, 1],
      [2025, 'fB', 15, 15, 1, 1]
    ]);
    expect(profile.stints[1]).toMatchObject({ teamId: 'tA25', teamName: 'Alpha 25', owner: 'Owner A' });
  });

  it('reads each move’s direction from his own leg', () => {
    const moves = Object.fromEntries(profile.moves.map((m) => [m.id, m]));
    expect(profile.moves.map((m) => m.id)).toEqual(['e-trade', 'e-claim', 'e-drop', 'e-old']);

    expect(moves['e-trade']).toMatchObject({ kind: 'trade', year: 2025, week: 16, bidAmount: null });
    expect(moves['e-trade'].fromFranchise.id).toBe('fB');
    expect(moves['e-trade'].toFranchise.id).toBe('fA');
    expect(moves['e-trade'].counterparts).toEqual([
      { espnPlayerId: 200, fromFranchise: source().franchises[0], toFranchise: source().franchises[1] }
    ]);

    expect(moves['e-claim']).toMatchObject({ kind: 'waiver', bidAmount: 12, fromFranchise: null });
    expect(moves['e-claim'].toFranchise.id).toBe('fB');

    // He was the drop that made room for player 999.
    expect(moves['e-drop']).toMatchObject({ kind: 'drop', toFranchise: null, bidAmount: null });
    expect(moves['e-drop'].fromFranchise.id).toBe('fA');

    expect(moves['e-old']).toMatchObject({ kind: 'unknown', fromFranchise: null, toFranchise: null });
    expect(moves['e-old'].franchises.map((f) => f.id)).toEqual(['fA']);
  });

  it('copes with a player who has never been on a roster', () => {
    const empty = buildPlayerProfile({ player: { id: 'p9', name: 'Nobody', position: 'K' } });
    expect(empty.seasons).toEqual([]);
    expect(empty.trends).toBeNull();
    expect(empty.career).toMatchObject({ weeksRostered: 0, pointsPerGame: null, startPct: null, firstYear: null });
    expect(empty.current).toBeNull();
    expect(empty.bestGames).toEqual([]);
    expect(empty.moves).toEqual([]);
  });
});

describe('trends', () => {
  const { trends } = buildPlayerProfile(source());

  it('reads the newest season with a game', () => {
    expect(trends.year).toBe(2026);
    expect(trends.span).toEqual({ games: 6, avg: 130 / 6 });
    // Last four appeared weeks: 30, 5, 25, 40 (week 7 is unplayed).
    expect(trends.recent).toEqual({ games: 4, avg: 25 });
    expect(trends.delta).toBeCloseTo(25 - 130 / 6);
  });

  it('measures boom, bust, floor, ceiling and consistency', () => {
    // Boom >= 32.5: 40. Bust <= 10.83: 10 and 5.
    expect(trends.boomRate).toBeCloseTo(1 / 6);
    expect(trends.bustRate).toBeCloseTo(2 / 6);
    expect(trends.floor).toBe(10);
    expect(trends.ceiling).toBe(30);
    expect(trends.consistency).toBeCloseTo(Math.sqrt((3650 - 6 * (130 / 6) ** 2) / 6));
  });

  it('counts the current streak on one side of the average', () => {
    expect(trends.currentStreak).toEqual({ kind: 'above', length: 2 });
  });

  it('withholds boom and bust under three games', () => {
    const src = source();
    src.lines = src.lines.filter((l) => l.seasonId === 's25' || l.week <= 2);
    const short = buildPlayerProfile(src).trends;
    expect(short.span.games).toBe(2);
    expect(short.boomRate).toBeNull();
    expect(short.bustRate).toBeNull();
    expect(short.currentStreak).toEqual({ kind: 'above', length: 1 });
  });

  it('falls back to an older season when the newest has no game yet', () => {
    const src = source();
    src.lines = src.lines.filter((l) => l.seasonId === 's25' || l.week === 7);
    expect(buildPlayerProfile(src).trends.year).toBe(2025);
  });
});

describe('percentile and stddevPop', () => {
  it('interpolate between ranks and handle the edges', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([7], 0.2)).toBe(7);
    expect(percentile([], 0.2)).toBeNull();
    expect(stddevPop([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(stddevPop([])).toBeNull();
  });
});
