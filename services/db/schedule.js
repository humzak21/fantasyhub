/**
 * The ESPN import log.
 *
 * This module used to run the import *pipeline*: an admin ran a script that
 * staged an ESPN fetch into `espn_schedule_imports` / `espn_teams` /
 * `espn_matchups`, then opened Settings and pressed "Assign to Season", which
 * called `importTeamsFromESPNImport` and the `assign_schedule_to_season` SQL
 * function to turn the staged rows into real teams and games.
 *
 * All of that is gone. `scripts/sync-schedule.js` writes `teams` and `games`
 * directly through `teams.upsertTeamsFromESPN` and `games.upsertEspnGames`, and
 * records what it did here. `espn_schedule_imports` is now purely a log, and
 * this module is the read side of it — the app cannot start an import, because
 * ESPN needs credentials that only the scripts have.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { throwDbError } from './errors.js';

/**
 * Columns named explicitly, never `*`: the legacy rows carry a `raw_data` blob
 * of 1.4 MB each and there is no reason to send that to a browser.
 */
const LOG_COLUMNS = `
  id,
  espn_league_id,
  season_year,
  league_name,
  team_count,
  total_matchups,
  regular_season_matchups,
  playoff_matchups,
  imported_at,
  import_source,
  assigned_season_id,
  assignment_status,
  assigned_at,
  assignment_notes
`;

/**
 * Every import run, newest first.
 *
 * Replaces `getPendingScheduleImports`, which filtered to `PENDING` because
 * pending meant "waiting for an admin to approve". Nothing is pending any more,
 * so the panel shows history instead of a queue.
 */
export async function getScheduleImports(ctx, { limit = 25 } = {}) {
  try {
    const { data, error } = await ctx.client
      .from('espn_schedule_imports')
      .select(LOG_COLUMNS)
      .order('imported_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];
  } catch (error) {
    throwDbError(error, 'Get schedule imports');
  }
}
