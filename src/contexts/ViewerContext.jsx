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
import { useActiveSeason, useIsParlayCommissioner } from '../../hooks/queries/index.js';
import { getTeamOwnerNames, isUserATeamOwner } from '../utils/displayNameUtils.js';

const ViewerContext = createContext(null);

export function ViewerProvider({ children }) {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { data: activeSeason } = useActiveSeason();

  /**
   * The one non-admin role the league has. It is a database round trip, not a
   * JWT claim, so `isPending` is part of the answer: the route guard has to
   * wait for it or a commissioner deep-linking /parlay is bounced to the
   * default tab on every cold load, before the RPC has resolved.
   */
  const { data: isCommissioner, isPending: commissionerPending } = useIsParlayCommissioner();

  const teamOwnerNames = useMemo(() => getTeamOwnerNames(activeSeason), [activeSeason]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isAdmin,
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
    [user, isAuthenticated, isAdmin, teamOwnerNames, isCommissioner, commissionerPending]
  );

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

/**
 * @returns {{
 *   user: Object|null,
 *   isAuthenticated: boolean,
 *   isAdmin: boolean,
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
