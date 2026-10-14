/**
 * Alerts: every push notification the viewer was sent, kept in
 * `notification_inbox` because a push is gone the moment it is tapped
 * (20261014120000_notification_inbox.sql).
 *
 * One cache entry, `qk.viewer.inbox(userId)`, serves both the bell's unread
 * badge in the shell and the list on the Alerts page. Marking read updates
 * that entry in place first, so the dot on a row and the number on the bell
 * drop together, then refetches to take the database's timestamps.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { useAuth } from '../../src/contexts/AuthContext.jsx';
import { qk } from './keys.js';

const db = () => getDb();

/** How many of these alerts are unread. */
export function countUnread(rows = []) {
  return rows.reduce((count, row) => count + (row.readAt ? 0 : 1), 0);
}

export function useNotificationInbox({ enabled = true } = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.viewer.inbox(user?.id ?? null),
    queryFn: () => db().notifications.getMyInbox(),
    enabled: Boolean(user?.id) && enabled,
    // A push arrives while the app is in the background; opening it again is
    // when the badge should catch up.
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    staleTime: 30_000
  });
}

export function useInboxMutations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = qk.viewer.inbox(user?.id ?? null);

  const setRows = (update) => queryClient.setQueryData(key, (rows) => (rows ? update(rows) : rows));
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  /** Mark these ids read, or every unread alert with no ids. */
  const markRead = useMutation({
    mutationFn: (ids = null) => db().notifications.markInboxRead(ids),
    onMutate: (ids = null) => {
      const now = new Date();
      const only = ids?.length ? new Set(ids) : null;
      setRows((rows) => rows.map((row) =>
        (!row.readAt && (!only || only.has(row.id)) ? { ...row, readAt: now } : row)));
    },
    onSettled: refresh
  });

  const remove = useMutation({
    mutationFn: (id) => db().notifications.deleteInboxItem(id),
    onMutate: (id) => setRows((rows) => rows.filter((row) => row.id !== id)),
    onSettled: refresh
  });

  return { markRead, remove };
}
