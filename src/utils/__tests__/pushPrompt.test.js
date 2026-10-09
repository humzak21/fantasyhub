import { describe, it, expect } from 'vitest';

import {
  PROMPT_SNOOZE_DAYS,
  promptStep,
  readSnooze,
  shouldOfferPushPrompt,
  snoozeKey,
  writeSnooze
} from '../pushPrompt.js';

const NOW = new Date('2026-10-09T16:00:00Z');
const daysAgo = (n) => NOW.getTime() - n * 864e5;

describe('shouldOfferPushPrompt', () => {
  it('offers to an approved member whose device can be set up', () => {
    expect(shouldOfferPushPrompt({ isApproved: true, state: 'install', now: NOW })).toBe(true);
    expect(shouldOfferPushPrompt({ isApproved: true, state: 'off', now: NOW })).toBe(true);
  });

  it('never offers to a visitor, a device already on, one that cannot, or one that refused', () => {
    expect(shouldOfferPushPrompt({ isApproved: false, state: 'off', now: NOW })).toBe(false);
    for (const state of ['on', 'unsupported', 'denied', undefined]) {
      expect(shouldOfferPushPrompt({ isApproved: true, state, now: NOW })).toBe(false);
    }
  });

  it(`stays quiet for ${PROMPT_SNOOZE_DAYS} days after "Not now"`, () => {
    expect(shouldOfferPushPrompt({ isApproved: true, state: 'off', snoozedAt: daysAgo(3), now: NOW })).toBe(false);
    expect(shouldOfferPushPrompt({ isApproved: true, state: 'off', snoozedAt: daysAgo(PROMPT_SNOOZE_DAYS + 1), now: NOW })).toBe(true);
  });
});

describe('promptStep', () => {
  it('asks in an iPhone Safari tab, finishes in the Home Screen app, enables elsewhere', () => {
    expect(promptStep({ state: 'install', isStandalone: false })).toBe('ask');
    expect(promptStep({ state: 'off', isStandalone: true })).toBe('finish');
    expect(promptStep({ state: 'off', isStandalone: false })).toBe('enable');
  });
});

describe('the snooze', () => {
  const memory = () => {
    const map = new Map();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  };

  it('round-trips per member', () => {
    const storage = memory();
    writeSnooze(storage, 'u1', NOW);
    expect(readSnooze(storage, 'u1')).toBe(NOW.getTime());
    expect(readSnooze(storage, 'u2')).toBeNull();
    expect(snoozeKey('u1')).toContain('u1');
  });

  it('survives storage that throws', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(() => writeSnooze(broken, 'u1', NOW)).not.toThrow();
    expect(readSnooze(broken, 'u1')).toBeNull();
    expect(readSnooze(null, 'u1')).toBeNull();
  });
});
