/**
 * Who the league's admins are.
 *
 * Admin is a `league_admins` row, and `public.is_admin()` answers from it —
 * the browser knows no admin email and no build-time user id. Two questions,
 * as with approvals: "am I an admin" is the viewer's own answer, keyed on the
 * user id so a different sign-in cannot read a cached yes; "who are the
 * admins" is the list in Settings → Admins.
 *
 * Because the first is a round trip, `isPending` is part of the answer.
 * `ViewerContext` turns it into `isAdminLoading`, and the route guard waits on
 * it, or an admin's deep link to an admin-gated tab would bounce on every cold
 * load before the RPC resolved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { useAuth } from '../../src/contexts/AuthContext.jsx';
import { qk } from './keys.js';

const db = () => getDb();

/**
 * Is this viewer a league admin? Disabled signed-out, so `isPending` must not
 * be read as "loading" without also checking `isAuthenticated`.
 */
export function useIsLeagueAdmin() {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: qk.viewer.admin(user?.id ?? null),
    queryFn: () => db().users.isLeagueAdmin(),
    enabled: Boolean(isAuthenticated && user?.id),
    // Granted by hand, roughly never — the commissioner check's cadence.
    staleTime: 30 * 60_000
  });
}

/**
 * The boolean, for the other hooks in this layer that only run for an admin
 * (the approval queue, the member list, the automation reads). They sit below
 * `ViewerProvider` in the import graph, so they ask the same cached query
 * rather than reading the context.
 */
export function useViewerIsAdmin() {
  return useIsLeagueAdmin().data === true;
}

/** Every current admin. Empty for anyone else, by the RPC's own guard. */
export function useLeagueAdmins({ enabled = true } = {}) {
  const { isAuthenticated } = useAuth();
  const isAdmin = useViewerIsAdmin();

  return useQuery({
    queryKey: qk.admins.list(),
    queryFn: () => db().users.listLeagueAdmins(),
    enabled: enabled && Boolean(isAuthenticated && isAdmin),
    staleTime: 60_000
  });
}

/**
 * Grant or revoke admin. Takes `{ userId, grant }`.
 *
 * Invalidates the admin list and the affected user's own `viewer.admin` entry
 * — in this browser that is only cached if the admin is looking at
 * themselves, but naming it keeps the rule honest — plus the caller's own,
 * which is one cheap RPC. Nothing else changed.
 */
export function useSetLeagueAdmin() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ userId, grant }) => db().users.setLeagueAdmin({ userId, grant }),
    onSuccess: (_changed, { userId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.admins.all }),
        queryClient.invalidateQueries({ queryKey: qk.viewer.admin(userId) }),
        user?.id && user.id !== userId
          ? queryClient.invalidateQueries({ queryKey: qk.viewer.admin(user.id) })
          : null
      ])
  });
}
