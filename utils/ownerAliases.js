/**
 * Owner-name aliases: spellings that mean the same person.
 *
 * `teams.owner` is this league's cross-season identity key. It decides whether
 * a viewer is unmasked, seats a member's parlay pick in their division, and is
 * the fallback the ESPN matchers use when a team has no `espn_team_id`. ESPN's
 * copy of the name is whatever the manager typed into their ESPN profile, and
 * one of them typed it wrong: ESPN carries "Aashish Gatmaneni" against the
 * league's correct "Aashish Gatamaneni". Every ESPN read reproduced that
 * misspelling — the transactions table held it for all seven seasons — and
 * every comparison treated the two as strangers.
 *
 * This is the one place that knows they are the same person. Two functions:
 *
 *   canonicalOwnerName(name)  the league's spelling, for anything that is
 *                             about to be *stored* or shown
 *   ownerKey(name)            the comparison key, for anything that is
 *                             *matching* names — both spellings map to one key
 *
 * Every ESPN reader goes through `extractOwnerInfo`, which canonicalises, so a
 * misspelling never reaches a table. Every comparison — `normalizeOwnerName`
 * on the client, `buildTeamIndex` and `sameOwner` in the sync — goes through
 * `ownerKey`, so a misspelling already in a row, or typed by the person as
 * their display name, still matches. Adding an alias is one line in the map.
 *
 * Keys are the alias in comparison form (trimmed, lower-cased, single-spaced);
 * values are the canonical spelling exactly as `teams.owner` stores it.
 */

export const OWNER_ALIASES = Object.freeze({
  'aashish gatmaneni': 'Aashish Gatamaneni'
});

const fold = (name) =>
  typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').toLowerCase() : '';

/**
 * The league's spelling of an owner name. Unknown names come back trimmed and
 * otherwise untouched; non-strings come back as ''.
 *
 * @param {unknown} name
 * @returns {string}
 */
export function canonicalOwnerName(name) {
  if (typeof name !== 'string') return '';
  const trimmed = name.trim();
  return OWNER_ALIASES[fold(trimmed)] ?? trimmed;
}

/**
 * The key two owner names are compared on: alias-resolved, trimmed,
 * whitespace-collapsed, lower-cased. '' for anything unusable.
 *
 * @param {unknown} name
 * @returns {string}
 */
export function ownerKey(name) {
  return fold(canonicalOwnerName(name));
}

/** Whether two owner names name the same person. */
export const sameOwnerName = (a, b) => {
  const ka = ownerKey(a);
  return ka !== '' && ka === ownerKey(b);
};
