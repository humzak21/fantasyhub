/**
 * ESPN Transaction Fetcher Service
 *
 * Fetches and parses transaction data from ESPN Fantasy Football API.
 * Aggregates transaction counts by team and type per season.
 *
 * Two ESPN views make one payload. `mTransactions2`, week by week, is every
 * add, drop, claim and draft pick — but it describes a trade only to the
 * teams in it. Any other team's executed trade comes back as a `TRADE_ACCEPT`
 * with no items, or with just the drop that made room, so a league of fourteen
 * read through one member's cookies showed that member's trades and nobody
 * else's (37 of 170 through 2026 week 8, measured 2026-11-02). The player card
 * view, `kona_playercard`, carries each player's own transaction history with
 * every leg, whoever asks, so `fetchSeasonTransactions` cards every player the
 * week view names and `mergeCardTrades` puts the full trades back. This is
 * what cwendt94/espn-api does as `fill_trade_items`.
 */

import { FAAB_TRADE_PROCESSED, parseFaabTransfers } from '../utils/faabLedger.js';
import { extractOwnerInfo } from '../utils/ownerUtils.js';

/** Topics per request from ESPN's league activity feed. */
const FEED_PAGE = 200;

/**
 * Player cards per request. ESPN answered 200 ids in one request on
 * 2026-11-02; this stays well under, and a season is about 350 ids.
 */
export const CARD_BATCH = 50;

/** A trade moved somebody: at least one leg of type TRADE. */
const hasTradeLeg = (transaction) =>
  (transaction.items ?? []).some((item) => item.type === 'TRADE');

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

/** The transaction kinds the counts are made of, and so the kinds stored individually. */
const EVENT_TYPES = new Set(['FREEAGENT', 'WAIVER', 'TRADE_ACCEPT']);

/**
 * Every player id a payload's items name: drafted, added, dropped or traded.
 *
 * A player who was traded was on a roster, and he got there through the draft
 * or an add, both of which the week view reports in full. So this is the
 * universe to card for hidden trades. Checked against every `player_week_stats`
 * row for 2020-26 on 2026-11-02: no rostered player was outside it. D/ST ids
 * are negative and are kept; 0 is ESPN's pool and is not a player.
 */
