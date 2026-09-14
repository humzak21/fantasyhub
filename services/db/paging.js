/**
 * Read every row of a query, a page at a time.
 *
 * PostgREST caps a response at 1,000 rows and says nothing when it does: the
 * request succeeds with the first thousand. `v_game_results` passed that cap in
 * 2026 (1,402 rows), and the backfilled `team_week_lineups` and
 * `transaction_events` start above it, so a plain `select` would quietly drop
 * whole seasons from the record book.
 *
 * `buildQuery` must return a fresh builder each call, with a stable `order` —
 * without one, pages can overlap or skip rows between requests.
 *
 * @param {() => object} buildQuery a supabase-js select, ordered, not yet ranged
 * @param {{ pageSize?: number }} [options]
 * @returns {Promise<object[]>}
 */
export async function selectAll(buildQuery, { pageSize = 1000 } = {}) {
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;

    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export default selectAll;
