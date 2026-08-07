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
// Season management
export async function createSeason(ctx, year, name = '', leagueSize = 14, regularSeasonWeeks = 14, playoffWeeks = 3) {


  const season = models.createSeason(year, name, leagueSize, regularSeasonWeeks, playoffWeeks);

  if (!models.validateSeason(season)) {
    throw new Error('Invalid season data');
  }

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

export async function setActiveSeason(ctx, seasonId) {

  try {
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
