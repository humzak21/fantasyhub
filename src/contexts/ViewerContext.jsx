/**
 * Who is looking, and what they are allowed to see.
 *
 * `user`, `isAdmin` and `teamOwnerNames` were threaded as props into every tab
 * component by both app shells — and they always travel together, because every
 * consumer feeds all three into the same masking helpers:
 *
 *     getMaskedTeamName(team, user, isAdmin, teamOwnerNames)
 *     canViewFullData(user, isAdmin, teamOwnerNames)
 *
 * They are one concept, so they are one context. `teamOwnerNames` in particular
 * was derived from the active season identically in both shells; deriving it
 * once here means the two can't disagree.
 *
 * Components destructure the same three names they used to receive as props, so
 * every existing `getMasked*` call site keeps working unchanged.
 */

import { createContext, useContext, useMemo } from 'react';

import { useAuth } from './AuthContext.jsx';
import { useActiveSeason, useIsApprovedMember, useIsParlayCommissioner } from '../../hooks/queries/index.js';
import { getTeamOwnerNames, isUserATeamOwner } from '../utils/displayNameUtils.js';

const ViewerContext = createContext(null);

/** A stable empty list, so an unapproved viewer's memo deps do not churn. */
const NO_OWNERS = [];

export function ViewerProvider({ children }) {
  const { user, isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const { data: activeSeason } = useActiveSeason();

  /**
   * The one non-admin role the league has. It is a database round trip, not a
   * JWT claim, so `isPending` is part of the answer: the route guard has to
   * wait for it or a commissioner deep-linking /parlay is bounced to the
   * default tab on every cold load, before the RPC has resolved.
   */
  const { data: isCommissioner, isPending: commissionerPending } = useIsParlayCommissioner();

  /**
   * Has the admin approved this account? Same shape as the commissioner
   * check: a database round trip with its own pending state. The admin is
   * folded in here, the way `isParlayCommissioner` folds them in, and the
   * query is disabled for them — and for a signed-out viewer, for whom
   * `isPending` would otherwise be true forever.
   */
  const { data: approved, isPending: approvalPending } = useIsApprovedMember();
  const isApproved = Boolean(isAdmin || approved === true);
  const isApprovalLoading = Boolean(isAuthenticated && !isAdmin && approvalPending);

  const allOwnerNames = useMemo(() => getTeamOwnerNames(activeSeason), [activeSeason]);

  /**
   * The one lever the approval gate pulls on the client.
   *
   * Every `getMasked*` helper and `canViewFullData` decide "real name or
   * masked" by asking whether the viewer's display name is in this list — and
   * an empty list means nobody is. So a signed-in account the admin has not
   * approved is handed no owners at all, and every one of the ~35 call sites
   * masks exactly as it does for a visitor, with no new argument to thread and
   * nothing a future call site can forget. `DisplayNamePrompt` only warns about
   * an unrecognised name when the list is non-empty, so an unapproved viewer
   * still gets asked for their name (the admin's queue shows it) without being
   * told it matches nobody. A signed-out viewer keeps the full list: they are
   * masked by having no `user`, and the prompt is not shown to them anyway.
   *
   * The database is the real boundary — every members-only read and write
   * checks `is_approved_member()` — so this is what the page *shows*, not what
   * keeps anyone out.
   */
  const teamOwnerNames = isAuthenticated && !isApproved ? NO_OWNERS : allOwnerNames;

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isAdmin,
      /**
       * True until the session has been resolved.
       *
       * `isAuthenticated` is false while a stored session is still being read
       * back, which is indistinguishable from "signed out" to anything that
       * only looks at the flag. A route guard that gates on authentication has
       * to wait for this or it bounces a signed-in viewer's deep link on every
       * cold load — the same trap `isParlayCommissionerLoading` exists for.
       */
      isAuthLoading: Boolean(authLoading),
      /**
       * Approved by the admin, or the admin. Members-only tabs, the member
       * write paths and — through `teamOwnerNames` above — every masked name
       * follow this, not `isAuthenticated`.
       */
      isApproved,
      /** True while the approval is still unknown. Never true signed-out or
       *  for the admin, whose answer needs no round trip. The route guard
       *  waits on it for the same reason it waits on `isAuthLoading`. */
      isApprovalLoading,
      teamOwnerNames,
      /**
       * Does this viewer own a team? Drives History-tab access, which the
       * desktop shell used to compute inline in its tab list.
       *
       * Goes through `isUserATeamOwner` rather than comparing by hand, because
       * the two obvious hand-rolled comparisons are both wrong. The inline
       * version this replaced read `user_metadata.display_name` — a key the app
       * never writes; signup and settings both write `name`/`full_name` — and
       * then ran `.includes()` against `teamOwnerNames`, which holds
       * `{ ownerName, teamName }` objects, not strings. Either mistake alone
       * pins this to `false`, and it did: the History tab was invisible to
       * everyone, admin included, from 2025-11-19 until this was fixed.
       * `isUserATeamOwner` resolves the name the way the rest of the app does
       * and accepts both shapes.
       */
      isTeamOwner: Boolean(isAuthenticated && user && isUserATeamOwner(user, teamOwnerNames)),
      /**
       * May this viewer see everyone's TD parlay picks?
       *
       * The admin is folded in here, as they are in every `getMasked*` helper —
       * but only here. The reverse must not happen: a commissioner is not an
       * admin, and nothing that reads `isAdmin` should start reading this.
       */
      isParlayCommissioner: Boolean(isAdmin || isCommissioner),
      /** True while the role is still unknown. Never true for a signed-out
       *  viewer — the query is disabled, so there is nothing to wait for. */
      isParlayCommissionerLoading: Boolean(isAuthenticated && commissionerPending)
    }),
    [
      user,
      isAuthenticated,
      isAdmin,
      authLoading,
      isApproved,
      isApprovalLoading,
      teamOwnerNames,
      isCommissioner,
      commissionerPending
    ]
  );

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

/**
 * @returns {{
 *   user: Object|null,
 *   isAuthenticated: boolean,
 *   isAdmin: boolean,
 *   isAuthLoading: boolean,
 *   isApproved: boolean,
 *   isApprovalLoading: boolean,
 *   teamOwnerNames: string[],
 *   isTeamOwner: boolean,
 *   isParlayCommissioner: boolean,
 *   isParlayCommissionerLoading: boolean
 * }}
 */
export function useViewer() {
  const context = useContext(ViewerContext);
  if (!context) {
    throw new Error('useViewer must be used inside a <ViewerProvider>');
  }
  return context;
}
