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
import {
  useActiveSeason,
  useIsApprovedMember,
  useIsLeagueAdmin,
  useIsParlayCommissioner
} from '../../hooks/queries/index.js';
import { getTeamOwnerNames, isUserATeamOwner } from '../utils/displayNameUtils.js';

const ViewerContext = createContext(null);

/** A stable empty list, so an unapproved viewer's memo deps do not churn. */
const NO_OWNERS = [];

export function ViewerProvider({ children }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  /**
   * Is this viewer a league admin? A `league_admins` row, asked of
   * `is_admin()` — the browser holds no admin email and no build-time id, so
   * like the two checks below this is a round trip, and `isPending` is part
   * of the answer. Disabled signed-out, where it would pend forever.
   */
  const { data: adminAnswer, isPending: adminPending } = useIsLeagueAdmin();
  const isAdmin = adminAnswer === true;
  const isAdminLoading = Boolean(isAuthenticated && adminPending);
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
   * folded in here, the way `isParlayCommissioner` folds them in.
   *
   * The query runs for every signed-in viewer, admin or not: whether they are
   * an admin is itself still in flight when it starts, so there is nothing to
   * disable it on. It is disabled only signed-out, for whom `isPending` would
   * otherwise be true forever. And the approval is unknown until *both*
   * answers are in — an admin whose approval row is slow is approved the
   * moment the admin check lands, and a member whose admin check is slow is
   * not yet known to be anything — so the loading flag waits on either.
   */
  const { data: approved, isPending: approvalPending } = useIsApprovedMember();
  const isApproved = Boolean(isAdmin || approved === true);
  const isApprovalLoading = Boolean(
    isAuthenticated && !isApproved && (adminPending || approvalPending)
  );

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
      /**
       * Is this viewer a league admin? From `league_admins`, through
       * `is_admin()` — the same rule every policy uses. False until the
       * answer arrives; see `isAdminLoading`.
       */
      isAdmin,
      /**
       * True while a signed-in viewer's admin status is still unknown. Never
       * true signed-out — the query is disabled, so there is nothing to wait
       * for. The route guard waits on it: History and Awards are gated on
       * `isAdmin`, and a false read during the fetch would bounce an admin's
       * deep link.
       */
      isAdminLoading,
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
      /** True while the approval is still unknown: signed in, not yet
       *  approved, and either the admin check or the approval check still in
       *  flight. Never true signed-out, and false the moment either answer
       *  is yes. The route guard waits on it for the same reason it waits on
       *  `isAuthLoading`. */
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
       * Is this viewer the TD parlay's commissioner?
       *
       * Not "may they see everyone's picks" — every member can, since
       * 2026-09-29, on the Pick'ems TD Parlay tab. The flag names the person
       * who grades them, and the board shows it as a badge.
       *
       * The admin is folded in here, as they are in every `getMasked*` helper —
       * but only here. The reverse must not happen: a commissioner is not an
       * admin, and nothing that reads `isAdmin` should start reading this.
       */
      isParlayCommissioner: Boolean(isAdmin || isCommissioner),
      /** True while the role is still unknown — the role check or, since the
       *  admin is folded in, the admin check. Never true for a signed-out
       *  viewer — the queries are disabled, so there is nothing to wait for. */
      isParlayCommissionerLoading: Boolean(
        isAuthenticated && !isAdmin && !isCommissioner && (commissionerPending || adminPending)
      )
    }),
    [
      user,
      isAuthenticated,
      isAdmin,
      isAdminLoading,
      authLoading,
      isApproved,
      isApprovalLoading,
      teamOwnerNames,
      isCommissioner,
      commissionerPending,
      adminPending
    ]
  );

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

/**
 * @returns {{
 *   user: Object|null,
 *   isAuthenticated: boolean,
 *   isAdmin: boolean,
 *   isAdminLoading: boolean,
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
