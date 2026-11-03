import { describe, it, expect } from 'vitest';

import { FAAB_TRADE_PROCESSED, buildFaabLedger, espnFaabRemaining, faabBalance, parseFaabTransfers } from '../faabLedger.js';

const settings = { acquisitionSettings: { isUsingAcquisitionBudget: true, acquisitionBudget: 100 } };

/** The league on 2026-11-02, as ESPN reported it. */
const COUNTERS = { 1: 87, 2: 47, 3: 42, 4: 26, 5: 78, 6: 96, 7: 76, 8: 87, 9: 75, 10: 55, 11: 64, 12: 37, 13: 44, 14: 51 };
const BIDS = { 1: 114, 2: 80, 3: 61, 4: 26, 5: 78, 6: 109, 7: 71, 8: 89, 9: 87, 10: 65, 11: 82, 12: 62, 13: 50, 14: 21 };
const TRANSFERS = [
  [1, 6, 8], [7, 11, 20], [6, 2, 10], [1, 12, 15], [14, 11, 10], [14, 2, 10],
  [3, 13, 7], [14, 1, 10], [13, 7, 15], [13, 11, 1], [11, 3, 18], [2, 9, 2]
].map(([from, to, amount]) => ({ from, to, amount }));

const teams = Object.entries(COUNTERS).map(([id, spent]) => ({
  id: Number(id),
  transactionCounter: { acquisitionBudgetSpent: spent }
}));
const bids = new Map(Object.entries(BIDS).map(([id, amount]) => [Number(id), amount]));

const league = () => buildFaabLedger({ teams, settings, bids, transfers: TRANSFERS });

describe('espnFaabRemaining', () => {
  it('is the budget less what ESPN says was spent', () => {
    expect(espnFaabRemaining({ transactionCounter: { acquisitionBudgetSpent: 87 } }, settings)).toBe(13);
  });

  it('keeps a real zero', () => {
    expect(espnFaabRemaining({ transactionCounter: { acquisitionBudgetSpent: 100 } }, settings)).toBe(0);
  });

  it('is unknown, not the whole budget, when ESPN gives no counter', () => {
    expect(espnFaabRemaining({}, settings)).toBeNull();
  });

  it('is unknown in a league with no budget', () => {
    const none = { acquisitionSettings: { isUsingAcquisitionBudget: false, acquisitionBudget: 100 } };
    expect(espnFaabRemaining({ transactionCounter: { acquisitionBudgetSpent: 0 } }, none)).toBeNull();
    expect(espnFaabRemaining({ transactionCounter: { acquisitionBudgetSpent: 0 } }, undefined)).toBeNull();
  });
});

describe('parseFaabTransfers', () => {
  const message = (id, messageTypeId, from, to, targetId) => ({ id, messageTypeId, from, to, targetId });

  it('reads a processed trade\'s amount', () => {
    const topics = [{ targetId: 'trade-9', messages: [message('m1', FAAB_TRADE_PROCESSED, 14, 1, 10)] }];
    expect(parseFaabTransfers(topics)).toEqual([{ from: 14, to: 1, amount: 10, tradeId: 'trade-9' }]);
  });

  it('names no trade for a topic without one', () => {
    const topics = [{ messages: [message('m1', FAAB_TRADE_PROCESSED, 14, 1, 10)] }];
    expect(parseFaabTransfers(topics)[0].tradeId).toBeNull();
  });

  it('ignores a proposal, an offer and a veto, which moved nothing', () => {
    const topics = [{ messages: [message('a', 284, 1, 4, 12), message('b', 286, 1, 4, 12), message('c', 289, 1, 4, 12)] }];
    expect(parseFaabTransfers(topics)).toEqual([]);
  });

  it('counts a message once, however many pages it arrives on', () => {
    const topic = { messages: [message('m1', FAAB_TRADE_PROCESSED, 14, 1, 10)] };
    expect(parseFaabTransfers([topic, topic])).toHaveLength(1);
  });

  it('survives a topic with no messages', () => {
    expect(parseFaabTransfers([{}])).toEqual([]);
  });
});

describe('buildFaabLedger', () => {
  it('works out what each team was awarded, from the real league', () => {
    const awarded = Object.fromEntries([...league()].map(([id, row]) => [id, row.awarded]));

    expect(awarded).toEqual({ 1: 40, 2: 15, 3: 8, 4: 0, 5: 0, 6: 15, 7: 0, 8: 2, 9: 10, 10: 10, 11: 5, 12: 10, 13: 15, 14: 0 });
  });

  it('nets trades out to nothing across the league', () => {
    const rows = [...league().values()];
    const net = rows.reduce((sum, row) => sum + row.tradedIn - row.tradedOut, 0);
    expect(net).toBe(0);
  });

  it('explains a team that bid little but spent a lot: it traded its FAAB away', () => {
    expect(league().get(14)).toEqual({ budget: 100, tradedIn: 0, tradedOut: 30, awarded: 0 });
  });

  it('has no entry for a team with no counter', () => {
    const ledger = buildFaabLedger({ teams: [{ id: 1 }], settings, bids, transfers: [] });
    expect(ledger.size).toBe(0);
  });

  it('is empty in a league with no budget', () => {
    const none = { acquisitionSettings: { isUsingAcquisitionBudget: false, acquisitionBudget: 100 } };
    expect(buildFaabLedger({ teams, settings: none, bids }).size).toBe(0);
    expect(buildFaabLedger({ teams, settings: undefined, bids }).size).toBe(0);
  });

  it('shows a net take-back as a negative award', () => {
    const ledger = buildFaabLedger({
      teams: [{ id: 1, transactionCounter: { acquisitionBudgetSpent: 30 } }],
      settings,
      bids: new Map([[1, 20]]),
      transfers: []
    });
    expect(ledger.get(1).awarded).toBe(-10);
  });
});

describe('faabBalance', () => {
  it('adds up to what ESPN says is left, for every team', () => {
    for (const [id, row] of league()) {
      const balance = faabBalance({ ...row, spent: BIDS[id] });
      expect(balance.left).toBe(100 - COUNTERS[id]);
    }
  });

  it('reads the team that looked over budget', () => {
    expect(faabBalance({ ...league().get(1), spent: 114 })).toEqual({
      budget: 100,
      awarded: 40,
      tradedIn: 10,
      tradedOut: 23,
      traded: -13,
      had: 127,
      spent: 114,
      left: 13
    });
  });

  it('takes the stored numeric as a string', () => {
    expect(faabBalance({ budget: 100, awarded: 0, tradedIn: 0, tradedOut: 0, spent: '26.00' }).left).toBe(74);
  });

  it('is nothing before the sync has read a ledger', () => {
    expect(faabBalance({ budget: null, awarded: null, tradedIn: null, tradedOut: null, spent: 26 })).toBeNull();
  });
});
