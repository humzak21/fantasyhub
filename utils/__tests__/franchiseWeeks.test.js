import { describe, it, expect } from 'vitest';

import {
  listSeasonWeeks,
  rankPlayersForWeek,
  buildSeasonIndex,
  franchiseWeekStrip,
  defaultWeek,
  seasonArc,
  standingsThrough,
  buildWeekDossier,
  buildPlayerSeason,
  buildPlayerCareer,
  gamePhaseLabel,
  appeared
} from '../franchiseWeeks.js';

/**
 * A three-week regular season plus one postseason week, deliberately partial:
 * week 3 is in progress (games unscored, no lineups), only some weeks have a
 * rank snapshot, one transaction predates stored direction, and week 4 is a
 * bye for team A. The year is whatever the fixture says — nothing in the
 * module is allowed to care.
 */
function seasonSource({ year = 2026, id = 's1' } = {}) {
  const game = (week, type, team1Id, team2Id, team1Score, team2Score, extra = {}) => ({
    id: `${id}-${week}-${team1Id}`, week, type, team1Id, team2Id, team1Score, team2Score,
    isBlowout: false, isClose: false, ...extra
  });
  const pw = (week, teamId, playerId, name, position, slot, started, actualPoints, statBreakdown = null) => ({
    week, teamId, playerId, name, position, slot, started, actualPoints,
    proTeamId: 1, proTeam: 'BUF', statBreakdown
  });

  return {
    season: { id, year, nflSeasonYear: year, regularSeasonWeeks: 3, playoffWeeks: 1, totalWeeks: 4, isCompleted: false },
    franchises: ['fA', 'fB', 'fC', 'fD'].map((f) => ({ id: f, owner_name: `Owner ${f}`, display_name: null })),
    teams: ['A', 'B', 'C', 'D'].map((t) => ({ id: `t${t}`, franchiseId: `f${t}`, name: `Team ${t}`, owner: `Owner f${t}` })),
    games: [
      game(1, 'regular', 'tA', 'tB', 120, 90, { isBlowout: true }),
      game(1, 'regular', 'tC', 'tD', 100, 100),
      game(2, 'regular', 'tA', 'tC', 95, 110),
      game(2, 'regular', 'tB', 'tD', 130, 80),
      game(3, 'regular', 'tA', 'tD', null, null),
      game(3, 'regular', 'tB', 'tC', null, null),
      game(4, 'bye', 'tA', null, null, null),
      game(4, 'playoff_semifinals', 'tB', 'tC', null, null)
    ],
    playerWeeks: [
      pw(1, 'tA', 'p1', 'Josh Allen', 'QB', 'QB', true, 25, { 4: 3, 25: 1 }),
      pw(1, 'tA', 'p2', 'Bijan Robinson', 'RB', 'RB', true, 18, { 25: 1, 43: 1 }),
      pw(1, 'tA', 'p3', 'Bench WR', 'WR', 'BE', false, 12),
      pw(1, 'tB', 'p4', 'Other QB', 'QB', 'QB', true, 20),
      pw(1, 'tB', 'p5', 'Other RB', 'RB', 'RB', true, 30),
      pw(2, 'tA', 'p1', 'Josh Allen', 'QB', 'QB', true, 22),
      pw(2, 'tA', 'p2', 'Bijan Robinson', 'RB', 'RB', true, null)
    ],
    lineups: [{ week: 1, teamId: 'tA', starterPoints: 43, optimalPoints: 55, benchPoints: 12, startersScoring: 2 }],
    ranks: [
      { week: 1, teamId: 'tA', rank: 3, powerRating: 61, snapshotType: 'weekly', components: null, legacy: { performanceScore: 60, teamStrength: null } },
      { week: 2, teamId: 'tA', rank: 2, powerRating: 70, snapshotType: 'weekly', components: { scoring: 70, record: 80, bogus: 5 }, legacy: null }
    ],
    events: [
      {
        id: 'e1', type: 'WAIVER', week: 1, teamId: 'tA', franchiseId: 'fA', franchiseIds: ['fA'], bidAmount: 14, processedAt: null,
        players: [
          { espnPlayerId: 9, name: 'Added Guy', from: null, to: 'fA' },
          { espnPlayerId: 10, name: 'Dropped Guy', from: 'fA', to: null }
        ]
      },
      {
        id: 'e2', type: 'FREEAGENT', week: 1, teamId: 'tA', franchiseId: 'fA', franchiseIds: ['fA'], bidAmount: null, processedAt: null,
        players: [{ espnPlayerId: 11, name: 'Old Row', from: undefined, to: undefined }]
      },
      {
        id: 'e3', type: 'TRADE_ACCEPT', week: 2, teamId: null, franchiseId: null, franchiseIds: ['fA', 'fC'], bidAmount: null, processedAt: null,
        players: [
          { espnPlayerId: 12, name: 'Incoming', from: 'fC', to: 'fA' },
          { espnPlayerId: 13, name: 'Outgoing', from: 'fA', to: 'fC' }
        ]
      }
    ]
  };
}

