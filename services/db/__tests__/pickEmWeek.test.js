/**
 * `ensurePickEmWeek` is the weekly sync's first step, and it has two promises:
 * it creates the row the admin used to create by hand, and it never creates
 * it twice. Both are cheap to break — a stray timestamp argument would move the
 * window off the season's own rule, and a missing existence check would raise
 * on the unique constraint every Wednesday.
 */

import { describe, it, expect } from 'vitest';

import { ensurePickEmWeek } from '../pickems.js';
import { makeCtx } from './fakeClient.js';

const seasonId = 'season-2026';

describe('ensurePickEmWeek', () => {
  it('creates the row through the RPC when the week has none', async () => {
    const ctx = makeCtx({
      'pick_em_weeks.select': () => [],
      'rpc.create_pick_em_week': () => 'new-week-id'
    });

    const result = await ensurePickEmWeek(ctx, seasonId, 3);

    expect(result).toEqual({ created: true, id: 'new-week-id' });

    const [call] = ctx.client.callsFor('rpc', 'create_pick_em_week');
    expect(call.payload).toEqual({ p_season_id: seasonId, p_week_number: 3 });
  });

  // The database derives the window from the season row's `pickem_*` columns
  // when it is given no timestamps. Sending any would make the script a second
  // definition of the rule.
  it('sends no timestamps, so the database owns the window', async () => {
    const ctx = makeCtx({
      'pick_em_weeks.select': () => [],
      'rpc.create_pick_em_week': () => 'new-week-id'
    });

    await ensurePickEmWeek(ctx, seasonId, 3);

    const [call] = ctx.client.callsFor('rpc', 'create_pick_em_week');
    expect(Object.keys(call.payload).sort()).toEqual(['p_season_id', 'p_week_number']);
  });

  it('is a no-op when the row already exists', async () => {
    const ctx = makeCtx({
      'pick_em_weeks.select': () => [{ id: 'existing-id', season_id: seasonId, week_number: 3 }]
    });

    const result = await ensurePickEmWeek(ctx, seasonId, 3);

    expect(result).toEqual({ created: false, id: 'existing-id' });
    expect(ctx.client.callsFor('rpc')).toHaveLength(0);
  });

  it('looks up the row by season and week', async () => {
    const ctx = makeCtx({
      'pick_em_weeks.select': () => [{ id: 'existing-id' }]
    });

    await ensurePickEmWeek(ctx, seasonId, 7);

    const [call] = ctx.client.callsFor('pick_em_weeks', 'select');
    expect(call.filters).toEqual({ season_id: seasonId, week_number: 7 });
  });

  it('surfaces an RPC failure as a DbError rather than swallowing it', async () => {
    const ctx = makeCtx({
      'pick_em_weeks.select': () => [],
      'rpc.create_pick_em_week': () => {
        throw new Error('admin only');
      }
    });

    await expect(ensurePickEmWeek(ctx, seasonId, 3)).rejects.toThrow(/admin only/);
  });
});
