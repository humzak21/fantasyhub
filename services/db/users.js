/**
 * User profile lookups shared by pick'ems, awards and playoffs.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { throwDbError } from './errors.js';
import { createLogger } from './logger.js';

const log = createLogger('db:users');
// Helper method to get user display names from auth (public-safe, no emails exposed)
export async function getUserDisplayNames(ctx, userIds) {
  if (!userIds || userIds.length === 0) return {};

  const userDisplayNames = {};

  // Try to get user display names using the public-safe RPC function
  try {
    const { data: usersData, error: usersError } = await ctx.client.rpc('get_user_display_names', {
      user_ids: userIds
    });

    if (!usersError && usersData && Array.isArray(usersData)) {
      usersData.forEach(user => {
        if (user && user.id) {
          userDisplayNames[user.id] = user.display_name || `User ${user.id.slice(0, 8)}`;
        }
      });
    }
  } catch (rpcError) {
    log.warn('RPC function get_user_display_names not available:', rpcError);

    // Fallback: get current user details only
    try {
      const { data: { user } } = await ctx.client.auth.getUser();
      if (user && userIds.includes(user.id)) {
        userDisplayNames[user.id] = user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          `User ${user.id.slice(0, 8)}`;
      }
    } catch (authError) {
      log.warn('Could not get current user details:', authError);
    }
  }

  // Fill in any missing users with fallback names
  userIds.forEach(userId => {
    if (!userDisplayNames[userId]) {
      userDisplayNames[userId] = `User ${userId.slice(0, 8)}`;
    }
  });

  return userDisplayNames;
}

/**
 * Is the caller the league's parlay commissioner?
 *
 * One RPC rather than a read of `league_roles`: that table's SELECT policy only
 * shows a viewer their own row, so a read would work but would also hand the
 * client the shape of the role system to reason about. The function answers the
 * one question, and returns false for an anonymous caller (`auth.uid()` is
 * NULL) rather than failing.
 */
export async function isParlayCommissioner(ctx) {
  try {
    const { data: { session } } = await ctx.client.auth.getSession();
    if (!session?.user?.id) return false;

    const { data, error } = await ctx.client.rpc('is_parlay_commissioner');

    if (error) throw error;

    return data === true;
  } catch (error) {
    // Not `throwDbError`: this gates a tab, and a failed role check means "not
    // a commissioner", not a broken page. The alternative is an error boundary
    // over the whole shell because a role lookup blipped.
    log.warn('parlay commissioner check failed:', error?.message ?? error);
    return false;
  }
}

/** The one role the app grants. `league_roles.role` is CHECK-constrained to it. */
export const PARLAY_COMMISSIONER = 'parlay_commissioner';

/**
 * Every account, for the admin's role picker.
 *
 * Returns `[]` for anyone but the admin — the guard lives inside
 * `list_league_members()`, so this is not a check the caller can forget.
 */
export async function listLeagueMembers(ctx) {
  try {
    const { data, error } = await ctx.client.rpc('list_league_members');

    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      createdAt: row.created_at
    }));
  } catch (error) {
    throwDbError(error, 'List league members');
  }
}

/**
 * Who currently holds the parlay commissioner role.
 *
 * A plain read of `league_roles`, not an RPC: the SELECT policy already says
 * "your own row, or everything if you are the admin", so a non-admin asking
 * this gets their own grant and nothing else — which is a true answer, not a
 * leak, and is what the settings page needs anyway.
 */
export async function getParlayCommissioners(ctx) {
  try {
    const { data, error } = await ctx.client
      .from('league_roles')
      .select('id, user_id, role, created_at')
      .eq('role', PARLAY_COMMISSIONER);

    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      role: row.role,
      createdAt: row.created_at
    }));
  } catch (error) {
    throwDbError(error, 'Get parlay commissioners');
  }
}

/**
 * Make the set of commissioners exactly `userIds`.
 *
 * A diff rather than delete-everything-then-reinsert. Two reasons: the wipe
 * leaves a window in which nobody holds the role, and re-inserting an unchanged
 * grant rewrites its `created_at`, losing the only record of when it was made.
 *
 * Enforcement is the `league_roles admin write` policy, so a non-admin calling
 * this writes nothing — the delete matches no rows and the insert is refused.
 * The count returned is what actually changed.
 */
export async function setParlayCommissioners(ctx, userIds = []) {
  try {
    const wanted = new Set(userIds.filter(Boolean));
    const current = await getParlayCommissioners(ctx);
    const held = new Set(current.map((row) => row.userId));

    const toRevoke = current.filter((row) => !wanted.has(row.userId)).map((row) => row.id);
    const toGrant = [...wanted].filter((id) => !held.has(id));

    if (toRevoke.length > 0) {
      const { error } = await ctx.client.from('league_roles').delete().in('id', toRevoke);
      if (error) throw error;
    }

    if (toGrant.length > 0) {
      const { error } = await ctx.client
        .from('league_roles')
        .insert(toGrant.map((userId) => ({ user_id: userId, role: PARLAY_COMMISSIONER })));
      if (error) throw error;
    }

    if (toGrant.length || toRevoke.length) {
      log.info(`parlay commissioners: +${toGrant.length} -${toRevoke.length}`);
    }

    return { granted: toGrant.length, revoked: toRevoke.length };
  } catch (error) {
    throwDbError(error, 'Set parlay commissioners');
  }
}
