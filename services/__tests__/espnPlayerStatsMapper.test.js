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

const matchup = (homeTeamId, homeEntries, awayTeamId, awayEntries) => ({
  homeTeam: {
    teamId: homeTeamId,
    rosterForCurrentScoringPeriod: { entries: homeEntries }
  },
  awayTeam: {
    teamId: awayTeamId,
    rosterForCurrentScoringPeriod: { entries: awayEntries }
  }
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

  it('handles a bye, where only one side exists', () => {
    const bye = {
      homeTeam: { teamId: 3, rosterForCurrentScoringPeriod: { entries: entries.slice(0, 2) } },
      awayTeam: { teamId: null }
    };
    expect(mapMatchupRosterEntries([bye], WEEK)).toHaveLength(2);
  });
});
