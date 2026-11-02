/**
 * Autosubs: when one is due, what to do about it, and what to tell the
 * commissioners. Pure: `scripts/autosub-watch.js` reads the inputs, calls this
 * and acts on what it returns, the same decide/execute split as
 * `parlayGrader.js`. `canCoverSlot` is also what the roster picker offers.
 *
 * The rule that shapes `decideAutosub`: every doubtful case ends with a person,
 * never with a guess. A lineup is somebody's week, so the swap runs only when
 * ESPN's own live data says it can, and anything else goes to the commissioners
 * with the reason.
 */

import { isStarterSlot } from './db/espnMapping.js';

/**
 * Inactives come out about ninety minutes before kickoff. An hour after it is
 * long enough to catch a late ruling for the commissioners, who can still make
 * the change in LM Tools. `private.dispatch_autosub_watch()` holds the mirror
 * of both.
 */
export const WATCH_BEFORE_MINUTES = 120;
export const WATCH_AFTER_MINUTES = 60;

const MINUTE_MS = 60_000;

/**
 * What an admin may set `seasons.autosub_weekly_limit` to. Nine is every
 * starter in this league's lineup. `seasons_autosub_weekly_limit_check` is the
 * rule; this is what the setting offers.
 */
export const AUTOSUB_LIMIT_MIN = 1;
export const AUTOSUB_LIMIT_MAX = 9;

/** ESPN's bench slot. */
export const ESPN_BENCH_SLOT = 20;

/**
 * ESPN's own words, read raw. `mapESPNInjuryStatus` will not do here: it answers
 * ACTIVE for anything it does not know, which includes INJURY_RESERVE and
 * SUSPENSION, and "unknown" must never read as "healthy" or "ruled out".
 * DOUBTFUL and QUESTIONABLE are not out: those players often play.
 */
const RULED_OUT = new Set(['OUT', 'INJURY_RESERVE', 'SUSPENSION']);

export const isRuledOut = (status) => RULED_OUT.has(status);

/** What each reason says to the commissioners. Keys are `autosubs.reason`. */
const REASONS = {
  kicked_off: () => 'The game has kicked off, so this needs LM Tools.',
  writes_off: () => 'Automatic swaps are off, so this one is yours.',
  bench_unavailable: ({ bench, owner }) => `${bench} is no longer on the bench. Check with ${owner}.`,
  bench_out: ({ bench, owner }) => `${bench} is ruled out as well. Check with ${owner}.`,
  ineligible: ({ bench, slot }) => `ESPN will not take ${bench} at ${slot}.`,
  espn_refused: ({ detail }) => `ESPN refused the swap${detail ? ` (${detail})` : ''}.`,
  unconfirmed: () => 'The swap could not be confirmed, so check ESPN first.',
  interrupted: () => 'The run stopped partway, so check ESPN first.'
};

/**
 * May this player fill this lineup slot? Slots are the stored names
 * (`mapESPNRosterSlot`). The clause in `set_autosub()` is the mirror.
 */
export function canCoverSlot(slot, position) {
  if (!slot || !position) return false;
  if (slot === 'FLEX') return ['RB', 'WR', 'TE'].includes(position);
  return slot === position;
}

const hasKickedOff = (kickoff, now) => kickoff instanceof Date && kickoff <= now;

/** Is this kickoff near enough that an autosub on it is worth watching? */
export function isInWatchWindow(kickoff, now) {
  if (!(kickoff instanceof Date)) return false;
  const untilKickoff = kickoff.getTime() - now.getTime();
  return untilKickoff <= WATCH_BEFORE_MINUTES * MINUTE_MS && untilKickoff >= -WATCH_AFTER_MINUTES * MINUTE_MS;
}

/**
 * What to do about one armed autosub, from ESPN's live view of the two players.
 *
 * `wait` covers a starter who is healthy, and a starter the manager has already
 * moved out of the lineup: they got to their phone after all, and an autosub
 * must not undo that.
 *
 * @param {object} input
 * @param {{ starterKickoff: Date|null, benchKickoff: Date|null }} input.row
 * @param {{ lineupSlotId: number, injuryStatus: string, eligibleSlots: number[] }} [input.starter]
 * @param {{ lineupSlotId: number, injuryStatus: string, eligibleSlots: number[] }} [input.bench]
 * @param {Date} input.now
 * @param {boolean} input.espnWrites the season's `autosub_espn_writes`
 */
export function decideAutosub({ row, starter, bench, now, espnWrites }) {
  if (!starter || !isStarterSlot(starter.lineupSlotId)) return { action: 'wait' };
  if (!isRuledOut(starter.injuryStatus)) return { action: 'wait' };

  const injuryStatus = starter.injuryStatus;
  const manual = (reason) => ({ action: 'manual', reason, injuryStatus });

  if (!bench || bench.lineupSlotId !== ESPN_BENCH_SLOT) return manual('bench_unavailable');
  if (isRuledOut(bench.injuryStatus)) return manual('bench_out');
  if (!bench.eligibleSlots?.includes(starter.lineupSlotId)) return manual('ineligible');
  if (hasKickedOff(row.starterKickoff, now) || hasKickedOff(row.benchKickoff, now)) return manual('kicked_off');
  if (!espnWrites) return manual('writes_off');

  return { action: 'swap', injuryStatus, slotId: starter.lineupSlotId };
}

/** Did the swap land? Asked of a fresh read: a 200 from ESPN is not the proof. */
export function swapLanded({ starter, bench, slotId }) {
  return bench?.lineupSlotId === slotId && starter?.lineupSlotId !== slotId;
}

/**
 * The commissioners' notification for one fired autosub. A title fits one line
 * on a lock screen, so the title says only whether there is anything to do;
 * Alerts keeps the whole body. Names, never pronouns.
 *
 * @param {object} row a fired autosub with `starter`, `bench` and `team`
 */
export function describeAutosub(row) {
  const owner = row.team?.owner ?? row.team?.name ?? 'A member';
  const starter = row.starter?.name ?? 'A starter';
  const bench = row.bench?.name ?? 'the bench player';
  const slot = row.slot;
  const status = row.injuryStatus ?? 'out';

  if (row.status === 'swapped') {
    return {
      title: 'Autosub made',
      body: `${owner}: ${bench} is in for ${starter} (${status}) at ${slot} on ESPN. Nothing to do.`
    };
  }

  const why = REASONS[row.reason]?.({ bench, owner, slot, detail: row.detail }) ?? '';
  const ask = row.reason === 'bench_unavailable' || row.reason === 'bench_out'
    ? `${starter} is ${status}.`
    : `${starter} is ${status}. Start ${bench} at ${slot} on ESPN.`;
  return { title: 'Autosub needs you', body: `${owner}: ${ask} ${why}`.trim() };
}

/** The accounts to tell: the two roles, or the admins if nobody holds either. */
export function alertUserIds({ roleHolderIds = [], adminIds = [] }) {
  return [...new Set(roleHolderIds.length ? roleHolderIds : adminIds)];
}
