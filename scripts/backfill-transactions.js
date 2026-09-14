#!/usr/bin/env node

/**
 * Backfill `transaction_events` (and re-derive `transactions`) for past seasons.
 *
 * The weekly sync has only ever stored transaction *counts*, so the 2020-25
 * seasons have no individual moves — no trade partners, no single FAAB bid.
 * ESPN still serves those seasons' `mTransactions2`, so this runs the sync's
 * own transactions step (`syncTransactions`) over each of them: one fetch,
 * counted into `transactions` and kept move by move in `transaction_events`,
 * exactly as the weekly job does for the active season.
 *
 * Idempotent: both tables upsert on natural keys, so re-running a season
 * rewrites it. `--dry-run` fetches and parses, then prints what it would store
 * beside what `transactions` holds now, and writes nothing.
 *
 * Usage:
 *   node scripts/backfill-transactions.js              # every completed season from 2020
 *   node scripts/backfill-transactions.js 2023         # one season
 *   node scripts/backfill-transactions.js --dry-run
 */

import '../services/db/client.server.js';

import { ESPN_CONFIG } from '../config/espn-config.js';
import { getContext } from '../services/db/index.js';
import { ESPNTransactionFetcher } from '../services/espnTransactionFetcher.js';
import { syncTransactions } from './sync-week.js';

const FIRST_YEAR = 2020;

function parseArgs(argv) {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) options[arg.slice(2)] = true;
  }
  return { yearArg: positional[0] ? Number.parseInt(positional[0], 10) : null, options };
}

/** The seasons to run: one named year, or every completed season from 2020. */
export async function seasonsToBackfill(yearArg) {
  const { data, error } = await getContext().client
    .from('seasons')
    .select('id, year, is_completed, espn_league_id, espn_season_year, regular_season_weeks, playoff_weeks')
    .gte('year', FIRST_YEAR)
    .order('year');
  if (error) throw error;

  const seasons = (data ?? []).filter((season) =>
    yearArg ? season.year === yearArg : season.is_completed
  );
  if (seasons.length === 0) {
    throw new Error(yearArg ? `No season row for ${yearArg}` : 'No completed seasons from 2020 on');
  }
  return seasons;
}

/** The ESPN coordinates of one season, from its row with the config as fallback. */
export const espnFor = (season) => ({
  leagueId: season.espn_league_id || ESPN_CONFIG.leagueId,
  seasonYear: season.espn_season_year || season.year,
  espnS2: ESPN_CONFIG.espnS2,
  swid: ESPN_CONFIG.swid
});

async function dryRun(season) {
  const espn = espnFor(season);
  const fetcher = new ESPNTransactionFetcher(espn.leagueId, espn.seasonYear, espn.espnS2, espn.swid);
  const leagueData = await fetcher.fetchSeasonTransactions(espn.seasonYear);
  const summary = fetcher.parseTransactionData(leagueData);
  const events = fetcher.parseTransactionEvents(leagueData);

  const { data: stored } = await getContext().client
    .from('transactions')
    .select('trades, faab_spent')
    .eq('season_id', season.id);

  const byType = events.reduce((acc, event) => ({ ...acc, [event.type]: (acc[event.type] ?? 0) + 1 }), {});
  const bids = events.filter((event) => event.bidAmount != null);
  const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);

  console.log(
    `   ${season.year}: ${events.length} events ${JSON.stringify(byType)} · ` +
    `${bids.length} bids, max $${Math.max(0, ...bids.map((event) => event.bidAmount))}`
  );
  console.log(
    `         counts ESPN→ trades ${sum(summary, 'trades')}, faab $${sum(summary, 'faab_spent')} · ` +
    `stored trades ${sum(stored ?? [], 'trades')}, faab $${sum(stored ?? [], 'faab_spent')}`
  );
}

export async function backfillTransactions(argv = []) {
  const { yearArg, options } = parseArgs(argv);
  const seasons = await seasonsToBackfill(yearArg);

  for (const season of seasons) {
    if (options['dry-run']) {
      await dryRun(season);
    } else {
      const result = await syncTransactions(season.id, espnFor(season));
      console.log(
        `🔁 ${season.year}: ${result.updated} teams, ${result.events ?? 0} transactions stored`
      );
      for (const miss of result.errors) console.warn(`⚠️  ${season.year}: ${miss.team ?? ''} ${miss.error}`);
    }
    // ESPN rate-limits the league endpoints; each season is ~17 requests.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  backfillTransactions(process.argv.slice(2)).catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
