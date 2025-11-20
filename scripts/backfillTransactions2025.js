#!/usr/bin/env node

/**
 * Backfill Transactions 2025 Script
 *
 * Fetches all 2025 season transaction data from ESPN and populates
 * the transactions_2025 table. Run this once to backfill historical data,
 * then use weeklyUpdate.js to keep it updated.
 *
 * Usage:
 *   node scripts/backfillTransactions2025.js
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ESPNTransactionFetcher } from '../services/espnTransactionFetcher.js';
import { SupabaseDataManager } from '../services/supabaseDataManager.js';
import { ESPN_CONFIG } from '../config/espn-config.js';

const config = ESPN_CONFIG;

async function backfillTransactions() {
  console.log('='.repeat(50));
  console.log('BACKFILL TRANSACTIONS 2025');
  console.log('='.repeat(50));
  console.log('');

  // Initialize data manager
  let dataManager;
  try {
    dataManager = new SupabaseDataManager();
    await dataManager.initialize();
  } catch (error) {
    console.error('❌ Failed to initialize database:', error.message);
    process.exit(1);
  }

  // Get current season
  const { data: seasons, error: seasonError } = await dataManager.client
    .from('seasons')
    .select('id, name, year, teams(*)')
    .eq('year', 2025)
    .single();

  if (seasonError || !seasons) {
    console.error('❌ Could not find 2025 season in database');
    console.error('   Make sure you have a season with year = 2025');
    process.exit(1);
  }

  const season = seasons;
  console.log(`📋 Found season: ${season.name}`);
  console.log(`   Teams: ${season.teams?.length || 0}`);
  console.log('');

  // Create ESPN team ID to database team mapping
  const espnIdToTeam = {};
  const ownerToTeam = {};

  season.teams.forEach(team => {
    if (team.espn_team_id) {
      espnIdToTeam[team.espn_team_id] = team;
    }
    if (team.owner_name) {
      ownerToTeam[team.owner_name] = team;
    }
  });

  // Create transaction fetcher
  console.log('🔄 Fetching transactions from ESPN...');
  const fetcher = new ESPNTransactionFetcher(
    config.leagueId,
    config.seasonYear,
    config.espnS2,
    config.swid
  );

  // Fetch all 2025 transactions
  const transactionSummary = await fetcher.getSeasonTransactionSummary(2025);

  if (!transactionSummary || transactionSummary.length === 0) {
    console.warn('⚠️ No transaction data found for 2025');
    process.exit(0);
  }

  console.log(`✓ Found transactions for ${transactionSummary.length} teams`);
  console.log('');

  // Process each team's transactions
  const results = {
    updated: [],
    errors: []
  };

  for (const teamData of transactionSummary) {
    try {
      // Match team by ESPN ID first, then by owner name
      let team = espnIdToTeam[teamData.espnTeamId];

      if (!team) {
        team = ownerToTeam[teamData.ownerName];
      }

      if (!team) {
        results.errors.push({
          owner: teamData.ownerName,
          error: 'Could not match to database team'
        });
        continue;
      }

      // Calculate total transactions
      const totalTransactions = (teamData.free_agent_adds || 0) +
                               (teamData.waiver_claims || 0) +
                               (teamData.trades || 0) +
                               (teamData.drops || 0);

      // Upsert transaction data
      const { error: upsertError } = await dataManager.client
        .from('transactions_2025')
        .upsert({
          team_id: team.id,
          owner_name: teamData.ownerName,
          espn_team_id: teamData.espnTeamId,
          free_agent_adds: teamData.free_agent_adds || 0,
          waiver_claims: teamData.waiver_claims || 0,
          trades: teamData.trades || 0,
          drops: teamData.drops || 0,
          faab_spent: teamData.faab_spent || 0,
          last_synced_at: new Date().toISOString()
        }, {
          onConflict: 'team_id',
          ignoreDuplicates: false
        });

      if (upsertError) {
        throw upsertError;
      }

      results.updated.push({
        owner: teamData.ownerName,
        fa: teamData.free_agent_adds || 0,
        waiver: teamData.waiver_claims || 0,
        trades: teamData.trades || 0,
        drops: teamData.drops || 0,
        total: totalTransactions
      });

    } catch (error) {
      results.errors.push({
        owner: teamData.ownerName,
        error: error.message
      });
    }
  }

  // Print results
  console.log('='.repeat(50));
  console.log('BACKFILL RESULTS');
  console.log('='.repeat(50));
  console.log('');

  if (results.updated.length > 0) {
    console.log(`✅ Updated ${results.updated.length} teams:`);
    console.log('');
    console.log('Owner'.padEnd(25) + 'FA'.padStart(5) + 'Waiv'.padStart(6) + 'Trade'.padStart(6) + 'Drop'.padStart(6) + 'Total'.padStart(7));
    console.log('-'.repeat(55));

    results.updated
      .sort((a, b) => b.total - a.total)
      .forEach(r => {
        const name = r.owner.length > 22 ? r.owner.substring(0, 22) + '...' : r.owner;
        console.log(
          name.padEnd(25) +
          r.fa.toString().padStart(5) +
          r.waiver.toString().padStart(6) +
          r.trades.toString().padStart(6) +
          r.drops.toString().padStart(6) +
          r.total.toString().padStart(7)
        );
      });
    console.log('');
  }

  if (results.errors.length > 0) {
    console.log(`❌ ${results.errors.length} errors:`);
    results.errors.forEach(err => {
      console.log(`   ${err.owner}: ${err.error}`);
    });
    console.log('');
  }

  console.log('='.repeat(50));
  console.log('Backfill complete!');
  console.log('');
  console.log('Next steps:');
  console.log('  - Use weeklyUpdate.js to keep data updated');
  console.log('  - Check FranchiseProfile pages for transaction charts');
}

backfillTransactions().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
