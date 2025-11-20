/**
 * Import Transaction History Script
 *
 * Fetches transaction data from ESPN Fantasy Football API for multiple seasons
 * and stores aggregated counts in the team_transactions table in Supabase.
 *
 * Usage:
 *   node scripts/importTransactionHistory.js [test|import|report]
 *
 * Commands:
 *   test   - Test connection and show sample data
 *   import - Import transaction data for all seasons
 *   report - Print transaction report without importing
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ESPNTransactionFetcher } from '../services/espnTransactionFetcher.js';
import { ESPN_CONFIG } from '../config/espn-config.js';
import { getSupabaseAdmin } from './lib/getSupabaseAdmin.js';

// Seasons to import (2020-2025 for historical data)
const SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];

// Get Supabase admin client
let supabase;
try {
  supabase = getSupabaseAdmin();
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('   Please set SUPABASE_SERVICE_ROLE_KEY in your .env.local file');
  process.exit(1);
}

/**
 * Get franchise ID by owner name
 */
async function getFranchiseByOwnerName(ownerName) {
  const { data, error } = await supabase
    .from('league_franchises')
    .select('id, owner_name')
    .eq('owner_name', ownerName)
    .single();

  if (error) {
    console.warn(`  Warning: No franchise found for owner "${ownerName}"`);
    return null;
  }

  return data;
}

/**
 * Get season ID by year
 */
async function getSeasonByYear(year) {
  const { data, error } = await supabase
    .from('historical_seasons')
    .select('id, year')
    .eq('year', year)
    .single();

  if (error) {
    console.warn(`  Warning: No season found for year ${year}`);
    return null;
  }

  return data;
}

/**
 * Upsert transaction data for a team
 */
async function upsertTeamTransactions(transactionData) {
  const { data, error } = await supabase
    .from('team_transactions')
    .upsert(transactionData, {
      onConflict: 'franchise_id,season_id',
      ignoreDuplicates: false
    })
    .select();

  if (error) {
    console.error(`  Error upserting transactions:`, error.message);
    return null;
  }

  return data;
}

/**
 * Import transactions for a single season
 */
async function importSeasonTransactions(fetcher, year) {
  console.log(`\nProcessing ${year} season...`);

  try {
    // Get season ID from database
    const season = await getSeasonByYear(year);
    if (!season) {
      console.error(`  Skipping ${year}: Season not found in database`);
      return { success: false, year, error: 'Season not found' };
    }

    // Fetch transaction summary from ESPN
    const summary = await fetcher.getSeasonTransactionSummary(year);

    if (!summary || summary.length === 0) {
      console.warn(`  No transactions found for ${year}`);
      return { success: false, year, error: 'No transactions found' };
    }

    let imported = 0;
    let skipped = 0;

    for (const teamData of summary) {
      // Get franchise ID by owner name
      const franchise = await getFranchiseByOwnerName(teamData.ownerName);

      if (!franchise) {
        console.warn(`  Skipping ${teamData.ownerName}: Franchise not found`);
        skipped++;
        continue;
      }

      // Prepare transaction record
      const record = {
        franchise_id: franchise.id,
        season_id: season.id,
        owner_name: teamData.ownerName,
        espn_team_id: teamData.espnTeamId,
        free_agent_adds: teamData.free_agent_adds,
        waiver_claims: teamData.waiver_claims,
        trades: teamData.trades,
        drops: teamData.drops,
        faab_spent: teamData.faab_spent,
        last_synced_at: new Date().toISOString()
      };

      // Upsert to database
      const result = await upsertTeamTransactions(record);

      if (result) {
        imported++;
        console.log(`  ✓ ${teamData.ownerName}: ${teamData.total_transactions} transactions`);
      } else {
        skipped++;
      }
    }

    console.log(`  ${year} Complete: ${imported} imported, ${skipped} skipped`);
    return { success: true, year, imported, skipped };

  } catch (error) {
    console.error(`  Error processing ${year}:`, error.message);
    return { success: false, year, error: error.message };
  }
}

/**
 * Import transactions for all seasons
 */
