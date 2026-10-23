/**
 * Which team in a season belongs to the person looking at the page.
 *
 * Owner names are this league's identity key (CLAUDE.md), so the answer is the
 * viewer's display name against `teams.owner`, compared through
 * `normalizeOwnerName` — the same comparison `isUserATeamOwner` and the parlay
 * board's division seating use, so a misspelling covered by `OWNER_ALIASES`
 * matches here too. Never `teams.user_id`: the `set_user_id` trigger stamps
 * whoever inserted the row, which is the admin on every team.
 *
 * `teamOwnerNames` is the masking lever from `ViewerContext`: it is empty for a
 * signed-in account the admin has not approved, and an unapproved viewer has
 * no team here for the same reason they see masked names everywhere else.
 */

import {
  getUserDisplayName,
  matchesTeamOwner,
  normalizeOwnerName
} from '../src/utils/displayNameUtils.js';

/**
 * @param {Array<{owner?: string}>} teams - the season's teams
 * @param {Object|null} user - the auth user
 * @param {Array<Object|string>} teamOwnerNames - from `useViewer()`
 * @returns {Object|null} the viewer's team, or null
 */
export function resolveViewerTeam(teams, user, teamOwnerNames) {
  const name = getUserDisplayName(user);
  if (!name || !Array.isArray(teams) || teams.length === 0) return null;
  if (!matchesTeamOwner(name, teamOwnerNames)) return null;

  const key = normalizeOwnerName(name);
  return teams.find((team) => normalizeOwnerName(team?.owner) === key) ?? null;
}

/** The franchise a team row belongs to, in either casing. */
export function franchiseIdOf(team) {
  return team?.franchiseId ?? team?.franchise_id ?? null;
}

export default resolveViewerTeam;
