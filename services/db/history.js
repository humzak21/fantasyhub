/**
 * League history, read off the live tables.
 *
 * This replaces `services/leagueHistoryManager.js`, a 1,888-line singleton that
 * read a parallel universe: `historical_seasons`, `historical_teams`,
 * `historical_games`, `season_awards`, `head_to_head_records`,
 * `franchise_records` and three materialized views, all populated in November
 * 2025 by import scripts that were deleted in the August 2026 refactor. Nothing
 * has written to them since, which is why 2025 never appeared in League
 * History: it lives in `seasons`/`teams`/`games` and nowhere else.
 *
 * Everything here comes from the unified views built for exactly this purpose —
 * `v_team_standings`, `v_game_results`, `v_head_to_head`, `v_franchise_career`,
 * `v_record_book` — so a season becomes history the moment it is finalized,
 * with no import step in between.
 *
 * The shapes returned are the ones the `src/components/history/` tree already
 * renders (`playoff_results`, `regular_season_wins`, `award_name` …). Keeping
 * them means the swap is a change of source, not a rewrite of the markup.
 *
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import { throwDbError, unwrap } from './errors.js';
import { createLogger } from './logger.js';
import { selectAll } from './paging.js';

const log = createLogger('db:history');

const FRANCHISE_COLUMNS = 'id, owner_name, display_name, is_active, joined_year, left_year';

/** The identity fields the components pass to `getMaskedFranchiseName`. */
const franchiseRef = (franchise) =>
  franchise
    ? { id: franchise.id, owner_name: franchise.owner_name, display_name: franchise.display_name }
    : null;

async function getFranchises(ctx) {
  return unwrap(
    await ctx.client.from('league_franchises').select(FRANCHISE_COLUMNS).order('owner_name'),
    'Get franchises'
  ) ?? [];
}

/** `{ byId, byOwner }` — owner name is the stable key across team renames. */
function indexFranchises(franchises) {
  return {
    byId: new Map(franchises.map((f) => [f.id, f])),
    byOwner: new Map(franchises.map((f) => [f.owner_name, f]))
  };
}

/**
 * One standings row in the shape the history components read.
 *
 * They were written against `historical_teams`, whose columns are
 * `regular_season_wins` / `team_name`; `v_team_standings` calls the same things
 * `wins` / `team_name` and derives them from the games rather than from a
 * denormalised copy. This is the only place the two vocabularies meet.
 */
const toHistoryTeam = (row, franchise) => ({
  id: row.team_id,
  team_id: row.team_id,
  season_id: row.season_id,
  year: row.season_year,
  franchise_id: row.franchise_id,
  franchise: franchiseRef(franchise),
  team_name: row.team_name,
  owner_name: row.owner_name,
  regular_season_wins: row.wins ?? 0,
  regular_season_losses: row.losses ?? 0,
  regular_season_ties: row.ties ?? 0,
  win_percentage: row.win_percentage,
  points_for: Number(row.points_for ?? 0),
  points_against: Number(row.points_against ?? 0),
  average_points_for: row.average_points_for,
  best_week: row.best_week,
  worst_week: row.worst_week,
  made_playoffs: row.made_playoffs,
  playoff_seed: row.playoff_seed,
  playoff_finish: row.playoff_finish,
  final_rank: row.final_rank
});

const recordLabel = (team) => `${team.regular_season_wins}-${team.regular_season_losses}`;

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

/**
 * Every finished season, newest first, with its podium.
 *
 * Only completed seasons: a season in progress has no champion, and the
 * timeline's whole subject is who finished where. `finalize_season` is what
 * moves a season across that line.
 */
export async function getSeasonsTimeline(ctx) {
  try {
    const [seasons, standings, franchises] = await Promise.all([
      unwrap(
        await ctx.client
          .from('seasons')
          .select('id, year, name, league_size, regular_season_weeks, playoff_weeks, status, is_completed, completed_at, stats')
          .eq('is_completed', true)
          .order('year', { ascending: false }),
        'Get completed seasons'
      ),
      unwrap(
        await ctx.client
          .from('v_team_standings')
          .select('*')
          .in('playoff_finish', ['champion', '2nd', '3rd']),
        'Get season podiums'
      ),
      getFranchises(ctx)
    ]);

    const { byId } = indexFranchises(franchises);
    const podium = new Map();
    log.debug(`${seasons?.length ?? 0} completed seasons`);

    for (const row of standings ?? []) {
      const team = toHistoryTeam(row, byId.get(row.franchise_id));
      const entry = podium.get(row.season_id) ?? {};
      const slot = { champion: 'champion', '2nd': 'runner_up', '3rd': 'third_place' }[row.playoff_finish];
      entry[slot] = {
        franchise_id: team.franchise_id,
        franchise: team.franchise,
        team_name: team.team_name,
        record: recordLabel(team)
      };
      podium.set(row.season_id, entry);
    }

    return (seasons ?? []).map((season) => ({
      ...season,
      playoff_results: {
        champion: null,
        runner_up: null,
        third_place: null,
        ...(podium.get(season.id) ?? {})
      }
    }));
  } catch (error) {
    throwDbError(error, 'Get seasons timeline');
  }
}

