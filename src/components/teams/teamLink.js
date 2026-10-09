/**
 * The link into one team's roster on the Teams tab.
 *
 * `/teams?team=<id>` scrolls that team's card into view. The parameter name
 * lives here, beside the path builder, so the side that writes the link and
 * the side that reads it cannot spell it differently. This module imports
 * nothing: Rankings is in the eager chunk and Teams is lazy, and importing the
 * tab itself just to build a URL would drag it into the first paint.
 */
export const TEAM_PARAM = 'team';

/** @param {string|number} teamId */
export function teamRosterPath(teamId) {
  return `/teams?${new URLSearchParams({ [TEAM_PARAM]: String(teamId) })}`;
}
