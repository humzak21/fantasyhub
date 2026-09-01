/**
 * Per-player, per-week scoring: the fact table behind roster-aware rankings.
 *
 * One row per player per week, recording which team held them, whether they
 * were in the lineup, and what they scored and were projected for. This is the
 * grain neither `players` (a global last-write-wins snapshot) nor `rosters`
 * (deleted and rewritten on every sync) can express, and without it the
 * calculator's roster components are guesses about the present applied to the
 * past.
 *
 * Written only by `scripts/sync-week.js`. Read by `services/db/rankings.js`.
 *
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { buildTeamIndex } from '../espnGameMapper.js';
import { formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { getNFLTeamAbbreviation, mapESPNInjuryStatus, mapESPNRosterSlot } from './espnMapping.js';
import { createLogger } from './logger.js';

const log = createLogger('db:playerWeekStats');

/** The conflict target, spelled once. Matches the unique constraint. */
const CONFLICT_TARGET = 'season_id,week,player_id';

/**
 * `players.position` is NOT NULL and CHECK-constrained, so a player whose
 * position we cannot name cannot be created. That is an IDP or an ESPN id we do
 * not recognise; skipping is right, inventing a position is not.
 */
const CREATABLE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'D/ST', 'DL', 'LB', 'DB']);

/**
 * Resolve `players.id` for every ESPN player id in the batch, creating the ones
 * that do not exist yet.
 *
 * Two round trips regardless of roster size: one read, one upsert of whatever
 * was missing. The per-player `syncPlayerFromESPN` would be ~200 sequential
 * round trips in week 1, and it also writes the stats columns that the roster
 * step owns — this only ever writes identity.
 */
async function resolvePlayerIds(ctx, rows) {
  const espnIds = [...new Set(rows.map((row) => row.espnPlayerId).filter((id) => id != null))];
  if (espnIds.length === 0) return { byEspnId: new Map(), created: 0, uncreatable: [] };

  const { data: existing, error: readError } = await ctx.client
    .from('players')
    .select('id, espn_player_id')
    .in('espn_player_id', espnIds);

  if (readError) throw readError;

  const byEspnId = new Map((existing || []).map((row) => [row.espn_player_id, row.id]));

  const missing = rows.filter(
    (row) => row.espnPlayerId != null && !byEspnId.has(row.espnPlayerId)
  );
  if (missing.length === 0) return { byEspnId, created: 0, uncreatable: [] };

  const uncreatable = [];
  const inserts = new Map();

  for (const row of missing) {
    if (inserts.has(row.espnPlayerId)) continue;

    if (!row.playerName || !CREATABLE_POSITIONS.has(row.position)) {
      uncreatable.push({
        espnPlayerId: row.espnPlayerId,
        name: row.playerName ?? null,
        position: row.position ?? null,
        reason: !row.playerName ? 'no name' : `unmappable position ${row.defaultPositionId}`
      });
      continue;
    }

    inserts.set(row.espnPlayerId, {
      espn_player_id: row.espnPlayerId,
      name: row.playerName,
      position: row.position,
      team_abbreviation: getNFLTeamAbbreviation(row.proTeamId),
      is_active: true,
      updated_at: new Date().toISOString()
    });
  }

  if (inserts.size === 0) return { byEspnId, created: 0, uncreatable };

  const { data: created, error: writeError } = await ctx.client
    .from('players')
    .upsert([...inserts.values()], { onConflict: 'espn_player_id' })
    .select('id, espn_player_id');

  if (writeError) throw writeError;

  for (const row of created || []) byEspnId.set(row.espn_player_id, row.id);

  return { byEspnId, created: (created || []).length, uncreatable };
}

/**
 * Write one week of roster scoring.
 *
 * Idempotent: the unique key is (season, week, player), so re-running a week
 * rewrites the same rows rather than doubling them. That is what makes a failed
 * sync fixable by running it again, the promise every other step here makes.
 *
 * @param {object} ctx
 * @param {string} seasonId
 * @param {number} week
 * @param {Array}  mappedRows from `services/espnPlayerStatsMapper.js`
 * @param {Array}  teams      the season's teams, for ESPN id → team id
 * @returns {Promise<{upserted: number, playersCreated: number, skipped: Array}>}
 */
