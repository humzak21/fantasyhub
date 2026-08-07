/**
 * ESPN Transaction Fetcher Service
 *
 * Fetches and parses transaction data from ESPN Fantasy Football API.
 * Aggregates transaction counts by team and type per season.
 */

import { extractOwnerInfo } from '../utils/ownerUtils.js';

// Transaction type mappings from ESPN API
export const TRANSACTION_TYPES = {
  FREEAGENT: 'free_agent',
  WAIVER: 'waiver',
  WAIVER_ERROR: 'waiver_error',
  TRADE_PROPOSAL: 'trade_proposal',
  TRADE_ACCEPT: 'trade',
  TRADE_DECLINE: 'trade_decline',
  TRADE_VETO: 'trade_veto',
  TRADE_UPHOLD: 'trade_uphold',
  DROP: 'drop',
  ROSTER: 'roster',
  DRAFT: 'draft'
};

// Human-readable labels for transaction types
export const TRANSACTION_LABELS = {
  free_agent: 'Free Agent Adds',
  waiver: 'Waiver Claims',
  trade: 'Trades',
  drop: 'Drops',
  roster: 'Roster Moves',
  draft: 'Draft Picks'
};

export class ESPNTransactionFetcher {
  constructor(leagueId, seasonYear, espnS2 = null, swid = null) {
    this.leagueId = leagueId;
    this.seasonYear = seasonYear;
    this.espnS2 = espnS2;
    this.swid = swid;
    this.baseUrl = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
    this.historyUrl = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory';
  }

  // This class held a lazily-constructed data manager and an
  // `initializeDataManager()` to build it, but never called a single method on
  // it — it only reads from ESPN and returns parsed data. Both are gone.

