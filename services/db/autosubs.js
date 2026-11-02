/**
 * Autosubs: a bench player named to take over from a starter for one week.
 *
 * Two audiences, like notifications. The browser reads its own team's rows and
 * writes through `set_autosub()` / `remove_autosub()`, which hold every rule;
 * the watcher (`scripts/autosub-watch.js`, service role) reads every open row
 * and records what happened. See 20261103120000_autosubs.sql.
 *
 * Every function takes the shared `ctx` ({ client, seasonsCache,
 * activeSeasonId }) as its first argument; see `./context.js`.
 */

import { fromDbShape } from './caseMap.js';
import { unwrap } from './errors.js';
import { createLogger } from './logger.js';
import { getRoleHolders, COMMISSIONER, VICE_COMMISSIONER } from './users.js';

const log = createLogger('db:autosubs');

const PLAYER_COLUMNS = 'id, name, position, espn_player_id, pro_team_id';

// ---------------------------------------------------------------------------
// The member's own team
// ---------------------------------------------------------------------------

/** The caller's autosubs for a week. RLS returns only their own team's. */
export async function getMyAutosubs(ctx, seasonId, week) {
  const rows = unwrap(
    await ctx.client
      .from('autosubs')
      .select(`*, starter:starter_player_id(${PLAYER_COLUMNS}), bench:bench_player_id(${PLAYER_COLUMNS})`)
      .eq('season_id', seasonId)
      .eq('week', week)
      .order('created_at'),
    'Get autosubs'
  );
  return (rows ?? []).map((row) => fromDbShape(row));
}

/** Set an autosub, or point an existing one at a different bench player. */
export async function setAutosub(ctx, { teamId, week, starterPlayerId, benchPlayerId }) {
  return unwrap(
    await ctx.client.rpc('set_autosub', {
      p_team_id: teamId,
      p_week: week,
      p_starter_player_id: starterPlayerId,
      p_bench_player_id: benchPlayerId
    }),
    'Set autosub'
  );
}

export async function removeAutosub(ctx, id) {
  return unwrap(await ctx.client.rpc('remove_autosub', { p_id: id }), 'Remove autosub') === true;
}

// ---------------------------------------------------------------------------
// The watcher (service role)
// ---------------------------------------------------------------------------

/**
 * The active season and every autosub in it nobody has been told about (which
 * includes every armed one), each with both players, the team and both kickoffs. A kickoff is null when the calendar does not have
 * one, which the planner reads as "not known", never as "not started".
 */
export async function getWatchInputs(ctx) {
  const season = unwrap(
    await ctx.client
      .from('seasons')
      .select('id, year, espn_season_year, espn_league_id, autosubs_enabled, autosub_espn_writes')
      .eq('is_active', true)
      .maybeSingle(),
    'Get season for autosubs',
    { allowMissing: true }
  );
  if (!season) return { season: null, rows: [] };

  const rows = unwrap(
    await ctx.client
      .from('autosubs')
      .select(`
        *,
        starter:starter_player_id(${PLAYER_COLUMNS}),
        bench:bench_player_id(${PLAYER_COLUMNS}),
        team:team_id(id, name, owner, espn_team_id)
      `)
      .eq('season_id', season.id)
      .is('notified_at', null),
    'Get open autosubs'
  ) ?? [];
  if (!rows.length) return { season: fromDbShape(season), rows: [] };

  const seasonYear = season.espn_season_year ?? season.year;
  const games = unwrap(
    await ctx.client
      .from('nfl_schedule')
      .select('week, pro_team_id, game_time')
      .eq('season_year', seasonYear)
      .in('week', [...new Set(rows.map((row) => row.week))]),
    'Get kickoffs for autosubs'
  ) ?? [];
  const kickoffs = new Map(games.map((game) => [`${game.week}:${game.pro_team_id}`, game.game_time]));
  const kickoffOf = (row, player) => {
    const time = kickoffs.get(`${row.week}:${player?.pro_team_id}`);
    return time ? new Date(time) : null;
  };

  return {
    season: fromDbShape(season),
    rows: rows.map((row) => ({
      ...fromDbShape(row),
      starterKickoff: kickoffOf(row, row.starter),
      benchKickoff: kickoffOf(row, row.bench)
    }))
  };
}

/**
 * Take an armed autosub for this run. Stamped before anything is done about
 * it, so a second run cannot act on the same row. False when it was not armed.
 */
export async function claimAutosub(ctx, id, { injuryStatus, now }) {
  const rows = unwrap(
    await ctx.client
      .from('autosubs')
      .update({ status: 'firing', fired_at: now.toISOString(), injury_status: injuryStatus })
      .eq('id', id)
      .eq('status', 'armed')
      .select('id'),
    'Claim autosub'
  );
  return (rows ?? []).length === 1;
}

/** What happened. `status` is `swapped` or `manual`. */
export async function finishAutosub(ctx, id, { status, reason = null, detail = null }) {
  unwrap(
    await ctx.client.from('autosubs').update({ status, reason, detail }).eq('id', id),
    'Finish autosub'
  );
}

export async function markAutosubNotified(ctx, id, now) {
  unwrap(
    await ctx.client.from('autosubs').update({ notified_at: now.toISOString() }).eq('id', id),
    'Mark autosub notified'
  );
}

/**
 * Keep the stored lineup true until the next roster sync: a swap at noon on
 * Sunday would otherwise show the old lineup until Monday's refresh. Best
 * effort, because that refresh corrects it anyway.
 */
export async function applySwapToRosters(ctx, { teamId, starterPlayerId, benchPlayerId, slot }) {
  const swaps = [[starterPlayerId, 'BE'], [benchPlayerId, slot]];
  for (const [playerId, rosterSlot] of swaps) {
    const { error } = await ctx.client
      .from('rosters')
      .update({ roster_slot: rosterSlot })
      .eq('team_id', teamId)
      .eq('player_id', playerId);
    if (error) log.warn(`could not update the stored lineup for ${playerId}:`, error.message);
  }
}

/** Who holds either commissioner role, and who the admins are as the fallback. */
export async function getAlertAudience(ctx) {
  const [commissioners, vices, admins] = await Promise.all([
    getRoleHolders(ctx, COMMISSIONER),
    getRoleHolders(ctx, VICE_COMMISSIONER),
    ctx.client.from('league_admins').select('user_id')
  ]);
  return {
    roleHolderIds: [...commissioners, ...vices].map((row) => row.userId),
    adminIds: (unwrap(admins, 'Get admins') ?? []).map((row) => row.user_id)
  };
}
