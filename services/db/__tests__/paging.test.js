/**
 * PostgREST's silent 1,000-row cap. The failure this guards against looks like
 * success: a record book built from the first thousand games.
 */

import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import { selectAll } from '../paging.js';

const ROWS = Array.from({ length: 2500 }, (_, id) => ({ id }));

describe('selectAll', () => {
  it('keeps reading pages until one comes back short', async () => {
    const ctx = makeCtx({
      'games.select': (state) => ROWS.slice(state.range[0], state.range[1] + 1)
    });

    const rows = await selectAll(() => ctx.client.from('games').select('id').order('id'), { pageSize: 1000 });

    expect(rows).toHaveLength(2500);
    expect(ctx.client.callsFor('games').map((call) => call.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('throws what the page threw rather than returning what it had', async () => {
    const ctx = makeCtx({
      'games.select': (state) => {
        if (state.range[0] > 0) throw new Error('connection reset');
        return ROWS.slice(0, 1000);
      }
    });

    await expect(selectAll(() => ctx.client.from('games').select('id'))).rejects.toThrow('connection reset');
  });
});