describe('listSeasonWeeks', () => {
  it('takes its length and postseason boundary from the season row', () => {
    const weeks = listSeasonWeeks({ regularSeasonWeeks: 3, playoffWeeks: 1, totalWeeks: 4 });
    expect(weeks.map((w) => w.week)).toEqual([1, 2, 3, 4]);
    expect(weeks.map((w) => w.isPostseason)).toEqual([false, false, false, true]);
    expect(weeks[3].label).toBe('Championship');
  });

  it('falls back to regular + playoff weeks when total_weeks is missing', () => {
    expect(listSeasonWeeks({ regularSeasonWeeks: 14, playoffWeeks: 3 })).toHaveLength(17);
  });

  it('extends to the last week anything was stored for', () => {
    const weeks = listSeasonWeeks({ regularSeasonWeeks: 3, totalWeeks: 4 }, { games: [{ week: 5 }] });
    expect(weeks).toHaveLength(5);
  });
});

describe('rankPlayersForWeek', () => {
  it('ranks overall and within position, leaving out players with no result', () => {
    const ranks = rankPlayersForWeek([
      { playerId: 'p1', position: 'QB', actualPoints: 25 },
      { playerId: 'p2', position: 'RB', actualPoints: 18 },
      { playerId: 'p4', position: 'QB', actualPoints: 20 },
      { playerId: 'p5', position: 'RB', actualPoints: 30 },
      { playerId: 'p6', position: 'RB', actualPoints: null }
    ]);
    expect(ranks.get('p5')).toMatchObject({ overall: 1, positional: 1, positionalOf: 2 });
    expect(ranks.get('p1')).toMatchObject({ overall: 2, positional: 1, overallOf: 4 });
    expect(ranks.get('p2')).toMatchObject({ overall: 4, positional: 2 });
    expect(ranks.has('p6')).toBe(false);
  });

  it('uses competition ranking for ties', () => {
    const ranks = rankPlayersForWeek([
      { playerId: 'a', position: 'WR', actualPoints: 10 },
      { playerId: 'b', position: 'WR', actualPoints: 10 },
      { playerId: 'c', position: 'WR', actualPoints: 5 }
    ]);
    expect([ranks.get('a').overall, ranks.get('b').overall, ranks.get('c').overall]).toEqual([1, 1, 3]);
  });
});

describe('franchiseWeekStrip / defaultWeek', () => {
  const index = buildSeasonIndex(seasonSource());

  it('reports each week as it stands', () => {
    const strip = franchiseWeekStrip(index, 'fA');
    expect(strip.map((w) => w.result)).toEqual(['W', 'L', null, null]);
    expect(strip[3]).toMatchObject({ isBye: true, isPostseason: true });
    expect(strip[2].hasData).toBe(false); // in progress: scheduled, nothing settled
  });

  it('opens on the latest week with a game or lineup, not a bye', () => {
    expect(defaultWeek(franchiseWeekStrip(index, 'fA'))).toBe(2);
  });

  it('is empty for a franchise with no team that season', () => {
    expect(franchiseWeekStrip(index, 'fZ')).toEqual([]);
  });
});

describe('standingsThrough', () => {
  it('sorts by win %, then points for, then points against, with shared ranks', () => {
    const table = standingsThrough(buildSeasonIndex(seasonSource()), 1);
    expect(table.get('tA').rank).toBe(1);
    expect(table.get('tC').rank).toBe(2);
    expect(table.get('tD').rank).toBe(2);
    expect(table.get('tB').rank).toBe(4);
  });
});