  /**
   * Fetch transaction data from ESPN API for a specific season
   * Fetches week-by-week to ensure all transactions are captured
   */
  async fetchSeasonTransactions(year = null) {
    const seasonYear = year || this.seasonYear;

    try {
      // First, get team and member data with a single request
      const baseUrl = seasonYear >= 2018
        ? `${this.baseUrl}/${seasonYear}/segments/0/leagues/${this.leagueId}`
        : `${this.historyUrl}/${this.leagueId}`;

      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };

      if (this.espnS2 && this.swid) {
        headers['Cookie'] = `espn_s2=${this.espnS2}; SWID=${this.swid}`;
      }

      console.log(`Fetching transactions for ${seasonYear}...`);

      // Fetch all transactions by iterating through scoring periods (weeks 1-17)
      const allTransactions = [];
      const maxWeeks = 17; // Regular season weeks

      for (let week = 1; week <= maxWeeks; week++) {
        const params = new URLSearchParams();
        params.append('view', 'mTransactions2');

        if (week === 1) {
          // Only need team/member data once
          params.append('view', 'mTeam');
          params.append('view', 'mMembers');
        }

        if (seasonYear < 2018) {
          params.append('seasonId', seasonYear.toString());
        }

        params.append('scoringPeriodId', week.toString());

        const response = await fetch(`${baseUrl}?${params}`, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          // Some weeks may not exist (e.g., future weeks in current season)
          if (response.status === 404) break;
          throw new Error(`ESPN API request failed: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        const weekData = Array.isArray(data) ? data[0] : data;

        // Collect transactions from this week
        if (weekData.transactions && weekData.transactions.length > 0) {
          allTransactions.push(...weekData.transactions);
        }

        // On first week, capture teams and members
        if (week === 1) {
          this._teamsData = weekData.teams;
          this._membersData = weekData.members;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Deduplicate transactions by ID
      const uniqueTransactions = [];
      const seenIds = new Set();
      for (const tx of allTransactions) {
        if (!seenIds.has(tx.id)) {
          seenIds.add(tx.id);
          uniqueTransactions.push(tx);
        }
      }

      console.log(`  Found ${uniqueTransactions.length} unique transactions across ${maxWeeks} weeks`);

      return {
        transactions: uniqueTransactions,
        teams: this._teamsData || [],
        members: this._membersData || []
      };
    } catch (error) {
      console.error(`Error fetching transactions for ${seasonYear}:`, error);
      throw error;
    }
  }

  /**
   * Parse and aggregate transaction data by team
   * Counts individual items (adds/drops) within each transaction
   */
  parseTransactionData(leagueData) {
    const transactions = leagueData.transactions || [];
    const teams = leagueData.teams || [];
    const members = leagueData.members || [];

    // Initialize aggregates for each team
    const teamAggregates = {};

    teams.forEach(team => {
      const { ownerName } = extractOwnerInfo(team, members);
      teamAggregates[team.id] = {
        espnTeamId: team.id,
        teamName: team.abbrev || `Team ${team.id}`,
        ownerName: ownerName || 'Unknown',
        free_agent_adds: 0,
        waiver_claims: 0,
        trades: 0,
        drops: 0,
        faab_spent: 0,
        total_transactions: 0
      };
    });

    // Process each transaction by counting individual items
    transactions.forEach(transaction => {
      const type = transaction.type;
      const status = transaction.status;

      // Only count executed transactions
      if (status !== 'EXECUTED') return;

      // Handle trades specially - count transactions not items
      if (type === 'TRADE_ACCEPT') {
        // Track which teams are involved in this trade
        const teamsInTrade = new Set();
        if (transaction.items) {
          transaction.items.forEach(item => {
            if (item.toTeamId) teamsInTrade.add(item.toTeamId);
            if (item.fromTeamId) teamsInTrade.add(item.fromTeamId);
          });
        }
        // Count one trade per team involved
        teamsInTrade.forEach(teamId => {
          if (teamAggregates[teamId]) {
            teamAggregates[teamId].trades++;
          }
        });
        return; // Don't count trade items as drops
      }

      // Process items for non-trade transactions
      if (transaction.items && transaction.items.length > 0) {
        transaction.items.forEach(item => {
          const itemType = item.type; // 'ADD' or 'DROP'
          const toTeamId = item.toTeamId;
          const fromTeamId = item.fromTeamId;

          if (itemType === 'ADD' && toTeamId && teamAggregates[toTeamId]) {
            // Count adds based on transaction type
            if (type === 'FREEAGENT') {
              teamAggregates[toTeamId].free_agent_adds++;
            } else if (type === 'WAIVER') {
              teamAggregates[toTeamId].waiver_claims++;
            }
          } else if (itemType === 'DROP' && fromTeamId && teamAggregates[fromTeamId]) {
            // Count drops for the team dropping the player
            teamAggregates[fromTeamId].drops++;
          }
        });
      }

      // Track FAAB spending (at transaction level)
      if (type === 'WAIVER' && transaction.bidAmount) {
        const teamId = transaction.teamId;
        if (teamAggregates[teamId]) {
          teamAggregates[teamId].faab_spent += transaction.bidAmount;
        }
      }
    });

    // Calculate totals (ACQ = free_agent_adds + waiver_claims + trades)
    Object.values(teamAggregates).forEach(team => {
      team.total_transactions = team.free_agent_adds + team.waiver_claims + team.trades + team.drops;
    });

    return Object.values(teamAggregates);
  }

  /**
   * Get transaction summary for a single season
   */
  async getSeasonTransactionSummary(year = null) {
    const leagueData = await this.fetchSeasonTransactions(year);
    return this.parseTransactionData(leagueData);
  }

  /**
   * Get transaction summary for multiple seasons
   */
  async getMultiSeasonTransactionSummary(years) {
    const results = {};

    for (const year of years) {
      try {
        console.log(`Processing ${year}...`);
        const summary = await this.getSeasonTransactionSummary(year);
        results[year] = summary;
        // Rate limiting - wait between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to fetch ${year}:`, error.message);
        results[year] = null;
      }
    }

    return results;
  }

