/**
 * The bell's badge and the Alerts page read one cache entry. Marking read
 * updates it before the round trip, so the number on the bell and the dot on
 * the row drop together.
 */

import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const notifications = {
  getMyInbox: vi.fn(async () => [
    { id: 'a', readAt: null },
    { id: 'b', readAt: null },
    { id: 'c', readAt: new Date('2026-10-13T00:00:00Z') }
  ]),
  markInboxRead: vi.fn(() => new Promise(() => {})), // never settles: the cache must move on its own
  deleteInboxItem: vi.fn(() => new Promise(() => {}))
};

vi.mock('../../../services/db/index.js', () => ({ getDb: () => ({ notifications }) }));
vi.mock('../../../src/contexts/AuthContext.jsx', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

const { countUnread, useInboxMutations, useNotificationInbox } = await import('../useNotificationInbox.js');

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return renderHook(() => ({ inbox: useNotificationInbox(), ...useInboxMutations() }), { wrapper });
}

describe('useNotificationInbox', () => {
  it('counts unread', () => {
    expect(countUnread([{ readAt: null }, { readAt: new Date() }, {}])).toBe(2);
    expect(countUnread()).toBe(0);
  });

  it('drops one unread the moment it is marked read', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.inbox.data).toHaveLength(3));

    act(() => result.current.markRead.mutate(['a']));

    await waitFor(() => expect(countUnread(result.current.inbox.data)).toBe(1));
    expect(notifications.markInboxRead).toHaveBeenCalledWith(['a']);
  });

  it('drops them all for "mark all read", leaving earlier read times alone', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.inbox.data).toHaveLength(3));

    act(() => result.current.markRead.mutate(null));

    await waitFor(() => expect(countUnread(result.current.inbox.data)).toBe(0));
    expect(result.current.inbox.data[2].readAt).toEqual(new Date('2026-10-13T00:00:00Z'));
  });

  it('removes a deleted alert at once', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.inbox.data).toHaveLength(3));

    act(() => result.current.remove.mutate('b'));

    await waitFor(() => expect(result.current.inbox.data.map((row) => row.id)).toEqual(['a', 'c']));
  });
});