/**
 * One season's final table and its awards.
 *
 * Ordered by `final_rank` with nulls last, so a season that was finalized reads
 * as its own standings rather than being re-sorted by the component.
 */
export async function getSeasonDetail(ctx, seasonId) {
  try {
    const [standings, awards, franchises] = await Promise.all([
      unwrap(
        await ctx.client
          .from('v_team_standings')
          .select('*')
          .eq('season_id', seasonId)
          .order('final_rank', { ascending: true, nullsFirst: false })
          .order('wins', { ascending: false })
          .order('points_for', { ascending: false }),
        'Get season standings'
      ),
      unwrap(
        await ctx.client
          .from('awards')
          .select('*')
          .eq('season_id', seasonId)
          .order('display_order'),
        'Get season awards'
      ),
      getFranchises(ctx)
    ]);

    const index = indexFranchises(franchises);

    return {
      teams: (standings ?? []).map((row) => toHistoryTeam(row, index.byId.get(row.franchise_id))),
      awards: shapeAwards(awards ?? [], index)
    };
  } catch (error) {
    throwDbError(error, 'Get season detail');
  }
}

/**
 * Awards, in the vocabulary the gallery renders — league-voted awards only.
 *
 * The table holds three kinds. Only the ballot awards the league votes on
 * (`source = 'ballot'`, `category = 'voted'`) are awards in History: the stat
 * awards — computed ones, and the admin's hand-entered `non-voted` ballot rows
 * like "Survivor (lowest PA)" — are records now, ranked in the record book
 * (`utils/recordBook`), and counting them here would make "most decorated" a
 * second, one-winner copy of the Records tab.
 *
 * A voted award carries a free-text title and only the owner's *name*, so the
 * franchise is resolved by owner name, which is the one identifier that
 * survives a team rename. An award with no winner yet is dropped: an award
 * nobody won is not a result.
 */
function shapeAwards(rows, index) {
  return rows
    .filter((row) => row.source === 'ballot' && row.category === 'voted')
    .map((row) => {
      const franchise =
        (row.winner_franchise_id && index.byId.get(row.winner_franchise_id)) ||
        (row.winner_id && index.byOwner.get(row.winner_id)) ||
        null;

      return {
        ...row,
        award_name: row.title,
        award_category: row.source === 'ballot' ? 'ballot' : row.category,
        franchise_id: franchise?.id ?? row.winner_franchise_id ?? null,
        franchise: franchiseRef(franchise),
        team: row.winner_id ? { team_name: row.winner_id } : null
      };
    })
    .filter((award) => award.franchise_id || award.winner_id);
}

// ---------------------------------------------------------------------------
// Franchises
// ---------------------------------------------------------------------------

/**
 * Every franchise with its career record attached.
 *
 * One row serves both of the props the history tree passes around — the
 * franchise (`id`, `owner_name`) and its career stats (`franchise_id`,
 * `total_wins`) — because they were always the same fourteen people, and
 * keeping them apart is what let the two disagree.
 *
 * `total_seasons` comes from the view rather than the denormalised column on
 * `league_franchises`, which has said "5" since November 2025.
 */
