/**
 * One team, one colour, everywhere.
 *
 * Charts used to colour teams by their index in whatever array the chart
 * happened to receive, so a franchise was orange on the scoring chart, blue on
 * the all-play chart and green in the distribution — the reader could not
 * carry a team from one panel to the next. The colour is a property of the
 * franchise now, derived here and read by tables, charts, avatars, matchup
 * cards and bracket slots alike.
 *
 * The key is `franchise_id`, falling back to the owner name: team names change
 * between seasons (and mid-season), owner names do not — the same reason every
 * data-layer lookup in this codebase checks owner first.
 *
 * The wheel is 14 slots (`--color-team-1..14` in globals.css) for a 14-team
 * league, spaced so neighbouring hues stay distinguishable when two teams land
 * next to each other in a table.
 */

export const TEAM_COLOR_SLOTS = 14;

/**
 * FNV-1a. Small, stable, and — unlike `String.prototype.hashCode`-style sums —
 * it does not collide on anagrams, which matters when half the league's owner
 * names share the same letters.
 *
 * @param {string} input
 * @returns {number} unsigned 32-bit hash
 */
function hashString(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The identity a colour is derived from, in priority order. Exported because
 * chart series and table rows need to agree on what "the same team" means.
 *
 * @param {object} team
 * @returns {string}
 */
export function getTeamColorKey(team) {
  if (!team) return '';
  const franchiseId = team.franchiseId ?? team.franchise_id;
  if (franchiseId !== undefined && franchiseId !== null && franchiseId !== '') {
    return `franchise:${franchiseId}`;
  }
  const owner = team.ownerName ?? team.owner_name ?? team.owner;
  if (owner) return `owner:${String(owner).trim().toLowerCase()}`;
  const name = team.name ?? team.teamName ?? team.team_name;
  if (name) return `name:${String(name).trim().toLowerCase()}`;
  return '';
}

/**
 * 1-based slot number, matching the `--color-team-N` tokens.
 *
 * @param {object} team
 * @returns {number} 1..TEAM_COLOR_SLOTS
 */
export function getTeamColorSlot(team) {
  const key = getTeamColorKey(team);
  if (!key) return 1;
  return (hashString(key) % TEAM_COLOR_SLOTS) + 1;
}

/**
 * The colour, in the forms the app actually consumes.
 *
 * `varName`/`value` are for anywhere a real colour string is needed — recharts
 * takes a fill prop, not a class. The class fields are for markup.
 *
 * @param {object} team
 * @returns {{slot: number, varName: string, value: string, text: string, bg: string, border: string, ring: string}}
 */
export function getTeamColor(team) {
  const slot = getTeamColorSlot(team);
  // `--team-N` is the real custom property; the `--color-team-N` form is the
  // Tailwind theme entry, which `@theme inline` inlines rather than emitting,
  // so it is not readable at runtime.
  const varName = `--team-${slot}`;
  return {
    slot,
    varName,
    value: `var(${varName})`,
    text: `text-team-${slot}`,
    bg: `bg-team-${slot}`,
    border: `border-team-${slot}`,
    ring: `ring-team-${slot}`,
  };
}

/**
 * Colour for a chart series. Recharts needs a resolvable colour string; a
 * `var()` reference works in SVG fill/stroke in every browser this app
 * supports, and keeps the value in one place.
 *
 * @param {object} team
 * @returns {string}
 */
export function teamChartColor(team) {
  return getTeamColor(team).value;
}

/**
 * Up to two letters for an avatar. Prefers the owner's initials, because the
 * owner is the constant; falls back to the team name for unassigned teams.
 *
 * @param {object} team
 * @returns {string}
 */
export function getTeamInitials(team) {
  if (!team) return '?';
  const source =
    team.ownerName ?? team.owner_name ?? team.owner ?? team.name ?? team.teamName ?? team.team_name ?? '';
  const words = String(source).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
