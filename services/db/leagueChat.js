/**
 * The league chat (JITS-42): the snapshot it queries, and asking it.
 *
 * `getLeagueSnapshotSources` reads every league table the snapshot is made
 * from; `saveLeagueSnapshot` stores the built SQLite file (and the sql.js wasm
 * it was written with, so reader and writer are one version) in the private
 * `league-chat` bucket. Both run in `scripts/build-league-chat-db.js` with the
 * service role. `askLeague` is the browser's half: it posts the conversation to
 * the `league-chat` edge function, which holds the model key and the snapshot.
 */

import { unwrap, throwDbError } from './errors.js';
import { selectAll } from './paging.js';
import { createLogger } from './logger.js';
import { fromDbShape } from './caseMap.js';
import { toSeasonConfig, deriveCurrentWeek } from '../../utils/seasonConfig.js';

const log = createLogger('db:leagueChat');

export const SNAPSHOT_BUCKET = 'league-chat';
export const SNAPSHOT_PATH = 'league.sqlite';
export const WASM_PATH = 'sql-wasm.wasm';

const all = (ctx, table, columns, order, label) =>
  selectAll(() => {
    let q = ctx.client.from(table).select(columns);
    for (const col of order) q = q.order(col);
    return q;
  }).catch((error) => throwDbError(error, `Get ${label} for the league chat`));

/** Every row the snapshot is built from, camelCased through `caseMap`. */
export async function getLeagueSnapshotSources(ctx, { now = new Date() } = {}) {
  const [
    seasons, active, teams, divisions, games, playerWeeks, players,
    teamWeeks, transactionEvents, transactionTotals, rankings, awards
  ] = await Promise.all([
    ctx.client.from('seasons').select('id, year, is_completed, regular_season_weeks, playoff_weeks')
      .then((r) => unwrap(r, 'Get seasons for the league chat') ?? []),
    ctx.client.from('v_active_season').select('id, year, start_date, timezone, week_count').maybeSingle()
      .then((r) => unwrap(r, 'Get the active season for the league chat', { allowMissing: true })),
    all(ctx, 'teams', 'id, season_id, franchise_id, owner, name, division_id, made_playoffs, playoff_seed, playoff_finish, final_rank', ['id'], 'teams'),
    ctx.client.from('divisions').select('id, name').then((r) => unwrap(r, 'Get divisions for the league chat') ?? []),
    all(ctx, 'games', 'id, season_id, week, type, team1_id, team2_id, team1_score, team2_score, is_completed', ['id'], 'games'),
    all(ctx, 'player_week_stats', 'id, season_id, week, team_id, player_id, espn_player_id, position, roster_slot, started, actual_points, projected_points, pro_team_id', ['id'], 'player weeks'),
    all(ctx, 'players', 'id, name, position, espn_player_id', ['id'], 'players'),
    all(ctx, 'team_week_lineups', 'id, season_id, week, team_id, starter_points, optimal_points, starters_scoring', ['id'], 'team weeks'),
    all(ctx, 'transaction_events', 'id, season_id, type, franchise_id, scoring_period, processed_at, bid_amount, espn_player_ids, player_from_franchise_ids, player_to_franchise_ids', ['id'], 'transactions'),
    all(ctx, 'transactions', 'id, season_id, franchise_id, owner_name, waiver_claims, free_agent_adds, drops, trades, faab_spent', ['id'], 'transaction totals'),
    all(ctx, 'power_rankings_history', 'id, season_id, week_number, team_id, rank, power_rating', ['id'], 'power rankings'),
    ctx.client.from('awards').select('season_id, title, category, winner_franchise_id, winner_team_id')
      .then((r) => unwrap(r, 'Get awards for the league chat') ?? [])
  ]);

  const camel = (rows) => (rows ?? []).map(fromDbShape);
  return {
    currentSeasonId: active?.id ?? null,
    currentWeek: active ? deriveCurrentWeek(toSeasonConfig(active), now) : null,
    seasons: camel(seasons),
    teams: camel(teams),
    divisions: camel(divisions),
    games: camel(games),
    playerWeeks: camel(playerWeeks),
    players: camel(players),
    teamWeeks: camel(teamWeeks),
    transactionEvents: camel(transactionEvents),
    transactionTotals: camel(transactionTotals),
    rankings: camel(rankings),
    awards: camel(awards)
  };
}

/** Store the built snapshot and the wasm that wrote it. Service role only. */
export async function saveLeagueSnapshot(ctx, { snapshot, wasm }) {
  const bucket = ctx.client.storage.from(SNAPSHOT_BUCKET);
  const put = async (path, body, contentType) => {
    const { error } = await bucket.upload(path, body, { contentType, upsert: true, cacheControl: '60' });
    if (error) throwDbError(error, `Upload ${path} for the league chat`);
  };
  // The wasm first: a snapshot is only useful next to a reader that can open it.
  if (wasm) await put(WASM_PATH, wasm, 'application/wasm');
  await put(SNAPSHOT_PATH, snapshot, 'application/vnd.sqlite3');
  return { bytes: snapshot.byteLength };
}

/**
 * Ask the league chat. `history` is the conversation so far, oldest first, as
 * `{ role: 'user'|'assistant', content }`; the function keeps the last few.
 *
 * @returns {Promise<{ kind: 'answer'|'data'|'none', text: string,
 *   queries: Array<{ sql: string, columns: string[], rows: any[][], rowCount: number }>, asOf: string|null }>}
 */
export async function askLeague(ctx, question, { history = [] } = {}) {
  const { data, error } = await ctx.client.functions.invoke('league-chat', { body: { question, history } });
  if (error) {
    // A non-2xx carries the function's own message in its body.
    let message = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      // keep the generic message
    }
    log.warn(`league chat failed: ${message}`);
    throw new Error(message);
  }
  return {
    kind: data?.kind ?? 'none',
    text: String(data?.text ?? ''),
    queries: Array.isArray(data?.queries) ? data.queries : [],
    asOf: data?.asOf ?? null
  };
}