export async function getFranchisesWithCareerStats(ctx) {
  try {
    const [franchises, careers] = await Promise.all([
      getFranchises(ctx),
      unwrap(await ctx.client.from('v_franchise_career').select('*'), 'Get franchise careers')
    ]);

    const byFranchise = new Map((careers ?? []).map((row) => [row.franchise_id, row]));

    return franchises.map((franchise) => {
      const career = byFranchise.get(franchise.id) ?? {};
      const seasonsPlayed = Number(career.seasons_played ?? 0);

      return {
        ...franchise,
        franchise_id: franchise.id,
        seasons_played: seasonsPlayed,
        total_seasons: seasonsPlayed,
        total_wins: Number(career.total_wins ?? 0),
        total_losses: Number(career.total_losses ?? 0),
        total_ties: Number(career.total_ties ?? 0),
        avg_win_percentage: Number(career.career_win_percentage ?? 0),
        playoff_appearances: Number(career.playoff_appearances ?? 0),
        championships: Number(career.championships ?? 0),
        total_championships: Number(career.championships ?? 0),
        runner_ups: Number(career.runner_ups ?? 0),
        career_points_for: Number(career.career_points_for ?? 0),
        career_points_against: Number(career.career_points_against ?? 0),
        avg_points_per_game: Number(career.avg_points_per_game ?? 0),
        avg_final_rank: career.avg_final_rank == null ? null : Number(career.avg_final_rank),
        best_finish: career.best_finish ?? null,
        worst_finish: career.worst_finish ?? null,
        first_season: career.first_season ?? franchise.joined_year,
        last_season: career.last_season ?? null
      };
    });
  } catch (error) {
    throwDbError(error, 'Get franchises with career stats');
  }
}

/**
 * Every championship the league has awarded.
 *
 * Read from `teams.playoff_finish` rather than from an award row: the placement
 * is the fact, and the award is a description of it that may or may not have
 * been generated.
 */
export async function getChampionships(ctx) {
  try {
    const [standings, franchises] = await Promise.all([
      unwrap(
        await ctx.client
          .from('v_team_standings')
          .select('*')
          .eq('playoff_finish', 'champion')
          .order('season_year', { ascending: false }),
        'Get championships'
      ),
      getFranchises(ctx)
    ]);

    const { byId } = indexFranchises(franchises);

    return (standings ?? []).map((row) => {
      const team = toHistoryTeam(row, byId.get(row.franchise_id));
      return { ...team, record: recordLabel(team) };
    });
  } catch (error) {
    throwDbError(error, 'Get championships');
  }
}

/**
 * One franchise's whole story: season by season, its rivalries, its awards.
 *
 * Loaded together because the profile page renders all of it at once, and
 * because six separate round-trips is what the old hook did.
 */
export async function getFranchiseProfile(ctx, franchiseId) {
  try {
    const [standings, h2h, awards, careers, franchises] = await Promise.all([
      unwrap(
        await ctx.client
          .from('v_team_standings')
          .select('*')
          .eq('franchise_id', franchiseId)
          .order('season_year'),
        'Get franchise season history'
      ),
      unwrap(
        await ctx.client.from('v_head_to_head').select('*').eq('franchise_id', franchiseId),
        'Get franchise rivalries'
      ),
      unwrap(
        await ctx.client.from('awards').select('*').eq('winner_franchise_id', franchiseId),
        'Get franchise awards'
      ),
      unwrap(
        await ctx.client.from('v_franchise_career').select('*').eq('franchise_id', franchiseId),
        'Get franchise career'
      ),
      getFranchises(ctx)
    ]);

    const index = indexFranchises(franchises);
    const franchise = index.byId.get(franchiseId) ?? null;
    const career = careers?.[0] ?? {};

    // Ballot awards name their winner rather than referencing them, so they do
    // not come back from the `winner_franchise_id` filter above.
    const byOwner = unwrap(
      await ctx.client
        .from('awards')
        .select('*')
        .eq('winner_id', franchise?.owner_name ?? ' ')
        .is('winner_franchise_id', null),
      'Get franchise ballot awards'
    );

    const seasonIds = [...new Set([...(awards ?? []), ...(byOwner ?? [])].map((a) => a.season_id))];
    const seasonYears = await getSeasonYears(ctx, seasonIds);

    const seasonHistory = (standings ?? [])
      .filter((row) => (row.games_played ?? 0) > 0)
      .map((row) => {
        const team = toHistoryTeam(row, franchise);
        return { ...team, season: { id: row.season_id, year: row.season_year } };
      });

    const rivalries = shapeRivalries(h2h ?? [], index.byId);

    return {
      franchise: franchiseRef(franchise),
      seasonHistory,
      rivalries,
      careerStats: {
        franchise_id: franchiseId,
        seasons_played: Number(career.seasons_played ?? 0),
        total_wins: Number(career.total_wins ?? 0),
        total_losses: Number(career.total_losses ?? 0),
        total_ties: Number(career.total_ties ?? 0),
        avg_win_percentage: Number(career.career_win_percentage ?? 0),
        playoff_appearances: Number(career.playoff_appearances ?? 0),
        championships: Number(career.championships ?? 0),
        runner_ups: Number(career.runner_ups ?? 0),
        career_points_for: Number(career.career_points_for ?? 0),
        career_points_against: Number(career.career_points_against ?? 0),
        avg_points_per_game: Number(career.avg_points_per_game ?? 0)
      },
      awards: shapeAwards([...(awards ?? []), ...(byOwner ?? [])], index)
        .map((award) => ({ ...award, season: { year: seasonYears.get(award.season_id) ?? null } }))
        .sort((a, b) => (b.season.year ?? 0) - (a.season.year ?? 0))
    };
  } catch (error) {
    throwDbError(error, 'Get franchise profile');
  }
}