export function collectPlayerIds(transactions = []) {
  const ids = new Set();
  for (const transaction of transactions) {
    for (const item of transaction.items ?? []) {
      if (item.playerId) ids.add(item.playerId);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * The week view's rows with every executed trade filled in from player cards.
 *
 * Pure. A card's `transactions` lists the same `TRADE_ACCEPT` rows the week
 * view does, by the same id, with every leg present whoever is asking. A card
 * trade replaces the week view's row of the same id (which may be empty), and
 * a card trade the week view never listed is appended. Every player's copy of
 * a trade carried identical items when measured, but the copy with the most
 * items wins all the same, as espn-api does. Nothing but an executed trade
 * with a TRADE leg is taken from a card: adds and claims are the week view's.
 */
export function mergeCardTrades(transactions = [], cardEntries = []) {
  const byId = new Map();
  for (const entry of cardEntries) {
    for (const transaction of entry.transactions ?? []) {
      if (transaction.type !== 'TRADE_ACCEPT' || transaction.status !== 'EXECUTED') continue;
      if (!hasTradeLeg(transaction)) continue;
      const current = byId.get(transaction.id);
      if (!current || (current.items?.length ?? 0) < (transaction.items?.length ?? 0)) {
        byId.set(transaction.id, transaction);
      }
    }
  }

  const seen = new Set();
  const merged = transactions.map((transaction) => {
    seen.add(transaction.id);
    return (transaction.type === 'TRADE_ACCEPT' && byId.get(transaction.id)) || transaction;
  });
  for (const [id, transaction] of byId) {
    if (!seen.has(id)) merged.push(transaction);
  }
  return merged;
}

/**
 * Every executed transaction, one entry each, in `transaction_events`' shape.
 *
 * Pure, over the same payload `parseTransactionData` counts — the two read one
 * fetch, apply the same EXECUTED / TRADE_ACCEPT predicates, and so describe the
 * same moves. Team ids stay in ESPN's space here; the writer resolves them to
 * the season's teams and drops what is not a league team (ESPN's free-agent
 * pool appears as a team id on the other side of an add or a drop).
 *
 *   espnTeamId    who made it: the claimant, or a trade's proposer
 *   espnTeamIds   every team a player moved to or from
 *   espnPlayerIds the players acquired: the ADD of an add or claim, every
 *                 player moved in a trade (the drop that made room included)
 *   espnFromTeamIds / espnToTeamIds
 *                 aligned with espnPlayerIds: where each player came from and
 *                 went to. ESPN's pool is team 0, which the writer resolves to
 *                 no franchise.
 *   bidAmount     the FAAB bid, waiver claims only
 *   faab          the FAAB a trade moved, or null: { amount, espnFromTeamId,
 *                 espnToTeamId }. The direction is the trade's own
 *                 ACQUISITION_BUDGET_TRADE item (player id 0, which is not a
 *                 player and is left out of espnPlayerIds); the amount is the
 *                 feed's message 290 for the trade (`faabTransfers`, from
 *                 `parseFaabTransfers`), and null without it.
 *
 * @param {object} leagueData
 * @param {{ faabTransfers?: Array<{ tradeId: string|null, from: number, to: number, amount: number }> }} [options]
 */
export function parseTransactionEvents(leagueData = {}, { faabTransfers = [] } = {}) {
  const events = [];
  const transfersByTrade = new Map(
    faabTransfers.filter((transfer) => transfer.tradeId).map((transfer) => [String(transfer.tradeId), transfer])
  );

  for (const transaction of leagueData.transactions || []) {
    if (transaction.status !== 'EXECUTED' || !EVENT_TYPES.has(transaction.type)) continue;

    const isTrade = transaction.type === 'TRADE_ACCEPT';
    // A TRADE_ACCEPT that moved nobody is another team's trade as the week
    // view shows it to an outsider, or an acceptance filed on its own. The
    // trade itself arrives through `mergeCardTrades`; this row is not one.
    if (isTrade && !hasTradeLeg(transaction)) continue;
    const teamIds = new Set();
    // Player id → { from, to }, in item order. A player listed twice keeps where
    // they started and where they ended up.
    const moves = new Map();
    let faabLeg = null;

    for (const item of transaction.items || []) {
      if (item.toTeamId != null) teamIds.add(item.toTeamId);
      if (item.fromTeamId != null) teamIds.add(item.fromTeamId);
      if (item.type === 'ACQUISITION_BUDGET_TRADE') {
        faabLeg = { from: item.fromTeamId ?? null, to: item.toTeamId ?? null };
        continue;
      }
      // Player id 0 is ESPN's placeholder, not a player.
      if (!item.playerId || !(isTrade || item.type === 'ADD')) continue;

      const earlier = moves.get(item.playerId);
      moves.set(item.playerId, {
        from: earlier ? earlier.from : item.fromTeamId ?? null,
        to: item.toTeamId ?? null
      });
    }

    const processed = transaction.processDate ?? transaction.proposedDate ?? null;
    const transfer = isTrade ? transfersByTrade.get(String(transaction.id)) : null;
    const faab = transfer
      ? { amount: Number(transfer.amount), espnFromTeamId: transfer.from ?? null, espnToTeamId: transfer.to ?? null }
      : faabLeg
        ? { amount: null, espnFromTeamId: faabLeg.from, espnToTeamId: faabLeg.to }
        : null;

    events.push({
      espnTransactionId: String(transaction.id),
      type: transaction.type,
      scoringPeriod: transaction.scoringPeriodId ?? null,
      processedAt: processed != null ? new Date(processed).toISOString() : null,
      espnTeamId: transaction.teamId ?? null,
      espnTeamIds: [...teamIds].sort((a, b) => a - b),
      espnPlayerIds: [...moves.keys()],
      espnFromTeamIds: [...moves.values()].map((move) => move.from),
      espnToTeamIds: [...moves.values()].map((move) => move.to),
      bidAmount:
        transaction.type === 'WAIVER' && transaction.bidAmount != null
          ? Number(transaction.bidAmount)
          : null,
      faab
    });
  }

  return events;
}

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

      // Fetch all transactions by iterating through scoring periods. 2020 ran
      // 17; every season since runs 18, and week 18 still has adds and drops.
      const allTransactions = [];
      const maxWeeks = 18;

      for (let week = 1; week <= maxWeeks; week++) {
        const params = new URLSearchParams();
        params.append('view', 'mTransactions2');

        if (week === 1) {
          // Only need team/member data once. mSettings is the FAAB budget.
          params.append('view', 'mTeam');
          params.append('view', 'mMembers');
          params.append('view', 'mSettings');
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
          this._settingsData = weekData.settings;
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

      // The week view hides other teams' trades; the player cards do not.
      const cards = await this.fetchPlayerCardTransactions(seasonYear, collectPlayerIds(uniqueTransactions));
      const transactions = mergeCardTrades(uniqueTransactions, cards);
      const trades = transactions.filter(
        (transaction) => transaction.type === 'TRADE_ACCEPT' && transaction.status === 'EXECUTED' && hasTradeLeg(transaction)
      );
      console.log(`  ${trades.length} executed trades after carding ${cards.length} players`);

      return {
        transactions,
        teams: this._teamsData || [],
        members: this._membersData || [],
        settings: this._settingsData ?? null
      };
    } catch (error) {
      console.error(`Error fetching transactions for ${seasonYear}:`, error);
      throw error;
    }
  }

  /**
   * Every named player's own transaction history, from ESPN's player card
   * view: the same rows as `mTransactions2`, by the same ids, with every leg
   * of every trade present whoever asks. Cookied, like the league itself. The
   * ids go in `x-fantasy-filter`, ESPN's convention for this view, in batches
   * of `CARD_BATCH`. A failed batch throws: a season's trades written from a
   * partial set would overwrite a complete count with a smaller one.
   *
   * @param {number} year
   * @param {number[]} playerIds
   * @returns {Promise<Array>} the raw `players` entries, each with `.transactions`
   */
  async fetchPlayerCardTransactions(year, playerIds = []) {
    const ids = [...new Set(playerIds.filter((id) => id))];
    if (ids.length === 0) return [];

    const url = `${this.baseUrl}/${year}/segments/0/leagues/${this.leagueId}?view=kona_playercard`;
    const headers = { Accept: 'application/json' };
    if (this.espnS2 && this.swid) {
      headers['Cookie'] = `espn_s2=${this.espnS2}; SWID=${this.swid}`;
    }

    const entries = [];
    for (let start = 0; start < ids.length; start += CARD_BATCH) {
      const filter = {
        players: {
          filterIds: { value: ids.slice(start, start + CARD_BATCH) },
          filterStatsForTopScoringPeriodIds: { value: 17, additionalValue: [`00${year}`, `10${year}`] }
        }
      };
      const response = await fetch(url, {
        method: 'GET',
        headers: { ...headers, 'x-fantasy-filter': JSON.stringify(filter) }
      });
      if (!response.ok) {
        throw new Error(`ESPN player cards failed: ${response.status} - ${response.statusText}`);
      }
      const data = await response.json();
      entries.push(...((Array.isArray(data) ? data[0] : data)?.players ?? []));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return entries;
  }

  /**
   * The FAAB moved in processed trades, from the league activity feed. A
   * trade's own transaction row says FAAB moved and not how much, so this is
   * the only place the amounts are. Cookied, and a separate endpoint from the
   * league itself. See `utils/faabLedger.js`.
   */
  async fetchFaabTransfers(year = null) {
    const seasonYear = year || this.seasonYear;
    const url = `${this.baseUrl}/${seasonYear}/segments/0/leagues/${this.leagueId}/communication/?view=kona_league_communication`;
    const headers = { 'Accept': 'application/json' };

    if (this.espnS2 && this.swid) {
      headers['Cookie'] = `espn_s2=${this.espnS2}; SWID=${this.swid}`;
    }

    const topics = [];
    for (let offset = 0; ; offset += FEED_PAGE) {
      const filter = {
        topics: {
          filterType: { value: ['ACTIVITY_TRANSACTIONS'] },
          filterIncludeMessageTypeIds: { value: [FAAB_TRADE_PROCESSED] },
          limit: FEED_PAGE,
          limitPerMessageSet: { value: 25 },
          offset,
          sortMessageDate: { sortPriority: 1, sortAsc: false },
          sortFor: { sortPriority: 2, sortAsc: false }
        }
      };

      const response = await fetch(url, {
        method: 'GET',
        headers: { ...headers, 'x-fantasy-filter': JSON.stringify(filter) }
      });
      if (!response.ok) {
        throw new Error(`ESPN activity feed failed: ${response.status} - ${response.statusText}`);
      }

      const page = (await response.json()).topics ?? [];
      topics.push(...page);
      if (page.length < FEED_PAGE) return parseFaabTransfers(topics);
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
        // Track which teams are involved in this trade (team 0 is the pool)
        const teamsInTrade = new Set();
        if (transaction.items) {
          transaction.items.forEach(item => {
            if (item.toTeamId) teamsInTrade.add(item.toTeamId);
            if (item.fromTeamId) teamsInTrade.add(item.fromTeamId);
          });
        }
        // A trade moves players between at least two teams. A TRADE_ACCEPT
        // that does not is another team's trade as the week view shows it to
        // an outsider (no items, or only the drop that made room), or an
        // acceptance filed on its own; the trade itself comes from the player
        // cards, through `mergeCardTrades`. Until 2026-09-15 the drop-only
        // kind counted as a trade for the team that dropped.
        // `utils/recordBook::buildTrades` draws the same line over the stored
        // events, so a franchise's count and its listed trades agree.
        if (teamsInTrade.size < 2) return;
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

  /** Every executed transaction individually; see `parseTransactionEvents`. */
  parseTransactionEvents(leagueData, options) {
    return parseTransactionEvents(leagueData, options);
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
