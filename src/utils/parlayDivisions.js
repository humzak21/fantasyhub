/**
 * Grouping the parlay board into division columns.
 *
 * The league runs one parlay per division, so the board is two columns rather
 * than one list. Nothing on `td_parlay_picks` says which — a pick knows its
 * `user_id` and nothing else — so the column is derived through the league's
 * existing identity join: display name → `teams.owner` → `teams.division_id`.
 * That is the same chain `isUserATeamOwner` walks to decide whether to unmask
 * the league, and it goes through `normalizeOwnerName` for the same reason:
 * two spellings of "trim and lowercase" would silently seat somebody in the
 * wrong division instead of failing.
 *
 * Pure, and separate from the component, because the interesting cases are
 * data cases: a member whose display name matches no owner, a team with no
 * division, a division nobody has picked in yet.
 *
 * A pick that cannot be placed comes back in `unassigned` rather than being
 * dropped into the first column or hidden. A missing pick is invisible to the
 * reader, and a pick in the wrong division is worse — it changes who is
 * competing against whom.
 */

import { normalizeOwnerName } from './displayNameUtils';

/**
 * @typedef {{ division: object, picks: object[] }} DivisionGroup
 */

/**
 * @param {object[]} picks rows from `getParlayPicksForWeek`, carrying `displayName`
 * @param {{ teams?: object[], divisions?: object[] }} league
 * @returns {{ groups: DivisionGroup[], unassigned: object[] }}
 *   one group per division in `display_order`, empty ones included — an empty
 *   column is information ("nobody in Division 2 has picked yet"), and dropping
 *   it would make the board's shape change as picks arrive.
 */
export function groupPicksByDivision(picks = [], { teams = [], divisions = [] } = {}) {
  const teamByOwner = new Map();
  for (const team of teams) {
    // Teams come back in database shape from `getTeamsForSeason`, but the
    // carry-forward and admin paths hand around camelCase copies; read both
    // rather than depend on which caller we got.
    const owner = normalizeOwnerName(team?.owner);
    if (owner) teamByOwner.set(owner, team);
  }

  const groups = divisions.map((division) => ({ division, picks: [] }));
  const byDivisionId = new Map(groups.map((group) => [group.division?.id, group]));
  const unassigned = [];

  for (const pick of picks) {
    const team = teamByOwner.get(normalizeOwnerName(pick?.displayName));
    const divisionId = team?.division_id ?? team?.divisionId ?? null;
    const group = divisionId ? byDivisionId.get(divisionId) : null;

    (group ? group.picks : unassigned).push(pick);
  }

  return { groups, unassigned };
}
