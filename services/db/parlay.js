/**
 * The weekly TD parlay: one NFL player per member per week.
 *
 * The interesting part of this module is what it does *not* contain: no
 * "should this viewer see other people's picks" check. That rule is RLS on `td_parlay_picks` — own row always, everyone's
 * once the week's `submission_closes_at` passes, everything for the admin and
 * the parlay commissioner. So `getParlayPicksForWeek` can be asked at any time
 * and simply returns fewer rows before the deadline. A UI-side filter would be
 * decoration: the anon key reaches PostgREST directly.
 *
 * Member writes go through `submit_td_parlay_pick`, which is where the
 * deadline is enforced; the table has no user INSERT or UPDATE policy at all.
 * `applyParlayGrades` at the foot of this file is the one exception, and it is
 * not a member write: the weekly cron holds the service-role key, which
 * bypasses RLS the same way every other sync step does. The `is_admin()`
 * policy on the table stays as the browser's manual-override path.
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

/**
 * The picks an automated grader can act on: ungraded, matched to a player, and
 * in a week that is over.
 *
 * A projection of its own rather than a widening of `PICK_WITH_PLAYER`. That
 * one deliberately carries no `espn_player_id` — it feeds the board and the
 * dashboard, where a player's ESPN id is not information anybody reads — and
 * adding a column to it to serve one caller is how a "player columns worth
 * carrying alongside a pick" list stops meaning anything.
 *
 * `scored_td IS NULL` is what makes a re-run idempotent and a manual override
 * permanent: a pick a human has graded is no longer selected, so the grader
 * cannot overwrite it, and a week that failed to grade is simply picked up on
 * the next run. `beforeWeek` is exclusive — grading the week in progress would
 * grade Sunday's picks on Sunday morning.
 *
 * A free-text pick has no `player_id` and is filtered out here rather than
 * skipped downstream: there is nothing to look up, and it stays manual by
 * construction.
 *
 * @param {object} ctx
 * @param {string} seasonId
 * @param {number} beforeWeek exclusive upper bound — the week in progress
 * @returns {Promise<object[]>}
 */
export async function getUngradedMatchedPicks(ctx, seasonId, beforeWeek) {
  try {
    const { data, error } = await ctx.client
      .from('td_parlay_picks')
      .select(`
        id,
        season_id,
        week,
        user_id,
        player_id,
        player_name_raw,
        scored_td,
        player:players (
          id,
          espn_player_id,
          pro_team_id
        )
      `)
      .eq('season_id', seasonId)
      .is('scored_td', null)
      .not('player_id', 'is', null)
      .lt('week', beforeWeek)
      .order('week', { ascending: true });

    if (error) throw error;

    return (data || []).map(formatFromDatabase);
  } catch (error) {
    throwDbError(error, 'Get ungraded matched parlay picks');
  }
}

/**
 * Write a batch of grades.
 *
 * Row by row rather than an upsert: an upsert would need every NOT NULL column
 * of a row we are only amending, and `player_name_raw` in particular is one a
 * grader has no business restating. Fourteen picks a week makes the round
 * trips a non-question.
 *
 * Failures are collected, not thrown — one unwritable row must not cost the
 * other thirteen, and the sync step that calls this records what did not land.
 *
 * @param {object} ctx
 * @param {Array<{ pickId: string, scoredTd: boolean }>} grades
 * @returns {Promise<{ updated: number, errors: object[] }>}
 */
export async function applyParlayGrades(ctx, grades = []) {
  const errors = [];
  let updated = 0;

  for (const grade of grades) {
    const { error } = await ctx.client
      .from('td_parlay_picks')
      .update({ scored_td: grade.scoredTd })
      .eq('id', grade.pickId)
      // Only ever an ungraded row. Two runs racing, or a human grading between
      // the read and the write, must not have the second writer win silently.
      .is('scored_td', null);

    if (error) {
      errors.push({ pickId: grade.pickId, error: error.message });
      continue;
    }

    updated += 1;
  }

  if (updated > 0) log.info(`graded ${updated} parlay pick(s)`);

  return { updated, errors };
}
