import * as React from 'react';

import { storage } from '../lib/utils';

/**
 * When this viewer last saw the takes board, kept in `localStorage`.
 *
 * **This is per-browser on purpose, and is the one thing about the badge worth
 * being explicit about.** A read receipt is a convenience, not a fact the
 * league needs — nothing is owed on the strength of it and nothing else reads
 * it — so it does not earn a table, an RLS policy and a write on every visit
 * to a tab. The cost is that reading the board on a phone leaves the laptop's
 * badge up. A row per member per device would fix that and would be the wrong
 * trade for a dot that says "go look".
 *
 * Keyed by user id, because a shared browser is a real thing in a league where
 * people check the board on whoever's laptop is open, and one member clearing
 * another's badge is a small lie the storage should not tell.
 *
 * Reactive across components, which it has to be: the shell renders the badge
 * and the tab marks it read, and those are two trees that never meet. A
 * module-level store with a listener set is what connects them — plus the
 * browser's own `storage` event, so a second tab agrees without a reload.
 */

const KEY_PREFIX = 'takes:lastSeenAt:';

const keyFor = (userId) => `${KEY_PREFIX}${userId}`;

const listeners = new Set();

/**
 * Snapshots must be referentially stable between notifications or
 * `useSyncExternalStore` re-renders forever. The values here are strings, so
 * that is free — but the cache also spares every render a `JSON.parse`, and it
 * is what makes an unwritable `localStorage` (private mode, blocked site data)
 * behave like memory rather than like nothing.
 */
const cache = new Map();

function read(userId) {
  if (!userId) return null;
  if (!cache.has(userId)) cache.set(userId, storage.get(keyFor(userId), null));
  return cache.get(userId);
}

function write(userId, isoDate) {
  if (!userId || !isoDate) return;
  if (read(userId) === isoDate) return;

  cache.set(userId, isoDate);
  storage.set(keyFor(userId), isoDate);
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);

  // Another tab of the same app marking the board read. `storage` fires only
  // in the *other* documents, so this never double-notifies the writer.
  const onStorage = (event) => {
    if (event.key === null || event.key?.startsWith(KEY_PREFIX)) {
      cache.clear();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * @param {string|null|undefined} userId the signed-in viewer, or null
 * @returns {{ lastSeenAt: string|null, markSeen: (isoDate: string|null) => void }}
 *   `lastSeenAt` is null for a signed-out viewer and for one who has never
 *   opened the tab; `src/components/takes/seen.js` reads both as "unread".
 */
export function useTakesSeen(userId) {
  const lastSeenAt = React.useSyncExternalStore(
    subscribe,
    () => read(userId),
    () => null // The server has no localStorage, and neither does a first paint.
  );

  const markSeen = React.useCallback(
    (isoDate) => {
      // Never move the mark backwards: the board is fetched per season, and
      // switching to a quieter one must not un-see the takes on a busier.
      if (!isoDate) return;
      const current = read(userId);
      if (current && new Date(isoDate) <= new Date(current)) return;
      write(userId, isoDate);
    },
    [userId]
  );

  return { lastSeenAt, markSeen };
}

export default useTakesSeen;
