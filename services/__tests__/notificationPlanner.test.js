import { describe, it, expect } from 'vitest';

import {
  CLOSING_LEAD_HOURS,
  TAKE_EVENT_MAX_AGE_HOURS,
  TOPICS,
  formatDeadline,
  isGoneStatus,
  planPickemNotifications,
  planTakeNotifications,
  previewTake
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

describe('planTakeNotifications', () => {
  const NOW = new Date('2026-10-07T18:00:00Z');
  const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000);
  const TAKE = { id: 't1', authorId: 'author', body: 'Bijan finishes as the RB1.', wager: '$20' };
  const everything = [TOPICS.pickemsOpen, TOPICS.pickemsClosing, TOPICS.takesNew, TOPICS.takesReactions];
  const event = (eventType, subjectId, extra = {}) => ({
    id: `e-${eventType}-${subjectId}`,
    takeId: 't1',
    seasonId: 's26',
    eventType,
    subjectId,
    createdAt: minutesAgo(2),
    ...extra
  });
  const plan = (overrides) => planTakeNotifications({
    now: NOW,
    takes: new Map([['t1', TAKE]]),
    subscriptions: [sub('author', everything), sub('sam', everything), sub('lee', [TOPICS.pickemsOpen])],
    displayNames: { author: 'Humza', sam: 'Sam', lee: 'Lee' },
    ...overrides
  });

  it('announces a new take to everyone with it on, except the author', () => {
    const plans = plan({ events: [event('posted', 'author')] });
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: TOPICS.takesNew, eventId: 'e-posted-author', seasonId: 's26' });
    expect(plans[0].recipients.map((r) => r.userId)).toEqual(['sam']);
    expect(plans[0].payload).toEqual({
      title: 'New take from Humza',
      body: '“Bijan finishes as the RB1.” · $20 on it',
      url: '/takes?take=t1',
      tag: 'take-t1'
    });
  });

  it('tells only the author about a Hell Nah, with what it means for their stake', () => {
    const plans = plan({
      events: [event('faded', 'sam')],
      participants: [{ takeId: 't1', userId: 'sam', side: 'nah', wager: null }]
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].kind).toBe(TOPICS.takesReactions);
    expect(plans[0].recipients.map((r) => r.userId)).toEqual(['author']);
    expect(plans[0].payload.title).toBe('Sam said Hell Nah to your take');
    expect(plans[0].payload.body).toBe('“Bijan finishes as the RB1.” · If it hits, they owe you $20.');
  });

  it('names a Hell Yeah, and its stake when it has one', () => {
    const plain = plan({
      events: [event('backed', 'sam')],
      participants: [{ takeId: 't1', userId: 'sam', side: 'yeah', wager: null }]
    });
    expect(plain[0].payload.title).toBe('Sam said Hell Yeah to your take');
    expect(plain[0].payload.body).toBe('“Bijan finishes as the RB1.”');

    const staked = plan({
      events: [event('backed', 'sam')],
      participants: [{ takeId: 't1', userId: 'sam', side: 'yeah', wager: 'a beer' }]
    });
    expect(staked[0].payload.title).toBe('Sam said Hell Yeah to your take, with a beer on it');
  });

  it('says nothing about a Hell Nah withdrawn, or switched to a Hell Yeah, before the run', () => {
    expect(plan({ events: [event('faded', 'sam')], participants: [] })).toEqual([]);
    expect(plan({
      events: [event('faded', 'sam')],
      participants: [{ takeId: 't1', userId: 'sam', side: 'yeah', wager: null }]
    })).toEqual([]);
  });

  it('respects the author turning reactions off, and nobody else hears them', () => {
    const plans = plan({
      events: [event('faded', 'sam')],
      participants: [{ takeId: 't1', userId: 'sam', side: 'nah', wager: null }],
      subscriptions: [sub('author', [TOPICS.takesNew]), sub('sam', everything)]
    });
    expect(plans).toEqual([]);
  });

  it('skips stale events, deleted takes, withdrawals and edits', () => {
    expect(plan({ events: [event('posted', 'author', { createdAt: minutesAgo(TAKE_EVENT_MAX_AGE_HOURS * 60 + 1) })] })).toEqual([]);
    expect(plan({ events: [event('posted', 'author', { takeId: 'gone' })] })).toEqual([]);
    expect(plan({ events: [event('unfaded', 'sam'), event('edited', 'author'), event('graded', 'author')] })).toEqual([]);
  });

  it('keeps take wording away from accounts that may not read takes', () => {
    const plans = plan({ events: [event('posted', 'author')], excludedUserIds: new Set(['sam']) });
    expect(plans).toEqual([]);
  });

  it('gives each reaction its own tag so two Hell Nahs are two notifications', () => {
    const plans = plan({
      events: [event('faded', 'sam'), event('faded', 'lee', { createdAt: minutesAgo(1) })],
      participants: [
        { takeId: 't1', userId: 'sam', side: 'nah', wager: null },
        { takeId: 't1', userId: 'lee', side: 'nah', wager: null }
      ]
    });
    expect(plans.map((p) => p.payload.title)).toEqual(['Sam said Hell Nah to your take', 'Lee said Hell Nah to your take']);
    expect(new Set(plans.map((p) => p.payload.tag)).size).toBe(2);
  });
});

describe('previewTake', () => {
  it('collapses whitespace and trims a long take to the lock screen', () => {
    expect(previewTake('  two\n\nlines  ')).toBe('two lines');
    const long = 'x'.repeat(200);
    expect(previewTake(long)).toHaveLength(140);
    expect(previewTake(long).endsWith('…')).toBe(true);
  });
});
