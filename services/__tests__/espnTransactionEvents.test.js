/**
 * ESPN transactions, one entry each.
 *
 * Pinned: only executed moves of the three counted kinds, every team a player
 * moved between, the acquired players only, and a bid only on a waiver claim.
 */

import { describe, it, expect } from 'vitest';

import { collectPlayerIds, mergeCardTrades, parseTransactionEvents } from '../espnTransactionFetcher.js';

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
      bidAmount: 37,
      faab: null
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

describe('the FAAB a trade moved', () => {
  const legs = [
    { type: 'TRADE', playerId: 1, fromTeamId: 4, toTeamId: 9 },
    { type: 'TRADE', playerId: 2, fromTeamId: 9, toTeamId: 4 },
    // ESPN's budget item: player id 0, direction and no amount.
    { type: 'ACQUISITION_BUDGET_TRADE', playerId: 0, fromTeamId: 9, toTeamId: 4 }
  ];

  it('is not a player, and takes its amount from the feed message for the trade', () => {
    const [trade] = parseTransactionEvents(
      { transactions: [tx({ id: 'trade-1', type: 'TRADE_ACCEPT', items: legs })] },
      { faabTransfers: [{ tradeId: 'trade-1', from: 9, to: 4, amount: 15 }, { tradeId: 'other', from: 1, to: 2, amount: 5 }] }
    );

    expect(trade.espnPlayerIds).toEqual([1, 2]);
    expect(trade.faab).toEqual({ amount: 15, espnFromTeamId: 9, espnToTeamId: 4 });
  });

  it('keeps the direction with no amount when the feed has nothing for the trade', () => {
    const [trade] = parseTransactionEvents({ transactions: [tx({ id: 'trade-1', type: 'TRADE_ACCEPT', items: legs })] });
    expect(trade.faab).toEqual({ amount: null, espnFromTeamId: 9, espnToTeamId: 4 });
  });

  it('is null for a trade that moved none, and for a claim', () => {
    const events = parseTransactionEvents({
      transactions: [tx({ id: 'trade-2', type: 'TRADE_ACCEPT', items: legs.slice(0, 2) }), tx({ id: 'claim' })]
    });
    expect(events.map((event) => event.faab)).toEqual([null, null]);
  });
});

describe('a trade the week view hides', () => {
  it('is not an event on its own: a TRADE_ACCEPT with no TRADE leg is skipped', () => {
    const events = parseTransactionEvents({
      transactions: [
        // Another team's trade as `mTransactions2` shows it to an outsider.
        tx({ id: 'hidden', type: 'TRADE_ACCEPT', items: [] }),
        // The same, showing only the drop that made room.
        tx({ id: 'drop-only', type: 'TRADE_ACCEPT', items: [{ type: 'DROP', playerId: 3, fromTeamId: 9, toTeamId: 0 }] }),
        tx({ id: 'real', type: 'TRADE_ACCEPT', items: [{ type: 'TRADE', playerId: 1, fromTeamId: 4, toTeamId: 9 }] })
      ]
    });

    expect(events.map((event) => event.espnTransactionId)).toEqual(['real']);
  });
});

describe('collectPlayerIds', () => {
  it('names every player the items touch, once, D/ST included, never the pool', () => {
    expect(collectPlayerIds([
      tx({ items: [{ type: 'ADD', playerId: 111, toTeamId: 4 }, { type: 'DROP', playerId: -16001, fromTeamId: 4, toTeamId: 0 }] }),
      tx({ items: [{ type: 'TRADE', playerId: 111, fromTeamId: 4, toTeamId: 9 }, { type: 'ACQUISITION_BUDGET_TRADE', playerId: 0 }] }),
      tx({ items: undefined })
    ])).toEqual([-16001, 111]);
  });
});

describe('mergeCardTrades', () => {
  const legs = [
    { type: 'TRADE', playerId: 1, fromTeamId: 4, toTeamId: 9 },
    { type: 'TRADE', playerId: 2, fromTeamId: 9, toTeamId: 4 }
  ];
  const card = (transactions) => ({ id: 1, transactions });

  it('fills the week view\'s empty row from the card of the same id', () => {
    const merged = mergeCardTrades(
      [tx({ id: 'trade-1', type: 'TRADE_ACCEPT', items: [] })],
      [card([tx({ id: 'trade-1', type: 'TRADE_ACCEPT', items: legs })])]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].items).toEqual(legs);
  });

  it('appends a trade the week view never listed, and keeps the copy with the most items', () => {
    const fuller = [...legs, { type: 'DROP', playerId: 3, fromTeamId: 9, toTeamId: 0 }];
    const merged = mergeCardTrades(
      [tx({ id: 'claim-1' })],
      [
        card([tx({ id: 'trade-2', type: 'TRADE_ACCEPT', items: legs })]),
        card([tx({ id: 'trade-2', type: 'TRADE_ACCEPT', items: fuller })])
      ]
    );

    expect(merged.map((transaction) => transaction.id)).toEqual(['claim-1', 'trade-2']);
    expect(merged[1].items).toEqual(fuller);
  });

  it('takes nothing but executed trades with a leg from a card', () => {
    const merged = mergeCardTrades(
      [],
      [card([
        tx({ id: 'add', type: 'FREEAGENT' }),
        tx({ id: 'pending', type: 'TRADE_ACCEPT', status: 'PENDING', items: legs }),
        tx({ id: 'no-leg', type: 'TRADE_ACCEPT', items: [{ type: 'DROP', playerId: 3, fromTeamId: 9, toTeamId: 0 }] })
      ])]
    );

    expect(merged).toEqual([]);
  });

  it('leaves a row alone when no card describes it', () => {
    const rows = [tx({ id: 'claim-1' }), tx({ id: 'trade-x', type: 'TRADE_ACCEPT', items: legs })];
    expect(mergeCardTrades(rows, [])).toEqual(rows);
  });
});
