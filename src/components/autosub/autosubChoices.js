/**
 * What the autosub picker offers. Pure, over the viewer's lineup rows and the
 * week's NFL calendar. This mirrors `set_autosub()` so that the picker does not
 * offer a choice whose only outcome is an error; the database is the rule.
 */

import { canCoverSlot } from '../../../services/autosubPlanner.js';

const nameOf = (row) => row.player?.name ?? 'Unknown';

/**
 * Can this player still be part of an autosub? No calendar entry is "unknown"
 * and a bye is "off", and the RPC refuses both, so neither is offered.
 */
function hasGameAhead(row, opponents, now) {
  const entry = opponents[row.proTeamId];
  if (!entry || entry.bye) return false;
  return !entry.gameTime || new Date(entry.gameTime) > now;
}

/** Starters with no autosub yet whose game is still to come. */
export function coverableStarters(rows = [], autosubs = [], opponents = {}, now = new Date()) {
  const covered = new Set(autosubs.map((autosub) => autosub.starterPlayerId));
  return rows
    .filter((row) => row.started && !covered.has(row.playerId) && hasGameAhead(row, opponents, now))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
}

/**
 * Bench players who can fill this starter's slot. A bench player covers one
 * starter: two autosubs on one player could not both happen.
 */
export function benchOptions(rows = [], starter = null, autosubs = [], opponents = {}, now = new Date()) {
  if (!starter) return [];
  const taken = new Set(autosubs.map((autosub) => autosub.benchPlayerId));
  return rows
    .filter((row) =>
      row.rosterSlot === 'BE' &&
      !taken.has(row.playerId) &&
      canCoverSlot(starter.rosterSlot, row.position) &&
      hasGameAhead(row, opponents, now))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
}

/**
 * Has this team used the week's allowance? Every row counts, fired ones too,
 * which is how `set_autosub()` counts. No limit known means the picker stays
 * open, because the database is what refuses.
 */
export function atWeeklyLimit(autosubs = [], limit = null) {
  return limit != null && autosubs.length >= limit;
}

/** What a set autosub says for itself, on the member's own roster. */
export function autosubState(autosub) {
  if (autosub.status === 'swapped') return { label: 'Subbed in', variant: 'success' };
  if (autosub.status === 'manual') return { label: 'Commissioner told', variant: 'warning' };
  if (autosub.status === 'firing') return { label: 'Working', variant: 'info' };
  return { label: 'Set', variant: 'secondary' };
}