export async function upsertPlayerWeekStats(ctx, seasonId, week, mappedRows = [], teams = []) {
  try {
    if (mappedRows.length === 0) {
      return { upserted: 0, playersCreated: 0, skipped: [] };
    }

    const teamIndex = buildTeamIndex(teams);
    const { byEspnId, created, uncreatable } = await resolvePlayerIds(ctx, mappedRows);

    const skipped = uncreatable.map((entry) => ({ ...entry, reason: `player: ${entry.reason}` }));
    const rows = [];
    // (season, week, player) is unique; a player listed twice in one payload
    // would make the upsert fail on "affect row a second time".
    const seen = new Set();

    for (const row of mappedRows) {
      const team = teamIndex.find(row.espnTeamId, null);
      if (!team) {
        skipped.push({
          espnPlayerId: row.espnPlayerId,
          espnTeamId: row.espnTeamId,
          reason: `no team with ESPN id ${row.espnTeamId} in this season`
        });
        continue;
      }

      const playerId = byEspnId.get(row.espnPlayerId);
      if (!playerId) {
        if (!uncreatable.some((entry) => entry.espnPlayerId === row.espnPlayerId)) {
          skipped.push({ espnPlayerId: row.espnPlayerId, reason: 'player id unresolved' });
        }
        continue;
      }

      if (seen.has(playerId)) continue;
      seen.add(playerId);

      rows.push({
        season_id: seasonId,
        week,
        team_id: team.id,
        player_id: playerId,
        espn_player_id: row.espnPlayerId,
        // The NFL team, not the fantasy one (`team_id`). The mapper has always
        // extracted it and this writer has always dropped it; it is the join
        // key a future NFL-schedule table needs, and it cannot be backfilled
        // without re-fetching every past week from ESPN.
        pro_team_id: row.proTeamId ?? null,
        lineup_slot_id: row.lineupSlotId,
        roster_slot: mapESPNRosterSlot(row.lineupSlotId),
        started: row.started,
        position: row.position,
        actual_points: row.actualPoints,
        projected_points: row.projectedPoints,
        // The whole per-category map, as ESPN sent it. Touchdown counts are
        // derived from this (see `getTouchdownCount`) rather than stored
        // beside it, so there is one copy of the number and nothing to fall
        // out of step with it.
        stat_breakdown: row.statBreakdown ?? null,
        // Absent means ESPN said nothing, not that the player is healthy — the
        // usual 'ACTIVE' default would assert something this row does not know.
        injury_status: row.injuryStatus ? mapESPNInjuryStatus(row.injuryStatus) : null,
        updated_at: new Date().toISOString()
      });
    }

    if (rows.length === 0) {
      log.warn(`week ${week}: nothing to write, ${skipped.length} entries skipped`);
      return { upserted: 0, playersCreated: created, skipped };
    }

    const { error } = await ctx.client
      .from('player_week_stats')
      .upsert(rows, { onConflict: CONFLICT_TARGET, ignoreDuplicates: false });

    if (error) throw error;

    log.info(`week ${week}: ${rows.length} player rows, ${created} players created`);

    return { upserted: rows.length, playersCreated: created, skipped };
  } catch (error) {
    throwDbError(error, 'Upsert player week stats');
  }
}

/**
 * Every stored player-week of a season, grouped `{ [teamId]: { [week]: rows } }`.
 *
 * That is the shape `PowerRankingCalculator` consumes: it asks "what did this
 * team's lineup do in week 4", and both keys are on the way there.
 *
 * `throughWeek` is exclusive, matching the calculator's `week < viewingWeek`
 * rule — viewing week 5 must not see week 5's scores.
 */
export async function getPlayerWeekStats(ctx, seasonId, { throughWeek = null } = {}) {
  try {
    let query = ctx.client
      .from('player_week_stats')
      .select('*')
      .eq('season_id', seasonId);

    if (throughWeek != null) query = query.lt('week', throughWeek);

    const { data, error } = await query.order('week', { ascending: true });

    if (error) throw error;

    const byTeam = {};
    for (const row of data || []) {
      const team = (byTeam[row.team_id] ??= {});
      (team[row.week] ??= []).push(formatFromDatabase(row));
    }

    return byTeam;
  } catch (error) {
    throwDbError(error, 'Get player week stats');
  }
}

/**
 * One week's rows, flat, with the player joined.
 *
 * A separate function rather than a `throughWeek` that can also mean "at": that
 * parameter is exclusive on purpose — the calculator's `week < viewingWeek`
 * rule — and bending it so one caller can see the current week is how a
 * historical ranking starts seeing a week the reader has not navigated to.
 *
 * This is the read for the *live* week, which exists because the sync writes
 * the coming week's projections on Tuesday at 04:00 ET, a full pick'ems window
 * before its actual points land the following Tuesday.
 *
 * @returns {Promise<object[]>} rows, camelCased, each with `.player`
 */
export async function getPlayerWeekStatsForWeek(ctx, seasonId, week) {
  try {
    const { data, error } = await ctx.client
      .from('player_week_stats')
      .select(`
        id,
        season_id,
        week,
        team_id,
        player_id,
        espn_player_id,
        pro_team_id,
        lineup_slot_id,
        roster_slot,
        started,
        position,
        actual_points,
        projected_points,
        stat_breakdown,
        injury_status,
        player:players (
          id,
          name,
          position,
          team_abbreviation,
          pro_team_id
        )
      `)
      .eq('season_id', seasonId)
      .eq('week', week);

    if (error) throw error;

    return (data || []).map(formatFromDatabase);
  } catch (error) {
    throwDbError(error, 'Get player week stats for week');
  }
}
