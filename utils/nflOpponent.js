/**
 * How an opponent reads on a chip: "vs BUF", "@ KC", "BYE".
 *
 * One definition, because there are three places that need it — the pick'ems
 * research lineups, the parlay's current pick, and the parlay's autocomplete —
 * and a per-site copy is how "@ " and "at " end up on the same page.
 *
 * Takes an entry from `buildOpponentMap` in `hooks/queries/useNflSchedule.js`.
 */

/**
 * @param {{ bye: boolean, isHome: boolean, opponentAbbrev: string|null }|null} entry
 * @returns {string|null} the chip's text, or null when there is nothing to say
 */
export function formatOpponent(entry) {
  // Null is the honest answer for a player with no NFL team, a season nobody
  // has imported, or a week outside the calendar. The caller renders nothing;
  // guessing "BYE" here would tell the reader something false about a real
  // player, which is worse than a missing chip on any week of the year.
  if (!entry) return null;

  if (entry.bye) return 'BYE';

  if (!entry.opponentAbbrev) return null;

  return `${entry.isHome ? 'vs' : '@'} ${entry.opponentAbbrev}`;
}

/**
 * Whether this chip should read as "not playing", for styling.
 *
 * A separate question from the text: a bye and an unknown both render quietly,
 * but only one of them is a fact about the player.
 */
export function isBye(entry) {
  return Boolean(entry?.bye);
}

export default formatOpponent;
