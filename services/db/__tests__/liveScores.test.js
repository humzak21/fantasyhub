import { describe, it, expect, vi } from 'vitest';

import { getLiveWeek } from '../liveScores.js';
import { EMPTY_LIVE_WEEK } from '../../liveScores.js';

const ctxWith = (invoke) => ({ client: { functions: { invoke } } });

describe('getLiveWeek', () => {
  it('asks the function, not ESPN and not a table', async () => {
    const invoke = vi.fn(async () => ({
      data: { matchups: [1], lineups: {}, nflGames: {}, live: true, windowOpen: true, refreshedAt: 'then' },
      error: null
    }));

    const week = await getLiveWeek(ctxWith(invoke), 's1', 8);

    expect(invoke).toHaveBeenCalledWith('live-scores', { body: { seasonId: 's1', week: 8 } });
    expect(week).toMatchObject({ matchups: [1], live: true, refreshedAt: 'then' });
  });

  it('degrades to nothing live, so a scoreboard outlives its overlay', async () => {
    const invoke = vi.fn(async () => ({ data: null, error: new Error('function not found') }));

    await expect(getLiveWeek(ctxWith(invoke), 's1', 8)).resolves.toEqual(EMPTY_LIVE_WEEK);
  });

  it('makes no call without a week', async () => {
    const invoke = vi.fn();

    await expect(getLiveWeek(ctxWith(invoke), 's1', null)).resolves.toEqual(EMPTY_LIVE_WEEK);
    expect(invoke).not.toHaveBeenCalled();
  });
});
