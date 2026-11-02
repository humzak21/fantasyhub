/**
 * The write path's job is to turn ESPN ids into database ids without losing
 * rows quietly. The failures worth catching here all look like success: a
 * player skipped because their team could not be resolved, an upsert without a
 * conflict target that duplicates a week on the second run, a grouping that
 * hands the calculator a shape it reads as "no data".
 */

import { describe, it, expect } from 'vitest';
import { makeCtx } from './fakeClient.js';
import {
  upsertPlayerWeekStats,
  getPlayerWeekStats,
  findLeftBehindRows
} from '../playerWeekStats.js';

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
const existingPlayers = (rows, storedWeek = []) => ({
  'players.select': () => rows,
  'player_week_stats.select': () => storedWeek,
  'player_week_stats.upsert': () => [],
  'player_week_stats.delete': ({ filters }) => filters['in:id'].map((id) => ({ id })),
  'team_week_lineups.upsert': () => []
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
      'player_week_stats.select': () => [],
      'player_week_stats.upsert': () => [],
      'team_week_lineups.upsert': () => []
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
      'player_week_stats.upsert': () => [],
  'team_week_lineups.upsert': () => []
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

describe('upsertPlayerWeekStats · team_week_lineups', () => {
  it('stores each settled team week beside its player rows, and skips an unsettled one', async () => {
    const ctx = makeCtx(existingPlayers([
      { id: 'player-1', espn_player_id: 101 },
      { id: 'player-2', espn_player_id: 102 },
      { id: 'player-3', espn_player_id: 103 }
    ]));

    await upsertPlayerWeekStats(ctx, SEASON, WEEK, [
      // Team A started a 20-point quarterback over a 25-point one on the bench.
      mapped({ espnPlayerId: 101, actualPoints: 20 }),
      mapped({ espnPlayerId: 102, lineupSlotId: 20, started: false, actualPoints: 25 }),
      // Team B's starter has not played yet: a projection is not a lineup result.
      mapped({ espnTeamId: 2, espnPlayerId: 103, actualPoints: null })
    ], teams);

    const [{ payload, options }] = ctx.client.callsFor('team_week_lineups', 'upsert');
    expect(options.onConflict).toBe('season_id,week,team_id');
    expect(payload).toEqual([
      expect.objectContaining({
        season_id: SEASON,
        week: WEEK,
        team_id: 'team-a',
        starter_points: 20,
        optimal_points: 25,
        starters_scoring: 1
      })
    ]);
  });
});

/**
 * Tuesday's write holds that week's rosters as they stood on Tuesday. A player
 * dropped before kickoff is not in the finished week's payload, and an upsert
 * can only touch the players it names, so his row stayed: a starter with a
 * projection and no result, in a lineup ESPN says he was never in.
 */
describe('upsertPlayerWeekStats · rows ESPN no longer reports', () => {
  const stored = (overrides = {}) => ({
    id: 'row-1',
    team_id: 'team-a',
    espn_player_id: 101,
    roster_slot: 'QB',
    started: true,
    actual_points: 21.4,
    projected_points: 19.8,
    ...overrides
  });

  const players = [
    { id: 'player-1', espn_player_id: 101 },
    { id: 'player-2', espn_player_id: 102 }
  ];

  it('removes a starter dropped after the projection write, and only him', async () => {
    const ctx = makeCtx(existingPlayers(players, [
      stored(),
      stored({ id: 'row-dropped', espn_player_id: 555, actual_points: null, projected_points: 13.17 })
    ]));

    const result = await upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped()], teams);

    expect(result.removed).toBe(1);
    const [{ filters }] = ctx.client.callsFor('player_week_stats', 'delete');
    expect(filters['in:id']).toEqual(['row-dropped']);
  });

  it('removes a dropped bench player too', async () => {
    const ctx = makeCtx(existingPlayers(players, [
      stored({ id: 'row-bench', espn_player_id: 556, roster_slot: 'BE', started: false, actual_points: null })
    ]));

    await upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped()], teams);

    const [{ filters }] = ctx.client.callsFor('player_week_stats', 'delete');
    expect(filters['in:id']).toEqual(['row-bench']);
  });

  it('reads the stored week after the upsert, so a run that failed removes nothing', async () => {
    const ctx = makeCtx({
      ...existingPlayers(players, [stored({ id: 'row-dropped', espn_player_id: 555 })]),
      'player_week_stats.upsert': () => {
        throw new Error('upsert refused');
      }
    });

    await expect(upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped()], teams)).rejects.toThrow();
    expect(ctx.client.callsFor('player_week_stats', 'delete')).toHaveLength(0);
  });

  it('keeps a player ESPN now reports on another team, which the upsert has moved', async () => {
    const ctx = makeCtx(existingPlayers(players, [stored({ id: 'row-moved', espn_player_id: 102 })]));

    const result = await upsertPlayerWeekStats(ctx, SEASON, WEEK, [
      mapped(),
      mapped({ espnTeamId: 2, espnPlayerId: 102 })
    ], teams);

    expect(result.removed).toBe(0);
    expect(ctx.client.callsFor('player_week_stats', 'delete')).toHaveLength(0);
  });

  it('leaves a team the payload says nothing about', async () => {
    // A side with no roster is ESPN not knowing, not ESPN saying nobody played.
    const ctx = makeCtx(existingPlayers(players, [
      stored({ id: 'row-b', team_id: 'team-b', espn_player_id: 202 })
    ]));

    const result = await upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped()], teams);

    expect(result.removed).toBe(0);
    expect(ctx.client.callsFor('player_week_stats', 'delete')).toHaveLength(0);
  });

  it('removes nothing from a week ESPN returned no rosters for', async () => {
    // 2024 week 1: the league was wiped and restarted, so ESPN has no rosters.
    const ctx = makeCtx(existingPlayers(players, [stored()]));

    await upsertPlayerWeekStats(ctx, SEASON, WEEK, [], teams);

    expect(ctx.client.calls).toHaveLength(0);
  });

  it('removes nothing when no row in the payload could be written', async () => {
    const ctx = makeCtx(existingPlayers(players, [stored()]));

    await upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped({ espnTeamId: 99 })], teams);

    expect(ctx.client.callsFor('player_week_stats', 'delete')).toHaveLength(0);
  });

  it('keeps a stored row with no ESPN id, which nothing can compare', async () => {
    const ctx = makeCtx(existingPlayers(players, [stored({ id: 'row-unknown', espn_player_id: null })]));

    const result = await upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped()], teams);

    expect(result.removed).toBe(0);
  });

  it('still writes the settled lineup, and says so when the delete fails', async () => {
    const ctx = makeCtx({
      ...existingPlayers(players, [stored({ id: 'row-dropped', espn_player_id: 555 })]),
      'player_week_stats.delete': () => {
        throw new Error('delete refused');
      }
    });

    await expect(upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped()], teams)).rejects.toThrow();
    expect(ctx.client.callsFor('team_week_lineups', 'upsert')).toHaveLength(1);
  });

  it('counts what the database deleted, not what it was asked to', async () => {
    // RLS refuses a delete by matching no rows, with no error.
    const ctx = makeCtx({
      ...existingPlayers(players, [stored({ id: 'row-dropped', espn_player_id: 555 })]),
      'player_week_stats.delete': () => []
    });

    const result = await upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped()], teams);

    expect(result.removed).toBe(0);
  });

  it('scopes the read to one week of one season', async () => {
    const ctx = makeCtx(existingPlayers(players, []));

    await upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped()], teams);

    const [{ filters }] = ctx.client.callsFor('player_week_stats', 'select');
    expect(filters).toMatchObject({ season_id: SEASON, week: WEEK });
  });
});