  /**
   * Test connection and show transaction data preview
   */
  async testTransactionFetch() {
    try {
      console.log('Testing transaction fetch from ESPN Fantasy League...');
      const leagueData = await this.fetchSeasonTransactions();

      const transactionCount = leagueData.transactions?.length || 0;
      const teamCount = leagueData.teams?.length || 0;

      console.log(`\n✓ Successfully connected to league`);
      console.log(`✓ Found ${transactionCount} transactions`);
      console.log(`✓ Found ${teamCount} teams`);

      if (transactionCount > 0) {
        const summary = this.parseTransactionData(leagueData);

        console.log('\n=== Transaction Summary by Team ===');
        summary.sort((a, b) => b.total_transactions - a.total_transactions);

        summary.forEach(team => {
          console.log(`\n${team.teamName} (${team.ownerName}):`);
          console.log(`  Free Agent Adds: ${team.free_agent_adds}`);
          console.log(`  Waiver Claims: ${team.waiver_claims}`);
          console.log(`  Trades: ${team.trades}`);
          console.log(`  Drops: ${team.drops}`);
          console.log(`  FAAB Spent: $${team.faab_spent}`);
          console.log(`  Total: ${team.total_transactions}`);
        });

        return {
          success: true,
          transactionCount,
          teamCount,
          summary
        };
      }

      return {
        success: true,
        transactionCount,
        teamCount,
        summary: []
      };
    } catch (error) {
      console.error('❌ Failed to fetch transactions:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Print a human-readable transaction report
   */
  async printTransactionReport(year = null) {
    const summary = await this.getSeasonTransactionSummary(year);
    const seasonYear = year || this.seasonYear;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`TRANSACTION REPORT - ${seasonYear} SEASON`);
    console.log(`${'='.repeat(50)}\n`);

    // Sort by total transactions
    summary.sort((a, b) => b.total_transactions - a.total_transactions);

    // Print table header
    console.log('Team'.padEnd(25) + 'FA'.padStart(5) + 'Waiv'.padStart(6) + 'Trade'.padStart(6) + 'Drop'.padStart(6) + 'Total'.padStart(7));
    console.log('-'.repeat(55));

    summary.forEach(team => {
      const name = team.ownerName.length > 22 ? team.ownerName.substring(0, 22) + '...' : team.ownerName;
      console.log(
        name.padEnd(25) +
        team.free_agent_adds.toString().padStart(5) +
        team.waiver_claims.toString().padStart(6) +
        team.trades.toString().padStart(6) +
        team.drops.toString().padStart(6) +
        team.total_transactions.toString().padStart(7)
      );
    });

    console.log('-'.repeat(55));

    // Calculate totals
    const totals = summary.reduce((acc, team) => ({
      fa: acc.fa + team.free_agent_adds,
      waiver: acc.waiver + team.waiver_claims,
      trade: acc.trade + team.trades,
      drop: acc.drop + team.drops,
      total: acc.total + team.total_transactions
    }), { fa: 0, waiver: 0, trade: 0, drop: 0, total: 0 });

    console.log(
      'LEAGUE TOTAL'.padEnd(25) +
      totals.fa.toString().padStart(5) +
      totals.waiver.toString().padStart(6) +
      totals.trade.toString().padStart(6) +
      totals.drop.toString().padStart(6) +
      totals.total.toString().padStart(7)
    );

    console.log(`\n${'='.repeat(50)}\n`);

    return summary;
  }
}

/**
 * Factory function to create transaction fetcher with convenience methods
 */
export async function createTransactionFetcher(leagueId, seasonYear, espnS2 = null, swid = null) {
  const fetcher = new ESPNTransactionFetcher(leagueId, seasonYear, espnS2, swid);

  return {
    fetcher,

    async test() {
      return await fetcher.testTransactionFetch();
    },

    async getSummary(year = null) {
      return await fetcher.getSeasonTransactionSummary(year);
    },

    async getMultiYearSummary(years) {
      return await fetcher.getMultiSeasonTransactionSummary(years);
    },

    async printReport(year = null) {
      return await fetcher.printTransactionReport(year);
    }
  };
}

export default ESPNTransactionFetcher;
