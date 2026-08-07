/**
 * Transactions: the season-keyed `transactions` table and its leaderboards.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { createLogger } from './logger.js';
import { resolveSeasonYear } from './seasons.js';

const log = createLogger('db:transactions');
export async function getTransactionLeaderboard(ctx) {

  try {
    // Get historical data from materialized view
    let historicalData = [];
    const { data: mvData, error: mvError } = await ctx.client
      .from('mv_transaction_leaderboards')
      .select('*')
      .order('total_all_transactions', { ascending: false });

    if (mvError) {
      // Fallback to direct query if materialized view doesn't exist
      if (mvError.code === '42P01') {
        historicalData = await getTransactionLeaderboardFallback(ctx);
      } else {
        throw mvError;
      }
    } else {
      historicalData = mvData || [];
    }

    // Get 2025 transaction data
    const { data: data2025, error: error2025 } = await ctx.client
      .from('transactions_2025')
      .select('*');

    // If no 2025 data or error, just return historical
    if (error2025) {
      log.warn('Error fetching transactions_2025:', error2025.message);
      return historicalData;
    }

    if (!data2025 || data2025.length === 0) {
      log.warn('No data in transactions_2025 table');
      return historicalData;
    }

    log.debug(`Found ${data2025.length} entries in transactions_2025`);
    log.debug('2025 owners:', data2025.map(d => d.owner_name).join(', '));

    // Merge historical and 2025 data by owner_name
    const mergedByOwner = {};

    // First, add all historical data
    historicalData.forEach(row => {
      const ownerName = row.owner_name;
      mergedByOwner[ownerName] = {
        franchise_id: row.franchise_id,
        owner_name: ownerName,
        display_name: row.display_name,
        total_free_agent_adds: row.total_free_agent_adds || 0,
        total_waiver_claims: row.total_waiver_claims || 0,
        total_trades: row.total_trades || 0,
        total_drops: row.total_drops || 0,
        total_all_transactions: row.total_all_transactions || 0,
        total_faab_spent: row.total_faab_spent || 0,
        seasons_tracked: row.seasons_tracked || 0
      };
    });

    // Then add 2025 data
    data2025.forEach(row => {
      const ownerName = row.owner_name;
      const transactions2025 = (row.free_agent_adds || 0) + (row.waiver_claims || 0) +
        (row.trades || 0) + (row.drops || 0);

      if (mergedByOwner[ownerName]) {
        // Add to existing franchise
        mergedByOwner[ownerName].total_free_agent_adds += row.free_agent_adds || 0;
        mergedByOwner[ownerName].total_waiver_claims += row.waiver_claims || 0;
        mergedByOwner[ownerName].total_trades += row.trades || 0;
        mergedByOwner[ownerName].total_drops += row.drops || 0;
        mergedByOwner[ownerName].total_all_transactions += transactions2025;
        mergedByOwner[ownerName].total_faab_spent += row.faab_spent || 0;
        mergedByOwner[ownerName].seasons_tracked += 1;
      } else {
        // New owner (only in 2025, like Anish Madala)
        mergedByOwner[ownerName] = {
          franchise_id: null, // No historical franchise
          owner_name: ownerName,
          display_name: ownerName,
          total_free_agent_adds: row.free_agent_adds || 0,
          total_waiver_claims: row.waiver_claims || 0,
          total_trades: row.trades || 0,
          total_drops: row.drops || 0,
          total_all_transactions: transactions2025,
          total_faab_spent: row.faab_spent || 0,
          seasons_tracked: 1
        };
      }
    });

    // Convert to array and sort by total transactions
    const result = Object.values(mergedByOwner).sort((a, b) =>
      b.total_all_transactions - a.total_all_transactions
    );

    log.debug('Transaction leaderboard result:', result.length, 'entries');
    log.debug('All owners in result:', result.map(r => `${r.owner_name}: ${r.total_all_transactions}`).join(', '));

    return result;
  } catch (error) {
    throwDbError(error, 'Get transaction leaderboard');
    return [];
  }
}

export async function getTransactionLeaderboardFallback(ctx) {
  try {
    const { data, error } = await ctx.client
      .from('team_transactions')
      .select(`
        franchise_id,
        owner_name,
        free_agent_adds,
        waiver_claims,
        trades,
        drops,
        total_transactions,
        faab_spent
      `);

    if (error) throw error;

    // Aggregate by franchise
    const aggregates = {};
    (data || []).forEach(row => {
      if (!aggregates[row.franchise_id]) {
        aggregates[row.franchise_id] = {
          franchise_id: row.franchise_id,
          owner_name: row.owner_name,
          total_free_agent_adds: 0,
          total_waiver_claims: 0,
          total_trades: 0,
          total_drops: 0,
          total_all_transactions: 0,
          total_faab_spent: 0,
          seasons_tracked: 0
        };
      }
      aggregates[row.franchise_id].total_free_agent_adds += row.free_agent_adds || 0;
      aggregates[row.franchise_id].total_waiver_claims += row.waiver_claims || 0;
      aggregates[row.franchise_id].total_trades += row.trades || 0;
      aggregates[row.franchise_id].total_drops += row.drops || 0;
      aggregates[row.franchise_id].total_all_transactions += row.total_transactions || 0;
      aggregates[row.franchise_id].total_faab_spent += row.faab_spent || 0;
      aggregates[row.franchise_id].seasons_tracked += 1;
    });

    return Object.values(aggregates).sort((a, b) =>
      b.total_all_transactions - a.total_all_transactions
    );
  } catch (error) {
    throwDbError(error, 'Get transaction leaderboard fallback');
    return [];
  }
}

export async function getFranchiseTransactionHistory(ctx, franchiseId) {

  try {
    const { data, error } = await ctx.client
      .from('team_transactions')
      .select(`
        *,
        season:historical_seasons (
          id,
          year,
          name
        )
      `)
      .eq('franchise_id', franchiseId)
      .order('season(year)', { ascending: true });

    if (error) throw error;

    return (data || []).map(row => ({
      ...row,
      year: row.season?.year
    }));
  } catch (error) {
    throwDbError(error, 'Get franchise transaction history');
    return [];
  }
}

export async function getSeasonTransactions(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('team_transactions')
      .select(`
        *,
        franchise:league_franchises (
          id,
          owner_name,
          display_name
        )
      `)
      .eq('season_id', seasonId)
      .order('total_transactions', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    throwDbError(error, 'Get season transactions');
    return [];
  }
}

export async function upsertTeamTransaction(ctx, transactionData) {

  try {
    const { data, error } = await ctx.client
      .from('team_transactions')
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

export async function refreshTransactionViews(ctx) {

  try {
    const { error } = await ctx.client.rpc('refresh_transaction_views');

    if (error) throw error;

    return true;
  } catch (error) {
    // Non-fatal error - view might not exist yet
    log.warn('Could not refresh transaction views:', error.message);
    return false;
  }
}

export async function getCurrentSeasonTransactions(ctx) {

  try {
    const { data, error } = await ctx.client
      .from('transactions_2025')
      .select(`
        *,
        team:teams (
          id,
          name,
          owner_name:owner
        )
      `)
      .order('free_agent_adds', { ascending: false });

    if (error) {
      // Table might not exist yet
      if (error.code === '42P01') {
        return [];
      }
      throw error;
    }

    const seasonYear = await resolveSeasonYear(ctx);

    return (data || []).map(row => ({
      ...row,
      year: seasonYear,
      total_transactions: (row.free_agent_adds || 0) + (row.waiver_claims || 0) +
        (row.trades || 0) + (row.drops || 0)
    }));
  } catch (error) {
    throwDbError(error, 'Get current season transactions');
    return [];
  }
}

export async function getCurrentSeasonTransactionsByOwner(ctx, ownerName) {

  try {
    const { data, error } = await ctx.client
      .from('transactions_2025')
      .select('*')
      .eq('owner_name', ownerName)
      .single();

    if (error) {
      // Table might not exist or no data for this owner
      if (error.code === '42P01' || error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    if (!data) return null;

    return {
      ...data,
      year: await resolveSeasonYear(ctx),
      total_transactions: (data.free_agent_adds || 0) + (data.waiver_claims || 0) +
        (data.trades || 0) + (data.drops || 0)
    };
  } catch (error) {
    throwDbError(error, 'Get current season transactions by owner');
    return null;
  }
}
