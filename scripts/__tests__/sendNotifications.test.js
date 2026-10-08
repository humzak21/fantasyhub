/**
 * The sender's execute half: claim before sending, never send a claimed kind,
 * delete devices the push service says are gone, and keep the rest. The
 * decisions themselves are `notificationPlanner`'s and tested there.
 */

import { describe, it, expect, vi } from 'vitest';

import { deliver, sendDueNotifications, sendTakeNotifications } from '../send-notifications.js';
import { TOPICS } from '../../services/notificationPlanner.js';

const WEEK = {
  id: 'w5',
  seasonId: 's26',
  weekNumber: 5,
  opensAt: new Date('2026-10-06T08:00:00Z'),
  closesAt: new Date('2026-10-09T00:00:00Z')
};

const device = (userId, endpoint = `https://push.example/${userId}`) => ({
  userId,
  endpoint,
  keys: { p256dh: 'k', auth: 'a' },
  topics: [TOPICS.pickemsOpen, TOPICS.pickemsClosing]
});

function fakeDb({ sent = [], devices = [], submitted = [], claim = 'log-1' } = {}) {
  const calls = { claimed: [], finished: [], deleted: [], marked: [] };
  const notifications = {
    getOpenPickEmWeek: vi.fn(async () => ({ season: { id: 's26', year: 2026, timeZone: 'America/New_York' }, week: WEEK })),
    getSentNotificationKinds: vi.fn(async () => new Set(sent)),
    getPushSubscriptions: vi.fn(async () => devices),
    getPickEmSubmitterIds: vi.fn(async () => new Set(submitted)),
    claimNotification: vi.fn(async (row) => { calls.claimed.push(row); return claim; }),
    finishNotification: vi.fn(async (id, counts) => { calls.finished.push({ id, ...counts }); }),
    deletePushSubscriptions: vi.fn(async (endpoints) => { calls.deleted.push(...endpoints); }),
    markPushSubscriptionsSent: vi.fn(async (endpoints) => { calls.marked.push(...endpoints); })
  };
  return { db: { notifications }, calls };
}

describe('sendDueNotifications', () => {
  it('claims, sends, and records the counts', async () => {
    const { db, calls } = fakeDb({ devices: [device('a'), device('b')] });
    const send = vi.fn(async () => ({ ok: true, statusCode: 201 }));

    const result = await sendDueNotifications({ db, now: new Date('2026-10-06T14:00:00Z'), send });

    expect(calls.claimed).toEqual([{ kind: TOPICS.pickemsOpen, seasonId: 's26', week: 5, recipients: 2 }]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1].title).toBe("Week 5 pick'ems are open");
    expect(calls.finished).toEqual([{ id: 'log-1', delivered: 2, failed: 0, removed: 0 }]);
    expect(calls.marked).toEqual(['https://push.example/a', 'https://push.example/b']);
    expect(result.sent[0]).toMatchObject({ kind: TOPICS.pickemsOpen, delivered: 2 });
  });

  it('sends nothing when another run already claimed the kind', async () => {
    const { db } = fakeDb({ devices: [device('a')], claim: null });
    const send = vi.fn();
    const result = await sendDueNotifications({ db, now: new Date('2026-10-06T14:00:00Z'), send });
    expect(send).not.toHaveBeenCalled();
    expect(result.sent).toEqual([]);
  });

  it('sends nothing on a dry run, and claims nothing', async () => {
    const { db, calls } = fakeDb({ devices: [device('a')] });
    const send = vi.fn();
    const result = await sendDueNotifications({ db, now: new Date('2026-10-06T14:00:00Z'), dryRun: true, send });
    expect(send).not.toHaveBeenCalled();
    expect(calls.claimed).toEqual([]);
    expect(result.sent[0]).toMatchObject({ kind: TOPICS.pickemsOpen, recipients: 1, dryRun: true });
  });

  it('says why when no window is open', async () => {
    const { db } = fakeDb();
    db.notifications.getOpenPickEmWeek.mockResolvedValue({ season: { id: 's26' }, week: null });
    expect(await sendDueNotifications({ db, send: vi.fn() })).toEqual({ reason: "no pick'em window is open", sent: [] });
  });
});

describe('deliver', () => {
  it('deletes gone devices and keeps the ones that failed for another reason', async () => {
    const plan = { recipients: [device('a'), device('b'), device('c')], payload: { title: 't' } };
    const answers = {
      'https://push.example/a': { ok: true, statusCode: 201 },
      'https://push.example/b': { ok: false, statusCode: 410 },
      'https://push.example/c': { ok: false, statusCode: 500, message: 'busy' }
    };
    const result = await deliver(plan, { send: async (sub) => answers[sub.endpoint] });
    expect(result.delivered).toEqual(['https://push.example/a']);
    expect(result.gone).toEqual(['https://push.example/b']);
    expect(result.failures).toEqual([{ endpoint: 'https://push.example/c', statusCode: 500, message: 'busy' }]);
  });
});

