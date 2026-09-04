/**
 * The mapper reads a payload shape that is easy to get subtly wrong: a player's
 * `stats` array holds one entry per (source, split, scoring period), and three
 * of the four ways to select from it return a plausible number that is not the
 * projection. These fixtures are trimmed from a real
 * `rosterForCurrentScoringPeriod` response.
 */

import { describe, it, expect } from 'vitest';
import {
  mapMatchupRosterEntries,
  findProjectedPoints,
  findStatBreakdown,
  isMatchupDecided,
  mapDefaultPositionId
} from '../espnPlayerStatsMapper.js';

const WEEK = 5;

/**
 * @param overrides `{ id, name, positionId, slot, applied, projected, actual, injury }`
 */
const entry = ({
  id,
  name,
  positionId,
  slot,
  applied = null,
  projected = null,
  injury = 'ACTIVE',
  extraStats = []
}) => ({
  playerId: id,
  lineupSlotId: slot,
  playerPoolEntry: {
    id,
    ...(applied === null ? {} : { appliedStatTotal: applied }),
    player: {
      id,
      fullName: name,
      defaultPositionId: positionId,
      proTeamId: 12,
      injuryStatus: injury,
      stats: [
        ...(projected === null
          ? []
          : [
              {
                scoringPeriodId: WEEK,
                statSourceId: 1,
                statSplitTypeId: 1,
                appliedTotal: projected
              }
            ]),
        ...extraStats
      ]
    }
  }
});

/**
 * A finished week by default (`espnWinner: 'HOME'`), which is what most of
 * these cases are about. Pass `{ winner: 'UNDECIDED' }` for a week in progress.
 */
const matchup = (homeTeamId, homeEntries, awayTeamId, awayEntries, { winner = 'HOME' } = {}) => ({
  homeTeam: {
    teamId: homeTeamId,
    rosterForCurrentScoringPeriod: { entries: homeEntries }
  },
  awayTeam: {
    teamId: awayTeamId,
    rosterForCurrentScoringPeriod: { entries: awayEntries }
  },
  espnWinner: winner
});

/** A week-5 actual stat line, the evidence that a game was played. */
const weekStatLine = (appliedTotal, stats = { 24: 40, 25: 0 }) => ({
  scoringPeriodId: WEEK,
  statSourceId: 0,
  statSplitTypeId: 1,
  appliedTotal,
  stats
});

describe('mapDefaultPositionId', () => {
  it('maps the offensive positions and the defense', () => {
    expect(mapDefaultPositionId(1)).toBe('QB');
    expect(mapDefaultPositionId(2)).toBe('RB');
    expect(mapDefaultPositionId(3)).toBe('WR');
    expect(mapDefaultPositionId(4)).toBe('TE');
    expect(mapDefaultPositionId(5)).toBe('K');
    expect(mapDefaultPositionId(16)).toBe('D/ST');
  });

  it('returns null for an IDP id rather than inventing a position', () => {
    // A wrong position corrupts the optimal-lineup calculation silently.
    expect(mapDefaultPositionId(10)).toBeNull();
    expect(mapDefaultPositionId(undefined)).toBeNull();
  });
});

describe('findProjectedPoints', () => {
  const player = {
    stats: [
      // The actual result for this week — same period and split, source 0.
      { scoringPeriodId: WEEK, statSourceId: 0, statSplitTypeId: 1, appliedTotal: 24.6 },
      // The season projection — same source, split 0.
      { scoringPeriodId: WEEK, statSourceId: 1, statSplitTypeId: 0, appliedTotal: 288.4 },
      // Last week's projection — same source and split, wrong period.
      { scoringPeriodId: WEEK - 1, statSourceId: 1, statSplitTypeId: 1, appliedTotal: 17.2 },
      // The one we want.
      { scoringPeriodId: WEEK, statSourceId: 1, statSplitTypeId: 1, appliedTotal: 19.8 }
    ]
  };

  it('picks the projection for this week, not the actual, the season, or last week', () => {
    expect(findProjectedPoints(player, WEEK)).toBe(19.8);
  });

  it('returns null when the week has no projection', () => {
    expect(findProjectedPoints(player, 12)).toBeNull();
    expect(findProjectedPoints({}, WEEK)).toBeNull();
  });
});

