import { describe, it, expect } from 'vitest';

import { describeTauntResult, tauntIdFromUrl, tauntState, TAUNT_WINDOW_HOURS } from '../taunts.js';

const now = new Date('2026-10-20T16:00:00Z');
const hoursAgo = (h) => new Date(now.getTime() - h * 3600 * 1000);

describe('tauntState', () => {
  it('is open inside the window, expired at it, sent once sent', () => {
    expect(tauntState({ createdAt: hoursAgo(1) }, now)).toBe('open');
    expect(tauntState({ createdAt: hoursAgo(TAUNT_WINDOW_HOURS) }, now)).toBe('expired');
    expect(tauntState({ createdAt: hoursAgo(1), sentAt: now }, now)).toBe('sent');
    expect(tauntState({ createdAt: hoursAgo(72), sentAt: hoursAgo(60) }, now)).toBe('sent');
  });

  it('is unknown without an offer', () => {
    expect(tauntState(undefined, now)).toBe('unknown');
  });
});

describe('tauntIdFromUrl', () => {
  it('reads the offer an alert links to', () => {
    expect(tauntIdFromUrl('/alerts?taunt=abc')).toBe('abc');
    expect(tauntIdFromUrl('/alerts?taunt=abc&send=1')).toBe('abc');
    expect(tauntIdFromUrl('/takes?take=t1')).toBeNull();
    expect(tauntIdFromUrl(null)).toBeNull();
  });
});

describe('describeTauntResult', () => {
  it('names the opponent', () => {
    expect(describeTauntResult('sent', 'Arya')).toBe('Taunt sent. Arya will get it in a minute.');
    expect(describeTauntResult('already_sent', 'Arya')).toBe('You already taunted Arya with this one.');
    expect(describeTauntResult('expired')).toMatch(/expired/);
    expect(describeTauntResult('not_found')).toMatch(/could not be found/);
  });
});
