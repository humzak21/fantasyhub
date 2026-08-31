/**
 * The weekly TD parlay: one NFL player per member per week.
 *
 * The whole module is four reads and one write, and the interesting part is
 * what it does *not* contain: no "should this viewer see other people's picks"
 * check. That rule is RLS on `td_parlay_picks` — own row always, everyone's
 * once the week's `submission_closes_at` passes, everything for the admin and
 * the parlay commissioner. So `getParlayPicksForWeek` can be asked at any time
 * and simply returns fewer rows before the deadline. A UI-side filter would be
 * decoration: the anon key reaches PostgREST directly.
 *
 * Writes go through `submit_td_parlay_pick`, which is where the deadline is
 * enforced; the table has no user INSERT or UPDATE policy at all.
 *
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { createLogger } from './logger.js';

const log = createLogger('db:parlay');

/**
 * The player columns worth carrying alongside a pick.
 *
 * A free-text pick has no player row, which is why `player_name_raw` is on the
 * pick itself and this join is decoration — position and NFL team, when we
 * happen to know them.
 */
const PICK_WITH_PLAYER = `
  id,
  pick_em_week_id,
  season_id,
  week,
  user_id,
  player_id,
  player_name_raw,
  scored_td,
  submitted_at,
  player:players (
    id,
    name,
    position,
    team_abbreviation,
    pro_team_id,
    injury_status
  )
`;

/**
 * Submit (or replace) the caller's pick for a week.
 *
 * `playerId` is the autocomplete's match; `playerName` alone is the free-text
 * fallback. Both are sent every time — the RPC prefers the id and looks the
 * canonical name up itself, so a stale name in the box cannot be stored against
 * a matched player.
 *
 * @param {object} ctx
 * @param {string} pickEmWeekId
 * @param {{ playerId?: string|null, playerName?: string }} pick
 * @returns {Promise<object>} the stored row
 */
export async function submitParlayPick(ctx, pickEmWeekId, { playerId = null, playerName = '' } = {}) {
  try {
    if (!pickEmWeekId) throw new Error('A pick\'em week is required');
    if (!playerId && !playerName?.trim()) throw new Error('A player is required');

    const { data, error } = await ctx.client.rpc('submit_td_parlay_pick', {
      p_pick_em_week_id: pickEmWeekId,
      p_player_id: playerId,
      p_player_name: playerName?.trim() || null
    });

    if (error) throw error;

    log.info(`parlay pick stored for pick'em week ${pickEmWeekId}`);

    // A function returning a composite type comes back as the row, not an array.
    return data ? formatFromDatabase(Array.isArray(data) ? data[0] : data) : null;
  } catch (error) {
    throwDbError(error, 'Submit parlay pick');
  }
}

/**
 * The caller's own pick for a week, or null.
 *
 * No `user_id` filter: the "read own" policy is the filter, and an explicit one
 * would need the session read that `getUserPicksForWeek` does — a round trip to
 * re-derive something the database already knows.
 */
export async function getMyParlayPick(ctx, pickEmWeekId) {
  try {
    const { data: { session } } = await ctx.client.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return null;

    const { data, error } = await ctx.client
      .from('td_parlay_picks')
      .select(PICK_WITH_PLAYER)
      .eq('pick_em_week_id', pickEmWeekId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    return data ? formatFromDatabase(data) : null;
  } catch (error) {
    throwDbError(error, 'Get my parlay pick');
  }
}

/**
 * Every pick for a week that this viewer may see.
 *
 * Before the deadline that is their own row (or none); after it, the league's.
 * The empty result is the feature, not a failure — callers render "picks are
 * hidden until the deadline" from the week's own status, not from this length.
 */
export async function getParlayPicksForWeek(ctx, pickEmWeekId) {
  try {
    const { data, error } = await ctx.client
      .from('td_parlay_picks')
      .select(PICK_WITH_PLAYER)
      .eq('pick_em_week_id', pickEmWeekId)
      .order('submitted_at', { ascending: true });

    if (error) throw error;

    return (data || []).map(formatFromDatabase);
  } catch (error) {
    throwDbError(error, 'Get parlay picks for week');
  }
}

/**
 * A whole season of picks, for the commissioner dashboard.
 *
 * Reads `season_id` directly rather than joining through `pick_em_weeks`: the
 * RPC denormalizes it onto every row precisely so this query is one table.
 */
export async function getSeasonParlayPicks(ctx, seasonId) {
  try {
    const { data, error } = await ctx.client
      .from('td_parlay_picks')
      .select(PICK_WITH_PLAYER)
      .eq('season_id', seasonId)
      .order('week', { ascending: true });

    if (error) throw error;

    return (data || []).map(formatFromDatabase);
  } catch (error) {
    throwDbError(error, 'Get season parlay picks');
  }
}
