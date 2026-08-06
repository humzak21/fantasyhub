/**
 * User profile lookups shared by pick'ems, awards and playoffs.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

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
