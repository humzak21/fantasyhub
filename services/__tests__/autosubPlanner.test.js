/**
 * What an autosub does when its starter is ruled out. The cases worth pinning
 * are the ones that must not touch a lineup: a manager who got to their phone,
 * a status that is only doubtful, a locked game.
 */

import { describe, it, expect } from 'vitest';

import {
  alertUserIds,
  canCoverSlot,
  decideAutosub,
  describeAutosub,
  isInWatchWindow,
  isRuledOut,
  swapLanded,
  WATCH_AFTER_MINUTES,
  WATCH_BEFORE_MINUTES
} from '../autosubPlanner.js';

const NOW = new Date('2026-11-08T16:00:00Z');
const LATER = new Date('2026-11-08T18:00:00Z');
const EARLIER = new Date('2026-11-08T15:00:00Z');

const RB_SLOT = 2;
const BENCH = 20;

const row = { starterKickoff: LATER, benchKickoff: LATER };
const out = { lineupSlotId: RB_SLOT, injuryStatus: 'OUT', eligibleSlots: [2, 23, 20, 21] };
const backup = { lineupSlotId: BENCH, injuryStatus: 'ACTIVE', eligibleSlots: [2, 23, 20, 21] };

const decide = (overrides = {}) =>
  decideAutosub({ row, starter: out, bench: backup, now: NOW, espnWrites: true, ...overrides });

describe('isRuledOut', () => {
  it('counts the statuses that mean the player will not play', () => {
    expect(['OUT', 'INJURY_RESERVE', 'SUSPENSION'].every(isRuledOut)).toBe(true);
  });

  it('does not count a player who may still play, or a status it does not know', () => {
    expect(['ACTIVE', 'QUESTIONABLE', 'DOUBTFUL', null, undefined, 'NEW'].some(isRuledOut)).toBe(false);
  });
});

describe('canCoverSlot', () => {
  it('takes a player at their own position', () => {
    expect(canCoverSlot('RB', 'RB')).toBe(true);
    expect(canCoverSlot('D/ST', 'D/ST')).toBe(true);
  });

  it('takes running backs, receivers and tight ends at FLEX, and nobody else', () => {
    expect(['RB', 'WR', 'TE'].every((position) => canCoverSlot('FLEX', position))).toBe(true);
    expect(['QB', 'K', 'D/ST'].some((position) => canCoverSlot('FLEX', position))).toBe(false);
  });

  it('refuses a receiver at running back', () => {
    expect(canCoverSlot('RB', 'WR')).toBe(false);
  });
});

describe('isInWatchWindow', () => {
  const minutes = (n) => new Date(NOW.getTime() + n * 60_000);

  it('opens two hours before kickoff and closes an hour after', () => {
    expect(isInWatchWindow(minutes(WATCH_BEFORE_MINUTES), NOW)).toBe(true);
    expect(isInWatchWindow(minutes(WATCH_BEFORE_MINUTES + 1), NOW)).toBe(false);
    expect(isInWatchWindow(minutes(-WATCH_AFTER_MINUTES), NOW)).toBe(true);
    expect(isInWatchWindow(minutes(-WATCH_AFTER_MINUTES - 1), NOW)).toBe(false);
  });

  it('does not watch a game with no known kickoff', () => {
    expect(isInWatchWindow(null, NOW)).toBe(false);
  });
});

