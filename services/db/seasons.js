/**
 * Seasons: CRUD plus the active-season lookup and the season-year resolver
 * every other module leans on. The in-memory `ctx.seasonsCache` lives on the
 * context object so a season fetched here is the same object teams/games see.
 *
 * Extracted from the 4,132-line `services/supabaseDataManager.js` god class.
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 */

import * as models from '../../types/index.js';
import { formatForDatabase, formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { createLogger } from './logger.js';
import { copyDivisionsToSeason } from './divisions.js';
import { copyTeamsToSeason } from './teams.js';

const log = createLogger('db:seasons');

/**
 * Columns a new season inherits from the one it copies teams from.
 *
 * `carryTeamsForward` used to copy team identity and nothing else, which left
 * the 2026 row with no ESPN league and no pick'em windows — enough to make the
 * weekly sync fail. `start_date` and `awards_release_at` are deliberately not
 * here: one changes every year and the other is an act, not a setting.
 */
const INHERITED_CONFIG_COLUMNS = [
  'timezone',
  'espn_league_id',
  'pickem_open_offset_days',
  'pickem_open_time',
  'pickem_close_offset_days',
  'pickem_close_time',
  'pickem_reveal_offset_days',
  'pickem_reveal_time'
];

/** What `getPreviousSeason`/`getSeasonSummary` read: identity plus config. */
const SEASON_SUMMARY_COLUMNS = ['id', 'year', 'name', ...INHERITED_CONFIG_COLUMNS].join(', ');

// Season management
/**
 * Create a season, its weeks, and — by default — its teams.
 *
 * The league is the same fourteen owners every year, so a new season starts by
 * carrying last season's divisions, teams and configuration forward instead of
 * making the admin re-enter them by hand. Only team *identity* is copied; see
 * `teams.copyTeamsToSeason`.
 *
 * @param {Object} [options]
 * @param {string|null} [options.copyTeamsFromSeasonId] Which season to copy
 *   from. Omitted/`undefined` picks the most recent season before `year`;
 *   `null` creates an empty season.
 * @param {string|null} [options.startDate] 'YYYY-MM-DD' of week 1. Never
 *   inherited — every season starts on a different Tuesday.
 */
export async function createSeason(ctx, year, name = '', leagueSize = 14, regularSeasonWeeks = 14, playoffWeeks = 3, options = {}) {


  const season = models.createSeason(year, name, leagueSize, regularSeasonWeeks, playoffWeeks);

  if (!models.validateSeason(season)) {
    throw new Error('Invalid season data');
  }

  // Resolved before the insert so the new row can inherit the source's
  // configuration, not just its teams. A lookup failure is reported the same
  // way a failed copy is, rather than aborting a season that is otherwise fine.
  let source = null;
  let sourceError = null;
  if (options.copyTeamsFromSeasonId !== null) {
    try {
      source = options.copyTeamsFromSeasonId
        ? await getSeasonSummary(ctx, options.copyTeamsFromSeasonId)
        : await getPreviousSeason(ctx, year);
    } catch (error) {
      sourceError = error.message;
    }
  }

  const created = await insertSeasonWithWeeks(ctx, season, {
    startDate: options.startDate ?? null,
    inheritFrom: source
  });

  return carryTeamsForward(ctx, created, { source, sourceError });
}

/**
 * The season row and its empty weeks. Split out of `createSeason` so the team
 * copy that follows can fail without being reported as "create season failed".
 */
async function insertSeasonWithWeeks(ctx, season, { startDate = null, inheritFrom = null } = {}) {
  try {
    // Insert season
    const seasonData = formatForDatabase({
      year: season.year,
      name: season.name,
      leagueSize: season.leagueSize,
      regularSeasonWeeks: season.regularSeasonWeeks,
      playoffWeeks: season.playoffWeeks,
      isActive: season.isActive,
      isCompleted: season.isCompleted,
      stats: season.stats,
      playoffBracket: season.playoffBracket
    });

    // ESPN numbers its seasons by year, so this needs no source to be known.
    seasonData.espn_season_year = season.year;
    if (startDate) seasonData.start_date = startDate;
    for (const column of INHERITED_CONFIG_COLUMNS) {
      if (inheritFrom?.[column] != null) seasonData[column] = inheritFrom[column];
    }


    const { data: insertedSeason, error: seasonError } = await ctx.client
      .from('seasons')
      .insert(seasonData)
      .select()
      .single();


    if (seasonError) throw seasonError;

    season.id = insertedSeason.id;

    // Create weeks
    const weeksData = [];
    for (let week = 1; week <= season.totalWeeks; week++) {
      const weekData = models.createWeek(week, season.id);
      weeksData.push(formatForDatabase({
        seasonId: season.id,
        weekNumber: weekData.weekNumber,
        isCompleted: weekData.isCompleted,
        powerRankings: weekData.powerRankings,
        weeklyStats: weekData.weeklyStats
      }));
    }

    const { error: weeksError } = await ctx.client
      .from('weeks')
      .insert(weeksData);

    if (weeksError) throw weeksError;

    // Cache the season
    const formattedSeason = formatFromDatabase(insertedSeason);
    // Ensure teams array exists
    if (!formattedSeason.teams) {
      formattedSeason.teams = [];
    }
    // Ensure schedule array exists
    if (!formattedSeason.schedule) {
      formattedSeason.schedule = [];
    }
    ctx.seasonsCache.set(formattedSeason.id, formattedSeason);

    return formattedSeason;
  } catch (error) {
    throwDbError(error, 'Create season');
    throw error; // Ensure the error is re-thrown
  }
}

/**
 * The most recent season before `year`, or null when `year` is the first.
 * Returned in database shape — callers only want `id`, `year` and `name`.
 */
export async function getPreviousSeason(ctx, year) {
  try {
    const { data, error } = await ctx.client
      .from('seasons')
      .select(SEASON_SUMMARY_COLUMNS)
      .lt('year', year)
      .order('year', { ascending: false })
      .limit(1);

    if (error) throw error;

    return data?.[0] ?? null;
  } catch (error) {
    throwDbError(error, 'Get previous season');
  }
}

/**
 * Copy the previous season's divisions and teams into a season that was just
 * created, and record on it what happened.
 *
 * Non-fatal on purpose. `seasons.year` is unique, so a season that exists but
 * has no teams cannot simply be created again — throwing here would leave the
 * admin holding a season they can neither use nor recreate. The outcome is
 * reported on the returned season instead:
 *
 *   `teams`            the copied rows (empty when nothing was copied)
 *   `teamsCopiedFrom`  `{ id, year, name }` of the source, or null
 *   `teamCopyError`    message when the copy failed, or null
 */
async function carryTeamsForward(ctx, season, { source = null, sourceError = null } = {}) {
  season.teams = [];
  season.teamsCopiedFrom = null;
  season.teamCopyError = sourceError;

  // No source: the copy was declined, the league's first season has nothing to
  // copy, or resolving it failed and `sourceError` already says so.
  if (!source) return season;

  try {
    const divisionIdMap = await copyDivisionsToSeason(ctx, source.id, season.id);
    const teams = await copyTeamsToSeason(ctx, source.id, season.id, divisionIdMap);

    // Season objects carry camelCase teams (`getSeason`, `getAllSeasons`);
    // `copyTeamsToSeason` returns rows in database shape like `getTeamsForSeason`.
    season.teams = teams.map(formatFromDatabase);
    if (teams.length > 0) {
      season.teamsCopiedFrom = { id: source.id, year: source.year, name: source.name };
      log.info(`carried ${teams.length} teams forward from ${source.year} into ${season.year}`);
    }
  } catch (error) {
    // The season itself is fine — say so, and let the caller tell the admin.
    log.warn(`season ${season.year} created, but carrying teams forward failed:`, error.message);
    season.teamCopyError = error.message;
  }

  return season;
}

/** Identity of one season, without `getSeason`'s teams/weeks/games joins. */
async function getSeasonSummary(ctx, seasonId) {
  const { data, error } = await ctx.client
    .from('seasons')
    .select(SEASON_SUMMARY_COLUMNS)
    .eq('id', seasonId)
    .single();

  if (error) throw error;

  return data;
}

export async function getSeason(ctx, seasonId) {

  // Check cache first
  if (ctx.seasonsCache.has(seasonId)) {
    return ctx.seasonsCache.get(seasonId);
  }

  try {
    const { data, error } = await ctx.client
      .from('seasons')
      .select(`
        *,
        teams (*),
        weeks (*),
        games (*)
      `)
      .eq('id', seasonId)
      .single();

    if (error) throw error;

    const formattedSeason = formatFromDatabase(data);

    // Transform the structure to match expected format
    formattedSeason.schedule = formattedSeason.games || [];
    delete formattedSeason.games;

    ctx.seasonsCache.set(seasonId, formattedSeason);
    return formattedSeason;
  } catch (error) {
    throwDbError(error, 'Get season');
  }
}

export async function getAllSeasons(ctx) {

  try {
    const { data, error } = await ctx.client
      .from('seasons')
      .select(`
        *,
        teams (*)
      `)
      .order('year', { ascending: false });

    if (error) throw error;

    const seasons = data.map(season => {
      const formattedSeason = formatFromDatabase(season);
      // Ensure teams array exists
      if (!formattedSeason.teams) {
        formattedSeason.teams = [];
      }
      return formattedSeason;
    });

    // Update cache
    seasons.forEach(season => {
      ctx.seasonsCache.set(season.id, season);
    });

    return seasons;
  } catch (error) {
    throwDbError(error, 'Get all seasons');
  }
}

/**
 * Derive and write a season's final placements, and the awards that depend on
 * them.
 *
 * Both halves live in the database (`supabase/migrations/*_finalize_season`)
 * because the derivation is a join across games, teams and the standings view,
 * and because the same rules have to hold for the weekly sync as for the admin
 * pressing a button. Idempotent: re-running it rewrites the same rows.
 *
 * @param {Object} [options]
 * @param {boolean} [options.dryRun] Compute the assignments and return them
 *   without writing, so the admin can confirm the podium first.
 * @returns {Promise<Object>} `{ season_id, year, dry_run, assignments[] }`,
 *   plus `awards` on a real run.
 */
export async function finalizeSeason(ctx, seasonId, { dryRun = false } = {}) {
  try {
    const { data, error } = await ctx.client.rpc('finalize_season', {
      p_season_id: seasonId,
      p_dry_run: dryRun
    });

    if (error) throw error;
    if (dryRun) return data;

    const { data: awards, error: awardsError } = await ctx.client.rpc('compute_season_awards', {
      p_season_id: seasonId
    });

    if (awardsError) throw awardsError;

    // `is_completed` just changed, and the cached season still says otherwise.
    forgetSeason(ctx, seasonId);
    log.info(`finalized season ${data?.year ?? seasonId}`);

    return { ...data, awards };
  } catch (error) {
    throwDbError(error, 'Finalize season');
  }
}

/**
 * Finish the season being switched away from, if it is finished.
 *
 * Activating next season is the moment the old one stops being live, and until
 * now nothing marked it done — which is how 2025 disappeared from League
 * History the day 2026 was activated. Non-fatal on purpose, in the style of
 * `carryTeamsForward`: activating the new season is what the admin asked for,
 * and a failure here is reported on the returned season rather than thrown.
 *
 * A season with games still to play is skipped silently. Setting up next year
 * early is normal and is not an error worth reporting.
 *
 * @returns {Promise<{finalized: Object|null, error: string|null}>}
 */
async function finalizeOutgoingSeason(ctx, incomingSeasonId) {
  try {
    const { data: outgoing, error } = await ctx.client
      .from('seasons')
      .select('id, year, is_completed')
      .eq('is_active', true)
      .limit(1);

    if (error) throw error;

    const current = outgoing?.[0] ?? null;
    if (!current || current.id === incomingSeasonId || current.is_completed) {
      return { finalized: null, error: null };
    }

    const { data: pending, error: pendingError } = await ctx.client
      .from('games')
      .select('id')
      .eq('season_id', current.id)
      .neq('type', 'bye')
      .not('team2_id', 'is', null)
      .or('team1_score.is.null,team2_score.is.null')
      .limit(1);

    if (pendingError) throw pendingError;
    if (pending?.length) {
      log.info(`season ${current.year} still has games to play; not finalizing it`);
      return { finalized: null, error: null };
    }

    return { finalized: await finalizeSeason(ctx, current.id), error: null };
  } catch (error) {
    log.warn(`could not finalize the outgoing season: ${error.message}`);
    return { finalized: null, error: error.message };
  }
}

export async function setActiveSeason(ctx, seasonId) {

  try {
    const outgoing = await finalizeOutgoingSeason(ctx, seasonId);

    // Deactivate all seasons
    await ctx.client
      .from('seasons')
      .update({ is_active: false })
      .neq('id', seasonId);

    // Activate the specified season
    const { data, error } = await ctx.client
      .from('seasons')
      .update({ is_active: true })
      .eq('id', seasonId)
      .select()
      .single();

    if (error) throw error;

    ctx.activeSeasonId = seasonId;
    const formattedSeason = formatFromDatabase(data);
    formattedSeason.finalizedPrevious = outgoing.finalized;
    formattedSeason.finalizeError = outgoing.error;
    ctx.seasonsCache.set(seasonId, formattedSeason);

    return formattedSeason;
  } catch (error) {
    throwDbError(error, 'Set active season');
  }
}

export async function getActiveSeason(ctx) {

  if (ctx.activeSeasonId && ctx.seasonsCache.has(ctx.activeSeasonId)) {
    return ctx.seasonsCache.get(ctx.activeSeasonId);
  }

  try {
    const { data, error } = await ctx.client
      .from('seasons')
      .select(`
        *,
        teams (*)
      `)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;

    const formattedSeason = formatFromDatabase(data);
    // Ensure teams array exists
    if (!formattedSeason.teams) {
      formattedSeason.teams = [];
    }
    ctx.activeSeasonId = formattedSeason.id;
    ctx.seasonsCache.set(formattedSeason.id, formattedSeason);

    return formattedSeason;
  } catch (error) {
    throwDbError(error, 'Get active season');
  }
}

export async function deleteSeason(ctx, seasonId) {

  try {
    const { error } = await ctx.client
      .from('seasons')
      .delete()
      .eq('id', seasonId);

    if (error) throw error;

    ctx.seasonsCache.delete(seasonId);
    if (ctx.activeSeasonId === seasonId) {
      ctx.activeSeasonId = null;
    }

    return true;
  } catch (error) {
    throwDbError(error, 'Delete season');
  }
}

// Data export (enhanced with database query)
export async function exportSeasonData(ctx, seasonId) {

  try {
    const { data, error } = await ctx.client
      .from('seasons')
      .select(`
        *,
        teams (*),
        games (*),
        weeks (*),
        power_rankings_history (*)
      `)
      .eq('id', seasonId)
      .single();

    if (error) throw error;

    return {
      season: formatFromDatabase(data),
      exportedAt: new Date().toISOString(),
      version: '2.0'
    };
  } catch (error) {
    throwDbError(error, 'Export season data');
  }
}

/**
 * Drop cached season objects so the next read hits the database.
 *
 * `ctx.seasonsCache` predates any client-side query cache: `getSeason` and
 * `getActiveSeason` return the cached object forever once populated. That is
 * fine for a script, but a UI cache sitting on top would refetch after a
 * mutation and be handed the same stale object. Call this before refetching.
 *
 * @param {Object} ctx
 * @param {string} [seasonId] - one season, or every season when omitted.
 */
export function forgetSeason(ctx, seasonId = null) {
  if (seasonId) {
    ctx.seasonsCache.delete(seasonId);
    if (ctx.activeSeasonId === seasonId) ctx.activeSeasonId = null;
    return;
  }

  ctx.seasonsCache.clear();
  ctx.activeSeasonId = null;
}

export async function resolveSeasonYear(ctx, seasonYear) {
  if (seasonYear) return seasonYear;

  const { data } = await ctx.client
    .from('v_active_season')
    .select('year')
    .single();

  return data?.year ?? null;
}