describe('mapMatchupRosterEntries', () => {
  const entries = [
    entry({ id: 1, name: 'A Quarterback', positionId: 1, slot: 0, applied: 21.4, projected: 19.8 }),
    entry({ id: 2, name: 'A Runner', positionId: 2, slot: 2, applied: 14.2, projected: 12.0 }),
    entry({ id: 3, name: 'A Flex Runner', positionId: 2, slot: 3, applied: 9.1, projected: 8.5 }),
    entry({ id: 4, name: 'A Flex Receiver', positionId: 3, slot: 5, applied: 11.7, projected: 10.1 }),
    entry({ id: 5, name: 'An Op', positionId: 3, slot: 7, applied: 6.3, projected: 7.0 }),
    entry({ id: 6, name: 'A Defense', positionId: 16, slot: 16, applied: 8.0, projected: 6.5 }),
    entry({ id: 7, name: 'A Flex', positionId: 3, slot: 23, applied: 15.5, projected: 13.3 }),
    entry({ id: 8, name: 'A Benchwarmer', positionId: 2, slot: 20, applied: 30.9, projected: 4.0 }),
    entry({ id: 9, name: 'An Injured Man', positionId: 3, slot: 21, applied: 0, projected: 0, injury: 'OUT' })
  ];

  const rows = mapMatchupRosterEntries([matchup(1, entries, 2, [])], WEEK);

  it('returns one row per rostered player, bench and IR included', () => {
    expect(rows).toHaveLength(9);
  });

  it('counts every slot but the bench and IR as a start', () => {
    const started = rows.filter((row) => row.started).map((row) => row.espnPlayerId);
    expect(started).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const benched = rows.filter((row) => !row.started).map((row) => row.espnPlayerId);
    expect(benched).toEqual([8, 9]);
  });

  it('keeps the raw ESPN slot alongside the derived flag', () => {
    expect(rows.find((row) => row.espnPlayerId === 3).lineupSlotId).toBe(3);
    expect(rows.find((row) => row.espnPlayerId === 9).lineupSlotId).toBe(21);
  });

  it('reads actual points from the pool entry total', () => {
    expect(rows.find((row) => row.espnPlayerId === 1).actualPoints).toBe(21.4);
  });

  it('reads the projection for this week', () => {
    expect(rows.find((row) => row.espnPlayerId === 1).projectedPoints).toBe(19.8);
  });

  it('carries name, position and injury status through', () => {
    const quarterback = rows.find((row) => row.espnPlayerId === 1);
    expect(quarterback.playerName).toBe('A Quarterback');
    expect(quarterback.position).toBe('QB');
    expect(rows.find((row) => row.espnPlayerId === 9).injuryStatus).toBe('OUT');
  });

  it('tags every row with the ESPN team that rostered the player', () => {
    expect(new Set(rows.map((row) => row.espnTeamId))).toEqual(new Set([1]));
  });

  it('walks both sides of a matchup', () => {
    const both = mapMatchupRosterEntries(
      [matchup(1, entries.slice(0, 2), 2, entries.slice(2, 5))],
      WEEK
    );
    expect(both.filter((row) => row.espnTeamId === 1)).toHaveLength(2);
    expect(both.filter((row) => row.espnTeamId === 2)).toHaveLength(3);
  });

  it('falls back to a week stat line when the pool entry has no applied total', () => {
    const withoutTotal = entry({
      id: 20,
      name: 'No Total',
      positionId: 2,
      slot: 2,
      applied: null,
      projected: 8.0,
      extraStats: [
        { scoringPeriodId: WEEK, statSourceId: 0, statSplitTypeId: 1, appliedTotal: 13.5 }
      ]
    });

    const [row] = mapMatchupRosterEntries([matchup(1, [withoutTotal], 2, [])], WEEK);
    expect(row.actualPoints).toBe(13.5);
  });

  it('skips a side ESPN has not populated instead of throwing', () => {
    expect(mapMatchupRosterEntries([{ homeTeam: { teamId: 1 }, awayTeam: null }], WEEK)).toEqual([]);
    expect(mapMatchupRosterEntries([{}], WEEK)).toEqual([]);
    expect(mapMatchupRosterEntries([], WEEK)).toEqual([]);
    expect(mapMatchupRosterEntries(undefined, WEEK)).toEqual([]);
  });

  /**
   * ESPN reports `appliedStatTotal: 0` for every player from the moment a week
   * opens, days before kickoff, and a 0 stored as an actual is a result to
   * every reader — a bare "0.0" where the projection should be, and a team
   * total that calls itself final. This is the bug that put zeros beside every
   * starter on Schedule and in the pick'ems research panel on 2026-09-04.
   */
  describe('while the matchup is undecided', () => {
    const undecided = { winner: 'UNDECIDED' };

    it('does not take a 0 total with no stat line as a result', () => {
      const notYetPlayed = entry({ id: 30, name: 'Sunday Starter', positionId: 3, slot: 4, applied: 0, projected: 11.2 });

      const [row] = mapMatchupRosterEntries([matchup(1, [notYetPlayed], 2, [], undecided)], WEEK);
      expect(row.actualPoints).toBeNull();
      expect(row.projectedPoints).toBe(11.2);
      expect(row.statBreakdown).toBeNull();
    });

    it('takes the total once ESPN has a stat line for the player', () => {
      // Thursday's game is over; ESPN has categories for him even though the
      // matchup as a whole is still open.
      const played = entry({
        id: 31, name: 'Thursday Starter', positionId: 2, slot: 2,
        applied: 14.2, projected: 12.0, extraStats: [weekStatLine(14.2, { 24: 88, 25: 1 })]
      });

      const [row] = mapMatchupRosterEntries([matchup(1, [played], 2, [], undecided)], WEEK);
      expect(row.actualPoints).toBe(14.2);
      expect(row.statBreakdown).toEqual({ 24: 88, 25: 1 });
    });

    it('takes a scored 0 that has a stat line behind it', () => {
      // He played and did nothing. ESPN still lists his categories.
      const blanked = entry({
        id: 32, name: 'Blanked', positionId: 3, slot: 4,
        applied: 0, projected: 9.0, extraStats: [weekStatLine(0, { 42: 0, 53: 0 })]
      });

      const [row] = mapMatchupRosterEntries([matchup(1, [blanked], 2, [], undecided)], WEEK);
      expect(row.actualPoints).toBe(0);
    });

    it('treats a matchup with no verdict as undecided', () => {
      const notYetPlayed = entry({ id: 33, name: 'No Verdict', positionId: 1, slot: 0, applied: 0, projected: 18.0 });
      const noVerdict = { ...matchup(1, [notYetPlayed], 2, []), espnWinner: null };

      const [row] = mapMatchupRosterEntries([noVerdict], WEEK);
      expect(row.actualPoints).toBeNull();
    });
  });

  describe('once the matchup is decided', () => {
    it('keeps a 0 total with no stat line as a genuine 0', () => {
      // The inactive starter after the week is over. ESPN's matchup score
      // counted him as 0, and so must the lineup underneath it.
      const inactive = entry({ id: 40, name: 'Inactive', positionId: 3, slot: 4, applied: 0, projected: 12.0, injury: 'OUT' });

      for (const winner of ['HOME', 'AWAY', 'TIE']) {
        const [row] = mapMatchupRosterEntries([matchup(1, [inactive], 2, [], { winner })], WEEK);
        expect(row.actualPoints).toBe(0);
      }
    });
  });

  it('handles a bye, where only one side exists', () => {
    const bye = {
      homeTeam: { teamId: 3, rosterForCurrentScoringPeriod: { entries: entries.slice(0, 2) } },
      awayTeam: { teamId: null }
    };
    expect(mapMatchupRosterEntries([bye], WEEK)).toHaveLength(2);
  });
});

