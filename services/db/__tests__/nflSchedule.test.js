/**
 * The NFL calendar's reader and writer.
 *
 * Two behaviours here are load-bearing rather than incidental: the conflict
 * target, which is what makes the weekly re-upsert a rewrite instead of a
 * duplication, and throwing rather than returning `[]` on failure — a chip that
 * reads this prints "BYE", so an outage that came back empty would tell the
 * whole league it had a week off.
 */

import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import { getNflScheduleForSeason, upsertNflSchedule } from '../nflSchedule.js';
import { DbError } from '../errors.js';

const GAME_ROW = {
  season_year: 2026,
  week: 1,
  pro_team_id: 2,
  opponent_pro_team_id: 12,
  is_home: false,
  game_time: '2026-09-13T17:00:00.000Z',
  espn_game_id: 401872659,
  start_time_tbd: false,
  stats_official: false
};

const BYE_ROW = {
  season_year: 2026,
  week: 7,
  pro_team_id: 2,
  opponent_pro_team_id: null,
  is_home: null,
  game_time: null,
  espn_game_id: null,
  start_time_tbd: false,
  stats_official: false
};

describe('upsertNflSchedule', () => {
  it('upserts on (season_year, week, pro_team_id)', async () => {
    const ctx = makeCtx({ 'nfl_schedule.upsert': () => null });

    await upsertNflSchedule(ctx, 2026, [GAME_ROW]);

    const [call] = ctx.client.callsFor('nfl_schedule', 'upsert');
    expect(call.options).toEqual({
      onConflict: 'season_year,week,pro_team_id',
      ignoreDuplicates: false
    });
  });

  it('passes a bye row through with its nulls intact', async () => {
    const ctx = makeCtx({ 'nfl_schedule.upsert': () => null });

    const result = await upsertNflSchedule(ctx, 2026, [GAME_ROW, BYE_ROW]);

    const [call] = ctx.client.callsFor('nfl_schedule', 'upsert');
    const bye = call.payload.find((row) => row.week === 7);

    expect(bye).toMatchObject({
      pro_team_id: 2,
      opponent_pro_team_id: null,
      is_home: null,
      game_time: null,
      espn_game_id: null
    });
    expect(result.upserted).toBe(2);
  });

  it('stamps updated_at without touching the mapper’s rows', async () => {
    const ctx = makeCtx({ 'nfl_schedule.upsert': () => null });
    const input = { ...GAME_ROW };

    await upsertNflSchedule(ctx, 2026, [input]);

    const [call] = ctx.client.callsFor('nfl_schedule', 'upsert');
    expect(call.payload[0].updated_at).toEqual(expect.any(String));
    // The mapper's output is pure; the writer must not mutate it.
    expect(input).toEqual(GAME_ROW);
  });

  it('writes nothing for an empty plan', async () => {
    const ctx = makeCtx({});

    const result = await upsertNflSchedule(ctx, 2026, []);

    expect(result).toEqual({ upserted: 0, seasonYear: 2026 });
    expect(ctx.client.callsFor('nfl_schedule')).toHaveLength(0);
  });

  it('throws a DbError when the write fails', async () => {
    const ctx = makeCtx({
      'nfl_schedule.upsert': () => {
        throw new Error('duplicate key value violates unique constraint');
      }
    });

    await expect(upsertNflSchedule(ctx, 2026, [GAME_ROW])).rejects.toBeInstanceOf(DbError);
  });

  it('requires a season year', async () => {
    const ctx = makeCtx({});

    await expect(upsertNflSchedule(ctx, null, [GAME_ROW])).rejects.toThrow(
      /season year is required/
    );
  });
});

describe('getNflScheduleForSeason', () => {
  it('filters to the season and camelCases the rows', async () => {
    const ctx = makeCtx({ 'nfl_schedule.select': () => [GAME_ROW, BYE_ROW] });

    const rows = await getNflScheduleForSeason(ctx, 2026);

    expect(ctx.client.callsFor('nfl_schedule', 'select')[0].filters).toEqual({
      season_year: 2026
    });
    expect(rows[0]).toMatchObject({
      seasonYear: 2026,
      proTeamId: 2,
      opponentProTeamId: 12,
      isHome: false,
      espnGameId: 401872659,
      statsOfficial: false
    });
    expect(rows[1].opponentProTeamId).toBeNull();
  });

  it('never sends `*`', async () => {
    const ctx = makeCtx({ 'nfl_schedule.select': () => [] });

    await getNflScheduleForSeason(ctx, 2026);

    expect(ctx.client.callsFor('nfl_schedule', 'select')[0].columns).not.toBe('*');
  });

  it('returns [] without querying when no year is given', async () => {
    const ctx = makeCtx({});

    expect(await getNflScheduleForSeason(ctx, null)).toEqual([]);
    expect(ctx.client.callsFor('nfl_schedule')).toHaveLength(0);
  });

  it('throws rather than returning [] when the read fails', async () => {
    const ctx = makeCtx({
      'nfl_schedule.select': () => {
        throw new Error('connection reset');
      }
    });

    // The distinction this asserts: an unimported season is [], an outage is an
    // error. A caller that saw [] for both would render a league-wide bye.
    await expect(getNflScheduleForSeason(ctx, 2026)).rejects.toBeInstanceOf(DbError);
  });
});
