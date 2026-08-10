/**
 * A stand-in for the supabase-js query builder, for testing `services/db/`.
 *
 * Every filter returns the builder; awaiting it (or calling `.single()`) runs
 * the handler registered for `table.operation` and records the call. Handlers
 * receive the recorded call, so a test can assert on what was sent as easily as
 * it can stub what comes back.
 *
 *     const ctx = makeCtx({ 'games.select': () => [gameRow] });
 *     await upsertEspnGames(ctx, seasonId, matchups);
 *     expect(ctx.client.calls).toContainEqual(...);
 */

export function makeClient(handlers = {}) {
  const calls = [];

  return {
    calls,
    /** Calls for one table, optionally one operation. */
    callsFor(table, op = null) {
      return calls.filter((call) => call.table === table && (op === null || call.op === op));
    },
    from(table) {
      const state = { table, op: 'select', payload: null, options: null, filters: {} };

      const run = () => {
        calls.push({ ...state, filters: { ...state.filters } });
        const handler = handlers[`${state.table}.${state.op}`];
        if (!handler) {
          return Promise.resolve({
            data: null,
            error: new Error(`unexpected query: ${state.table}.${state.op}`)
          });
        }
        return Promise.resolve()
          .then(() => handler(state))
          .then((data) => ({ data: data ?? null, error: null }))
          .catch((error) => ({ data: null, error }));
      };

      const builder = {
        select: (columns) => {
          state.columns = columns;
          return builder;
        },
        insert: (rows) => {
          state.op = 'insert';
          state.payload = rows;
          return builder;
        },
        upsert: (rows, options) => {
          state.op = 'upsert';
          state.payload = rows;
          state.options = options;
          return builder;
        },
        update: (values) => {
          state.op = 'update';
          state.payload = values;
          return builder;
        },
        delete: () => {
          state.op = 'delete';
          return builder;
        },
        eq: (column, value) => {
          state.filters[column] = value;
          return builder;
        },
        in: (column, values) => {
          state.filters[`in:${column}`] = values;
          return builder;
        },
        lt: (column, value) => {
          state.filters[`lt:${column}`] = value;
          return builder;
        },
        lte: (column, value) => {
          state.filters[`lte:${column}`] = value;
          return builder;
        },
        neq: () => builder,
        not: (column, operator, value) => {
          state.filters[`not:${column}:${operator}`] = value;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        single: () =>
          run().then(({ data, error }) => ({
            data: Array.isArray(data) ? data[0] ?? null : data,
            error
          })),
        then: (resolve, reject) => run().then(resolve, reject)
      };

      return builder;
    }
  };
}

/** A `ctx` around a fake client, in the shape `services/db/` expects. */
export function makeCtx(handlers = {}) {
  return { client: makeClient(handlers), seasonsCache: new Map(), activeSeasonId: null };
}