/**
 * The per-category stat map, which rides in the same `stats` array as the
 * points and is selected by the same three predicates with the source flipped.
 * Getting the predicates wrong here does not produce a missing value — it
 * produces a season-to-date total sitting in a single week's row.
 */
describe('findStatBreakdown', () => {
  const weekActual = {
    scoringPeriodId: WEEK,
    statSourceId: 0,
    statSplitTypeId: 1,
    appliedTotal: 20.3,
    stats: { 24: 88, 25: 1, 42: 31, 43: 1 }
  };

  const seasonActual = {
    scoringPeriodId: 0,
    statSourceId: 0,
    statSplitTypeId: 0,
    appliedTotal: 366.9,
    stats: { 24: 1223, 25: 13, 42: 616, 43: 5 }
  };

  const weekProjection = {
    scoringPeriodId: WEEK,
    statSourceId: 1,
    statSplitTypeId: 1,
    appliedTotal: 18.4,
    stats: { 24: 70, 25: 0.6 }
  };

  const lastWeekActual = {
    scoringPeriodId: WEEK - 1,
    statSourceId: 0,
    statSplitTypeId: 1,
    appliedTotal: 6.4,
    stats: { 24: 40, 25: 0 }
  };

  it('returns this week’s actual categories verbatim', () => {
    const player = { stats: [seasonActual, weekProjection, weekActual, lastWeekActual] };

    expect(findStatBreakdown(player, WEEK)).toEqual({ 24: 88, 25: 1, 42: 31, 43: 1 });
  });

  it('does not pick up the season total', () => {
    // Split 0 is the season to date. It is the first entry here on purpose:
    // a `find` missing the split predicate would return 13 rushing TDs for one
    // week, and the error would grow every week rather than being noticed.
    const player = { stats: [seasonActual] };

    expect(findStatBreakdown(player, WEEK)).toBeNull();
  });

  it('does not pick up the projection or another week', () => {
    expect(findStatBreakdown({ stats: [weekProjection] }, WEEK)).toBeNull();
    expect(findStatBreakdown({ stats: [lastWeekActual] }, WEEK)).toBeNull();
  });

  it('is null rather than {} when ESPN reported no categories', () => {
    // An empty object asserts a player who did nothing; null says we do not
    // know. They are different claims and the grading gate depends on which.
    expect(findStatBreakdown({ stats: [{ ...weekActual, stats: {} }] }, WEEK)).toBeNull();
    expect(findStatBreakdown({ stats: [{ ...weekActual, stats: undefined }] }, WEEK)).toBeNull();
    expect(findStatBreakdown({}, WEEK)).toBeNull();
    expect(findStatBreakdown(null, WEEK)).toBeNull();
  });

  it('rides along on the mapped rows', () => {
    const rows = mapMatchupRosterEntries(
      [
        matchup(
          1,
          [entry({ id: 10, name: 'Jahmyr Gibbs', positionId: 2, slot: 2, extraStats: [weekActual] })],
          2,
          []
        )
      ],
      WEEK
    );

    expect(rows[0].statBreakdown).toEqual({ 24: 88, 25: 1, 42: 31, 43: 1 });
  });
});

describe('isMatchupDecided', () => {
  it('is true for any of ESPN\'s three verdicts', () => {
    expect(isMatchupDecided({ espnWinner: 'HOME' })).toBe(true);
    expect(isMatchupDecided({ espnWinner: 'AWAY' })).toBe(true);
    expect(isMatchupDecided({ espnWinner: 'TIE' })).toBe(true);
  });

  it('is false while undecided, and when there is no verdict to read', () => {
    expect(isMatchupDecided({ espnWinner: 'UNDECIDED' })).toBe(false);
    expect(isMatchupDecided({ espnWinner: null })).toBe(false);
    expect(isMatchupDecided({})).toBe(false);
    expect(isMatchupDecided(null)).toBe(false);
  });
});
