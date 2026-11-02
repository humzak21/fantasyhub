/**
 * The link to a franchise's profile: `/profile/<franchise id>`. `/profile` on
 * its own is the viewer's own.
 *
 * A franchise id, not a name: an opaque uuid says nothing about who is in the
 * league to anyone the URL is shared with, the rule `headToHeadPath` follows.
 * This module imports nothing, so an eager tab can build the link without
 * pulling the profile's chunk into the first paint.
 */
export const PROFILE_TAB = 'profile';

/** @param {string} franchiseId */
export function profilePath(franchiseId) {
  return `/${PROFILE_TAB}/${encodeURIComponent(franchiseId)}`;
}
