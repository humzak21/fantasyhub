/**
 * Transactions: one row per team per season, and the leaderboards over them.
 *
 * The `transactions` table has been season-keyed since the August 2026
 * refactor, but the reads here still went through three names for it:
 * `mv_transaction_leaderboards` (a materialized view nothing refreshes),
 * `team_transactions` (a passthrough view), and `transactions_2025` (a view
 * filtered to whichever season is *active*, not to 2025). That last one is why
 * the franchise transaction chart labelled the active season's numbers "2025",
 * and why every owner's totals were counted twice once 2026 was activated.
 *
 * All of it now reads `transactions` directly and joins `seasons` for the year.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { formatFromDatabase } from './caseMap.js';
import { throwDbError, unwrap } from './errors.js';
import { createLogger } from './logger.js';

const log = createLogger('db:transactions');

const TRANSACTION_COLUMNS =
  'id, franchise_id, season_id, team_id, owner_name, espn_team_id, ' +
  'free_agent_adds, waiver_claims, trades, drops, total_transactions, faab_spent, ' +
  'last_synced_at';

/**
 * `total_transactions` is stored, but a row written before the column existed
 * can still be null; the parts are always there.
 */
const totalFor = (row) =>
  row.total_transactions ??
  (row.free_agent_adds || 0) + (row.waiver_claims || 0) + (row.trades || 0) + (row.drops || 0);

/**
 * Career transaction totals, every season included.
 *
 * Aggregated in one pass over `transactions`. The previous version added a
 * materialized view of the historical seasons to a separate read of the active
 * one — which double-counted the active season the moment it appeared in both.
 */
export async function getTransactionLeaderboard(ctx) {
  try {
    const rows = unwrap(
      await ctx.client
        .from('transactions')
        .select(`${TRANSACTION_COLUMNS}, franchise:league_franchises (id, owner_name, display_name)`),
      'Get transaction leaderboard'
    ) ?? [];

    const byFranchise = new Map();

    for (const row of rows) {
      // Owner name is the fallback key: a franchise row is the identity, but a
      // team synced before its franchise was linked has only the name.
      const key = row.franchise_id ?? row.owner_name;
      if (!key) continue;

      const entry = byFranchise.get(key) ?? {
        franchise_id: row.franchise_id ?? null,
        owner_name: row.franchise?.owner_name ?? row.owner_name,
        display_name: row.franchise?.display_name ?? row.owner_name,
        total_free_agent_adds: 0,
        total_waiver_claims: 0,
        total_trades: 0,
        total_drops: 0,
        total_all_transactions: 0,
        total_faab_spent: 0,
        seasons_tracked: 0
      };

      entry.total_free_agent_adds += row.free_agent_adds || 0;
      entry.total_waiver_claims += row.waiver_claims || 0;
      entry.total_trades += row.trades || 0;
      entry.total_drops += row.drops || 0;
      entry.total_all_transactions += totalFor(row);
      entry.total_faab_spent += Number(row.faab_spent || 0);
      // A season with no activity yet is not a season anyone has been tracked
      // for; counting it would make an empty new season inflate everyone.
      if (totalFor(row) > 0) entry.seasons_tracked += 1;

      byFranchise.set(key, entry);
    }

    return [...byFranchise.values()].sort(
      (a, b) => b.total_all_transactions - a.total_all_transactions
    );
  } catch (error) {
    throwDbError(error, 'Get transaction leaderboard');
  }
}

/**
 * One franchise's activity, season by season, with the real year on each row.
 *
 * The year used to come from `transactions_2025`, which is a view over the
 * *active* season — so once 2026 was activated the chart showed 2026's numbers
 * under a "2025" label.
 */
export async function getFranchiseTransactionHistory(ctx, franchiseId) {
  try {
    const rows = unwrap(
      await ctx.client
        .from('transactions')
        .select(`${TRANSACTION_COLUMNS}, season:seasons (id, year, name)`)
        .eq('franchise_id', franchiseId),
      'Get franchise transaction history'
    ) ?? [];

    return rows
      .map((row) => ({ ...row, year: row.season?.year ?? null, total_transactions: totalFor(row) }))
      // A season that has not started yet gets a row when its teams are carried
      // forward, and charting it puts an empty bar next to real ones.
      .filter((row) => row.year !== null && row.total_transactions > 0)
      .sort((a, b) => a.year - b.year);
  } catch (error) {
    throwDbError(error, 'Get franchise transaction history');
  }
}

export async function getSeasonTransactions(ctx, seasonId) {

  try {
    const rows = unwrap(
      await ctx.client
        .from('transactions')
        .select(`${TRANSACTION_COLUMNS}, franchise:league_franchises (id, owner_name, display_name)`)
        .eq('season_id', seasonId)
        .order('total_transactions', { ascending: false }),
      'Get season transactions'
    );

    return rows ?? [];
  } catch (error) {
    throwDbError(error, 'Get season transactions');
  }
}

export async function upsertTeamTransaction(ctx, transactionData) {

  try {
    const { data, error } = await ctx.client
      .from('transactions')
      .upsert(transactionData, {
        onConflict: 'franchise_id,season_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) throw error;

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Upsert team transaction');
    return null;
  }
}

/** Every team's activity in one season, keyed by owner. */
export async function getCurrentSeasonTransactions(ctx, seasonId) {
  try {
    const rows = await getSeasonTransactions(ctx, seasonId);
    log.debug(`${rows.length} transaction rows for season ${seasonId}`);
    return rows.map((row) => ({ ...row, total_transactions: totalFor(row) }));
  } catch (error) {
    throwDbError(error, 'Get current season transactions');
  }
}
