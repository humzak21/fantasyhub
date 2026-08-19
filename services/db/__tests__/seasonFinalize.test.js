/**
 * Finishing a season.
 *
 * The derivation itself is SQL (`finalize_season`); what is worth pinning down
 * here is the contract around it — that a dry run writes nothing, that awards
 * follow placements, and that activating next season finishes the last one
 * without ever putting the activation itself at risk.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { makeCtx } from './fakeClient.js';
import { finalizeSeason, setActiveSeason } from '../seasons.js';

const DRY_RUN_RESULT = {
  season_id: 'season-2025',
  year: 2025,
  dry_run: true,
  assignments: [{ team_id: 'team-eshan', owner: 'Eshan Kaul', finish: 'champion', final_rank: 1 }]
};

const rpcCalls = (ctx, name) =>
  ctx.client.calls.filter((call) => call.table === 'rpc' && call.op === name);

describe('finalizeSeason', () => {
  it('returns the derived placements without computing awards on a dry run', async () => {
    const ctx = makeCtx({
      'rpc.finalize_season': () => DRY_RUN_RESULT
    });

    const result = await finalizeSeason(ctx, 'season-2025', { dryRun: true });

    expect(result).toEqual(DRY_RUN_RESULT);
    expect(rpcCalls(ctx, 'finalize_season')[0].payload).toEqual({
      p_season_id: 'season-2025',
      p_dry_run: true
    });
    // Awards describe a finished season. There is no such thing as a dry-run
    // award, and computing them would be a write the caller did not ask for.
    expect(rpcCalls(ctx, 'compute_season_awards')).toHaveLength(0);
  });

  it('computes the awards after the placements they depend on', async () => {
    const ctx = makeCtx({
      'rpc.finalize_season': () => ({ ...DRY_RUN_RESULT, dry_run: false }),
      'rpc.compute_season_awards': () => ({ awards: [{ award_type: 'champion' }] })
    });

    const result = await finalizeSeason(ctx, 'season-2025');

    expect(result.year).toBe(2025);
    expect(result.awards).toEqual({ awards: [{ award_type: 'champion' }] });

    const order = ctx.client.calls.filter((call) => call.table === 'rpc').map((call) => call.op);
    expect(order).toEqual(['finalize_season', 'compute_season_awards']);
  });

  it('drops the cached season, which still says the season is unfinished', async () => {
    const ctx = makeCtx({
      'rpc.finalize_season': () => ({ ...DRY_RUN_RESULT, dry_run: false }),
      'rpc.compute_season_awards': () => ({})
    });
    ctx.seasonsCache.set('season-2025', { id: 'season-2025', isCompleted: false });

    await finalizeSeason(ctx, 'season-2025');

    expect(ctx.seasonsCache.has('season-2025')).toBe(false);
  });

  it('surfaces a refused derivation instead of reporting success', async () => {
    const ctx = makeCtx({
      'rpc.finalize_season': () => {
        throw new Error('finalize_season: 3 game(s) of the 2026 season are not complete');
      }
    });

    await expect(finalizeSeason(ctx, 'season-2026')).rejects.toThrow(/are not complete/);
  });
});

describe('setActiveSeason finishing the season it replaces', () => {
  /** Handlers for the happy path; individual tests override what they care about. */
  function defaultHandlers(overrides = {}) {
    return {
      'seasons.select': () => [{ id: 'season-2025', year: 2025, is_completed: false }],
      'games.select': () => [],
      'seasons.update': () => ({ id: 'season-2026', year: 2026, is_active: true }),
      'rpc.finalize_season': () => ({ season_id: 'season-2025', year: 2025, dry_run: false }),
      'rpc.compute_season_awards': () => ({}),
      ...overrides
    };
  }

  let ctx;

  beforeEach(() => {
    ctx = makeCtx(defaultHandlers());
  });

  it('finalizes the outgoing season and reports it on the new one', async () => {
    const season = await setActiveSeason(ctx, 'season-2026');

    expect(rpcCalls(ctx, 'finalize_season')[0].payload).toEqual({
      p_season_id: 'season-2025',
      p_dry_run: false
    });
    expect(season.finalizedPrevious).toMatchObject({ year: 2025 });
    expect(season.finalizeError).toBeNull();
  });

  // Setting next season up in August is normal, and the season being left
  // behind is still being played. Nothing to finish, nothing to say.
  it('leaves a season with games still to play alone', async () => {
    ctx = makeCtx(defaultHandlers({ 'games.select': () => [{ id: 'game-1' }] }));

    const season = await setActiveSeason(ctx, 'season-2026');

    expect(rpcCalls(ctx, 'finalize_season')).toHaveLength(0);
    expect(season.finalizedPrevious).toBeNull();
    expect(season.finalizeError).toBeNull();
  });

  it('does nothing when the outgoing season is already completed', async () => {
    ctx = makeCtx(
      defaultHandlers({
        'seasons.select': () => [{ id: 'season-2025', year: 2025, is_completed: true }]
      })
    );

    await setActiveSeason(ctx, 'season-2026');

    expect(rpcCalls(ctx, 'finalize_season')).toHaveLength(0);
  });

  it('does nothing when the season being activated is already the active one', async () => {
    await setActiveSeason(ctx, 'season-2025');

    expect(rpcCalls(ctx, 'finalize_season')).toHaveLength(0);
  });

  // Activating the new season is what the admin asked for. A bracket the
  // derivation cannot read is worth reporting, not worth refusing over.
  it('still activates the new season when finalizing the old one fails', async () => {
    ctx = makeCtx(
      defaultHandlers({
        'rpc.finalize_season': () => {
          throw new Error('finalize_season: expected a 6-team bracket in 2025, found 4 team(s)');
        }
      })
    );

    const season = await setActiveSeason(ctx, 'season-2026');

    expect(season.id).toBe('season-2026');
    expect(ctx.activeSeasonId).toBe('season-2026');
    expect(season.finalizeError).toMatch(/6-team bracket/);
  });
});
