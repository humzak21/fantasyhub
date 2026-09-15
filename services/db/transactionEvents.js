/**
 * Individual ESPN transactions: the detail behind `transactions`' counts.
 *
 * The only writer of `transaction_events`. Fed by the sync's transactions step
 * and `scripts/backfill-transactions.js`, both from the same `mTransactions2`
 * fetch that produces the counts, parsed by `parseTransactionEvents`.
 *
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { buildTeamIndex } from '../espnGameMapper.js';
import { throwDbError, unwrap } from './errors.js';
import { createLogger } from './logger.js';

const log = createLogger('db:transactionEvents');

const CONFLICT_TARGET = 'season_id,espn_transaction_id';
const CHUNK = 500;

/**
 * Upsert one season's transactions.
 *
 * Idempotent on (season, ESPN transaction id), so a re-run rewrites rather than
 * duplicates. ESPN team ids resolve to the season's teams by `buildTeamIndex`,
 * the same matcher every other ESPN writer uses; an id that is no league team
 * (the free-agent pool) is simply not a franchise. A transaction that resolves
 * to no team at all is reported, not stored.
 *
 * @param {object} ctx
 * @param {string} seasonId
 * @param {Array}  events from `parseTransactionEvents`
 * @param {Array}  teams  the season's teams
 * @returns {Promise<{upserted: number, skipped: Array}>}
 */
export async function upsertTransactionEvents(ctx, seasonId, events = [], teams = []) {
  try {
    if (events.length === 0) return { upserted: 0, skipped: [] };

    const index = buildTeamIndex(teams);
    const resolve = (espnTeamId) => {
      const team = espnTeamId != null ? index.find(espnTeamId, null) : null;
      return team ? { id: team.id, franchiseId: team.franchiseId ?? team.franchise_id ?? null } : null;
    };

    const rows = [];
    const skipped = [];
    const now = new Date().toISOString();

    for (const event of events) {
      const actor = resolve(event.espnTeamId);
      const franchiseIds = [
        ...new Set(event.espnTeamIds.map(resolve).map((team) => team?.franchiseId).filter(Boolean))
      ];

      if (!actor && franchiseIds.length === 0) {
        skipped.push({ espnTransactionId: event.espnTransactionId, reason: 'no team in this season' });
        continue;
      }

      rows.push({
        season_id: seasonId,
        espn_transaction_id: event.espnTransactionId,
        type: event.type,
        scoring_period: event.scoringPeriod,
        processed_at: event.processedAt,
        team_id: actor?.id ?? null,
        franchise_id: actor?.franchiseId ?? null,
        bid_amount: event.bidAmount,
        franchise_ids: franchiseIds,
        espn_player_ids: event.espnPlayerIds,
        // Aligned with espn_player_ids. ESPN's pool (team 0) is no franchise: null.
        player_from_franchise_ids: event.espnFromTeamIds
          ? event.espnFromTeamIds.map((id) => resolve(id)?.franchiseId ?? null)
          : null,
        player_to_franchise_ids: event.espnToTeamIds
          ? event.espnToTeamIds.map((id) => resolve(id)?.franchiseId ?? null)
          : null,
        updated_at: now
      });
    }

    for (let start = 0; start < rows.length; start += CHUNK) {
      const { error } = await ctx.client
        .from('transaction_events')
        .upsert(rows.slice(start, start + CHUNK), { onConflict: CONFLICT_TARGET, ignoreDuplicates: false });
      if (error) throw error;
    }

    log.info(`season ${seasonId}: ${rows.length} transactions stored, ${skipped.length} skipped`);
    return { upserted: rows.length, skipped };
  } catch (error) {
    throwDbError(error, 'Upsert transaction events');
  }
}

/** How many events a season holds, by type — the backfill's before/after. */
export async function countTransactionEvents(ctx, seasonId) {
  try {
    const rows = unwrap(
      await ctx.client.from('transaction_events').select('type').eq('season_id', seasonId),
      'Count transaction events'
    ) ?? [];

    return rows.reduce((counts, row) => ({ ...counts, [row.type]: (counts[row.type] ?? 0) + 1 }), {});
  } catch (error) {
    throwDbError(error, 'Count transaction events');
  }
}
