/**
 * The approval gate on new accounts.
 *
 * Two questions, asked by two different people. "Am I approved" is the
 * viewer's own answer and drives masking and the members-only tabs, so it is
 * keyed on the user id like the commissioner check beside it. "Who is
 * waiting" is the admin's queue in Settings → Approvals.
 *
 * The one thing worth knowing about the first: the admin's approval cannot
 * reach the approved person's browser. `useSetMemberApproval` invalidates
 * `viewer.all`, but that is the *admin's* QueryClient; the member's own copy
 * of "no" is only refreshed by their tab. So a pending viewer polls once a
 * minute and on focus, and stops the moment the answer is yes. The database
 * refuses an unapproved write either way — the poll is how the page catches
 * up, not what keeps anyone out.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { useAuth } from '../../src/contexts/AuthContext.jsx';
import { qk } from './keys.js';

const db = () => getDb();

/**
 * Has the admin approved this viewer?
 *
 * Disabled for the admin (`ViewerContext` folds them in, so there is nothing
 * to ask) and for a signed-out viewer — which is why `isPending` must not be
 * read as "loading" without also checking those two.
 */
export function useIsApprovedMember() {
  const { user, isAuthenticated, isAdmin } = useAuth();

  return useQuery({
    queryKey: qk.viewer.approved(user?.id ?? null),
    queryFn: () => db().users.isApprovedMember(),
    enabled: Boolean(isAuthenticated && user?.id && !isAdmin),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // A "no" is the answer most likely to change under us. Ask again every
    // minute until it is a "yes", then stop asking.
    refetchInterval: (query) => (query.state.data === false ? 60_000 : false)
  });
}

/** How many are waiting — the number on the Settings sidebar badge. */
export const countPendingApprovals = (rows = []) =>
  rows.filter((row) => row.status === 'pending').length;

/** The admin's queue. Empty for everyone else, by the RPC's own guard. */
export function useMemberApprovals({ enabled = true } = {}) {
  const { isAdmin, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: qk.approvals.list(),
    queryFn: () => db().users.listMemberApprovals(),
    enabled: enabled && Boolean(isAuthenticated && isAdmin),
    staleTime: 30_000
  });
}

/**
 * Invalidate everything a decision touches: the queue, the member list the
 * roles picker draws from, and the viewer domain — the admin's own entry is
 * unaffected, but the pattern matches `useSetParlayCommissioners` and costs
 * nothing.
 */
function invalidateApprovals(queryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.approvals.all }),
    queryClient.invalidateQueries({ queryKey: qk.roles.all }),
    queryClient.invalidateQueries({ queryKey: qk.viewer.all })
  ]);
}

/** Approve, reject, or return to pending. Takes `{ userId, status, note? }`. */
export function useSetMemberApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, status, note = null }) =>
      db().users.setMemberApproval({ userId, status, note }),
    onSuccess: () => invalidateApprovals(queryClient)
  });
}

/** Revoke: delete the account. Takes `{ userId }`. Irreversible. */
export function useDeleteMemberAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId }) => db().users.deleteMemberAccount(userId),
    onSuccess: () => invalidateApprovals(queryClient)
  });
}
