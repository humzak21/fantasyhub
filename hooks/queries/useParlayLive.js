/**
 * The TD parlay's live tracker (client side).
 *
 * Between the Thursday deadline and the following Tuesday sync, a pick is
 * submitted but ungraded — `scored_td` is NULL until the grader runs. This hook
 * fills that gap, but it does **not** talk to ESPN: it reads the shared result
 * the `parlay-live` edge function maintains, so the client's read path stays a
 * small, fast round trip and ESPN is called once for everyone (see
 * `services/db/parlay.js::getLiveStatus` and `supabase/functions/parlay-live`).
 *
 * It is the in-progress overlay only. It never writes, never touches
 * `scored_td`, and the card shows the official grade the moment one exists.
 *
 * The edge function refreshes ESPN at most every 30 minutes and only during
 * game windows, so the client polls gently: every few minutes while a game is
 * live (those calls mostly return the cached snapshot), and it stops entirely
 * once nothing is live. On a non-game day it makes one call and stops.
 */

import { useQuery } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { qk } from './keys.js';

const db = () => getDb();

/** Poll the shared snapshot this often while a game is live. The edge function
 *  only hits ESPN every 30 minutes, so a shorter client interval just re-reads
 *  the cache; 5 minutes keeps updates timely without churning invocations. */
const POLL_MS = 5 * 60_000;

/**
 * @param {string} pickEmWeekId
 * @param {{ seasonYear?: number|null, weekNumber?: number|null, enabled?: boolean }} [options]
 * @returns {import('@tanstack/react-query').UseQueryResult<{ status: object, live: boolean, refreshedAt: string|null }>}
 */
export function useParlayLive(pickEmWeekId, { seasonYear = null, weekNumber = null, enabled = true } = {}) {
  return useQuery({
    queryKey: qk.parlay.live(pickEmWeekId),
    enabled: Boolean(pickEmWeekId) && enabled,
    // The snapshot's own `refreshed_at` governs freshness; the client just
    // re-reads it. A short client staleTime avoids hammering the function on
    // every remount within a minute.
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
    // Keep re-reading only while something is live; otherwise one read and done.
    refetchInterval: (query) => (query.state.data?.live ? POLL_MS : false),
    queryFn: () =>
      db().parlay.getLiveStatus(pickEmWeekId, { nflWeek: weekNumber, year: seasonYear })
  });
}
