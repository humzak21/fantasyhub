/**
 * ESPN transactions, counted per team.
 *
 * Pinned: a trade counts once for each team it moved players between, and a
 * `TRADE_ACCEPT` that moved nobody between two teams counts for nobody. ESPN
 * files those — rows with no items, and the drop that made room for a real
 * trade filed again as a row of its own — and until 2026-09-15 the second kind
 * counted as a trade for the team that dropped. The fixtures are shaped after
 * the league's 2022 rows.
 */

import { describe, it, expect } from 'vitest';

import { ESPNTransactionFetcher } from '../espnTransactionFetcher.js';

const tradesByTeam = (transactions) => {
  const summary = new ESPNTransactionFetcher('1', 2022).parseTransactionData({
    teams: [{ id: 1, abbrev: 'ONE' }, { id: 3, abbrev: 'THR' }, { id: 6, abbrev: 'SIX' }],
    members: [],
    transactions
  });
  return Object.fromEntries(summary.map((team) => [team.espnTeamId, team.trades]));
};

const trade = (id, items) => ({ id, type: 'TRADE_ACCEPT', status: 'EXECUTED', teamId: 1, items });

describe('parseTransactionData trades', () => {
  it('counts a trade once for each team, whatever it moved', () => {
    expect(tradesByTeam([
      trade('real', [
        { type: 'TRADE', playerId: 10, fromTeamId: 3, toTeamId: 1 },
        { type: 'TRADE', playerId: 11, fromTeamId: 1, toTeamId: 3 },
        { type: 'TRADE', playerId: 12, fromTeamId: 1, toTeamId: 3 },
        { type: 'DROP', playerId: 13, fromTeamId: 3, toTeamId: 0 }
      ])
    ])).toEqual({ 1: 1, 3: 1, 6: 0 });
  });

  it('counts nothing for a row that moved nobody between two teams', () => {
    expect(tradesByTeam([
      // The drop from the trade above, filed again on its own.
      trade('drop-only', [{ type: 'DROP', playerId: 13, fromTeamId: 3, toTeamId: 0 }]),
      trade('empty', [])
    ])).toEqual({ 1: 0, 3: 0, 6: 0 });
  });
});
