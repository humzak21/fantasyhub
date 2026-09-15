/**
 * ESPN transactions, one entry each.
 *
 * Pinned: only executed moves of the three counted kinds, every team a player
 * moved between, the acquired players only, and a bid only on a waiver claim.
 */

import { describe, it, expect } from 'vitest';

import { parseTransactionEvents } from '../espnTransactionFetcher.js';

const tx = (overrides = {}) => ({
  id: 'abc-1',
  type: 'WAIVER',
  status: 'EXECUTED',
  teamId: 4,
  bidAmount: 37,
  scoringPeriodId: 3,
  processDate: Date.UTC(2025, 8, 17, 8),
  items: [
    { type: 'ADD', playerId: 111, fromTeamId: 0, toTeamId: 4 },
    { type: 'DROP', playerId: 222, fromTeamId: 4, toTeamId: 0 }
  ],
  ...overrides
});

describe('parseTransactionEvents', () => {
  it('keeps a waiver claim with its bid, its claimant and the player it added', () => {
    expect(parseTransactionEvents({ transactions: [tx()] })).toEqual([{
      espnTransactionId: 'abc-1',
      type: 'WAIVER',
      scoringPeriod: 3,
      processedAt: '2025-09-17T08:00:00.000Z',
      espnTeamId: 4,
      espnTeamIds: [0, 4],
      espnPlayerIds: [111],
      espnFromTeamIds: [0],
      espnToTeamIds: [4],
      bidAmount: 37
    }]);
  });

  it('records every team and every player a trade moved, and which way each went', () => {
    const [trade] = parseTransactionEvents({
      transactions: [tx({
        id: 'trade-1',
        type: 'TRADE_ACCEPT',
        bidAmount: 0,
        items: [
          { type: 'TRADE', playerId: 1, fromTeamId: 4, toTeamId: 9 },
          { type: 'TRADE', playerId: 2, fromTeamId: 9, toTeamId: 4 },
          // The drop that made room, to ESPN's pool: team 0.
          { type: 'DROP', playerId: 3, fromTeamId: 9, toTeamId: 0 }
        ]
      })]
    });

    expect(trade.espnTeamIds).toEqual([0, 4, 9]);
    expect(trade.espnPlayerIds).toEqual([1, 2, 3]);
    expect(trade.espnFromTeamIds).toEqual([4, 9, 9]);
    expect(trade.espnToTeamIds).toEqual([9, 4, 0]);
    expect(trade.bidAmount).toBeNull();
  });

  it('nets out a player listed twice: where they started and where they ended up', () => {
    const [trade] = parseTransactionEvents({
      transactions: [tx({
        type: 'TRADE_ACCEPT',
        items: [
          { type: 'TRADE', playerId: 1, fromTeamId: 4, toTeamId: 9 },
          { type: 'DROP', playerId: 1, fromTeamId: 9, toTeamId: 0 }
        ]
      })]
    });

    expect(trade.espnPlayerIds).toEqual([1]);
    expect([trade.espnFromTeamIds, trade.espnToTeamIds]).toEqual([[4], [0]]);
  });

  it('keeps a zero-dollar bid, which is still a bid', () => {
    expect(parseTransactionEvents({ transactions: [tx({ bidAmount: 0 })] })[0].bidAmount).toBe(0);
  });

  it('drops what was never executed and the kinds that are not counted', () => {
    const events = parseTransactionEvents({
      transactions: [
        tx({ status: 'FAILED_INVALIDPLAYERSOURCE' }),
        tx({ type: 'TRADE_PROPOSAL' }),
        tx({ type: 'ROSTER' }),
        tx({ id: 'fa-1', type: 'FREEAGENT', bidAmount: null })
      ]
    });

    expect(events.map((event) => event.espnTransactionId)).toEqual(['fa-1']);
    expect(events[0].bidAmount).toBeNull();
  });
});