describe('decideAutosub', () => {
  it('swaps when the starter is out, the bench player can play and nothing has kicked off', () => {
    expect(decide()).toEqual({ action: 'swap', injuryStatus: 'OUT', slotId: RB_SLOT });
  });

  it('leaves a healthy starter alone', () => {
    expect(decide({ starter: { ...out, injuryStatus: 'QUESTIONABLE' } })).toEqual({ action: 'wait' });
  });

  it('does not undo a manager who already moved the starter out of the lineup', () => {
    expect(decide({ starter: { ...out, lineupSlotId: BENCH } })).toEqual({ action: 'wait' });
    expect(decide({ starter: undefined })).toEqual({ action: 'wait' });
  });

  it('goes to the commissioners once the starter has kicked off', () => {
    expect(decide({ row: { ...row, starterKickoff: EARLIER } }).reason).toBe('kicked_off');
  });

  it('goes to the commissioners once the bench player has kicked off', () => {
    expect(decide({ row: { ...row, benchKickoff: EARLIER } }).reason).toBe('kicked_off');
  });

  it('goes to the commissioners while automatic swaps are off', () => {
    expect(decide({ espnWrites: false })).toMatchObject({ action: 'manual', reason: 'writes_off' });
  });

  it('goes to the commissioners when the bench player is no longer on the bench', () => {
    expect(decide({ bench: { ...backup, lineupSlotId: 4 } }).reason).toBe('bench_unavailable');
    expect(decide({ bench: undefined }).reason).toBe('bench_unavailable');
  });

  it('does not swap in a player who is ruled out too', () => {
    expect(decide({ bench: { ...backup, injuryStatus: 'OUT' } }).reason).toBe('bench_out');
  });

  it('takes ESPN at its word on who may play the slot', () => {
    expect(decide({ bench: { ...backup, eligibleSlots: [4, 20] } }).reason).toBe('ineligible');
    expect(decide({ bench: { ...backup, eligibleSlots: undefined } }).reason).toBe('ineligible');
  });
});

describe('swapLanded', () => {
  it('needs the bench player in the slot and the starter out of it', () => {
    expect(swapLanded({
      starter: { lineupSlotId: BENCH }, bench: { lineupSlotId: RB_SLOT }, slotId: RB_SLOT
    })).toBe(true);
  });

  it('is false when the lineup did not move', () => {
    expect(swapLanded({
      starter: { lineupSlotId: RB_SLOT }, bench: { lineupSlotId: BENCH }, slotId: RB_SLOT
    })).toBe(false);
  });

  it('is false when the read has no such player', () => {
    expect(swapLanded({ starter: undefined, bench: undefined, slotId: RB_SLOT })).toBe(false);
  });
});

describe('describeAutosub', () => {
  const fired = {
    status: 'manual',
    slot: 'RB',
    injuryStatus: 'OUT',
    team: { owner: 'Harshil Pareek' },
    starter: { name: 'Bijan Robinson' },
    bench: { name: 'Jaylen Warren' }
  };

  it('says there is nothing to do after a swap', () => {
    const { title, body } = describeAutosub({ ...fired, status: 'swapped' });
    expect(title).toBe('Autosub made');
    expect(body).toContain('Jaylen Warren is in for Bijan Robinson');
    expect(body).toContain('Nothing to do');
  });

  it('asks for the change, and says why it needs a person', () => {
    const { title, body } = describeAutosub({ ...fired, reason: 'kicked_off' });
    expect(title).toBe('Autosub needs you');
    expect(body).toContain('Start Jaylen Warren at RB');
    expect(body).toContain('LM Tools');
  });

  it('names ESPN\'s refusal', () => {
    const { body } = describeAutosub({ ...fired, reason: 'espn_refused', detail: 'TRAN_LINEUP_LOCKED' });
    expect(body).toContain('TRAN_LINEUP_LOCKED');
  });

  it('does not ask for a bench player who is not there', () => {
    const { body } = describeAutosub({ ...fired, reason: 'bench_unavailable' });
    expect(body).not.toContain('Start Jaylen Warren');
    expect(body).toContain('Check with Harshil Pareek');
  });

  it('keeps every title to one line on a lock screen', () => {
    for (const status of ['swapped', 'manual']) {
      expect(describeAutosub({ ...fired, status }).title.length).toBeLessThanOrEqual(30);
    }
  });
});

describe('alertUserIds', () => {
  it('tells the role holders, once each', () => {
    expect(alertUserIds({ roleHolderIds: ['a', 'b', 'a'], adminIds: ['z'] })).toEqual(['a', 'b']);
  });

  it('falls back to the admins, so a fired autosub is never heard by nobody', () => {
    expect(alertUserIds({ roleHolderIds: [], adminIds: ['z'] })).toEqual(['z']);
  });
});