/** `{ seasonId → year }` for a handful of ids. */
async function getSeasonYears(ctx, seasonIds) {
  if (seasonIds.length === 0) return new Map();

  const rows = unwrap(
    await ctx.client.from('seasons').select('id, year').in('id', seasonIds),
    'Get season years'
  );

  return new Map((rows ?? []).map((row) => [row.id, row.year]));
}

/** Best, worst and most frequent opponents, from one franchise's H2H rows. */
function shapeRivalries(rows, byId) {
  const all = rows.map((row) => ({
    opponentId: row.opponent_franchise_id,
    opponentName: byId.get(row.opponent_franchise_id)?.owner_name ?? 'Unknown',
    wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0),
    totalGames: Number(row.total_matchups ?? 0),
    winPct: row.total_matchups > 0 ? Number(row.wins) / Number(row.total_matchups) : 0
  }));

  const byWinPct = [...all].sort((a, b) => b.winPct - a.winPct);
  const byTotalGames = [...all].sort((a, b) => b.totalGames - a.totalGames);

  return {
    bestMatchups: byWinPct.slice(0, 3),
    worstMatchups: byWinPct.slice(-3).reverse(),
    mostFrequent: byTotalGames.slice(0, 3),
    all
  };
}

// ---------------------------------------------------------------------------
// Head to head
// ---------------------------------------------------------------------------

/**
 * The full W-L grid.
 *
 * `v_head_to_head` is already directional — one row per (franchise, opponent)
 * pair in each direction — so there is no perspective to flip, which is where
 * the old `head_to_head_records` table's swap logic lived.
 */
export async function getHeadToHeadMatrix(ctx) {
  try {
    const [records, franchises] = await Promise.all([
      unwrap(await ctx.client.from('v_head_to_head').select('*'), 'Get head-to-head records'),
      getFranchises(ctx)
    ]);

    const { byId } = indexFranchises(franchises);
    const matrix = new Map(
      franchises.map((f) => [
        f.id,
        { franchiseId: f.id, ownerName: f.owner_name, displayName: f.display_name, opponents: {} }
      ])
    );

    for (const row of records ?? []) {
      const entry = matrix.get(row.franchise_id);
      if (!entry) continue;

      const total = Number(row.total_matchups ?? 0);
      entry.opponents[row.opponent_franchise_id] = {
        opponentName: byId.get(row.opponent_franchise_id)?.owner_name,
        wins: Number(row.wins ?? 0),
        losses: Number(row.losses ?? 0),
        totalGames: total,
        winPct: total > 0 ? ((Number(row.wins) / total) * 100).toFixed(1) : 0,
        pointsFor: Number(row.total_points_for ?? 0),
        pointsAgainst: Number(row.total_points_against ?? 0)
      };
    }

    return {
      franchises: franchises.map((f) => ({ id: f.id, name: f.owner_name })),
      matrix: [...matrix.values()]
    };
  } catch (error) {
    throwDbError(error, 'Get head-to-head matrix');
  }
}

/**
 * Every meeting between two franchises, oldest first.
 *
 * `v_game_results` carries each game twice, once from each side. Reading only
 * the rows whose `team_id` belongs to franchise 1 selects each meeting exactly
 * once *and* orients it — so the caller never has to work out which side is
 * which. The old version read `historical_games` and `games`, which since the
 * refactor hold the same rows, and showed every 2020-24 game twice.
 */