async function importAllTransactions() {
  console.log('='.repeat(50));
  console.log('IMPORTING TRANSACTION HISTORY');
  console.log('='.repeat(50));

  const fetcher = new ESPNTransactionFetcher(
    ESPN_CONFIG.leagueId,
    ESPN_CONFIG.seasonYear,
    ESPN_CONFIG.espnS2,
    ESPN_CONFIG.swid
  );

  const results = [];

  for (const year of SEASONS) {
    const result = await importSeasonTransactions(fetcher, year);
    results.push(result);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('IMPORT SUMMARY');
  console.log('='.repeat(50));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\nSuccessful: ${successful.length}/${SEASONS.length} seasons`);
  successful.forEach(r => {
    console.log(`  ✓ ${r.year}: ${r.imported} teams imported`);
  });

  if (failed.length > 0) {
    console.log(`\nFailed: ${failed.length} seasons`);
    failed.forEach(r => {
      console.log(`  ✗ ${r.year}: ${r.error}`);
    });
  }

  // Refresh materialized view
  console.log('\nRefreshing materialized views...');
  const { error } = await supabase.rpc('refresh_transaction_views');
  if (error) {
    console.warn('  Warning: Could not refresh views:', error.message);
  } else {
    console.log('  ✓ Views refreshed successfully');
  }

  console.log('\n' + '='.repeat(50));
  console.log('Import complete!');

  return results;
}

/**
 * Test connection and show sample data
 */
async function testConnection() {
  console.log('='.repeat(50));
  console.log('TESTING ESPN TRANSACTION FETCH');
  console.log('='.repeat(50));

  const fetcher = new ESPNTransactionFetcher(
    ESPN_CONFIG.leagueId,
    ESPN_CONFIG.seasonYear,
    ESPN_CONFIG.espnS2,
    ESPN_CONFIG.swid
  );

  const result = await fetcher.testTransactionFetch();

  if (!result.success) {
    console.error('\n❌ Test failed:', result.error);
    return;
  }

  // Also verify database connection
  console.log('\n\nTesting Supabase connection...');

  const { data: seasons, error } = await supabase
    .from('historical_seasons')
    .select('year')
    .order('year', { ascending: false });

  if (error) {
    console.error('❌ Database connection failed:', error.message);
    return;
  }

  console.log(`✓ Found ${seasons.length} seasons in database: ${seasons.map(s => s.year).join(', ')}`);

  // Check franchises
  const { data: franchises, error: fError } = await supabase
    .from('league_franchises')
    .select('owner_name')
    .eq('is_active', true);

  if (fError) {
    console.error('❌ Could not fetch franchises:', fError.message);
    return;
  }

  console.log(`✓ Found ${franchises.length} active franchises`);

  console.log('\n✅ All tests passed! Ready to import.');
}

/**
 * Print transaction report without importing
 */
async function printReport() {
  console.log('='.repeat(50));
  console.log('TRANSACTION REPORT - ALL SEASONS');
  console.log('='.repeat(50));

  const fetcher = new ESPNTransactionFetcher(
    ESPN_CONFIG.leagueId,
    ESPN_CONFIG.seasonYear,
    ESPN_CONFIG.espnS2,
    ESPN_CONFIG.swid
  );

  for (const year of SEASONS) {
    await fetcher.printTransactionReport(year);
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

/**
 * Import transactions for a specific year only
 */
async function importSingleSeason(year) {
  console.log('='.repeat(50));
  console.log(`IMPORTING TRANSACTION HISTORY - ${year}`);
  console.log('='.repeat(50));

  const fetcher = new ESPNTransactionFetcher(
    ESPN_CONFIG.leagueId,
    ESPN_CONFIG.seasonYear,
    ESPN_CONFIG.espnS2,
    ESPN_CONFIG.swid
  );

  const result = await importSeasonTransactions(fetcher, year);

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('IMPORT SUMMARY');
  console.log('='.repeat(50));

  if (result.success) {
    console.log(`\n✓ ${result.year}: ${result.imported} teams imported, ${result.skipped} skipped`);
  } else {
    console.log(`\n✗ ${result.year}: ${result.error}`);
  }

  // Refresh materialized view
  console.log('\nRefreshing materialized views...');
  const { error } = await supabase.rpc('refresh_transaction_views');
  if (error) {
    console.warn('  Warning: Could not refresh views:', error.message);
  } else {
    console.log('  ✓ Views refreshed successfully');
  }

  console.log('\n' + '='.repeat(50));
  console.log('Import complete!');

  return result;
}

/**
 * Main entry point
 */
async function main() {
  const command = process.argv[2] || 'test';
  const yearArg = process.argv[3];

  switch (command) {
    case 'test':
      await testConnection();
      break;
    case 'import':
      if (yearArg) {
        const year = parseInt(yearArg, 10);
        if (isNaN(year) || year < 2000 || year > 2100) {
          console.error('Invalid year specified. Use a valid year like 2025.');
          process.exit(1);
        }
        await importSingleSeason(year);
      } else {
        await importAllTransactions();
      }
      break;
    case 'report':
      if (yearArg) {
        const year = parseInt(yearArg, 10);
        if (isNaN(year) || year < 2000 || year > 2100) {
          console.error('Invalid year specified. Use a valid year like 2025.');
          process.exit(1);
        }
        const fetcher = new ESPNTransactionFetcher(
          ESPN_CONFIG.leagueId,
          ESPN_CONFIG.seasonYear,
          ESPN_CONFIG.espnS2,
          ESPN_CONFIG.swid
        );
        await fetcher.printTransactionReport(year);
      } else {
        await printReport();
      }
      break;
    default:
      console.log('Usage: node scripts/importTransactionHistory.js [test|import|report] [year]');
      console.log('');
      console.log('Commands:');
      console.log('  test          - Test connection and show sample data');
      console.log('  import        - Import transaction data for all seasons (2020-2025)');
      console.log('  import <year> - Import transaction data for a specific year');
      console.log('  report        - Print transaction report for all seasons');
      console.log('  report <year> - Print transaction report for a specific year');
      console.log('');
      console.log('Examples:');
      console.log('  node scripts/importTransactionHistory.js import 2025');
      console.log('  node scripts/importTransactionHistory.js report 2024');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
