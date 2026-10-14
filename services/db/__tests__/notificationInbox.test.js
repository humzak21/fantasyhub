/**
 * Alerts in the data layer: what the member reads, how "read" is asked of the
 * database (its clock, not the browser's), and what the sender writes.
 */

import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import { addToInbox, deleteInboxItem, getMyInbox, INBOX_LIMIT, markInboxRead } from '../notifications.js';

describe('notification inbox', () => {
  it('reads the newest alerts, read and unread', async () => {
    const ctx = makeCtx({
      'notification_inbox.select': () => [
        { id: 'a', kind: 'test', title: 'OG Jits', body: 'hi', url: '/', created_at: '2026-10-14T00:14:00Z', read_at: null },
        { id: 'b', kind: 'takes_new', title: 'New take', body: null, url: null, created_at: '2026-10-13T00:00:00Z', read_at: '2026-10-13T01:00:00Z' }
      ]
    });

    const rows = await getMyInbox(ctx);

    expect(rows[0]).toEqual({ id: 'a', kind: 'test', title: 'OG Jits', body: 'hi', url: '/', createdAt: new Date('2026-10-14T00:14:00Z'), readAt: null });
    expect(rows[1]).toMatchObject({ body: '', url: null, readAt: new Date('2026-10-13T01:00:00Z') });
    expect(ctx.client.callsFor('notification_inbox', 'select')[0].limit).toBe(INBOX_LIMIT);
  });

  it('asks the database to mark read, by id or all at once', async () => {
    const ctx = makeCtx({ 'rpc.mark_notifications_read': () => 2 });
    expect(await markInboxRead(ctx, ['a', 'b'])).toBe(2);
    await markInboxRead(ctx);
    await markInboxRead(ctx, []);
    expect(ctx.client.callsFor('rpc').map((call) => call.payload)).toEqual([
      { p_ids: ['a', 'b'] },
      { p_ids: null },
      { p_ids: null }
    ]);
  });

  it('deletes one alert by id', async () => {
    const ctx = makeCtx({ 'notification_inbox.delete': () => null });
    await deleteInboxItem(ctx, 'a');
    expect(ctx.client.callsFor('notification_inbox', 'delete')[0].filters).toEqual({ id: 'a' });
  });

  it('writes what the sender sent, one row per member', async () => {
    const ctx = makeCtx({ 'notification_inbox.insert': () => null });
    const count = await addToInbox(ctx, [{ userId: 'u1', kind: 'test', title: 'OG Jits', body: 'hi', url: '/' }, { userId: 'u2', kind: 'test', title: 'T' }]);
    expect(count).toBe(2);
    expect(ctx.client.callsFor('notification_inbox', 'insert')[0].payload).toEqual([
      { user_id: 'u1', kind: 'test', title: 'OG Jits', body: 'hi', url: '/' },
      { user_id: 'u2', kind: 'test', title: 'T', body: '', url: null }
    ]);
    expect(await addToInbox(ctx, [])).toBe(0);
  });
});
