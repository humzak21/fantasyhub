/**
 * The player page's place in the URL: `?player=<players.id>`, at every width.
 *
 * The param rides beside whatever the page already carries (`?view=statistics`,
 * `?tab=records&record=…`), so opening and closing a player never moves the
 * page under it. Pure, so the rule is tested without a router.
 */

export const PLAYER_PARAM = 'player';

/** The open player's id, or null. A blank param is no player. */
export function playerIdFrom(searchParams) {
  const id = searchParams?.get?.(PLAYER_PARAM);
  return id ? id : null;
}

/** A copy of the params with this player open; every other param is kept. */
export function withPlayer(searchParams, id) {
  const next = new URLSearchParams(searchParams);
  if (id == null || id === '') next.delete(PLAYER_PARAM);
  else next.set(PLAYER_PARAM, String(id));
  return next;
}

/** A copy of the params with no player open; every other param is kept. */
export function withoutPlayer(searchParams) {
  const next = new URLSearchParams(searchParams);
  next.delete(PLAYER_PARAM);
  return next;
}