describe('findLeftBehindRows', () => {
  it('answers the repair script without creating a player or writing a row', async () => {
    const ctx = makeCtx({
      'player_week_stats.select': () => [
        { id: 'row-1', team_id: 'team-a', espn_player_id: 101 },
        { id: 'row-2', team_id: 'team-a', espn_player_id: 555, actual_points: null }
      ]
    });

    const rows = await findLeftBehindRows(ctx, SEASON, WEEK, [mapped()], teams);

    expect(rows.map((row) => row.id)).toEqual(['row-2']);
    expect(rows[0].espnPlayerId).toBe(555);
    expect(ctx.client.calls.every((call) => call.op === 'select')).toBe(true);
  });

  it('asks nothing when the payload covers no team', async () => {
    const ctx = makeCtx({});

    expect(await findLeftBehindRows(ctx, SEASON, WEEK, [], teams)).toEqual([]);
    expect(ctx.client.calls).toHaveLength(0);
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

  it('reads past the 1,000-row cap, which a season crosses by week 6', async () => {
    // ~190 rows a week: eight weeks is 1,520. Served a page at a time, as
    // PostgREST does, so an unpaged read would see weeks 1-5 and part of 6.
    const season = Array.from({ length: 1520 }, (_, i) => ({
      team_id: 'team-a',
      week: Math.floor(i / 190) + 1,
      player_id: `p${i}`,
      started: true,
      actual_points: 10
    }));
    const ctx = makeCtx({
      'player_week_stats.select': ({ range }) => (range ? season.slice(range[0], range[1] + 1) : season.slice(0, 1000))
    });

    const grouped = await getPlayerWeekStats(ctx, SEASON);

    expect(Object.keys(grouped['team-a']).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(grouped['team-a'][8]).toHaveLength(190);
  });
});

/**
 * The per-category map. Written straight through — the mapper decides what it
 * contains and the derivation helpers decide what it means, so the writer's
 * only job is to not drop it and not invent one.
 */
describe('upsertPlayerWeekStats · stat_breakdown', () => {
  it('writes the breakdown the mapper produced', async () => {
    const ctx = makeCtx(existingPlayers([{ id: 'player-1', espn_player_id: 101 }]));
    const breakdown = { 3: 288, 4: 3, 20: 1 };

    await upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped({ statBreakdown: breakdown })], teams);

    const [{ payload }] = ctx.client.callsFor('player_week_stats', 'upsert');
    expect(payload[0].stat_breakdown).toEqual(breakdown);
  });

  it('writes null, not {}, when the mapper found no categories', async () => {
    const ctx = makeCtx(existingPlayers([{ id: 'player-1', espn_player_id: 101 }]));

    await upsertPlayerWeekStats(ctx, SEASON, WEEK, [mapped()], teams);

    const [{ payload }] = ctx.client.callsFor('player_week_stats', 'upsert');
    // `stat_breakdown` is nullable and NULL means "not known". An empty object
    // would claim ESPN reported a player who did nothing.
    expect(payload[0].stat_breakdown).toBeNull();
  });
});
