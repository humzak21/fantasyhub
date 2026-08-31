/**
 * The weekly TD parlay.
 *
 * Three reads and one write, all of them thin — the interesting decisions are
 * in `services/db/parlay.js` (RLS owns privacy) and in the query keys. What
 * lives here is when *not* to ask:
 *
 *   * `useMyParlayPick` is keyed on the viewer, so signing out does not leave
 *     somebody else's pick in the cache under the same key.
 *   * `useParlayWeekPicks` is disabled while the week is open and the viewer is
 *     nobody special. RLS would answer `[]` correctly, but issuing a request
 *     whose answer is known is still a request.
 *   * `usePlayerSearch` takes an already-debounced term. Debouncing inside the
 *     hook would key the cache on a value that changes every keystroke.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { useAuth } from '../../src/contexts/AuthContext.jsx';
import { qk } from './keys.js';

const db = () => getDb();

/** The signed-in viewer's own pick for a week, or null. */
export function useMyParlayPick(pickEmWeekId, { enabled = true } = {}) {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: qk.parlay.myPick(pickEmWeekId, user?.id ?? null),
    queryFn: () => db().parlay.getMyParlayPick(pickEmWeekId),
    enabled: Boolean(pickEmWeekId) && isAuthenticated && enabled
  });
}

/**
 * Everyone's picks for a week.
 *
 * `enabled` is the caller's judgement about whether the answer can be anything
 * but empty — the closed/completed states, or a privileged viewer. It is a
 * politeness, not the privacy rule: passing `true` on an open week returns `[]`
 * from the database, not the league's picks.
 */
export function useParlayWeekPicks(pickEmWeekId, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.parlay.weekPicks(pickEmWeekId),
    queryFn: () => db().parlay.getParlayPicksForWeek(pickEmWeekId),
    enabled: Boolean(pickEmWeekId) && enabled
  });
}

/** A whole season of picks — the commissioner dashboard's single query. */
export function useSeasonParlayPicks(seasonId, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.parlay.season(seasonId),
    queryFn: () => db().parlay.getSeasonParlayPicks(seasonId),
    enabled: Boolean(seasonId) && enabled
  });
}

/**
 * Submit or replace this week's pick.
 *
 * Invalidates the three entries the write can change and nothing else: the
 * viewer's own pick, the week's visible picks, and the season roll-up the
 * dashboard reads. Not `qk.parlay.all` — pick'ems, rankings and the league are
 * untouched by a parlay pick, and there is no reason to make them prove it.
 */
export function useSubmitParlayPick(seasonId) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ pickEmWeekId, playerId = null, playerName = '' }) =>
      db().parlay.submitParlayPick(pickEmWeekId, { playerId, playerName }),
    onSuccess: (_row, { pickEmWeekId }) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: qk.parlay.myPick(pickEmWeekId, user?.id ?? null)
        }),
        queryClient.invalidateQueries({ queryKey: qk.parlay.weekPicks(pickEmWeekId) }),
        queryClient.invalidateQueries({ queryKey: qk.parlay.season(seasonId) })
      ])
  });
}

/**
 * Player-name autocomplete.
 *
 * `query` must already be debounced by the caller — see `useDebouncedValue`.
 * `searchPlayers` short-circuits under two characters without a request, so a
 * short term costs nothing but still gets a cache entry, which is why the hook
 * does not repeat the length check as an `enabled`.
 */
export function usePlayerSearch(query, { limit = 10, enabled = true } = {}) {
  const term = (query ?? '').trim();

  return useQuery({
    queryKey: qk.players.search(term),
    queryFn: () => db().players.searchPlayers(term, { limit }),
    enabled: enabled && term.length >= 2,
    // The player registry moves once a week, at most.
    staleTime: 5 * 60_000
  });
}

/**
 * Is this viewer the parlay commissioner?
 *
 * A query rather than a field on the session, because the answer lives in the
 * database — there is no claim in the JWT to read it from. `isPending` matters
 * to callers: the dashboard route has to wait for this before deciding a
 * commissioner is not allowed in, or a deep link to /parlay bounces on every
 * cold load.
 */
export function useIsParlayCommissioner() {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: qk.viewer.parlayCommissioner(user?.id ?? null),
    queryFn: () => db().users.isParlayCommissioner(),
    enabled: Boolean(isAuthenticated && user?.id),
    // A role is granted by hand, in SQL, roughly never.
    staleTime: 30 * 60_000
  });
}

/**
 * The accounts the admin can grant a role to. Empty for everyone else, by the
 * function's own guard.
 */
export function useLeagueMembers({ enabled = true } = {}) {
  const { isAdmin, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: qk.roles.members(),
    queryFn: () => db().users.listLeagueMembers(),
    enabled: enabled && Boolean(isAuthenticated && isAdmin),
    staleTime: 5 * 60_000
  });
}

/** Who currently holds `parlay_commissioner`. */
export function useParlayCommissioners({ enabled = true } = {}) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: qk.roles.parlayCommissioners(),
    queryFn: () => db().users.getParlayCommissioners(),
    enabled: enabled && isAuthenticated
  });
}

/**
 * Set the commissioner list to exactly the ids given.
 *
 * Invalidates the whole `viewer` domain, not just the admin's own entry: the
 * grant changes what *someone else* may see, and their session is keyed on
 * their own user id. Invalidating the key the admin happens to hold would
 * leave the grantee looking at a cached "no" for half an hour.
 */
export function useSetParlayCommissioners() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userIds) => db().users.setParlayCommissioners(userIds),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.roles.all }),
        queryClient.invalidateQueries({ queryKey: qk.viewer.all })
      ])
  });
}
