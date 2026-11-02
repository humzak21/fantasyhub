/**
 * The autosub settings write. What matters is that it sends only what it was
 * given, so changing the limit cannot also flip a switch, and that the limit's
 * range is said in words before the database's check says it in a code.
 */

import { describe, it, expect, vi } from 'vitest';

import { setAutosubSettings } from '../seasons.js';

function makeCtx() {
  const update = vi.fn(() => chain);
  const chain = {
    update,
    eq: () => chain,
    select: () => chain,
    single: async () => ({ data: { id: 's1', autosub_weekly_limit: 3 }, error: null })
  };
  return { update, ctx: { client: { from: () => chain }, seasonsCache: new Map([['s1', {}]]) } };
}

describe('setAutosubSettings', () => {
  it('sends the limit and nothing else', async () => {
    const { ctx, update } = makeCtx();

    const saved = await setAutosubSettings(ctx, 's1', { autosubWeeklyLimit: 3 });

    expect(update).toHaveBeenCalledWith({ autosub_weekly_limit: 3 });
    expect(saved.autosubWeeklyLimit).toBe(3);
    expect(ctx.seasonsCache.has('s1')).toBe(false);
  });

  it('sends a switch without touching the limit', async () => {
    const { ctx, update } = makeCtx();

    await setAutosubSettings(ctx, 's1', { autosubsEnabled: false });

    expect(update).toHaveBeenCalledWith({ autosubs_enabled: false });
  });

  it.each([0, 10, 2.5, 'lots'])('refuses a limit of %s before it reaches the database', async (limit) => {
    const { ctx, update } = makeCtx();

    await expect(setAutosubSettings(ctx, 's1', { autosubWeeklyLimit: limit })).rejects.toThrow('from 1 to 9');
    expect(update).not.toHaveBeenCalled();
  });

  it('takes both ends of the range', async () => {
    for (const limit of [1, 9]) {
      const { ctx, update } = makeCtx();
      await setAutosubSettings(ctx, 's1', { autosubWeeklyLimit: limit });
      expect(update).toHaveBeenCalledWith({ autosub_weekly_limit: limit });
    }
  });
});
