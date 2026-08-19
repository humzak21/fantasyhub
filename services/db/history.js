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
 * Awards, in the vocabulary the gallery renders.
 *
 * Two kinds share the table. Computed awards carry `award_type`,
 * `winner_franchise_id` and a category the gallery already groups by. Ballot
 * awards carry a free-text title and only the owner's *name* — so the franchise
 * is resolved by owner name, which is the one identifier that survives a team
 * rename. Ballot awards with no winner yet are dropped: an award nobody won is
 * not a result.
 */
function shapeAwards(rows, index) {
  return rows
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

/** The league's outright records — highest game, largest margin, best season. */
export async function getRecordBook(ctx) {
  try {
    const rows = unwrap(await ctx.client.from('v_record_book').select('*'), 'Get record book');

    return (rows ?? []).map((row) => ({
      recordType: row.record_type,
      scope: row.scope,
      franchiseId: row.franchise_id,
      ownerName: row.owner_name,
      value: Number(row.value),
      valueLabel: row.value_label,
      year: row.season_year,
      week: row.week
    }));
  } catch (error) {
    throwDbError(error, 'Get record book');
  }
}

/** The best and worst single seasons anyone has had. */
export async function getSingleSeasonRecords(ctx) {
  try {
    const [standings, franchises] = await Promise.all([
      unwrap(
        await ctx.client.from('v_team_standings').select('*').gt('games_played', 0),
        'Get single-season records'
      ),
      getFranchises(ctx)
    ]);

    const { byId } = indexFranchises(franchises);
    const teams = (standings ?? []).map((row) => toHistoryTeam(row, byId.get(row.franchise_id)));
    if (teams.length === 0) return {};

    const pick = (compare) => teams.reduce((best, team) => (compare(team, best) ? team : best));
    const diff = (team) => team.points_for - team.points_against;

    const records = {
      mostWins: pick((t, b) => t.regular_season_wins > b.regular_season_wins),
      mostPoints: pick((t, b) => t.points_for > b.points_for),
      fewestPoints: pick((t, b) => t.points_for < b.points_for),
      bestPointDiff: pick((t, b) => diff(t) > diff(b)),
      worstPointDiff: pick((t, b) => diff(t) < diff(b)),
      fewestLosses: pick((t, b) => t.regular_season_losses < b.regular_season_losses)
    };

    return Object.fromEntries(
      Object.entries(records).map(([key, team]) => [
        key,
        {
          ownerName: team.owner_name,
          teamName: team.team_name,
          year: team.year,
          value:
            key === 'mostWins' || key === 'fewestLosses'
              ? recordLabel(team)
              : key.includes('PointDiff')
                ? diff(team).toFixed(2)
                : team.points_for.toFixed(2)
        }
      ])
    );
  } catch (error) {
    throwDbError(error, 'Get single-season records');
  }
}

/**
 * The all-time top five by wins, points and titles.
 *
 * One query for all three boards: the old hook ran `getAllTimeLeaderboard`
 * three times, each of which re-read the career stats and the whole active
 * season.
 */
export async function getAllTimeLeaderboards(ctx, limit = 5) {
  try {
    const careers = unwrap(
      await ctx.client.from('v_franchise_career').select('*'),
      'Get all-time leaderboards'
    ) ?? [];

    const board = (valueOf) =>
      [...careers]
        .filter((row) => Number(row.seasons_played ?? 0) > 0)
        .sort((a, b) => valueOf(b) - valueOf(a))
        .slice(0, limit)
        .map((row, index) => ({
          rank: index + 1,
          franchiseId: row.franchise_id,
          ownerName: row.owner_name,
          displayName: row.display_name,
          value: valueOf(row),
          totalSeasons: Number(row.seasons_played ?? 0),
          record: `${Number(row.total_wins ?? 0)}-${Number(row.total_losses ?? 0)}`
        }));

    return {
      wins: board((row) => Number(row.total_wins ?? 0)),
      points: board((row) => Number(row.career_points_for ?? 0)),
      championships: board((row) => Number(row.championships ?? 0))
    };
  } catch (error) {
    throwDbError(error, 'Get all-time leaderboards');
  }
}
