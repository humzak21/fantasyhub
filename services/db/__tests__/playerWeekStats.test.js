/**
 * The write path's job is to turn ESPN ids into database ids without losing
 * rows quietly. The failures worth catching here all look like success: a
 * player skipped because their team could not be resolved, an upsert without a
 * conflict target that duplicates a week on the second run, a grouping that
 * hands the calculator a shape it reads as "no data".
 */

import { describe, it, expect } from 'vitest';
import { makeCtx } from './fakeClient.js';
import { upsertPlayerWeekStats, getPlayerWeekStats } from '../playerWeekStats.js';

const SEASON = 'season-1';
const WEEK = 4;

const teams = [
  { id: 'team-a', espn_team_id: 1, owner: 'Alice' },
  { id: 'team-b', espn_team_id: 2, owner: 'Bob' }
];

const mapped = (overrides = {}) => ({
  espnTeamId: 1,
  espnPlayerId: 101,
  playerName: 'A Quarterback',
  defaultPositionId: 1,
  position: 'QB',
  proTeamId: 12,
  lineupSlotId: 0,
  started: true,
  actualPoints: 21.4,
  projectedPoints: 19.8,
  injuryStatus: 'ACTIVE',
  ...overrides
});

/** Every player already exists, so no `players` write is expected. */
const existingPlayers = (rows) => ({
  'players.select': () => rows,
  'player_week_stats.upsert': () => []
});

describe('upsertPlayerWeekStats', () => {
  it('resolves teams by ESPN id and players by ESPN player id', async () => {
    const ctx = makeCtx(existingPlayers([{ id: 'player-1', espn_player_id: 101 }]));

    const result = await upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped()], teams);

    expect(result.upserted).toBe(1);

    const [{ payload }] = ctx.client.callsFor('player_week_stats', 'upsert');
    expect(payload[0]).toMatchObject({
      season_id: SEASON,
      week: WEEK,
      team_id: 'team-a',
      player_id: 'player-1',
      espn_player_id: 101,
      lineup_slot_id: 0,
      roster_slot: 'QB',
      started: true,
      position: 'QB',
      actual_points: 21.4,
      projected_points: 19.8
    });
  });

  it('conflicts on (season, week, player), so re-running a week rewrites it', async () => {
    // Without this exact target the second sync of a week inserts a second copy
    // of every player, and the calculator averages a doubled roster.
    const ctx = makeCtx(existingPlayers([{ id: 'player-1', espn_player_id: 101 }]));

    await upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped()], teams);

    const [{ options }] = ctx.client.callsFor('player_week_stats', 'upsert');
    expect(options.onConflict).toBe('season_id,week,player_id');
    expect(options.ignoreDuplicates).toBe(false);
  });

  it('maps the multi-position slots through the fixed slot map', async () => {
    const ctx = makeCtx(existingPlayers([{ id: 'player-1', espn_player_id: 101 }]));

    await upsertPlayerWeekStats(
      ctx, SEASON, WEEK, [mapped({ lineupSlotId: 5, position: 'WR' })], teams
    );

    const [{ payload }] = ctx.client.callsFor('player_week_stats', 'upsert');
    expect(payload[0].roster_slot).toBe('FLEX');
  });

  it('skips a player whose ESPN team is not in this season, and says which', async () => {
    const ctx = makeCtx(
      existingPlayers([
        { id: 'player-1', espn_player_id: 101 },
        { id: 'player-2', espn_player_id: 102 }
      ])
    );

    const result = await upsertPlayerWeekStats(
      ctx, SEASON, WEEK, [mapped(), mapped({ espnTeamId: 99, espnPlayerId: 102 })], teams
    );

    expect(result.upserted).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ espnPlayerId: 102, espnTeamId: 99 });
    expect(result.skipped[0].reason).toMatch(/no team with ESPN id 99/);
  });

  it('creates the players it has never seen, in one batch', async () => {
    const created = [];
    const ctx = makeCtx({
      'players.select': () => [{ id: 'player-1', espn_player_id: 101 }],
      'players.upsert': (call) => {
        created.push(call.payload);
        return call.payload.map((row, index) => ({
          id: `new-${index}`,
          espn_player_id: row.espn_player_id
        }));
      },
      'player_week_stats.upsert': () => []
    });

    const result = await upsertPlayerWeekStats(
      ctx,
      SEASON,
      WEEK,
      [
        mapped(),
        mapped({ espnPlayerId: 102, playerName: 'A Rookie', position: 'RB', lineupSlotId: 2 })
      ],
      teams
    );

    expect(result.playersCreated).toBe(1);
    expect(created).toHaveLength(1);
    expect(created[0][0]).toMatchObject({
      espn_player_id: 102,
      name: 'A Rookie',
      position: 'RB',
      team_abbreviation: 'KC'
    });

    const [{ payload }] = ctx.client.callsFor('player_week_stats', 'upsert');
    expect(payload.map((row) => row.player_id)).toEqual(['player-1', 'new-0']);
  });

  it('refuses to invent a position for an unmappable player', async () => {
    // `players.position` is NOT NULL with a CHECK constraint; guessing here
    // would either fail the whole batch or store a lie.
    const ctx = makeCtx({
      'players.select': () => [],
      'player_week_stats.upsert': () => []
    });

    const result = await upsertPlayerWeekStats(
      ctx,
      SEASON,
      WEEK,
      [mapped({ espnPlayerId: 500, position: null, defaultPositionId: 10 })],
      teams
    );

    expect(result.upserted).toBe(0);
    expect(result.playersCreated).toBe(0);
    expect(result.skipped[0].reason).toMatch(/unmappable position 10/);
    expect(ctx.client.callsFor('players', 'upsert')).toHaveLength(0);
  });

  it('writes a player once even if ESPN lists them twice', async () => {
    const ctx = makeCtx(existingPlayers([{ id: 'player-1', espn_player_id: 101 }]));

    const result = await upsertPlayerWeekStats(
      ctx, SEASON, WEEK, [mapped(), mapped()], teams
    );

    expect(result.upserted).toBe(1);
  });

  it('does nothing, and writes nothing, for an empty batch', async () => {
    const ctx = makeCtx({});
    const result = await upsertPlayerWeekStats(ctx, SEASON, WEEK, [], teams);

    expect(result).toEqual({ upserted: 0, playersCreated: 0, skipped: [] });
    expect(ctx.client.calls).toHaveLength(0);
  });

  it('leaves injury status null when ESPN reported none, rather than claiming ACTIVE', async () => {
    const ctx = makeCtx(existingPlayers([{ id: 'player-1', espn_player_id: 101 }]));

    await upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped({ injuryStatus: null })], teams);

    const [{ payload }] = ctx.client.callsFor('player_week_stats', 'upsert');
    expect(payload[0].injury_status).toBeNull();
  });
});