export async function getMatchupHistory(ctx, franchise1Id, franchise2Id) {
  try {
    const teams = unwrap(
      await ctx.client
        .from('teams')
        .select('id, name, season_id, franchise_id')
        .in('franchise_id', [franchise1Id, franchise2Id]),
      'Get matchup teams'
    ) ?? [];

    const ours = teams.filter((t) => t.franchise_id === franchise1Id).map((t) => t.id);
    const theirs = teams.filter((t) => t.franchise_id === franchise2Id).map((t) => t.id);
    if (ours.length === 0 || theirs.length === 0) return [];

    const [results, standings, seasons] = await Promise.all([
      unwrap(
        await ctx.client
          .from('v_game_results')
          .select('*')
          .in('team_id', ours)
          .in('opponent_id', theirs),
        'Get matchup history'
      ),
      unwrap(
        await ctx.client
          .from('v_team_standings')
          .select('team_id, wins, losses')
          .in('team_id', [...ours, ...theirs]),
        'Get matchup records'
      ),
      unwrap(await ctx.client.from('seasons').select('id, year, name'), 'Get seasons')
    ]);

    const teamById = new Map(teams.map((t) => [t.id, t]));
    const recordById = new Map(
      (standings ?? []).map((row) => [row.team_id, `${row.wins ?? 0}-${row.losses ?? 0}`])
    );
    const seasonById = new Map((seasons ?? []).map((row) => [row.id, row]));

    return (results ?? [])
      .map((row) => {
        const season = seasonById.get(row.season_id);
        return {
          id: row.game_id,
          week: row.week,
          year: season?.year ?? null,
          seasonName: season?.name ?? null,
          type: row.type,
          isPlayoff: Boolean(row.is_playoff),
          // `is_playoff` is a bracket game; consolation is its own thing, and
          // counting it as a playoff meeting is what the pre-2025 flat types did.
          isRegular: Boolean(row.is_regular),
          isConsolation: Boolean(row.is_consolation),
          team1Score: Number(row.points_for),
          team2Score: Number(row.points_against),
          team1Name: teamById.get(row.team_id)?.name ?? null,
          team2Name: teamById.get(row.opponent_id)?.name ?? null,
          team1FranchiseId: franchise1Id,
          team2FranchiseId: franchise2Id,
          team1Record: recordById.get(row.team_id) ?? null,
          team2Record: recordById.get(row.opponent_id) ?? null,
          winnerId:
            row.result === 'W' ? row.team_id : row.result === 'L' ? row.opponent_id : null
        };
      })
      .sort((a, b) => (a.year - b.year) || (a.week - b.week));
  } catch (error) {
    throwDbError(error, 'Get matchup history');
  }
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

const num = (value) => (value == null ? null : Number(value));

/** ESPN player ids → name and position, for the players a bid or a trade moved. */
async function getPlayers(ctx, espnPlayerIds) {
  const ids = [...new Set(espnPlayerIds)].filter((id) => id != null);
  const players = new Map();

  for (let start = 0; start < ids.length; start += 150) {
    const rows = unwrap(
      await ctx.client
        .from('players')
        .select('espn_player_id, name, position')
        .in('espn_player_id', ids.slice(start, start + 150)),
      'Get record book players'
    ) ?? [];
    for (const row of rows) players.set(row.espn_player_id, { name: row.name, position: row.position });
  }

  return players;
}

/**
 * Everything the record book is computed from, in the shape
 * `utils/recordBook::buildRecordBook` reads.
 *
 * The raw tables rather than the views: the records need each game once with
 * its blowout and close-game flags (which `v_game_results` does not carry),
 * each team's placement, and the two tables the backfill filled — individual
 * trades and bids from `transaction_events`, and `team_week_lineups`. Every
 * read that can pass PostgREST's 1,000-row cap goes through `selectAll`.
 *
 * This replaces `getRecordBook` (`v_record_book`), `getSingleSeasonRecords` and
 * `getAllTimeLeaderboards`, which between them answered "who is first" for
 * nine questions.
 */
export async function getRecordBookSource(ctx) {
  try {
    const client = ctx.client;

    const [seasons, franchises, teams, games, transactions, trades, bids, lineups] = await Promise.all([
      (async () => unwrap(
        await client.from('seasons').select('id, year, is_completed, regular_season_weeks').order('year'),
        'Get record seasons'
      ) ?? [])(),
      getFranchises(ctx),
      selectAll(() => client
        .from('teams')
        .select('id, season_id, franchise_id, name, owner, made_playoffs, playoff_finish, final_rank')
        .order('id')),
      selectAll(() => client
        .from('games')
        .select('id, season_id, week, type, team1_id, team2_id, team1_score, team2_score, is_blowout, is_close')
        .not('team2_id', 'is', null)
        .not('team1_score', 'is', null)
        .not('team2_score', 'is', null)
        .order('id')),
      selectAll(() => client
        .from('transactions')
        .select('season_id, franchise_id, free_agent_adds, waiver_claims, trades, drops, faab_spent')
        .order('id')),
      selectAll(() => client
        .from('transaction_events')
        .select('id, season_id, scoring_period, processed_at, franchise_ids, espn_player_ids, player_from_franchise_ids, player_to_franchise_ids')
        .eq('type', 'TRADE_ACCEPT')
        .order('id')),
      selectAll(() => client
        .from('transaction_events')
        .select('season_id, team_id, franchise_id, bid_amount, scoring_period, espn_player_ids')
        .eq('type', 'WAIVER')
        .gt('bid_amount', 0)
        .order('id')),
      selectAll(() => client
        .from('team_week_lineups')
        .select('season_id, week, team_id, starter_points, optimal_points, starters_scoring')
        .order('id'))
    ]);

    const players = await getPlayers(ctx, [
      ...bids.map((bid) => bid.espn_player_ids?.[0]),
      ...trades.flatMap((trade) => trade.espn_player_ids ?? [])
    ]);

    return {
      seasons: seasons.map((row) => ({
        id: row.id,
        year: row.year,
        isCompleted: Boolean(row.is_completed),
        regularSeasonWeeks: row.regular_season_weeks
      })),
      franchises,
      teams: teams.map((row) => ({
        id: row.id,
        seasonId: row.season_id,
        franchiseId: row.franchise_id,
        name: row.name,
        owner: row.owner,
        madePlayoffs: Boolean(row.made_playoffs),
        playoffFinish: row.playoff_finish,
        finalRank: row.final_rank
      })),
      games: games.map((row) => ({
        id: row.id,
        seasonId: row.season_id,
        week: row.week,
        type: row.type,
        team1Id: row.team1_id,
        team2Id: row.team2_id,
        team1Score: num(row.team1_score),
        team2Score: num(row.team2_score),
        isBlowout: Boolean(row.is_blowout),
        isClose: Boolean(row.is_close)
      })),
      transactions: transactions.map((row) => ({
        seasonId: row.season_id,
        franchiseId: row.franchise_id,
        freeAgentAdds: row.free_agent_adds ?? 0,
        waiverClaims: row.waiver_claims ?? 0,
        trades: row.trades ?? 0,
        drops: row.drops ?? 0,
        faabSpent: num(row.faab_spent) ?? 0
      })),
      trades: trades.map((row) => ({
        id: row.id,
        seasonId: row.season_id,
        week: row.scoring_period,
        processedAt: row.processed_at,
        franchiseIds: row.franchise_ids ?? [],
        players: (row.espn_player_ids ?? []).map((espnPlayerId) => ({
          espnPlayerId,
          name: players.get(espnPlayerId)?.name ?? null,
          position: players.get(espnPlayerId)?.position ?? null
        })),
        // Null on a row stored before direction was; the record book lists
        // those players without sides rather than guessing one.
        fromFranchiseIds: row.player_from_franchise_ids ?? null,
        toFranchiseIds: row.player_to_franchise_ids ?? null
      })),
      bids: bids.map((row) => ({
        seasonId: row.season_id,
        teamId: row.team_id,
        franchiseId: row.franchise_id,
        bidAmount: num(row.bid_amount),
        scoringPeriod: row.scoring_period,
        playerName: players.get(row.espn_player_ids?.[0])?.name ?? null
      })),
      lineups: lineups.map((row) => ({
        seasonId: row.season_id,
        week: row.week,
        teamId: row.team_id,
        starterPoints: num(row.starter_points),
        optimalPoints: num(row.optimal_points),
        startersScoring: row.starters_scoring
      }))
    };
  } catch (error) {
    throwDbError(error, 'Get record book source');
  }
}

/**
 * Every scored regular-season game, with just enough to say which franchise
 * played it — the source of the franchise profile's record trend.
 *
 * The record book's source would do, but it also carries lineups, transaction
 * events and player names; a profile should not pay for those to draw a line.
 * This is one small read cached for every franchise, so switching profiles or
 * adding a team to the comparison fetches nothing. Regular season only, like
 * standings: a bracket run would make seasons end at different weeks.
 */
export async function getRecordTrendSource(ctx) {
  try {
    const client = ctx.client;

    const [seasons, teams, games] = await Promise.all([
      (async () => unwrap(
        await client.from('seasons').select('id, year, is_completed').order('year'),
        'Get record trend seasons'
      ) ?? [])(),
      selectAll(() => client
        .from('teams')
        .select('id, season_id, franchise_id')
        .order('id')),
      selectAll(() => client
        .from('games')
        .select('id, season_id, week, team1_id, team2_id, team1_score, team2_score')
        .eq('type', 'regular')
        .not('team2_id', 'is', null)
        .not('team1_score', 'is', null)
        .not('team2_score', 'is', null)
        .order('id'))
    ]);

    return {
      seasons: seasons.map((row) => ({
        id: row.id,
        year: row.year,
        isCompleted: Boolean(row.is_completed)
      })),
      teams: teams.map((row) => ({
        id: row.id,
        seasonId: row.season_id,
        franchiseId: row.franchise_id
      })),
      games: games.map((row) => ({
        id: row.id,
        seasonId: row.season_id,
        week: row.week,
        team1Id: row.team1_id,
        team2Id: row.team2_id,
        team1Score: num(row.team1_score),
        team2Score: num(row.team2_score)
      }))
    };
  } catch (error) {
    throwDbError(error, 'Get record trend source');
  }
}

// ---------------------------------------------------------------------------
// Week by week
// ---------------------------------------------------------------------------

/**
 * One season, every franchise, week by week — the source of the franchise
 * profile's week-by-week view, in the shape `utils/franchiseWeeks.js` reads.
 *
 * League-wide rather than per franchise, for two reasons. Switching the profile
 * to another team inside the same season should fetch nothing; and a player's
 * rank in a week is a comparison against every rostered player that week, so
 * the whole league's lineups are needed anyway.
 *
 * Nothing here knows what year it is. Every table read is one the weekly sync
 * already writes — `games` (scores), `player_week_stats` and
 * `team_week_lineups` (playerStats / finalizePrev), `power_rankings_history`
 * (snapshot), `transaction_events` (transactions) — so a new week is in this
 * source the Tuesday after it is played. What a week can show is decided by
 * which rows exist, never by the season's year.
 *
 * Each read that can pass PostgREST's 1,000-row cap goes through `selectAll`:
 * a season of player-weeks is ~4,000 rows.
 */
export async function getSeasonWeekSource(ctx, seasonId) {
  try {
    const client = ctx.client;

    const [season, franchises, teams, games, playerWeeks, lineups, ranks, events] = await Promise.all([
      (async () => unwrap(
        await client
          .from('seasons')
          .select('id, year, espn_season_year, regular_season_weeks, playoff_weeks, total_weeks, is_completed')
          .eq('id', seasonId)
          .maybeSingle(),
        'Get week-by-week season'
      ))(),
      getFranchises(ctx),
      selectAll(() => client
        .from('teams')
        .select('id, season_id, franchise_id, name, owner')
        .eq('season_id', seasonId)
        .order('id')),
      selectAll(() => client
        .from('games')
        .select('id, week, type, team1_id, team2_id, team1_score, team2_score, is_blowout, is_close')
        .eq('season_id', seasonId)
        .order('id')),
      selectAll(() => client
        .from('player_week_stats')
        .select(`
          id, week, team_id, player_id, position, roster_slot, started,
          actual_points, pro_team_id, stat_breakdown,
          player:players ( name, team_abbreviation )
        `)
        .eq('season_id', seasonId)
        .order('id')),
      selectAll(() => client
        .from('team_week_lineups')
        .select('week, team_id, starter_points, optimal_points, bench_points, starters_scoring')
        .eq('season_id', seasonId)
        .order('id')),
      selectAll(() => client
        .from('power_rankings_history')
        .select(`
          id, week_number, team_id, rank, power_rating, components, snapshot_type,
          performance_score, team_strength, strength_of_schedule, momentum_score,
          consistency_score, clutch_score, all_play_win_pct
        `)
        .eq('season_id', seasonId)
        .order('id')),
      selectAll(() => client
        .from('transaction_events')
        .select('id, type, team_id, franchise_id, franchise_ids, scoring_period, bid_amount, processed_at, espn_player_ids, player_from_franchise_ids, player_to_franchise_ids')
        .eq('season_id', seasonId)
        .order('id'))
    ]);

    if (!season) return null;

    const players = await getPlayers(ctx, events.flatMap((event) => event.espn_player_ids ?? []));

    return {
      season: {
        id: season.id,
        year: season.year,
        nflSeasonYear: season.espn_season_year ?? season.year,
        regularSeasonWeeks: season.regular_season_weeks,
        playoffWeeks: season.playoff_weeks,
        totalWeeks: season.total_weeks,
        isCompleted: Boolean(season.is_completed)
      },
      franchises: franchises.map(franchiseRef),
      teams: teams.map((row) => ({
        id: row.id,
        franchiseId: row.franchise_id,
        name: row.name,
        owner: row.owner
      })),
      games: games.map((row) => ({
        id: row.id,
        week: row.week,
        type: row.type,
        team1Id: row.team1_id,
        team2Id: row.team2_id,
        team1Score: num(row.team1_score),
        team2Score: num(row.team2_score),
        isBlowout: Boolean(row.is_blowout),
        isClose: Boolean(row.is_close)
      })),
      playerWeeks: playerWeeks.map((row) => ({
        week: row.week,
        teamId: row.team_id,
        playerId: row.player_id,
        name: row.player?.name ?? null,
        position: row.position,
        slot: row.roster_slot,
        started: Boolean(row.started),
        actualPoints: num(row.actual_points),
        proTeamId: row.pro_team_id,
        proTeam: row.player?.team_abbreviation ?? null,
        statBreakdown: row.stat_breakdown ?? null
      })),
      lineups: lineups.map((row) => ({
        week: row.week,
        teamId: row.team_id,
        starterPoints: num(row.starter_points),
        optimalPoints: num(row.optimal_points),
        benchPoints: num(row.bench_points),
        startersScoring: row.starters_scoring
      })),
      ranks: ranks.map((row) => ({
        week: row.week_number,
        teamId: row.team_id,
        rank: row.rank,
        powerRating: num(row.power_rating),
        snapshotType: row.snapshot_type,
        components: row.components ?? null,
        // A snapshot written before 2026-08-10 has these columns instead of
        // `components`; they name an older formula and are shown as such.
        legacy: row.components ? null : {
          performanceScore: num(row.performance_score),
          teamStrength: num(row.team_strength),
          strengthOfSchedule: num(row.strength_of_schedule),
          momentumScore: num(row.momentum_score),
          consistencyScore: num(row.consistency_score),
          clutchScore: num(row.clutch_score),
          allPlayWinPct: num(row.all_play_win_pct)
        }
      })),
      events: events.map((row) => ({
        id: row.id,
        type: row.type,
        week: row.scoring_period,
        teamId: row.team_id,
        franchiseId: row.franchise_id,
        franchiseIds: row.franchise_ids ?? [],
        bidAmount: num(row.bid_amount),
        processedAt: row.processed_at,
        players: (row.espn_player_ids ?? []).map((espnPlayerId, i) => ({
          espnPlayerId,
          name: players.get(espnPlayerId)?.name ?? null,
          position: players.get(espnPlayerId)?.position ?? null,
          // Null on a row stored before direction was; shown without a side.
          from: row.player_from_franchise_ids ? row.player_from_franchise_ids[i] ?? null : undefined,
          to: row.player_to_franchise_ids ? row.player_to_franchise_ids[i] ?? null : undefined
        }))
      }))
    };
  } catch (error) {
    throwDbError(error, 'Get season week source');
  }
}

/**
 * Every week one player was rostered in this league, across every season —
 * the player sheet's career and roster history.
 *
 * `player_week_stats` only holds players while they are on a league roster, so
 * a week this returns nothing for is a week nobody here had him, not a zero.
 */
export async function getPlayerCareer(ctx, playerId) {
  try {
    const client = ctx.client;

    const [player, rows] = await Promise.all([
      (async () => unwrap(
        await client
          .from('players')
          .select('id, name, position, team_abbreviation')
          .eq('id', playerId)
          .maybeSingle(),
        'Get career player'
      ))(),
      selectAll(() => client
        .from('player_week_stats')
        .select('id, season_id, week, team_id, started, actual_points, stat_breakdown, position')
        .eq('player_id', playerId)
        .order('id'))
    ]);

    const teamIds = [...new Set(rows.map((row) => row.team_id))];
    const seasonIds = [...new Set(rows.map((row) => row.season_id))];

    const [teams, seasons] = await Promise.all([
      teamIds.length
        ? (async () => unwrap(
            await client.from('teams').select('id, franchise_id, name, owner').in('id', teamIds),
            'Get career teams'
          ) ?? [])()
        : [],
      seasonIds.length
        ? (async () => unwrap(
            await client.from('seasons').select('id, year').in('id', seasonIds),
            'Get career seasons'
          ) ?? [])()
        : []
    ]);

    const teamById = new Map(teams.map((team) => [team.id, team]));
    const yearById = new Map(seasons.map((season) => [season.id, season.year]));

    return {
      player: player
        ? { id: player.id, name: player.name, position: player.position, proTeam: player.team_abbreviation }
        : null,
      weeks: rows.map((row) => {
        const team = teamById.get(row.team_id);
        return {
          seasonId: row.season_id,
          year: yearById.get(row.season_id) ?? null,
          week: row.week,
          teamId: row.team_id,
          franchiseId: team?.franchise_id ?? null,
          teamName: team?.name ?? null,
          owner: team?.owner ?? null,
          started: Boolean(row.started),
          actualPoints: num(row.actual_points),
          hasStatLine: row.stat_breakdown != null
        };
      })
    };
  } catch (error) {
    throwDbError(error, 'Get player career');
  }
}
