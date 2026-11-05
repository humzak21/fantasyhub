/**
 * One player's page: every week he was on a league roster, with the league's
 * context already computed, plus who has him now and every move he was part of.
 *
 * The arithmetic that needs the whole league (a week's rank among every
 * rostered player, his team's result that week, career points per game) lives
 * in two SQL views, `v_player_week_lines` and `v_player_careers`. Reading them
 * means a player's page costs his own ~100 rows, not the league's 20,000.
 * Everything else — trends, stints, the stat catalog — is
 * `utils/playerProfile/`, pure, over what this returns.
 *
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { fromDbShape } from './caseMap.js';
import { throwDbError, unwrap } from './errors.js';
import { getFranchiseRefs } from './history.js';
import { createLogger } from './logger.js';
import { selectAll } from './paging.js';

const log = createLogger('db:playerProfiles');

const num = (value) => (value == null ? null : Number(value));

const PLAYER_COLUMNS =
  'id, espn_player_id, name, position, team_abbreviation, pro_team_id, injury_status, projected_points, is_active';

const LINE_COLUMNS = `
  id, season_id, year, week, player_id, espn_player_id, team_id, franchise_id, position,
  roster_slot, started, actual_points, projected_points, pro_team_id, injury_status,
  stat_breakdown, appeared, overall_rank, overall_of, position_rank, position_of,
  game_id, game_type, team_score, opponent_score, opponent_team_id, opponent_franchise_id,
  result, is_bye
`;

/** The view's numeric columns, which PostgREST may hand back as strings. */
const NUMERIC_LINE_FIELDS = ['actualPoints', 'projectedPoints', 'teamScore', 'opponentScore'];

const NUMERIC_CAREER_FIELDS = [
  'totalPoints', 'pointsPerGame', 'startedPoints', 'benchPoints',
  'bestPoints', 'worstPoints', 'pointsStddev'
];

function withNumbers(row, fields) {
  const out = { ...row };
  for (const field of fields) if (field in out) out[field] = num(out[field]);
  return out;
}

const toPlayer = (row) => ({
  id: row.id,
  espnPlayerId: row.espn_player_id ?? null,
  name: row.name,
  position: row.position ?? null,
  teamAbbreviation: row.team_abbreviation ?? null,
  proTeamId: row.pro_team_id ?? null,
  injuryStatus: row.injury_status ?? null,
  projectedPoints: num(row.projected_points),
  isActive: row.is_active ?? null
});

/**
 * A line, camelCased. `stat_breakdown`'s keys are ESPN's numeric stat ids,
 * which the case converter leaves alone, so the map arrives verbatim.
 */
const toLine = (row) => withNumbers(fromDbShape(row), NUMERIC_LINE_FIELDS);

/** The active season's id: the context's if something already found it. */
async function activeSeasonId(ctx) {
  if (ctx.activeSeasonId) return ctx.activeSeasonId;
  const row = unwrap(
    await ctx.client.from('seasons').select('id').eq('is_active', true).maybeSingle(),
    'Get active season'
  );
  return row?.id ?? null;
}

/**
 * Everything a player's page reads, or `null` when there is no such player.
 *
 * `lines` are `v_player_week_lines`, oldest first. `teams` covers every team in
 * them plus the one that has him now; `seasons` every season in them plus the
 * active one. `current` is his `rosters` row on an active-season team, or null
 * when nobody has him. `events` are the transactions naming his ESPN id — none
 * for a player without one, since there is nothing to match on.
 */
