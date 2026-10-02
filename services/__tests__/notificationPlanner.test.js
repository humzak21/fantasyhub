import { describe, it, expect } from 'vitest';

import {
  CLOSING_LEAD_HOURS,
  TOPICS,
  formatDeadline,
  isGoneStatus,
  planPickemNotifications
} from '../notificationPlanner.js';

// Week 5, 2026: opens Tuesday 06 Oct 04:00 EDT, closes Thursday 08 Oct 20:00 EDT.
const WEEK = {
  id: 'w5',
  seasonId: 's26',
  weekNumber: 5,
  opensAt: new Date('2026-10-06T08:00:00Z'),
  closesAt: new Date('2026-10-09T00:00:00Z')
};

const sub = (userId, topics = [TOPICS.pickemsOpen, TOPICS.pickemsClosing], endpoint = `https://push.example/${userId}`) =>
  ({ userId, endpoint, topics });

const TUESDAY_SLOT = new Date('2026-10-06T14:00:00Z'); // 10 AM EDT
const THURSDAY_SLOT = new Date('2026-10-08T21:30:00Z'); // 5:30 PM EDT

describe('planPickemNotifications', () => {
  it('sends "open" on Tuesday to every device that wants it', () => {
    const plans = planPickemNotifications({
      now: TUESDAY_SLOT,
      week: WEEK,
      subscriptions: [sub('a'), sub('b', [TOPICS.pickemsClosing]), sub('c', [TOPICS.pickemsOpen])]
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].kind).toBe(TOPICS.pickemsOpen);
    expect(plans[0].recipients.map((r) => r.userId)).toEqual(['a', 'c']);
    expect(plans[0].payload).toMatchObject({
      title: "Week 5 pick'ems are open",
      body: 'Make your picks and your TD parlay pick before Thursday 8 PM ET.',
      url: '/pickems'
    });
  });

  it('sends the reminder on Thursday only to members who have not picked', () => {
    const plans = planPickemNotifications({
      now: THURSDAY_SLOT,
      week: WEEK,
      sent: new Set([TOPICS.pickemsOpen]),
      subscriptions: [sub('a'), sub('b'), sub('b', undefined, 'https://push.example/b-laptop'), sub('c', [TOPICS.pickemsOpen])],
      submittedUserIds: new Set(['a'])
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].kind).toBe(TOPICS.pickemsClosing);
    // Both of b's devices; not a (picked), not c (opted out of reminders).
    expect(plans[0].recipients.map((r) => r.endpoint)).toEqual(['https://push.example/b', 'https://push.example/b-laptop']);
    expect(plans[0].payload.title).toBe("Pick'ems close at 8 PM ET");
    expect(plans[0].payload.body).toBe("You haven't made your week 5 picks yet.");
  });

  it('never sends a kind twice', () => {
    const sent = new Set([TOPICS.pickemsOpen, TOPICS.pickemsClosing]);
    expect(planPickemNotifications({ now: TUESDAY_SLOT, week: WEEK, sent, subscriptions: [sub('a')] })).toEqual([]);
    expect(planPickemNotifications({ now: THURSDAY_SLOT, week: WEEK, sent, subscriptions: [sub('a')] })).toEqual([]);
  });

  it('skips "open" once the reminder is due, rather than sending both', () => {
    const plans = planPickemNotifications({ now: THURSDAY_SLOT, week: WEEK, subscriptions: [sub('a')] });
    expect(plans.map((p) => p.kind)).toEqual([TOPICS.pickemsClosing]);
  });

  it('sends nothing outside the window', () => {
    const before = new Date('2026-10-06T07:00:00Z');
    const after = new Date('2026-10-09T00:00:00Z');
    expect(planPickemNotifications({ now: before, week: WEEK, subscriptions: [sub('a')] })).toEqual([]);
    expect(planPickemNotifications({ now: after, week: WEEK, subscriptions: [sub('a')] })).toEqual([]);
  });

  it('holds the reminder until the lead window, under standard time too', () => {
    const early = new Date(WEEK.closesAt.getTime() - (CLOSING_LEAD_HOURS + 1) * 3600e3);
    expect(planPickemNotifications({ now: early, week: WEEK, sent: new Set([TOPICS.pickemsOpen]), subscriptions: [sub('a')] }))
      .toEqual([]);

    // December: closes 20:00 EST = 01:00 UTC Friday; the 21:30 UTC slot is 3.5 h before.
    const december = { ...WEEK, opensAt: new Date('2026-12-08T09:00:00Z'), closesAt: new Date('2026-12-11T01:00:00Z') };
    const plans = planPickemNotifications({ now: new Date('2026-12-10T21:30:00Z'), week: december, subscriptions: [sub('a')] });
    expect(plans.map((p) => p.kind)).toEqual([TOPICS.pickemsClosing]);
    expect(plans[0].payload.title).toBe("Pick'ems close at 8 PM ET");
  });

  it('sends nothing with no week or no subscribers', () => {
    expect(planPickemNotifications({ now: TUESDAY_SLOT, week: null, subscriptions: [sub('a')] })).toEqual([]);
    expect(planPickemNotifications({ now: TUESDAY_SLOT, week: WEEK, subscriptions: [] })).toEqual([]);
  });
});

describe('formatDeadline', () => {
  it('reads like the league says it', () => {
    expect(formatDeadline(new Date('2026-10-09T00:00:00Z'))).toBe('8 PM ET');
    expect(formatDeadline(new Date('2026-10-09T00:30:00Z'))).toBe('8:30 PM ET');
    expect(formatDeadline(new Date('2026-10-09T00:00:00Z'), 'America/Chicago')).toBe('7 PM CT');
  });
});

describe('isGoneStatus', () => {
  it('treats only 404 and 410 as a removed device', () => {
    expect(isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(429)).toBe(false);
    expect(isGoneStatus(500)).toBe(false);
  });
});