describe('sendTakeNotifications', () => {
  const NOW = new Date('2026-10-07T18:00:00Z');
  const takeDevice = (userId) => ({
    ...device(userId),
    topics: [TOPICS.takesNew, TOPICS.takesReactions]
  });
  const inputs = (events) => ({
    events,
    takes: new Map([['t1', { id: 't1', authorId: 'author', body: 'Bold call.', wager: null }]]),
    participants: [{ takeId: 't1', userId: 'sam', side: 'yeah', wager: null }],
    displayNames: { author: 'Humza', sam: 'Sam' },
    excludedUserIds: new Set()
  });
  const event = (id, eventType, subjectId) =>
    ({ id, takeId: 't1', seasonId: 's26', eventType, subjectId, createdAt: new Date('2026-10-07T17:58:00Z') });

  function takeDb({ events, devices, claim = (row) => `log-${row.takeEventId}` }) {
    const { db, calls } = fakeDb({ devices });
    db.notifications.getTakeNotificationInputs = vi.fn(async () => inputs(events));
    db.notifications.claimTakeNotification = vi.fn(async (row) => { calls.claimed.push(row); return claim(row); });
    return { db, calls };
  }

  it('claims each event by its id and sends it to the right people', async () => {
    const { db, calls } = takeDb({
      events: [event('e1', 'posted', 'author'), event('e2', 'backed', 'sam')],
      devices: [takeDevice('author'), takeDevice('sam'), takeDevice('lee')]
    });
    const send = vi.fn(async () => ({ ok: true, statusCode: 201 }));

    const result = await sendTakeNotifications({ db, now: NOW, send });

    expect(calls.claimed).toEqual([
      { kind: TOPICS.takesNew, seasonId: 's26', takeEventId: 'e1', recipients: 2 },
      { kind: TOPICS.takesReactions, seasonId: 's26', takeEventId: 'e2', recipients: 1 }
    ]);
    const sentTo = send.mock.calls.map(([recipient, payload]) => `${payload.title} → ${recipient.userId}`);
    expect(sentTo).toEqual([
      'New take from Humza → sam',
      'New take from Humza → lee',
      'Sam said Hell Yeah to your take → author'
    ]);
    expect(calls.finished).toEqual([
      { id: 'log-e1', delivered: 2, failed: 0, removed: 0 },
      { id: 'log-e2', delivered: 1, failed: 0, removed: 0 }
    ]);
    expect(result.sent).toHaveLength(2);
  });

  it('reads events from the last six hours, and never touches the pick\'em kinds', async () => {
    const { db, calls } = takeDb({ events: [event('e1', 'posted', 'author')], devices: [takeDevice('sam')] });
    await sendTakeNotifications({ db, now: NOW, send: vi.fn(async () => ({ ok: true })) });
    expect(db.notifications.getTakeNotificationInputs).toHaveBeenCalledWith(new Date('2026-10-07T12:00:00Z'));
    expect(db.notifications.getOpenPickEmWeek).not.toHaveBeenCalled();
    expect(calls.claimed.every((row) => row.takeEventId)).toBe(true);
  });

  it('skips an event another run claimed first', async () => {
    const { db } = takeDb({ events: [event('e1', 'posted', 'author')], devices: [takeDevice('sam')], claim: () => null });
    const send = vi.fn();
    expect((await sendTakeNotifications({ db, now: NOW, send })).sent).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not retry a device found gone earlier in the same run', async () => {
    const { db, calls } = takeDb({
      events: [event('e1', 'posted', 'author'), event('e2', 'backed', 'sam')],
      devices: [takeDevice('author'), takeDevice('sam')]
    });
    // The author is not told about their own post, so make sam's device gone
    // on the first send and check it is not in the second plan's claim.
    const send = vi.fn(async (recipient) => (recipient.userId === 'sam' ? { ok: false, statusCode: 410 } : { ok: true }));
    await sendTakeNotifications({ db, now: NOW, send });
    expect(calls.deleted).toEqual(['https://push.example/sam']);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('claims nothing on a dry run', async () => {
    const { db, calls } = takeDb({ events: [event('e1', 'posted', 'author')], devices: [takeDevice('sam')] });
    const result = await sendTakeNotifications({ db, now: NOW, dryRun: true, send: vi.fn() });
    expect(calls.claimed).toEqual([]);
    expect(result.sent[0]).toMatchObject({ kind: TOPICS.takesNew, recipients: 1, dryRun: true });
  });
});