describe('buildWeekDossier', () => {
  const index = buildSeasonIndex(seasonSource());

  it('assembles a settled week', () => {
    const d = buildWeekDossier(index, 'fA', 1);
    expect(d.matchup).toMatchObject({ result: 'W', pointsFor: 120, pointsAgainst: 90, margin: 30, isBlowout: true });
    expect(d.matchup.opponentFranchise.id).toBe('fB');
    expect(d.record).toEqual({ wins: 1, losses: 0, ties: 0 });
    expect(d.standing).toEqual({ rank: 1, of: 4 });

    expect(d.lineup.starters.map((r) => r.slot)).toEqual(['QB', 'RB']);
    expect(d.lineup.bench.map((r) => r.name)).toEqual(['Bench WR']);
    expect(d.lineup.starters[0].touchdowns).toBe(1); // thrown is not scored
    expect(d.lineup.starters[1].touchdowns).toBe(2);
    expect(d.lineup.starters[0].rank).toMatchObject({ positional: 1 });

    expect(d.totals).toMatchObject({ starterPoints: 43, optimalPoints: 55, benchPoints: 12 });
    expect(d.totals.efficiency).toBeCloseTo(43 / 55);
  });

  it('shows a rank only when a snapshot exists, and an older snapshot as legacy', () => {
    const week1 = buildWeekDossier(index, 'fA', 1);
    expect(week1.power).toMatchObject({ rank: 3, change: null, legacy: true });
    expect(week1.power.items).toEqual([{ key: 'performanceScore', label: 'Performance', value: 60 }]);

    const week2 = buildWeekDossier(index, 'fA', 2);
    expect(week2.power).toMatchObject({ rank: 2, change: 1, legacy: false });
    expect(week2.power.items.map((c) => c.key)).toEqual(['record', 'scoring']); // meta order, unknown keys dropped

    expect(buildWeekDossier(index, 'fB', 1).power).toBeNull();
  });

  it('never turns a missing result into zero', () => {
    const d = buildWeekDossier(index, 'fA', 2);
    expect(d.lineup.starters.find((r) => r.playerId === 'p2').actualPoints).toBeNull();
    expect(d.totals).toMatchObject({ starterPoints: null, optimalPoints: null, efficiency: null });
  });

  it('keeps each part independent for a week in progress', () => {
    const d = buildWeekDossier(index, 'fA', 3);
    expect(d.matchup).toMatchObject({ result: null, pointsFor: null });
    expect(d.lineup.hasLineup).toBe(false);
    expect(d.totals).toBeNull();
    expect(d.power).toBeNull();
  });

  it('reads a postseason bye against the final regular-season table', () => {
    const d = buildWeekDossier(index, 'fA', 4);
    expect(d.isPostseason).toBe(true);
    expect(d.matchup.isBye).toBe(true);
    expect(d.record).toEqual({ wins: 1, losses: 1, ties: 0 });
  });

  it('lists moves with direction, and without a side where none was stored', () => {
    const week1 = buildWeekDossier(index, 'fA', 1).moves;
    const waiver = week1.find((m) => m.kind === 'waiver');
    expect(waiver.bidAmount).toBe(14);
    expect(waiver.added.map((p) => p.name)).toEqual(['Added Guy']);
    expect(waiver.dropped.map((p) => p.name)).toEqual(['Dropped Guy']);
    expect(week1.find((m) => m.kind === 'free_agent').involved.map((p) => p.name)).toEqual(['Old Row']);

    const trade = buildWeekDossier(index, 'fA', 2).moves[0];
    expect(trade.kind).toBe('trade');
    expect(trade.counterparts.map((f) => f.id)).toEqual(['fC']);
    expect(trade.added.map((p) => p.name)).toEqual(['Incoming']);
    expect(trade.dropped.map((p) => p.name)).toEqual(['Outgoing']);
  });

  it('is null for a franchise with no team that season', () => {
    expect(buildWeekDossier(index, 'fZ', 1)).toBeNull();
  });
});

describe('seasonArc', () => {
  it('plots the snapshot rank where one exists and the standing for played weeks', () => {
    const arc = seasonArc(buildSeasonIndex(seasonSource()), 'fA');
    expect(arc.map((p) => p.week)).toEqual([1, 2]);
    expect(arc.map((p) => p.powerRank)).toEqual([3, 2]);
    expect(arc.map((p) => p.standing)).toEqual([1, 3]); // wk2: C 1-0-1 leads; B beats A at 1-1 on PF
  });
});

describe('a future season needs no code change', () => {
  it('works for any year, lighting up whatever tiers have rows', () => {
    const source = seasonSource({ year: 2031, id: 's31' });
    const index = buildSeasonIndex(source);
    expect(franchiseWeekStrip(index, 'fA')).toHaveLength(4);
    expect(buildWeekDossier(index, 'fA', 2).power.rank).toBe(2);

    // Drop the snapshots: the same week renders without a rank, no year check involved.
    const noRanks = buildSeasonIndex({ ...source, ranks: [] });
    expect(buildWeekDossier(noRanks, 'fA', 2).power).toBeNull();
    expect(buildWeekDossier(noRanks, 'fA', 2).matchup.result).toBe('L');
  });
});