describe('getPlayerWeekStats', () => {
  const rows = [
    { team_id: 'team-a', week: 1, player_id: 'p1', started: true, actual_points: 20 },
    { team_id: 'team-a', week: 1, player_id: 'p2', started: false, actual_points: 5 },
    { team_id: 'team-a', week: 2, player_id: 'p1', started: true, actual_points: 18 },
    { team_id: 'team-b', week: 1, player_id: 'p3', started: true, actual_points: 12 }
  ];

  it('groups by team and then by week, the shape the calculator reads', async () => {
    const ctx = makeCtx({ 'player_week_stats.select': () => rows });

    const grouped = await getPlayerWeekStats(ctx, SEASON);

    expect(Object.keys(grouped).sort()).toEqual(['team-a', 'team-b']);
    expect(Object.keys(grouped['team-a']).sort()).toEqual(['1', '2']);
    expect(grouped['team-a'][1]).toHaveLength(2);
    expect(grouped['team-b'][1]).toHaveLength(1);
  });

  it('camelizes the rows on the way out', async () => {
    const ctx = makeCtx({ 'player_week_stats.select': () => rows });

    const grouped = await getPlayerWeekStats(ctx, SEASON);

    expect(grouped['team-a'][1][0]).toMatchObject({ actualPoints: 20, started: true });
  });

  it('applies throughWeek as an exclusive cutoff, matching the calculator', async () => {
    const ctx = makeCtx({ 'player_week_stats.select': () => [] });

    await getPlayerWeekStats(ctx, SEASON, { throughWeek: 5 });

    const [call] = ctx.client.callsFor('player_week_stats', 'select');
    expect(call.filters['lt:week']).toBe(5);
    expect(call.filters.season_id).toBe(SEASON);
  });

  it('returns an empty grouping, not a throw, when a season has no rows', async () => {
    const ctx = makeCtx({ 'player_week_stats.select': () => [] });
    expect(await getPlayerWeekStats(ctx, SEASON)).toEqual({});
  });
});
