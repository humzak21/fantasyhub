/**
 * A team's FAAB as a ledger: what it started with, what it was given, what it
 * traded, what it spent, and what that leaves. Pure, so the sync and the page
 * mean the same thing by each line.
 *
 * Three sources, because ESPN keeps no one list of this:
 *
 * - **Spent** is the winning bids, `transactions.faab_spent`.
 * - **Traded** is ESPN's league activity feed. A trade's transaction row says
 *   FAAB moved (`ACQUISITION_BUDGET_TRADE`) but not how much; the feed's
 *   processed-trade message carries the amount. A proposal (284), an offer
 *   (286) and a veto (289) move nothing, so only 290 counts.
 * - **Awarded** is what is left over. The commissioner awards FAAB (pick'em
 *   prizes, takes) by editing a team's `transactionCounter.acquisitionBudgetSpent`,
 *   and the feed logs that the edit happened (message 167) with no amount. So
 *   the counter, which ESPN enforces, is the one figure that includes it:
 *
 *       counter = bids - tradedIn + tradedOut - awarded
 *
 *   which makes `awarded` a net figure per team, not a list of prizes. On
 *   2026-11-02 it came to a non-negative number for all 14 teams, zero exactly
 *   for the four the commissioner had never edited and non-zero for the ten
 *   they had, including a team that was traded out of $30 and came to $0.
 */

/** The feed's message for a processed trade's FAAB. `targetId` is the amount. */
export const FAAB_TRADE_PROCESSED = 290;

/**
 * What a team has left, or null when the league has no budget. Needs neither
 * the bids nor the feed: this is the figure ESPN enforces, and the one a member
 * can actually bid against.
 */
export function espnFaabRemaining(team, settings) {
  const acquisition = settings?.acquisitionSettings;
  if (!acquisition?.isUsingAcquisitionBudget) return null;
  const budget = acquisition.acquisitionBudget;
  const spent = team?.transactionCounter?.acquisitionBudgetSpent;
  if (!Number.isFinite(budget) || !Number.isFinite(spent)) return null;
  return budget - spent;
}

/**
 * The FAAB trades that happened, from the league activity feed's topics.
 *
 * @param {Array<{ messages?: Array }>} topics
 * @returns {Array<{ from: number, to: number, amount: number }>}
 */
export function parseFaabTransfers(topics = []) {
  const transfers = new Map();
  for (const topic of topics) {
    for (const message of topic.messages ?? []) {
      if (message.messageTypeId !== FAAB_TRADE_PROCESSED) continue;
      transfers.set(message.id, { from: message.from, to: message.to, amount: message.targetId });
    }
  }
  return [...transfers.values()];
}

/**
 * Each team's ledger, by ESPN team id. A team ESPN gives no counter for, and a
 * league with no budget, have no entry: unknown, never zero.
 *
 * @param {object} input
 * @param {Array<{ id: number, transactionCounter?: { acquisitionBudgetSpent?: number } }>} input.teams
 * @param {{ acquisitionSettings?: object }} input.settings
 * @param {Map<number, number>} input.bids - winning bids by ESPN team id
 * @param {ReturnType<typeof parseFaabTransfers>} input.transfers
 * @returns {Map<number, { budget: number, tradedIn: number, tradedOut: number, awarded: number }>}
 */
export function buildFaabLedger({ teams = [], settings, bids = new Map(), transfers = [] }) {
  const ledger = new Map();
  const acquisition = settings?.acquisitionSettings;
  if (!acquisition?.isUsingAcquisitionBudget || !Number.isFinite(acquisition.acquisitionBudget)) return ledger;

  for (const team of teams) {
    const counter = team?.transactionCounter?.acquisitionBudgetSpent;
    if (!Number.isFinite(counter)) continue;

    const tradedIn = transfers.filter((transfer) => transfer.to === team.id).reduce((sum, { amount }) => sum + amount, 0);
    const tradedOut = transfers.filter((transfer) => transfer.from === team.id).reduce((sum, { amount }) => sum + amount, 0);

    ledger.set(team.id, {
      budget: acquisition.acquisitionBudget,
      tradedIn,
      tradedOut,
      awarded: (bids.get(team.id) ?? 0) - counter - tradedIn + tradedOut
    });
  }
  return ledger;
}

/**
 * The ledger as a reader wants it: `had` is everything the team has been able
 * to spend, and `left` is what remains of it. `left` is ESPN's own
 * budget-minus-counter by construction, which is `teams.faab_remaining`.
 *
 * @param {{ budget: number|null, awarded: number|null, tradedIn: number|null, tradedOut: number|null, spent: number|null }} row
 * @returns {null | { budget: number, awarded: number, tradedIn: number, tradedOut: number, traded: number, had: number, spent: number, left: number }}
 */
export function faabBalance({ budget, awarded, tradedIn, tradedOut, spent }) {
  if ([budget, awarded, tradedIn, tradedOut].some((value) => value == null)) return null;
  const traded = tradedIn - tradedOut;
  const had = budget + awarded + traded;
  const paid = Number(spent ?? 0);
  return { budget, awarded, tradedIn, tradedOut, traded, had, spent: paid, left: had - paid };
}