describe('buildPlayerSeason', () => {
  const index = buildSeasonIndex(seasonSource());

  it("summarizes a player's weeks, ranks and splits over scored weeks only", () => {
    const { weeks, splits } = buildPlayerSeason(index, 'p1');
    expect(weeks.map((w) => w.actualPoints)).toEqual([25, 22]);
    expect(weeks[0].rank).toMatchObject({ overall: 2, positional: 1 });
    expect(splits).toMatchObject({ total: 47, games: 2, average: 23.5, best: { week: 1 }, worst: { week: 2 } });

    const bijan = buildPlayerSeason(index, 'p2');
    expect(bijan.splits).toMatchObject({ games: 1, rostered: 2 });
    expect(bijan.weeks[1].rank).toBeNull();
  });
});

describe('buildPlayerCareer', () => {
  it('groups by season, newest first, and splits stints on a team change or gap', () => {
    const row = (year, week, franchiseId, started = true, actualPoints = 10) =>
      ({ seasonId: `s${year}`, year, week, teamId: `t${franchiseId}${year}`, franchiseId, teamName: franchiseId, owner: franchiseId, started, actualPoints });

    const career = buildPlayerCareer({
      weeks: [
        row(2025, 1, 'fA'), row(2025, 2, 'fA', false), row(2025, 3, 'fB'),
        row(2026, 1, 'fB'), row(2026, 3, 'fB')
      ]
    });

    expect(career.map((s) => s.year)).toEqual([2026, 2025]);
    expect(career[1].stints).toMatchObject([
      { franchiseId: 'fA', fromWeek: 1, toWeek: 2, weeks: 2, starts: 1 },
      { franchiseId: 'fB', fromWeek: 3, toWeek: 3 }
    ]);
    expect(career[0].stints).toHaveLength(2); // week 2 gap breaks the stint
    expect(career[1].splits.total).toBe(30);
  });
});

describe('gamePhaseLabel', () => {
  it('names a postseason game by its type, not the calendar week', () => {
    expect(gamePhaseLabel('playoff_consolation_final')).toBe('Consolation');
    expect(gamePhaseLabel('playoff_championship')).toBe('Championship');
    expect(gamePhaseLabel('playoff_semifinals')).toBe('Semifinal');
    expect(gamePhaseLabel('playoff_first_round')).toBe('Playoffs, first round');
    expect(gamePhaseLabel('playoff')).toBe('Placement game');
    expect(gamePhaseLabel('bye')).toBe('Bye');
    expect(gamePhaseLabel('regular')).toBeNull();
    expect(gamePhaseLabel(undefined)).toBeNull();
  });

  it('badges the dossier of a postseason week', () => {
    const index = buildSeasonIndex(seasonSource());
    expect(buildWeekDossier(index, 'fB', 4).phase).toBe('Semifinal');
    expect(buildWeekDossier(index, 'fA', 4).phase).toBe('Bye');
    expect(buildWeekDossier(index, 'fA', 1).phase).toBeNull();
  });
});

describe('appeared', () => {
  it('treats a settled zero with no stat line as not playing', () => {
    expect(appeared({ actualPoints: 0, statBreakdown: null })).toBe(false);
    expect(appeared({ actualPoints: 0, statBreakdown: { 25: 0 } })).toBe(true);
    expect(appeared({ actualPoints: 0, hasStatLine: true })).toBe(true);
    expect(appeared({ actualPoints: -1, statBreakdown: null })).toBe(true);
    expect(appeared({ actualPoints: null, statBreakdown: { 25: 1 } })).toBe(false);
  });

  it('keeps an injured week out of the rank pool and the average', () => {
    const source = seasonSource();
    source.playerWeeks.push({
      week: 1, teamId: 'tB', playerId: 'pIR', name: 'On IR', position: 'QB', slot: 'IR', started: false,
      actualPoints: 0, proTeamId: 1, proTeam: 'BUF', statBreakdown: null
    });
    const index = buildSeasonIndex(source);
    expect(index.playerRanksByWeek.get(1).has('pIR')).toBe(false);
    expect(index.playerRanksByWeek.get(1).get('p1').positionalOf).toBe(2);

    const season = buildPlayerSeason(index, 'pIR');
    expect(season.weeks[0].appeared).toBe(false);
    expect(season.splits).toBeNull();
  });
});