export async function getPlayerProfileSource(ctx, playerId) {
  try {
    const client = ctx.client;

    const [playerRow, lineRows, activeId] = await Promise.all([
      (async () => unwrap(
        await client.from('players').select(PLAYER_COLUMNS).eq('id', playerId).maybeSingle(),
        'Get profile player'
      ))(),
      selectAll(() => client
        .from('v_player_week_lines')
        .select(LINE_COLUMNS)
        .eq('player_id', playerId)
        .order('year')
        .order('week')
        .order('id')),
      activeSeasonId(ctx)
    ]);

    if (!playerRow) return null;

    const player = toPlayer(playerRow);
    const lines = lineRows
      .map(toLine)
      .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.week - b.week);

    const teamIds = [...new Set(lines.map((line) => line.teamId).filter(Boolean))];
    const seasonIds = [...new Set([...lines.map((line) => line.seasonId), activeId].filter(Boolean))];

    const [teamRows, franchises, seasonRows, rosterRows, eventRows] = await Promise.all([
      teamIds.length
        ? (async () => unwrap(
            await client.from('teams').select('id, season_id, franchise_id, name, owner').in('id', teamIds),
            'Get profile teams'
          ) ?? [])()
        : [],
      getFranchiseRefs(ctx),
      seasonIds.length
        ? (async () => unwrap(
            await client
              .from('seasons')
              .select('id, year, espn_season_year, regular_season_weeks, playoff_weeks, total_weeks, is_active, is_completed')
              .in('id', seasonIds),
            'Get profile seasons'
          ) ?? [])()
        : [],
      activeId
        ? (async () => unwrap(
            await client
              .from('rosters')
              .select('team_id, roster_slot, team:teams!inner ( id, season_id, franchise_id, name, owner )')
              .eq('player_id', playerId)
              .eq('team.season_id', activeId)
              .limit(1),
            'Get profile roster'
          ) ?? [])()
        : [],
      player.espnPlayerId != null
        ? selectAll(() => client
            .from('transaction_events')
            .select(`
              id, season_id, type, scoring_period, processed_at, bid_amount, franchise_id,
              franchise_ids, espn_player_ids, player_from_franchise_ids, player_to_franchise_ids,
              season:seasons ( year )
            `)
            .contains('espn_player_ids', [player.espnPlayerId])
            .order('processed_at')
            .order('id'))
        : []
    ]);

    const roster = rosterRows[0] ?? null;

    const teamsById = new Map(teamRows.map((row) => [row.id, row]));
    if (roster?.team && !teamsById.has(roster.team.id)) teamsById.set(roster.team.id, roster.team);

    log.debug('player profile source', { playerId, lines: lines.length, events: eventRows.length });

    return {
      player,
      lines,
      teams: [...teamsById.values()].map((row) => ({
        id: row.id,
        seasonId: row.season_id,
        franchiseId: row.franchise_id ?? null,
        name: row.name,
        owner: row.owner
      })),
      franchises,
      seasons: seasonRows
        .map((row) => ({
          id: row.id,
          year: row.year,
          nflSeasonYear: row.espn_season_year ?? row.year,
          regularSeasonWeeks: row.regular_season_weeks,
          playoffWeeks: row.playoff_weeks,
          totalWeeks: row.total_weeks,
          isActive: Boolean(row.is_active),
          isCompleted: Boolean(row.is_completed)
        }))
        .sort((a, b) => a.year - b.year),
      current: roster
        ? { teamId: roster.team_id, rosterSlot: roster.roster_slot ?? null, seasonId: roster.team?.season_id ?? activeId }
        : null,
      events: eventRows.map((row) => ({
        id: row.id,
        seasonId: row.season_id,
        year: row.season?.year ?? null,
        type: row.type,
        week: row.scoring_period,
        processedAt: row.processed_at,
        bidAmount: num(row.bid_amount),
        franchiseId: row.franchise_id ?? null,
        franchiseIds: row.franchise_ids ?? [],
        espnPlayerIds: row.espn_player_ids ?? [],
        // Null on a row stored before direction was; the pure half reads that as unknown.
        playerFromFranchiseIds: row.player_from_franchise_ids ?? null,
        playerToFranchiseIds: row.player_to_franchise_ids ?? null
      }))
    };
  } catch (error) {
    throwDbError(error, 'Get player profile source');
  }
}

/**
 * Every player ever on a league roster, one `v_player_careers` row each,
 * camelCased. Several hundred rows and growing, so paged.
 */
export async function getPlayerCareers(ctx) {
  try {
    const rows = await selectAll(() => ctx.client
      .from('v_player_careers')
      .select('*')
      .order('player_id'));
    return rows.map((row) => withNumbers(fromDbShape(row), NUMERIC_CAREER_FIELDS));
  } catch (error) {
    throwDbError(error, 'Get player careers');
  }
}

/**
 * The player with this ESPN id, or null. For surfaces that know a player only
 * by ESPN id (a trade line, a chat table) and need his `players.id`.
 */
export async function getPlayerByEspnId(ctx, espnPlayerId) {
  try {
    if (espnPlayerId == null) return null;
    const row = unwrap(
      await ctx.client
        .from('players')
        .select('id, espn_player_id, name, position, team_abbreviation, pro_team_id')
        .eq('espn_player_id', espnPlayerId)
        .limit(1)
        .maybeSingle(),
      'Get player by ESPN id'
    );
    if (!row) return null;
    return {
      id: row.id,
      espnPlayerId: row.espn_player_id,
      name: row.name,
      position: row.position ?? null,
      teamAbbreviation: row.team_abbreviation ?? null,
      proTeamId: row.pro_team_id ?? null
    };
  } catch (error) {
    throwDbError(error, 'Get player by ESPN id');
  }
}
