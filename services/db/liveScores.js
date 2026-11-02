/**
 * The week in progress, from the shared snapshot.
 *
 * The browser never talks to ESPN. It asks the `live-scores` edge function,
 * which answers from `live_week_snapshot` at once and keeps that row fresh
 * behind the answer; see `supabase/functions/live-scores`. So a poll here is a
 * small read however many people are watching.
 *
 * The one read that degrades rather than throws, like `parlay.getLiveStatus`.
 * This is an overlay: with it gone the page goes on showing projections, which
 * is what it showed before there was a feed, and a failed read must not take a
 * scoreboard down with it.
 *
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { EMPTY_LIVE_WEEK } from '../liveScores.js';
import { createLogger } from './logger.js';

const log = createLogger('db:liveScores');

/**
 * @returns {Promise<{ matchups: Array, lineups: object, nflGames: object, live: boolean, windowOpen: boolean, refreshedAt: string|null }>}
 */
export async function getLiveWeek(ctx, seasonId, week) {
  if (!seasonId || !week) return EMPTY_LIVE_WEEK;

  const { data, error } = await ctx.client.functions.invoke('live-scores', {
    body: { seasonId, week }
  });

  if (error) {
    log.warn(`live week unavailable for week ${week}: ${error.message}`);
    return EMPTY_LIVE_WEEK;
  }

  return { ...EMPTY_LIVE_WEEK, ...data };
}
