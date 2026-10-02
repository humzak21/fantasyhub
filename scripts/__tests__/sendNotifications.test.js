/**
 * The sender's execute half: claim before sending, never send a claimed kind,
 * delete devices the push service says are gone, and keep the rest. The
 * decisions themselves are `notificationPlanner`'s and tested there.
 */

import { describe, it, expect, vi } from 'vitest';

import { deliver, sendDueNotifications } from '../send-notifications.js';
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
